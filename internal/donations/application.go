package donations

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"sync"
	"sync/atomic"
	"time"

	"github.com/streambrew-app/streambrew/internal/donationalert"
)

type persistence interface {
	Connections(context.Context) ([]Connection, error)
	SaveConnectionWithDonations(context.Context, int, ProviderConnection, DonationBatch) error
	SaveDonations(context.Context, connectionVersion, DonationBatch, IngestionOrigin, time.Time) error
	SetTokensIfVersion(context.Context, connectionVersion, Tokens) (bool, error)
	Disconnect(context.Context, int) error
	RequireReauthorizationIfVersion(context.Context, connectionVersion) (bool, error)
	MarkConnectionErrorIfVersion(context.Context, connectionVersion) (bool, error)
}

type Connection struct {
	UserID            int
	SourceUserID      string
	ConnectedAt       time.Time
	AccessToken       string
	RefreshToken      string
	TokenVersion      int
	HistoryCheckpoint *string
}

// connectionVersion identifies the saved connection generation that a
// listener or history worker read. Deleting a connection and saving it again
// restarts token_version at 1, so version-guarded writes also match the
// immutable provider account and connection time of that generation.
type connectionVersion struct {
	userID       int
	sourceUserID string
	connectedAt  time.Time
	tokenVersion int
}

func (connection Connection) version() connectionVersion {
	return connectionVersion{
		userID:       connection.UserID,
		sourceUserID: connection.SourceUserID,
		connectedAt:  connection.ConnectedAt,
		tokenVersion: connection.TokenVersion,
	}
}

const (
	recentRecoveryConcurrency = 4
	recentRecoveryTimeout     = 45 * time.Second
	// maxReportedRejections bounds the memory used to report each skipped
	// provider row once.
	maxReportedRejections = 10_000
)

type integration struct {
	store           persistence
	provider        provider
	refreshEvery    time.Duration
	recoveryEvery   time.Duration
	recoveryLimit   int
	recoveryTimeout time.Duration
	historyEvery    time.Duration
	now             func() time.Time
	rejections      rejectionLog
}

// rejectionLog remembers which skipped provider rows were already reported.
// Periodic history passes read the same rows again; repeating the error each
// pass would only add noise.
type rejectionLog struct {
	mu       sync.Mutex
	reported map[rejectionKey]struct{}
}

type rejectionKey struct {
	userID           int
	sourceDonationID string
}

func (rejections *rejectionLog) firstReport(key rejectionKey) bool {
	rejections.mu.Lock()
	defer rejections.mu.Unlock()
	if _, reported := rejections.reported[key]; reported {
		return false
	}
	if rejections.reported == nil || len(rejections.reported) >= maxReportedRejections {
		rejections.reported = make(map[rejectionKey]struct{})
	}
	rejections.reported[key] = struct{}{}
	return true
}

func newIntegration(store persistence, provider provider) *integration {
	return &integration{
		store: store, provider: provider,
		refreshEvery:    10 * time.Second,
		recoveryEvery:   donationalert.MaxAlertAge / 2,
		recoveryLimit:   recentRecoveryConcurrency,
		recoveryTimeout: recentRecoveryTimeout,
		historyEvery:    time.Hour,
		now:             time.Now,
	}
}

type Application struct {
	integrations map[Source]*integration
	order        []Source
}

func NewApplication(store *Store, providers ...provider) *Application {
	application := &Application{integrations: make(map[Source]*integration, len(providers))}
	for _, configured := range providers {
		source := configured.Source()
		if _, exists := application.integrations[source]; exists {
			panic("duplicate donation provider: " + source)
		}
		application.integrations[source] = newIntegration(store.forSource(source), configured)
		application.order = append(application.order, source)
	}
	return application
}

func (application *Application) AuthorizationURL(source Source, redirectURI, state string) (string, error) {
	integration, err := application.integration(source)
	if err != nil {
		return "", err
	}
	return integration.provider.AuthorizationURL(redirectURI, state), nil
}

func (application *Application) Connect(ctx context.Context, source Source, userID int, authCode, redirectURI string) error {
	integration, err := application.integration(source)
	if err != nil {
		return err
	}
	return integration.connect(ctx, userID, authCode, redirectURI)
}

func (application *Application) Disconnect(ctx context.Context, source Source, userID int) error {
	integration, err := application.integration(source)
	if err != nil {
		return err
	}
	return integration.store.Disconnect(ctx, userID)
}

func (application *Application) integration(source Source) (*integration, error) {
	configured, ok := application.integrations[source]
	if !ok {
		return nil, fmt.Errorf("donations: provider %q is not configured", source)
	}
	return configured, nil
}

func (application *Application) Run(ctx context.Context) error {
	workerCtx, cancel := context.WithCancel(ctx)
	defer cancel()

	results := make(chan error, len(application.order))
	var workers sync.WaitGroup
	for _, source := range application.order {
		configured := application.integrations[source]
		workers.Add(1)
		go func() {
			defer workers.Done()
			results <- configured.run(workerCtx)
		}()
	}

	select {
	case <-ctx.Done():
		cancel()
		workers.Wait()
		return nil
	case err := <-results:
		cancel()
		workers.Wait()
		if err == nil {
			return errors.New("donation provider worker stopped unexpectedly")
		}
		return err
	}
}

func (integration *integration) connect(ctx context.Context, userID int, authCode, redirectURI string) error {
	name := integration.provider.Source().displayName()
	connection, err := integration.provider.IssueConnection(ctx, authCode, redirectURI)
	if err != nil {
		return fmt.Errorf("issue %s connection: %w", name, err)
	}
	batch, err := integration.provider.GetDonations(ctx, connection.AccessToken, connection.SourceUserID, nil, nil)
	if err != nil {
		return fmt.Errorf("import initial %s history: %w", name, err)
	}
	integration.reportRejected(userID, batch.Rejected)
	if err := integration.store.SaveConnectionWithDonations(ctx, userID, connection, batch); err != nil {
		return fmt.Errorf("save %s connection and history: %w", name, err)
	}
	return nil
}

// runningListener is the supervisor's view of one listener. The listener
// publishes each refreshed token version to tokenVersion before saving it, so
// the supervisor can tell the listener's own refresh from a replacement.
type runningListener struct {
	cancel       context.CancelFunc
	sourceUserID string
	connectedAt  time.Time
	tokenVersion *atomic.Int64
}

// replacedBy reports whether the saved connection is no longer the one this
// listener serves: another provider account, a deleted and recreated
// connection, or a version newer than any the listener wrote. A snapshot read
// before the listener's own refresh can be older, which is not a replacement.
func (listener runningListener) replacedBy(connection Connection) bool {
	return connection.SourceUserID != listener.sourceUserID ||
		!connection.ConnectedAt.Equal(listener.connectedAt) ||
		int64(connection.TokenVersion) > listener.tokenVersion.Load()
}

type listenerCompletion struct {
	userID int
	// tokenVersion identifies the completed listener's shared state.
	tokenVersion *atomic.Int64
	err          error
}

func (integration *integration) run(ctx context.Context) error {
	running := make(map[int]runningListener)
	completed := make(chan listenerCompletion)
	var listeners sync.WaitGroup
	defer func() {
		for _, listener := range running {
			listener.cancel()
		}
		listeners.Wait()
	}()

	if err := integration.refreshListeners(ctx, running, completed, &listeners); err != nil {
		return err
	}
	refreshTicker := time.NewTicker(integration.refreshEvery)
	defer refreshTicker.Stop()
	var historyWorkers sync.WaitGroup
	historyWorkers.Add(2)
	go func() {
		defer historyWorkers.Done()
		// Start with the bounded freshness window. A full account history can be
		// arbitrarily large and must not delay listener lifecycle management.
		integration.syncRecentHistory(ctx)
		ticker := time.NewTicker(integration.recoveryEvery)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				integration.syncRecentHistory(ctx)
			}
		}
	}()
	go func() {
		defer historyWorkers.Done()
		timer := time.NewTimer(integration.historyEvery)
		defer timer.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-timer.C:
				integration.syncHistory(ctx, false)
				timer.Reset(integration.historyEvery)
			}
		}
	}()
	defer historyWorkers.Wait()

	for {
		select {
		case <-ctx.Done():
			return nil
		case completion := <-completed:
			listener, exists := running[completion.userID]
			if exists && listener.tokenVersion == completion.tokenVersion {
				delete(running, completion.userID)
			}
			if completion.err != nil {
				slog.Error(integration.provider.Source().displayName()+" listener exited", "userId", completion.userID, "error", completion.err)
			}
		case <-refreshTicker.C:
			if err := integration.refreshListeners(ctx, running, completed, &listeners); err != nil {
				slog.Error("refresh "+integration.provider.Source().displayName()+" listeners", "error", err)
			}
		}
	}
}

func (integration *integration) refreshListeners(ctx context.Context, running map[int]runningListener, completed chan<- listenerCompletion, listeners *sync.WaitGroup) error {
	connections, err := integration.store.Connections(ctx)
	if err != nil {
		return fmt.Errorf("get %s connections: %w", integration.provider.Source().displayName(), err)
	}
	byUserID := make(map[int]Connection, len(connections))
	for _, connection := range connections {
		byUserID[connection.UserID] = connection
	}
	for userID, listener := range running {
		connection, exists := byUserID[userID]
		if !exists || listener.replacedBy(connection) {
			listener.cancel()
			delete(running, userID)
		}
	}
	for _, connection := range connections {
		if _, exists := running[connection.UserID]; exists {
			continue
		}
		listenerCtx, cancel := context.WithCancel(ctx)
		tokenVersion := new(atomic.Int64)
		tokenVersion.Store(int64(connection.TokenVersion))
		running[connection.UserID] = runningListener{
			cancel:       cancel,
			sourceUserID: connection.SourceUserID,
			connectedAt:  connection.ConnectedAt,
			tokenVersion: tokenVersion,
		}
		listeners.Add(1)
		go func(connection Connection) {
			defer listeners.Done()
			err := integration.listen(listenerCtx, connection, tokenVersion)
			select {
			case completed <- listenerCompletion{userID: connection.UserID, tokenVersion: tokenVersion, err: err}:
			case <-ctx.Done():
			}
		}(connection)
	}
	return nil
}

var ErrStaleCredentials = errors.New("donations: stale credentials")

// listen runs one connection's provider listener. It publishes refreshed token
// versions to tokenVersion, which the supervisor shares.
func (integration *integration) listen(ctx context.Context, connection Connection, tokenVersion *atomic.Int64) error {
	accessToken := connection.AccessToken
	refreshToken := connection.RefreshToken
	version := connection.version()
	checkpoint := connection.HistoryCheckpoint
	refreshedBeforeAuthorization := false
	for ctx.Err() == nil {
		err := integration.provider.Run(ctx, accessToken, connection.SourceUserID, checkpoint, func(batch DonationBatch) error {
			integration.reportRejected(connection.UserID, batch.Rejected)
			if err := integration.store.SaveDonations(ctx, version, batch, LiveOrigin, integration.now()); err != nil {
				return err
			}
			checkpoint = batch.Checkpoint
			return nil
		})
		if contextDone(ctx) {
			return nil
		}
		if err == nil {
			return nil
		}
		if !integration.provider.Unauthorized(err) {
			return integration.recordPermanentConnectionError(ctx, version, err)
		}
		if hadAuthorizedSession, supported := failureHadAuthorizedSession(err); supported {
			if refreshedBeforeAuthorization && !hadAuthorizedSession {
				updated, statusErr := integration.store.RequireReauthorizationIfVersion(ctx, version)
				if statusErr != nil {
					return errors.Join(err, statusErr)
				}
				if !updated {
					return ErrStaleCredentials
				}
				return fmt.Errorf("%s rejected refreshed credentials: %w", integration.provider.Source().displayName(), err)
			}
		}
		tokens, refreshErr := integration.provider.RefreshTokens(ctx, refreshToken)
		if refreshErr != nil {
			if integration.provider.Unauthorized(refreshErr) {
				updated, statusErr := integration.store.RequireReauthorizationIfVersion(ctx, version)
				if statusErr != nil {
					return errors.Join(refreshErr, statusErr)
				}
				if !updated {
					return ErrStaleCredentials
				}
			}
			wrapped := fmt.Errorf("refresh %s tokens: %w", integration.provider.Source().displayName(), refreshErr)
			return integration.recordPermanentConnectionError(ctx, version, wrapped)
		}
		nextVersion := version.tokenVersion + 1
		// Publish before saving so a supervisor snapshot read during the save
		// does not mistake this refresh for a replacement. Every failed save
		// ends the listener, so the published version is never used for writes.
		tokenVersion.Store(int64(nextVersion))
		updated, err := integration.store.SetTokensIfVersion(ctx, version, tokens)
		if err != nil {
			return fmt.Errorf("save refreshed %s tokens: %w", integration.provider.Source().displayName(), err)
		}
		if !updated {
			return ErrStaleCredentials
		}
		accessToken = tokens.AccessToken
		refreshToken = tokens.RefreshToken
		version.tokenVersion = nextVersion
		refreshedBeforeAuthorization = true
	}
	return nil
}

type authorizedSessionFailure interface {
	HadAuthorizedSession() bool
}

func failureHadAuthorizedSession(err error) (bool, bool) {
	var failure authorizedSessionFailure
	if !errors.As(err, &failure) {
		return false, false
	}
	return failure.HadAuthorizedSession(), true
}

func (integration *integration) recordPermanentConnectionError(ctx context.Context, version connectionVersion, failure error) error {
	if !integration.provider.Permanent(failure) {
		return failure
	}
	if _, err := integration.store.MarkConnectionErrorIfVersion(ctx, version); err != nil {
		return errors.Join(failure, fmt.Errorf("record %s connection error: %w", integration.provider.Source().displayName(), err))
	}
	return failure
}

// reportRejected logs provider rows skipped at the validation seam once per
// process. The log carries identifiers and the validation reason only.
func (integration *integration) reportRejected(userID int, rejected []RejectedDonation) {
	source := integration.provider.Source()
	for _, donation := range rejected {
		if !integration.rejections.firstReport(rejectionKey{userID: userID, sourceDonationID: donation.SourceDonationID}) {
			continue
		}
		slog.Error(source.displayName()+" donation skipped",
			"source", source,
			"userId", userID,
			"sourceDonationId", donation.SourceDonationID,
			"error", donation.Err,
		)
	}
}

func contextDone(ctx context.Context) bool { return ctx.Err() != nil }

func (integration *integration) syncRecentHistory(ctx context.Context) {
	integration.syncHistory(ctx, true)
}

func (integration *integration) syncHistory(ctx context.Context, recent bool) {
	name := integration.provider.Source().displayName()
	connections, err := integration.store.Connections(ctx)
	if err != nil {
		if ctx.Err() == nil {
			slog.Error("get connections for "+name+" history", "error", err)
		}
		return
	}
	workerLimit := 1
	accountTimeout := time.Duration(0)
	if recent {
		workerLimit = integration.recoveryLimit
		accountTimeout = integration.recoveryTimeout
	}
	if workerLimit > len(connections) {
		workerLimit = len(connections)
	}
	if workerLimit == 0 {
		return
	}
	jobs := make(chan Connection, len(connections))
	for _, connection := range connections {
		jobs <- connection
	}
	close(jobs)
	var workers sync.WaitGroup
	workers.Add(workerLimit)
	for range workerLimit {
		go func() {
			defer workers.Done()
			for connection := range jobs {
				integration.syncConnectionHistory(ctx, name, connection, recent, accountTimeout)
			}
		}()
	}
	workers.Wait()
}

func (integration *integration) syncConnectionHistory(ctx context.Context, name string, connection Connection, recent bool, timeout time.Duration) {
	accountCtx := ctx
	cancel := func() {}
	if timeout > 0 {
		accountCtx, cancel = context.WithTimeout(ctx, timeout)
	}
	defer cancel()
	var occurredAfter *time.Time
	if recent {
		cutoff := integration.now().Add(-donationalert.MaxAlertAge)
		occurredAfter = &cutoff
	}
	batch, err := integration.provider.GetDonations(
		accountCtx,
		connection.AccessToken,
		connection.SourceUserID,
		connection.HistoryCheckpoint,
		occurredAfter,
	)
	if err != nil {
		if integration.provider.Permanent(err) {
			if _, statusErr := integration.store.MarkConnectionErrorIfVersion(ctx, connection.version()); statusErr != nil && ctx.Err() == nil {
				slog.Error("record "+name+" history error", "userId", connection.UserID, "error", statusErr)
			}
		}
		if ctx.Err() == nil {
			slog.Error("fetch "+name+" history", "userId", connection.UserID, "error", err)
		}
		return
	}
	integration.reportRejected(connection.UserID, batch.Rejected)
	if err := integration.store.SaveDonations(accountCtx, connection.version(), batch, RecoveryOrigin, integration.now()); err != nil && ctx.Err() == nil {
		slog.Error("insert "+name+" history", "userId", connection.UserID, "error", err)
	}
}

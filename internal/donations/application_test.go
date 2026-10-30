package donations

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/streambrew-app/streambrew/internal/streamlabs"
)

type applicationTestStore struct {
	connections            []Connection
	savedConnection        *ProviderConnection
	savedBatch             DonationBatch
	savedOrigin            IngestionOrigin
	savedAcceptedAt        time.Time
	savedVersion           connectionVersion
	disconnectedUser       int
	reauthorizationVersion connectionVersion
	connectionErrorVersion connectionVersion
	setTokensVersion       connectionVersion
	setTokensUpdated       bool
}

func (store *applicationTestStore) Connections(context.Context) ([]Connection, error) {
	return append([]Connection(nil), store.connections...), nil
}
func (store *applicationTestStore) SaveConnectionWithDonations(_ context.Context, _ int, connection ProviderConnection, batch DonationBatch) error {
	store.savedConnection = &connection
	store.savedBatch = batch
	return nil
}
func (store *applicationTestStore) SaveDonations(_ context.Context, version connectionVersion, batch DonationBatch, origin IngestionOrigin, acceptedAt time.Time) error {
	store.savedVersion = version
	store.savedBatch = batch
	store.savedOrigin = origin
	store.savedAcceptedAt = acceptedAt
	return nil
}
func (store *applicationTestStore) SetTokensIfVersion(_ context.Context, version connectionVersion, _ Tokens) (bool, error) {
	store.setTokensVersion = version
	return store.setTokensUpdated, nil
}
func (store *applicationTestStore) Disconnect(_ context.Context, userID int) error {
	store.disconnectedUser = userID
	return nil
}
func (store *applicationTestStore) RequireReauthorizationIfVersion(_ context.Context, version connectionVersion) (bool, error) {
	store.reauthorizationVersion = version
	return true, nil
}
func (store *applicationTestStore) MarkConnectionErrorIfVersion(_ context.Context, version connectionVersion) (bool, error) {
	store.connectionErrorVersion = version
	return true, nil
}

var testConnectedAt = time.Date(2026, 9, 10, 12, 0, 0, 0, time.UTC)

func listenerVersion(connection Connection) *atomic.Int64 {
	version := new(atomic.Int64)
	version.Store(int64(connection.TokenVersion))
	return version
}

type unauthorizedTestError struct{ hadAuthorizedSession bool }

func (*unauthorizedTestError) Error() string { return "unauthorized" }
func (err *unauthorizedTestError) HadAuthorizedSession() bool {
	return err.hadAuthorizedSession
}

type permanentTestError struct{}

func (*permanentTestError) Error() string { return "permanent" }

type applicationTestProvider struct {
	source              Source
	connection          ProviderConnection
	batch               DonationBatch
	historyErr          error
	historyAfter        *time.Time
	historySourceUserID string
	getDonations        func(context.Context, string, string, *string, *time.Time) (DonationBatch, error)
	run                 func(context.Context, string, string, *string, func(DonationBatch) error) error
	refresh             func(context.Context, string) (Tokens, error)
}

func (provider *applicationTestProvider) Source() Source { return provider.source }
func (*applicationTestProvider) AuthorizationURL(redirectURI, state string) string {
	return "https://provider.test/authorize?redirect_uri=" + redirectURI + "&state=" + state
}
func (provider *applicationTestProvider) IssueConnection(context.Context, string, string) (ProviderConnection, error) {
	return provider.connection, nil
}
func (provider *applicationTestProvider) GetDonations(ctx context.Context, accessToken, sourceUserID string, checkpoint *string, occurredAfter *time.Time) (DonationBatch, error) {
	if provider.getDonations != nil {
		return provider.getDonations(ctx, accessToken, sourceUserID, checkpoint, occurredAfter)
	}
	provider.historySourceUserID = sourceUserID
	if occurredAfter == nil {
		provider.historyAfter = nil
	} else {
		copied := *occurredAfter
		provider.historyAfter = &copied
	}
	return provider.batch, provider.historyErr
}
func (provider *applicationTestProvider) Run(ctx context.Context, accessToken, sourceUserID string, checkpoint *string, emit func(DonationBatch) error) error {
	return provider.run(ctx, accessToken, sourceUserID, checkpoint, emit)
}
func (provider *applicationTestProvider) RefreshTokens(ctx context.Context, refreshToken string) (Tokens, error) {
	return provider.refresh(ctx, refreshToken)
}
func (*applicationTestProvider) Unauthorized(err error) bool {
	var unauthorized *unauthorizedTestError
	return errors.As(err, &unauthorized)
}
func (*applicationTestProvider) Permanent(err error) bool {
	var permanent *permanentTestError
	return errors.As(err, &permanent)
}

func testProvider() *applicationTestProvider {
	return &applicationTestProvider{source: StreamlabsSource}
}

func TestConnectImportsHistoryBeforeAtomicSave(t *testing.T) {
	store := &applicationTestStore{}
	donation := Donation{SourceDonationID: "donation-1"}
	connection := ProviderConnection{SourceUserID: "source-user", Tokens: Tokens{AccessToken: "access", RefreshToken: "refresh"}}
	provider := testProvider()
	provider.connection = connection
	provider.batch = DonationBatch{Donations: []Donation{donation}}
	integration := newIntegration(store, provider)
	if err := integration.connect(context.Background(), 42, "code", "https://streambrew.test/callback"); err != nil {
		t.Fatal(err)
	}
	if store.savedConnection == nil || *store.savedConnection != connection || len(store.savedBatch.Donations) != 1 || store.savedBatch.Donations[0].SourceDonationID != "donation-1" {
		t.Fatalf("connection=%#v batch=%#v", store.savedConnection, store.savedBatch)
	}
	if provider.historySourceUserID != connection.SourceUserID {
		t.Fatalf("history source user id = %q", provider.historySourceUserID)
	}
}

func TestConnectHistoryFailureDoesNotSavePartialConnection(t *testing.T) {
	store := &applicationTestStore{}
	provider := testProvider()
	provider.connection = ProviderConnection{Tokens: Tokens{AccessToken: "access"}}
	provider.historyErr = errors.New("history unavailable")
	integration := newIntegration(store, provider)
	if err := integration.connect(context.Background(), 42, "code", "https://streambrew.test/callback"); err == nil {
		t.Fatal("expected history failure")
	}
	if store.savedConnection != nil {
		t.Fatal("connection was saved before history completed")
	}
}

func TestRefreshListenersReplacesListenerAfterReconnect(t *testing.T) {
	store := &applicationTestStore{connections: []Connection{{UserID: 42, AccessToken: "first", TokenVersion: 1}}}
	started := make(chan string, 2)
	cancelled := make(chan string, 2)
	provider := testProvider()
	provider.run = func(ctx context.Context, token, _ string, _ *string, _ func(DonationBatch) error) error {
		started <- token
		<-ctx.Done()
		cancelled <- token
		return nil
	}
	provider.refresh = func(context.Context, string) (Tokens, error) { return Tokens{}, nil }
	integration := newIntegration(store, provider)
	running := make(map[int]runningListener)
	completed := make(chan listenerCompletion, 2)
	var listeners sync.WaitGroup
	ctx, cancel := context.WithCancel(context.Background())
	defer func() { cancel(); listeners.Wait() }()
	if err := integration.refreshListeners(ctx, running, completed, &listeners); err != nil {
		t.Fatal(err)
	}
	if token := <-started; token != "first" {
		t.Fatalf("first token = %q", token)
	}
	store.connections = []Connection{{UserID: 42, AccessToken: "second", TokenVersion: 2}}
	if err := integration.refreshListeners(ctx, running, completed, &listeners); err != nil {
		t.Fatal(err)
	}
	if token := <-cancelled; token != "first" {
		t.Fatalf("cancelled token = %q", token)
	}
	if token := <-started; token != "second" || running[42].tokenVersion.Load() != 2 {
		t.Fatalf("replacement token=%q listener=%#v", token, running[42])
	}
}

func TestRefreshListenersReplacesListenerForAnotherAccountWithReusedVersion(t *testing.T) {
	store := &applicationTestStore{connections: []Connection{{
		UserID: 42, SourceUserID: "account-a", ConnectedAt: testConnectedAt, AccessToken: "account-a", TokenVersion: 1,
	}}}
	started := make(chan string, 2)
	cancelled := make(chan string, 2)
	provider := testProvider()
	provider.run = func(ctx context.Context, token, _ string, _ *string, _ func(DonationBatch) error) error {
		started <- token
		<-ctx.Done()
		cancelled <- token
		return nil
	}
	integration := newIntegration(store, provider)
	running := make(map[int]runningListener)
	completed := make(chan listenerCompletion, 2)
	var listeners sync.WaitGroup
	ctx, cancel := context.WithCancel(context.Background())
	defer func() { cancel(); listeners.Wait() }()
	if err := integration.refreshListeners(ctx, running, completed, &listeners); err != nil {
		t.Fatal(err)
	}
	if token := <-started; token != "account-a" {
		t.Fatalf("first token = %q", token)
	}

	// Disconnecting and connecting another account recreates the row, which
	// restarts its token version at the schema default.
	store.connections = []Connection{{
		UserID: 42, SourceUserID: "account-b", ConnectedAt: testConnectedAt.Add(time.Second), AccessToken: "account-b", TokenVersion: 1,
	}}
	if err := integration.refreshListeners(ctx, running, completed, &listeners); err != nil {
		t.Fatal(err)
	}
	if token := <-cancelled; token != "account-a" {
		t.Fatalf("cancelled token = %q", token)
	}
	if token := <-started; token != "account-b" || running[42].sourceUserID != "account-b" {
		t.Fatalf("replacement token=%q listener=%#v", token, running[42])
	}
}

type refreshingTestStore struct {
	applicationTestStore
	mu         sync.Mutex
	connection Connection
}

func (store *refreshingTestStore) Connections(context.Context) ([]Connection, error) {
	store.mu.Lock()
	defer store.mu.Unlock()
	return []Connection{store.connection}, nil
}

func (store *refreshingTestStore) SetTokensIfVersion(_ context.Context, version connectionVersion, tokens Tokens) (bool, error) {
	store.mu.Lock()
	defer store.mu.Unlock()
	if version != store.connection.version() {
		return false, nil
	}
	store.connection.AccessToken = tokens.AccessToken
	store.connection.RefreshToken = tokens.RefreshToken
	store.connection.TokenVersion++
	return true, nil
}

func TestRefreshListenersKeepsListenerAfterItsOwnTokenRefresh(t *testing.T) {
	store := &refreshingTestStore{connection: Connection{
		UserID: 42, SourceUserID: "account", ConnectedAt: testConnectedAt, AccessToken: "expired", RefreshToken: "refresh-1", TokenVersion: 1,
	}}
	started := make(chan string, 2)
	cancelled := make(chan string, 2)
	provider := testProvider()
	provider.run = func(ctx context.Context, token, _ string, _ *string, _ func(DonationBatch) error) error {
		if token == "expired" {
			return &unauthorizedTestError{hadAuthorizedSession: true}
		}
		started <- token
		<-ctx.Done()
		cancelled <- token
		return nil
	}
	provider.refresh = func(context.Context, string) (Tokens, error) {
		return Tokens{AccessToken: "fresh", RefreshToken: "refresh-2"}, nil
	}
	integration := newIntegration(store, provider)
	running := make(map[int]runningListener)
	completed := make(chan listenerCompletion, 2)
	var listeners sync.WaitGroup
	ctx, cancel := context.WithCancel(context.Background())
	defer func() { cancel(); listeners.Wait() }()
	if err := integration.refreshListeners(ctx, running, completed, &listeners); err != nil {
		t.Fatal(err)
	}
	if token := <-started; token != "fresh" {
		t.Fatalf("token after refresh = %q", token)
	}
	listener := running[42]
	if err := integration.refreshListeners(ctx, running, completed, &listeners); err != nil {
		t.Fatal(err)
	}
	select {
	case token := <-cancelled:
		t.Fatalf("listener %q was restarted after its own token refresh", token)
	case <-time.After(50 * time.Millisecond):
	}
	if running[42].tokenVersion != listener.tokenVersion || listener.tokenVersion.Load() != 2 {
		t.Fatalf("listener = %#v; want the original listener at version 2", running[42])
	}
}

func TestRunningListenerReplacementIgnoresSnapshotOlderThanItsRefresh(t *testing.T) {
	connection := Connection{UserID: 42, SourceUserID: "account", ConnectedAt: testConnectedAt, TokenVersion: 3}
	listener := runningListener{sourceUserID: "account", connectedAt: testConnectedAt, tokenVersion: listenerVersion(connection)}
	listener.tokenVersion.Store(4)
	if listener.replacedBy(connection) {
		t.Fatal("a snapshot read before the listener's refresh was treated as a replacement")
	}
	connection.TokenVersion = 5
	if !listener.replacedBy(connection) {
		t.Fatal("a newer external version was not treated as a replacement")
	}
	connection.TokenVersion = 4
	connection.ConnectedAt = testConnectedAt.Add(time.Millisecond)
	if !listener.replacedBy(connection) {
		t.Fatal("a recreated connection was not treated as a replacement")
	}
}

func TestListenerRejectsStaleRefresh(t *testing.T) {
	store := &applicationTestStore{setTokensUpdated: false}
	provider := testProvider()
	provider.run = func(context.Context, string, string, *string, func(DonationBatch) error) error {
		return &unauthorizedTestError{}
	}
	provider.refresh = func(context.Context, string) (Tokens, error) {
		return Tokens{AccessToken: "new-access", RefreshToken: "new-refresh"}, nil
	}
	integration := newIntegration(store, provider)
	connection := Connection{UserID: 42, SourceUserID: "account", ConnectedAt: testConnectedAt, AccessToken: "old", RefreshToken: "old-refresh", TokenVersion: 3}
	err := integration.listen(context.Background(), connection, listenerVersion(connection))
	if !errors.Is(err, ErrStaleCredentials) {
		t.Fatalf("error = %v", err)
	}
	if store.setTokensVersion != connection.version() {
		t.Fatalf("conditional token save version = %#v; want %#v", store.setTokensVersion, connection.version())
	}
}

func TestUnauthorizedRefreshRequiresReauthorizationForOnlyMatchingVersion(t *testing.T) {
	store := &applicationTestStore{}
	provider := testProvider()
	provider.run = func(context.Context, string, string, *string, func(DonationBatch) error) error {
		return &unauthorizedTestError{}
	}
	provider.refresh = func(context.Context, string) (Tokens, error) {
		return Tokens{}, &unauthorizedTestError{}
	}
	integration := newIntegration(store, provider)
	connection := Connection{UserID: 42, SourceUserID: "account", ConnectedAt: testConnectedAt, AccessToken: "old", RefreshToken: "old-refresh", TokenVersion: 7}
	if err := integration.listen(context.Background(), connection, listenerVersion(connection)); err == nil {
		t.Fatal("expected refresh failure")
	}
	if store.reauthorizationVersion != connection.version() {
		t.Fatalf("conditional reauthorization version = %#v", store.reauthorizationVersion)
	}
}

func TestRefreshedCredentialsRejectedBeforeAuthorizationRequireReauthorization(t *testing.T) {
	store := &applicationTestStore{setTokensUpdated: true}
	provider := testProvider()
	runs := 0
	provider.run = func(_ context.Context, accessToken, _ string, _ *string, _ func(DonationBatch) error) error {
		runs++
		if runs == 2 && accessToken != "new-access" {
			t.Fatalf("second access token = %q", accessToken)
		}
		return &unauthorizedTestError{}
	}
	refreshes := 0
	provider.refresh = func(context.Context, string) (Tokens, error) {
		refreshes++
		return Tokens{AccessToken: "new-access", RefreshToken: "new-refresh"}, nil
	}
	integration := newIntegration(store, provider)

	connection := Connection{
		UserID: 42, SourceUserID: "account", ConnectedAt: testConnectedAt, AccessToken: "old", RefreshToken: "old-refresh", TokenVersion: 7,
	}
	published := listenerVersion(connection)
	err := integration.listen(context.Background(), connection, published)
	if err == nil || refreshes != 1 || runs != 2 {
		t.Fatalf("error=%v refreshes=%d runs=%d", err, refreshes, runs)
	}
	refreshed := connection.version()
	refreshed.tokenVersion = 8
	if store.reauthorizationVersion != refreshed || published.Load() != 8 {
		t.Fatalf("conditional reauthorization version=%#v published=%d", store.reauthorizationVersion, published.Load())
	}
}

func TestAuthorizationAfterRefreshAllowsLaterTokenRefresh(t *testing.T) {
	store := &applicationTestStore{setTokensUpdated: true}
	provider := testProvider()
	runs := 0
	provider.run = func(context.Context, string, string, *string, func(DonationBatch) error) error {
		runs++
		switch runs {
		case 1:
			return &unauthorizedTestError{}
		case 2:
			return &unauthorizedTestError{hadAuthorizedSession: true}
		default:
			return context.Canceled
		}
	}
	refreshes := 0
	provider.refresh = func(context.Context, string) (Tokens, error) {
		refreshes++
		return Tokens{
			AccessToken:  fmt.Sprintf("access-%d", refreshes),
			RefreshToken: fmt.Sprintf("refresh-%d", refreshes),
		}, nil
	}
	integration := newIntegration(store, provider)

	connection := Connection{UserID: 42, AccessToken: "old", RefreshToken: "old-refresh", TokenVersion: 7}
	err := integration.listen(context.Background(), connection, listenerVersion(connection))
	if !errors.Is(err, context.Canceled) || refreshes != 2 || runs != 3 {
		t.Fatalf("error=%v refreshes=%d runs=%d", err, refreshes, runs)
	}
	if store.reauthorizationVersion != (connectionVersion{}) {
		t.Fatalf("unexpected reauthorization for %#v", store.reauthorizationVersion)
	}
}

func TestPermanentListenerFailureMarksOnlyMatchingConnectionVersion(t *testing.T) {
	store := &applicationTestStore{}
	provider := testProvider()
	provider.run = func(context.Context, string, string, *string, func(DonationBatch) error) error {
		return &permanentTestError{}
	}
	provider.refresh = func(context.Context, string) (Tokens, error) { return Tokens{}, nil }
	integration := newIntegration(store, provider)

	connection := Connection{UserID: 42, SourceUserID: "account", ConnectedAt: testConnectedAt, AccessToken: "access", TokenVersion: 9}
	err := integration.listen(context.Background(), connection, listenerVersion(connection))
	var permanent *permanentTestError
	if !errors.As(err, &permanent) {
		t.Fatalf("error = %v", err)
	}
	if store.connectionErrorVersion != connection.version() {
		t.Fatalf("conditional error version = %#v", store.connectionErrorVersion)
	}
}

func TestListenerAdvancesHistoryCheckpointAfterPersist(t *testing.T) {
	checkpoint := "old"
	next := "new"
	store := &applicationTestStore{}
	provider := testProvider()
	provider.run = func(_ context.Context, _, sourceUserID string, received *string, emit func(DonationBatch) error) error {
		if sourceUserID != "source-user" {
			t.Fatalf("source user id = %q", sourceUserID)
		}
		if received == nil || *received != checkpoint {
			t.Fatalf("checkpoint = %v", received)
		}
		if err := emit(DonationBatch{Checkpoint: &next}); err != nil {
			return err
		}
		return context.Canceled
	}
	provider.refresh = func(context.Context, string) (Tokens, error) { return Tokens{}, nil }
	integration := newIntegration(store, provider)
	acceptedAt := time.Date(2026, 9, 13, 12, 0, 0, 0, time.UTC)
	integration.now = func() time.Time { return acceptedAt }
	connection := Connection{UserID: 42, SourceUserID: "source-user", ConnectedAt: testConnectedAt, AccessToken: "access", TokenVersion: 1, HistoryCheckpoint: &checkpoint}
	if err := integration.listen(context.Background(), connection, listenerVersion(connection)); !errors.Is(err, context.Canceled) {
		t.Fatalf("error = %v", err)
	}
	if store.savedVersion != connection.version() {
		t.Fatalf("saved version = %#v", store.savedVersion)
	}
	if store.savedBatch.Checkpoint == nil || *store.savedBatch.Checkpoint != next {
		t.Fatalf("saved checkpoint = %v", store.savedBatch.Checkpoint)
	}
	if store.savedOrigin != LiveOrigin || !store.savedAcceptedAt.Equal(acceptedAt) {
		t.Fatalf("origin=%q acceptedAt=%v", store.savedOrigin, store.savedAcceptedAt)
	}
}

func TestHistorySyncUsesRecoveryOrigin(t *testing.T) {
	checkpoint := "checkpoint"
	store := &applicationTestStore{connections: []Connection{{UserID: 42, SourceUserID: "source-user", AccessToken: "access", TokenVersion: 3, HistoryCheckpoint: &checkpoint}}}
	provider := testProvider()
	provider.batch = DonationBatch{Donations: []Donation{{SourceDonationID: "recovered"}}}
	integration := newIntegration(store, provider)
	acceptedAt := time.Date(2026, 9, 13, 12, 0, 0, 0, time.UTC)
	integration.now = func() time.Time { return acceptedAt }
	integration.syncHistory(context.Background(), false)
	if store.savedOrigin != RecoveryOrigin || !store.savedAcceptedAt.Equal(acceptedAt) {
		t.Fatalf("origin=%q acceptedAt=%v", store.savedOrigin, store.savedAcceptedAt)
	}
	if provider.historySourceUserID != "source-user" {
		t.Fatalf("history source user id = %q", provider.historySourceUserID)
	}
}

func TestPermanentHistoryFailureMarksOnlyMatchingConnectionVersion(t *testing.T) {
	store := &applicationTestStore{connections: []Connection{{
		UserID: 42, AccessToken: "access", TokenVersion: 3,
	}}}
	provider := testProvider()
	provider.historyErr = &permanentTestError{}
	integration := newIntegration(store, provider)

	integration.syncHistory(context.Background(), false)

	if store.connectionErrorVersion != store.connections[0].version() {
		t.Fatalf("conditional error version = %#v", store.connectionErrorVersion)
	}
}

func TestHistorySyncReportsEachRejectedDonationOnce(t *testing.T) {
	var logs bytes.Buffer
	previousLogger := slog.Default()
	slog.SetDefault(slog.New(slog.NewJSONHandler(&logs, nil)))
	defer slog.SetDefault(previousLogger)

	store := &applicationTestStore{connections: []Connection{{UserID: 42, AccessToken: "secret-access-token", TokenVersion: 1}}}
	provider := testProvider()
	provider.batch = DonationBatch{
		Donations: []Donation{{SourceDonationID: "valid"}},
		Rejected:  []RejectedDonation{{SourceDonationID: "invalid", Err: errors.New("invalid donation amount")}},
	}
	integration := newIntegration(store, provider)
	integration.syncHistory(context.Background(), false)
	integration.syncHistory(context.Background(), false)

	if len(store.savedBatch.Donations) != 1 || store.savedBatch.Donations[0].SourceDonationID != "valid" {
		t.Fatalf("saved batch = %#v", store.savedBatch)
	}
	output := logs.String()
	if count := strings.Count(output, `"msg":"Streamlabs donation skipped"`); count != 1 {
		t.Fatalf("skipped donation logged %d times: %s", count, output)
	}
	for _, field := range []string{`"level":"ERROR"`, `"source":"streamlabs"`, `"userId":42`, `"sourceDonationId":"invalid"`, "invalid donation amount"} {
		if !strings.Contains(output, field) {
			t.Fatalf("log lacks %s: %s", field, output)
		}
	}
	if strings.Contains(output, "secret-access-token") {
		t.Fatalf("log leaked access token: %s", output)
	}
}

type recoveryIsolationStore struct {
	applicationTestStore
	saved chan<- int
}

func (store *recoveryIsolationStore) SaveDonations(_ context.Context, version connectionVersion, _ DonationBatch, _ IngestionOrigin, _ time.Time) error {
	store.saved <- version.userID
	return nil
}

func TestRecentHistorySyncDoesNotLetBlockedAccountDelayHealthyAccount(t *testing.T) {
	saved := make(chan int, 2)
	store := &recoveryIsolationStore{
		applicationTestStore: applicationTestStore{connections: []Connection{
			{UserID: 1, AccessToken: "blocked", TokenVersion: 1},
			{UserID: 2, AccessToken: "healthy", TokenVersion: 1},
		}},
		saved: saved,
	}
	blockedStarted := make(chan struct{})
	provider := testProvider()
	provider.getDonations = func(ctx context.Context, accessToken, _ string, _ *string, occurredAfter *time.Time) (DonationBatch, error) {
		if occurredAfter == nil {
			return DonationBatch{}, errors.New("missing recovery cutoff")
		}
		if accessToken == "blocked" {
			close(blockedStarted)
			<-ctx.Done()
			return DonationBatch{}, ctx.Err()
		}
		return DonationBatch{Donations: []Donation{{SourceDonationID: "fresh"}}}, nil
	}
	integration := newIntegration(store, provider)
	integration.recoveryLimit = 2
	integration.recoveryTimeout = 50 * time.Millisecond
	done := make(chan struct{})
	go func() {
		integration.syncRecentHistory(context.Background())
		close(done)
	}()

	select {
	case <-blockedStarted:
	case <-time.After(time.Second):
		t.Fatal("blocked account did not start")
	}
	select {
	case userID := <-saved:
		if userID != 2 {
			t.Fatalf("first recovered user = %d, want 2", userID)
		}
	case <-time.After(250 * time.Millisecond):
		t.Fatal("healthy account was delayed by blocked account")
	}
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("bounded recovery did not stop blocked account")
	}
}

func TestStreamlabsReconciliationRetriesWithBackoffAndRetryHint(t *testing.T) {
	responses := []func(http.ResponseWriter){
		func(writer http.ResponseWriter) {
			writer.Header().Set("Retry-After", "17")
			writer.WriteHeader(http.StatusTooManyRequests)
		},
		func(writer http.ResponseWriter) { writer.WriteHeader(http.StatusBadGateway) },
		func(writer http.ResponseWriter) { writer.WriteHeader(http.StatusServiceUnavailable) },
		func(writer http.ResponseWriter) {
			_, _ = writer.Write([]byte(`{"data":[` +
				`{"donation_id":"20","created_at":"1438576556","currency":"USD","amount":"5","name":null,"message":null},` +
				`{"donation_id":"10","created_at":"1438576500","currency":"USD","amount":"1","name":null,"message":null}]}`))
		},
	}
	requests := 0
	adapter := testStreamlabsAdapter(func(writer http.ResponseWriter, _ *http.Request) {
		responses[requests](writer)
		requests++
	})
	var waits []time.Duration
	adapter.wait = func(_ context.Context, duration time.Duration) error {
		waits = append(waits, duration)
		return nil
	}

	checkpoint := "10"
	batch, err := adapter.reconcile(context.Background(), "access-token", &checkpoint)
	if err != nil {
		t.Fatal(err)
	}
	if len(batch.Donations) != 1 || batch.Donations[0].SourceDonationID != "20" || batch.Checkpoint == nil || *batch.Checkpoint != "20" {
		t.Fatalf("batch = %#v", batch)
	}
	expected := []time.Duration{17 * time.Second, 10 * time.Second, 20 * time.Second}
	if !reflect.DeepEqual(waits, expected) {
		t.Fatalf("retry waits = %v; want %v", waits, expected)
	}
}

func TestStreamlabsReconciliationReturnsUnauthorizedWithoutRetry(t *testing.T) {
	adapter := testStreamlabsAdapter(func(writer http.ResponseWriter, _ *http.Request) {
		writer.WriteHeader(http.StatusUnauthorized)
	})
	adapter.wait = func(context.Context, time.Duration) error {
		t.Fatal("unauthorized reconciliation was retried")
		return nil
	}
	_, err := adapter.reconcile(context.Background(), "expired", nil)
	if !adapter.Unauthorized(err) {
		t.Fatalf("error = %v; want unauthorized", err)
	}
}

func TestStreamlabsReconciliationStopsRetryingWhenCancelled(t *testing.T) {
	adapter := testStreamlabsAdapter(func(writer http.ResponseWriter, _ *http.Request) {
		writer.WriteHeader(http.StatusInternalServerError)
	})
	ctx, cancel := context.WithCancel(context.Background())
	adapter.wait = func(context.Context, time.Duration) error {
		cancel()
		return context.Canceled
	}
	if _, err := adapter.reconcile(ctx, "access-token", nil); !errors.Is(err, context.Canceled) {
		t.Fatalf("error = %v; want cancellation", err)
	}
}

func testStreamlabsAdapter(handler http.HandlerFunc) *StreamlabsAdapter {
	client := streamlabs.NewClient(&http.Client{Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
		recorder := httptest.NewRecorder()
		handler.ServeHTTP(recorder, request)
		return recorder.Result(), nil
	})})
	client.BaseURL = "https://streamlabs.test"
	client.PageDelay = 0
	return NewStreamlabsAdapter(client, streamlabs.NewSource(client), streamlabs.Config{})
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (function roundTripFunc) RoundTrip(request *http.Request) (*http.Response, error) {
	return function(request)
}

package donations

import (
	"context"
	"errors"
	"log/slog"
	"time"

	"github.com/streambrew-app/streambrew/internal/donationalerts"
	"github.com/streambrew-app/streambrew/internal/streamelements"
	"github.com/streambrew-app/streambrew/internal/streamlabs"
)

type Source string

const (
	DonationAlertsSource Source = "donationalerts"
	DonateStreamSource   Source = "donate_stream"
	StreamlabsSource     Source = "streamlabs"
	TourniquetSource     Source = "tourniquet"
	StreamElementsSource Source = "streamelements"
)

func validIngestionOrigin(origin IngestionOrigin) bool {
	return origin == InitialHistoryOrigin || origin == LiveOrigin || origin == RecoveryOrigin
}

// IngestionOrigin distinguishes an account's initial import from donations
// accepted while its connection is already active. Recovery imports can create
// alerts when the donation is still fresh; initial history never does.
type IngestionOrigin string

const (
	InitialHistoryOrigin IngestionOrigin = "initial_history"
	LiveOrigin           IngestionOrigin = "live"
	RecoveryOrigin       IngestionOrigin = "recovery"
)

func (source Source) displayName() string {
	switch source {
	case DonationAlertsSource:
		return "DonationAlerts"
	case DonateStreamSource:
		return "donate.stream"
	case StreamlabsSource:
		return "Streamlabs"
	case TourniquetSource:
		return "Tourniquet"
	case StreamElementsSource:
		return "StreamElements"
	default:
		return string(source)
	}
}

func parseSource(value string) (Source, bool) {
	source := Source(value)
	switch source {
	case DonationAlertsSource, DonateStreamSource, StreamlabsSource, TourniquetSource, StreamElementsSource:
		return source, true
	default:
		return "", false
	}
}

type Tokens struct {
	AccessToken  string
	RefreshToken string
}

type ProviderConnection struct {
	Tokens
	SourceUserID string
}

type Donation struct {
	SourceDonationID string
	Author           *string
	Message          *string
	Amount           string
	Currency         string
	SourceCreatedAt  string
	OccurredAt       time.Time
}

// RejectedDonation is a provider row skipped because it failed validation.
type RejectedDonation struct {
	SourceDonationID string
	Err              error
}

type DonationBatch struct {
	Donations []Donation
	// Rejected rows are reported but never persisted or used as checkpoints.
	Rejected   []RejectedDonation
	Checkpoint *string
}

type provider interface {
	Source() Source
	AuthorizationURL(redirectURI, state string) string
	IssueConnection(context.Context, string, string) (ProviderConnection, error)
	RefreshTokens(context.Context, string) (Tokens, error)
	GetDonations(context.Context, string, string, *string, *time.Time) (DonationBatch, error)
	Run(context.Context, string, string, *string, func(DonationBatch) error) error
	Unauthorized(error) bool
	Permanent(error) bool
}

type DonationAlertsAdapter struct {
	client *donationalerts.Client
	source *donationalerts.Source
	config donationalerts.Config
}

func NewDonationAlertsAdapter(client *donationalerts.Client, source *donationalerts.Source, config donationalerts.Config) *DonationAlertsAdapter {
	return &DonationAlertsAdapter{client: client, source: source, config: config}
}

func (*DonationAlertsAdapter) Source() Source { return DonationAlertsSource }

func (adapter *DonationAlertsAdapter) AuthorizationURL(redirectURI, _ string) string {
	return donationalerts.AuthorizationURL(adapter.config.ClientID, redirectURI)
}

func (adapter *DonationAlertsAdapter) IssueConnection(ctx context.Context, authCode, redirectURI string) (ProviderConnection, error) {
	connection, err := adapter.client.IssueConnection(ctx, adapter.config, authCode, redirectURI)
	if err != nil {
		return ProviderConnection{}, err
	}
	return ProviderConnection{
		SourceUserID: connection.SourceUserID,
		Tokens: Tokens{
			AccessToken:  connection.AccessToken,
			RefreshToken: connection.RefreshToken,
		},
	}, nil
}

func (adapter *DonationAlertsAdapter) RefreshTokens(ctx context.Context, refreshToken string) (Tokens, error) {
	tokens, err := adapter.client.RefreshTokens(ctx, adapter.config, refreshToken)
	if err != nil {
		return Tokens{}, err
	}
	return Tokens{AccessToken: tokens.AccessToken, RefreshToken: tokens.RefreshToken}, nil
}

func (adapter *DonationAlertsAdapter) GetDonations(ctx context.Context, accessToken, _ string, _ *string, occurredAfter *time.Time) (DonationBatch, error) {
	var history donationalerts.History
	var err error
	if occurredAfter == nil {
		history, err = adapter.client.GetDonations(ctx, accessToken)
	} else {
		history, err = adapter.client.GetDonationsAfter(ctx, accessToken, *occurredAfter)
	}
	if err != nil {
		return DonationBatch{}, err
	}
	rejected := make([]RejectedDonation, len(history.Rejected))
	for index, donation := range history.Rejected {
		rejected[index] = RejectedDonation(donation)
	}
	return DonationBatch{Donations: donationAlertsDonations(history.Donations), Rejected: rejected}, nil
}

func (adapter *DonationAlertsAdapter) Run(ctx context.Context, accessToken, _ string, _ *string, emit func(DonationBatch) error) error {
	return adapter.source.Run(ctx, accessToken, func(donation donationalerts.Donation) error {
		return emit(DonationBatch{Donations: donationAlertsDonations([]donationalerts.Donation{donation})})
	})
}

func (*DonationAlertsAdapter) Unauthorized(err error) bool {
	var requestError *donationalerts.RequestError
	return errors.As(err, &requestError) && requestError.Unauthorized
}

func (*DonationAlertsAdapter) Permanent(error) bool { return false }

func donationAlertsDonations(donations []donationalerts.Donation) []Donation {
	result := make([]Donation, len(donations))
	for index, donation := range donations {
		result[index] = Donation{
			SourceDonationID: donation.SourceDonationID,
			Author:           donation.Author,
			Message:          donation.Message,
			Amount:           donation.Amount,
			Currency:         donation.Currency,
			SourceCreatedAt:  donation.SourceCreatedAt,
			OccurredAt:       donation.OccurredAt,
		}
	}
	return result
}

const streamlabsWakeDebounce = 250 * time.Millisecond

type StreamlabsAdapter struct {
	client *streamlabs.Client
	source *streamlabs.Source
	config streamlabs.Config
	// Reconciliation retry pacing; failed reconciliations keep the socket open.
	retryStart time.Duration
	retryMax   time.Duration
	wait       func(context.Context, time.Duration) error
}

func NewStreamlabsAdapter(client *streamlabs.Client, source *streamlabs.Source, config streamlabs.Config) *StreamlabsAdapter {
	return &StreamlabsAdapter{
		client:     client,
		source:     source,
		config:     config,
		retryStart: 5 * time.Second,
		retryMax:   60 * time.Second,
		wait:       waitContext,
	}
}

func (*StreamlabsAdapter) Source() Source { return StreamlabsSource }

func (adapter *StreamlabsAdapter) AuthorizationURL(redirectURI, state string) string {
	return streamlabs.AuthorizationURL(adapter.config.ClientID, redirectURI, state)
}

func (adapter *StreamlabsAdapter) IssueConnection(ctx context.Context, authCode, redirectURI string) (ProviderConnection, error) {
	connection, err := adapter.client.IssueConnection(ctx, adapter.config, authCode, redirectURI)
	if err != nil {
		return ProviderConnection{}, err
	}
	return ProviderConnection{
		SourceUserID: connection.SourceUserID,
		Tokens: Tokens{
			AccessToken:  connection.AccessToken,
			RefreshToken: connection.RefreshToken,
		},
	}, nil
}

func (adapter *StreamlabsAdapter) RefreshTokens(ctx context.Context, refreshToken string) (Tokens, error) {
	tokens, err := adapter.client.RefreshTokens(ctx, adapter.config, refreshToken)
	if err != nil {
		return Tokens{}, err
	}
	return Tokens{AccessToken: tokens.AccessToken, RefreshToken: tokens.RefreshToken}, nil
}

func (adapter *StreamlabsAdapter) GetDonations(ctx context.Context, accessToken, _ string, checkpoint *string, _ *time.Time) (DonationBatch, error) {
	history, err := adapter.client.GetDonations(ctx, accessToken, checkpoint)
	if err != nil {
		return DonationBatch{}, err
	}
	return streamlabsBatch(history), nil
}

func (adapter *StreamlabsAdapter) Run(ctx context.Context, accessToken, _ string, checkpoint *string, emit func(DonationBatch) error) error {
	// listenerCtx also ends when the socket listener stops, which interrupts a
	// reconciliation retry instead of leaving it waiting for a dead socket.
	listenerCtx, cancel := context.WithCancel(ctx)
	defer cancel()
	wakes := make(chan struct{}, 1)
	listenerDone := make(chan error, 1)
	go func() {
		defer cancel()
		listenerDone <- adapter.source.Run(listenerCtx, accessToken, func() error {
			select {
			case wakes <- struct{}{}:
			default:
			}
			return nil
		})
	}()
	listenerResult := func() error {
		if ctx.Err() != nil {
			return nil
		}
		if err := <-listenerDone; err != nil {
			return err
		}
		return errors.New("listener for Streamlabs stopped unexpectedly")
	}

	currentCheckpoint := checkpoint
	for {
		select {
		case <-listenerCtx.Done():
			return listenerResult()
		case <-wakes:
			if err := adapter.wait(listenerCtx, streamlabsWakeDebounce); err != nil {
				return listenerResult()
			}
			for len(wakes) > 0 {
				<-wakes
			}
			batch, err := adapter.reconcile(listenerCtx, accessToken, currentCheckpoint)
			if listenerCtx.Err() != nil {
				return listenerResult()
			}
			if err != nil {
				return err
			}
			if err := emit(batch); err != nil {
				return err
			}
			currentCheckpoint = batch.Checkpoint
		}
	}
}

// reconcile reads history after a socket wake-up. Failures other than
// unauthorized credentials are retried with bounded exponential backoff that
// honors the provider's Retry-After hint, so a rate limit or provider outage
// neither closes the socket nor restarts the listener.
func (adapter *StreamlabsAdapter) reconcile(ctx context.Context, accessToken string, checkpoint *string) (DonationBatch, error) {
	delay := adapter.retryStart
	for {
		history, err := adapter.client.GetDonations(ctx, accessToken, checkpoint)
		if err == nil {
			return streamlabsBatch(history), nil
		}
		if ctx.Err() != nil || adapter.Unauthorized(err) {
			return DonationBatch{}, err
		}
		retry := delay
		var requestError *streamlabs.RequestError
		if errors.As(err, &requestError) {
			retry = max(retry, requestError.RetryAfter)
		}
		slog.WarnContext(ctx, "Streamlabs reconciliation will retry", "error", err, "retry", retry)
		if waitErr := adapter.wait(ctx, retry); waitErr != nil {
			return DonationBatch{}, waitErr
		}
		delay = min(delay*2, adapter.retryMax)
	}
}

func (*StreamlabsAdapter) Unauthorized(err error) bool {
	var requestError *streamlabs.RequestError
	return errors.As(err, &requestError) && requestError.Unauthorized
}

func (*StreamlabsAdapter) Permanent(error) bool { return false }

func streamlabsBatch(history streamlabs.History) DonationBatch {
	donations := make([]Donation, len(history.Donations))
	for index, donation := range history.Donations {
		donations[index] = Donation{
			SourceDonationID: donation.SourceDonationID,
			Author:           donation.Author,
			Message:          donation.Message,
			Amount:           donation.Amount,
			Currency:         donation.Currency,
			SourceCreatedAt:  donation.SourceCreatedAt,
			OccurredAt:       donation.OccurredAt,
		}
	}
	rejected := make([]RejectedDonation, len(history.Rejected))
	for index, donation := range history.Rejected {
		rejected[index] = RejectedDonation(donation)
	}
	return DonationBatch{Donations: donations, Rejected: rejected, Checkpoint: history.Checkpoint}
}

type StreamElementsAdapter struct {
	client *streamelements.Client
	source *streamelements.Source
	config streamelements.Config
}

func NewStreamElementsAdapter(client *streamelements.Client, source *streamelements.Source, config streamelements.Config) *StreamElementsAdapter {
	return &StreamElementsAdapter{client: client, source: source, config: config}
}

func (*StreamElementsAdapter) Source() Source { return StreamElementsSource }

func (adapter *StreamElementsAdapter) AuthorizationURL(redirectURI, state string) string {
	return streamelements.AuthorizationURL(adapter.config.ClientID, redirectURI, state)
}

func (adapter *StreamElementsAdapter) IssueConnection(ctx context.Context, authCode, redirectURI string) (ProviderConnection, error) {
	connection, err := adapter.client.IssueConnection(ctx, adapter.config, authCode, redirectURI)
	if err != nil {
		return ProviderConnection{}, err
	}
	return ProviderConnection{
		SourceUserID: connection.SourceUserID,
		Tokens: Tokens{
			AccessToken:  connection.AccessToken,
			RefreshToken: connection.RefreshToken,
		},
	}, nil
}

func (adapter *StreamElementsAdapter) RefreshTokens(ctx context.Context, refreshToken string) (Tokens, error) {
	tokens, err := adapter.client.RefreshTokens(ctx, adapter.config, refreshToken)
	if err != nil {
		return Tokens{}, err
	}
	return Tokens{AccessToken: tokens.AccessToken, RefreshToken: tokens.RefreshToken}, nil
}

func (adapter *StreamElementsAdapter) GetDonations(ctx context.Context, accessToken, sourceUserID string, checkpoint *string, occurredAfter *time.Time) (DonationBatch, error) {
	history, err := adapter.client.GetDonations(ctx, accessToken, sourceUserID, checkpoint, occurredAfter)
	if err != nil {
		return DonationBatch{}, err
	}
	return streamElementsBatch(history), nil
}

func (adapter *StreamElementsAdapter) Run(ctx context.Context, accessToken, sourceUserID string, _ *string, emit func(DonationBatch) error) error {
	return adapter.source.Run(ctx, accessToken, sourceUserID, func(donation streamelements.Donation) error {
		return emit(DonationBatch{Donations: streamElementsDonations([]streamelements.Donation{donation})})
	})
}

func (*StreamElementsAdapter) Unauthorized(err error) bool {
	var requestError *streamelements.RequestError
	return errors.As(err, &requestError) && requestError.Unauthorized
}

func (*StreamElementsAdapter) Permanent(err error) bool {
	var requestError *streamelements.RequestError
	return errors.As(err, &requestError) && requestError.Permanent
}

func streamElementsBatch(history streamelements.History) DonationBatch {
	rejected := make([]RejectedDonation, len(history.Rejected))
	for index, donation := range history.Rejected {
		rejected[index] = RejectedDonation(donation)
	}
	return DonationBatch{
		Donations:  streamElementsDonations(history.Donations),
		Rejected:   rejected,
		Checkpoint: history.Checkpoint,
	}
}

func streamElementsDonations(donations []streamelements.Donation) []Donation {
	result := make([]Donation, len(donations))
	for index, donation := range donations {
		result[index] = Donation{
			SourceDonationID: donation.SourceDonationID,
			Author:           donation.Author,
			Message:          donation.Message,
			Amount:           donation.Amount,
			Currency:         donation.Currency,
			SourceCreatedAt:  donation.SourceCreatedAt,
			OccurredAt:       donation.OccurredAt,
		}
	}
	return result
}

func waitContext(ctx context.Context, duration time.Duration) error {
	timer := time.NewTimer(duration)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}

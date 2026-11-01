package chat

import (
	"context"
	"reflect"
	"sync"
	"testing"
	"time"
)

type collectorTestStore struct{ source OwnedConnectedSource }

func (store *collectorTestStore) GetAllEnabledSources(context.Context) ([]OwnedConnectedSource, error) {
	return []OwnedConnectedSource{store.source}, nil
}

type collectorTestLease struct{}

func (*collectorTestLease) Maintain(ctx context.Context) error { <-ctx.Done(); return nil }
func (*collectorTestLease) Release() error                     { return nil }

type collectorTestLeases struct{}

func (*collectorTestLeases) Acquire(context.Context, string, string) (CollectorLease, error) {
	return &collectorTestLease{}, nil
}

type collectorTestControl struct{ refreshes <-chan string }

func (control *collectorTestControl) Refreshes(context.Context) (<-chan string, error) {
	return control.refreshes, nil
}

type collectorTestBroker struct {
	mu      sync.Mutex
	events  []StreamEvent
	onEvent func(StreamEvent)
}

func (broker *collectorTestBroker) Publish(_ context.Context, _ int, event StreamEvent, _ string) error {
	broker.mu.Lock()
	broker.events = append(broker.events, event)
	broker.mu.Unlock()
	if broker.onEvent != nil {
		broker.onEvent(event)
	}
	return nil
}
func (*collectorTestBroker) Stream(context.Context, int) <-chan StreamEvent {
	output := make(chan StreamEvent)
	close(output)
	return output
}

type collectorTestProvider struct {
	stream func(context.Context) (<-chan StreamEvent, <-chan error)
}

func (*collectorTestProvider) Name() string       { return "youtube" }
func (*collectorTestProvider) Collection() string { return "pull" }
func (provider *collectorTestProvider) Stream(ctx context.Context, _ ConnectedSource) (<-chan StreamEvent, <-chan error) {
	return provider.stream(ctx)
}
func (*collectorTestProvider) SendMessage(context.Context, ConnectedSource, string) error { return nil }
func (*collectorTestProvider) Moderate(context.Context, ConnectedSource, ModerationCommand, string) (ProviderCommandSuccess, error) {
	return ProviderCommandSuccess{}, nil
}

func testOwnedSource() OwnedConnectedSource {
	return OwnedConnectedSource{UserID: 42, ConnectedSource: ConnectedSource{Source: Source{SourceID: youtubeSourceID, ConnectionID: "10000000-0000-4000-8000-000000000001", Provider: "youtube", ProviderSourceID: "channel-1", DisplayName: "Channel", SourceURL: "https://www.youtube.com/channel/channel-1", Enabled: true}, Capabilities: []Capability{CapabilityRead}, Credentials: ProviderCredentials{AccessToken: "token", TokenVersion: 1}}}
}

func TestCollectorsPublishErrorsAndContinue(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	refreshes := make(chan string)
	broker := &collectorTestBroker{}
	broker.onEvent = func(event StreamEvent) {
		if event.Type == "state" && event.State == "offline" {
			cancel()
		}
	}
	provider := &collectorTestProvider{stream: func(ctx context.Context) (<-chan StreamEvent, <-chan error) {
		events := make(chan StreamEvent)
		errorsChannel := make(chan error)
		go func() {
			defer close(events)
			defer close(errorsChannel)
			select {
			case errorsChannel <- &ProviderError{Type: "provider unavailable", Detail: "temporary"}:
			case <-ctx.Done():
				return
			}
			select {
			case events <- StreamEvent{Type: "state", SourceID: youtubeSourceID, State: "offline"}:
			case <-ctx.Done():
				return
			}
		}()
		return events, errorsChannel
	}}
	err := RunCollectors(ctx, &collectorTestStore{source: testOwnedSource()}, broker, &collectorTestLeases{}, &collectorTestControl{refreshes: refreshes}, []Provider{provider})
	if err != nil {
		t.Fatal(err)
	}
	expected := []StreamEvent{{Type: "state", SourceID: youtubeSourceID, State: "error", Detail: "temporary"}, {Type: "state", SourceID: youtubeSourceID, State: "offline"}}
	if !reflect.DeepEqual(broker.events, expected) {
		t.Fatalf("events = %#v; want %#v", broker.events, expected)
	}
}

func TestCollectorsRestartOnManualRefresh(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	refreshes := make(chan string, 1)
	broker := &collectorTestBroker{}
	starts := 0
	var startsMutex sync.Mutex
	provider := &collectorTestProvider{stream: func(ctx context.Context) (<-chan StreamEvent, <-chan error) {
		events := make(chan StreamEvent)
		errorsChannel := make(chan error)
		startsMutex.Lock()
		start := starts
		starts++
		startsMutex.Unlock()
		go func() {
			defer close(events)
			defer close(errorsChannel)
			state := "offline"
			if start > 0 {
				state = "live"
			}
			select {
			case events <- StreamEvent{Type: "state", SourceID: youtubeSourceID, State: state}:
			case <-ctx.Done():
				return
			}
			if start == 0 {
				<-ctx.Done()
			}
		}()
		return events, errorsChannel
	}}
	broker.onEvent = func(event StreamEvent) {
		if event.State == "offline" {
			refreshes <- youtubeSourceID
		}
		if event.State == "live" {
			cancel()
		}
	}
	if err := RunCollectors(ctx, &collectorTestStore{source: testOwnedSource()}, broker, &collectorTestLeases{}, &collectorTestControl{refreshes: refreshes}, []Provider{provider}); err != nil {
		t.Fatal(err)
	}
	startsMutex.Lock()
	defer startsMutex.Unlock()
	if starts != 2 {
		t.Fatalf("provider started %d times; want 2", starts)
	}
}

func TestCollectorBackoffGrowsUntilHealthySession(t *testing.T) {
	var backoff collectorBackoff
	expected := []time.Duration{2 * time.Second, 4 * time.Second, 8 * time.Second, 16 * time.Second, 32 * time.Second, 64 * time.Second, 128 * time.Second, 256 * time.Second, 5 * time.Minute, 5 * time.Minute}
	for index, want := range expected {
		if actual := backoff.next(time.Second); actual != want {
			t.Fatalf("restart %d delay = %s; want %s", index, actual, want)
		}
	}
	if actual := backoff.next(collectorHealthySession); actual != collectorStreamRetry {
		t.Fatalf("delay after healthy session = %s; want %s", actual, collectorStreamRetry)
	}
	if actual := backoff.next(time.Second); actual != 2*collectorStreamRetry {
		t.Fatalf("delay after reset = %s; want %s", actual, 2*collectorStreamRetry)
	}
}

func TestCollectorStopsAfterDefinitiveAuthorizationFailure(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	starts := 0
	provider := &collectorTestProvider{stream: func(ctx context.Context) (<-chan StreamEvent, <-chan error) {
		starts++
		events := make(chan StreamEvent)
		errorsChannel := make(chan error, 1)
		errorsChannel <- refreshRequiredError("Reconnect the account", nil)
		close(errorsChannel)
		close(events)
		return events, errorsChannel
	}}
	broker := &collectorTestBroker{}
	collectSource(ctx, testOwnedSource(), provider, broker, &collectorTestLeases{}, "owner")
	if ctx.Err() != nil {
		t.Fatal("collector kept restarting a source whose connection must be reconnected")
	}
	expected := []StreamEvent{{Type: "state", SourceID: youtubeSourceID, State: "error", Detail: "Reconnect the account"}}
	if starts != 1 || !reflect.DeepEqual(broker.events, expected) {
		t.Fatalf("starts=%d events=%#v", starts, broker.events)
	}
}

// collectorSequenceStore returns one source list per reconciliation, then repeats the last one.
type collectorSequenceStore struct {
	mu    sync.Mutex
	lists [][]OwnedConnectedSource
}

func (store *collectorSequenceStore) GetAllEnabledSources(context.Context) ([]OwnedConnectedSource, error) {
	store.mu.Lock()
	defer store.mu.Unlock()
	sources := store.lists[0]
	if len(store.lists) > 1 {
		store.lists = store.lists[1:]
	}
	return sources, nil
}

func TestCollectorsResumeReconnectedSourceOnRefresh(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	reconnected := testOwnedSource()
	reconnected.ConnectedSource.Credentials.TokenVersion = 2
	// The refresh_required connection is absent from reconciliation until a reconnect bumps its version.
	store := &collectorSequenceStore{lists: [][]OwnedConnectedSource{{}, {reconnected}}}
	refreshes := make(chan string, 1)
	var versions []int
	var versionsMutex sync.Mutex
	provider := &collectorTestProvider{}
	broker := &collectorTestBroker{onEvent: func(event StreamEvent) {
		if event.State == "live" {
			cancel()
		}
	}}
	provider.stream = func(ctx context.Context) (<-chan StreamEvent, <-chan error) {
		events := make(chan StreamEvent)
		errorsChannel := make(chan error)
		go func() {
			defer close(events)
			defer close(errorsChannel)
			select {
			case events <- StreamEvent{Type: "state", SourceID: youtubeSourceID, State: "live"}:
			case <-ctx.Done():
			}
		}()
		return events, errorsChannel
	}
	streamed := &versionRecordingProvider{collectorTestProvider: provider, record: func(version int) {
		versionsMutex.Lock()
		versions = append(versions, version)
		versionsMutex.Unlock()
	}}
	refreshes <- youtubeSourceID
	if err := RunCollectors(ctx, store, broker, &collectorTestLeases{}, &collectorTestControl{refreshes: refreshes}, []Provider{streamed}); err != nil {
		t.Fatal(err)
	}
	versionsMutex.Lock()
	defer versionsMutex.Unlock()
	if !reflect.DeepEqual(versions, []int{2}) {
		t.Fatalf("collected token versions = %v; want only the reconnected credentials", versions)
	}
}

type versionRecordingProvider struct {
	*collectorTestProvider
	record func(int)
}

func (provider *versionRecordingProvider) Stream(ctx context.Context, source ConnectedSource) (<-chan StreamEvent, <-chan error) {
	provider.record(source.Credentials.TokenVersion)
	return provider.collectorTestProvider.Stream(ctx, source)
}

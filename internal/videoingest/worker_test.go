package videoingest

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"
)

type fakeClock struct{ now time.Time }

func (clock *fakeClock) Now() time.Time { return clock.now }

type retriedJob struct {
	job         Job
	availableAt time.Time
	safeError   string
}

type fakeStore struct {
	mu            sync.Mutex
	claimErrs     []error
	jobs          []Job
	completed     []Video
	completeCalls int
	completeErr   error
	retried       []retriedJob
	retryErr      error
	idle          chan struct{}
}

func (store *fakeStore) Backfill(context.Context) error { return nil }
func (store *fakeStore) Claim(context.Context, time.Time, time.Duration) (*Job, error) {
	store.mu.Lock()
	defer store.mu.Unlock()
	if len(store.claimErrs) > 0 {
		err := store.claimErrs[0]
		store.claimErrs = store.claimErrs[1:]
		return nil, err
	}
	if len(store.jobs) == 0 {
		if store.idle != nil {
			close(store.idle)
			store.idle = nil
		}
		return nil, nil //nolint:nilnil // The fake mirrors the store's empty-queue result.
	}
	job := store.jobs[0]
	store.jobs = store.jobs[1:]
	return &job, nil
}
func (store *fakeStore) Complete(_ context.Context, _ Job, videos []Video, _ time.Time) error {
	store.mu.Lock()
	defer store.mu.Unlock()
	store.completeCalls++
	if store.completeErr != nil {
		return store.completeErr
	}
	store.completed = videos
	return nil
}
func (store *fakeStore) Retry(_ context.Context, job Job, availableAt time.Time, safeError string, _ time.Time) error {
	store.mu.Lock()
	defer store.mu.Unlock()
	store.retried = append(store.retried, retriedJob{job: job, availableAt: availableAt, safeError: safeError})
	return store.retryErr
}
func TestScanPersistsLinksWithoutMetadata(t *testing.T) {
	for _, test := range []struct {
		message string
		count   int
	}{
		{"no links", 0},
		{"Посмотри видео, пожалуйста: https://www.youtube.com/watch?v=_JXL6Fn99l8&t=13s", 1},
		{"https://www.youtube.com/watch?v=_JXL6Fn99l8&end=60", 1},
	} {
		t.Run(test.message, func(t *testing.T) {
			store := &fakeStore{jobs: []Job{{DonationID: 1101, Message: &test.message, Amount: "10.00", Currency: "RUB"}}}
			worked, err := newWorker(store, &fakeClock{time.Now()}, DefaultConfig()).ProcessNext(context.Background())
			if err != nil || !worked || store.completeCalls != 1 || len(store.completed) != test.count {
				t.Fatalf("worked=%v err=%v completed=%+v", worked, err, store.completed)
			}
			for _, video := range store.completed {
				if video.ProviderVideoID != "_JXL6Fn99l8" || video.DurationSeconds != nil {
					t.Fatalf("unexpected video: %+v", video)
				}
			}
		})
	}
}
func TestScanSkipsInvalidVideoIDsAndIgnoresInvalidEnd(t *testing.T) {
	message := "https://youtu.be/%ff https://www.youtube.com/watch?v=%00 " +
		"https://www.youtube.com/watch?v=_JXL6Fn99l8&end=99999999999 https://youtu.be/dQw4w9WgXcQ?end=1m"
	store := &fakeStore{jobs: []Job{{DonationID: 1, Message: &message, Amount: "10.00", Currency: "RUB"}}}
	worked, err := newWorker(store, &fakeClock{time.Now()}, DefaultConfig()).ProcessNext(context.Background())
	if err != nil || !worked || len(store.completed) != 2 || len(store.retried) != 0 {
		t.Fatalf("worked=%v err=%v completed=%+v retried=%+v", worked, err, store.completed, store.retried)
	}
	first, second := store.completed[0], store.completed[1]
	if first.ProviderVideoID != "_JXL6Fn99l8" || first.EndSeconds != nil {
		t.Fatalf("first video = %+v", first)
	}
	if second.ProviderVideoID != "dQw4w9WgXcQ" || second.EndSeconds == nil || *second.EndSeconds != 60 {
		t.Fatalf("second video = %+v", second)
	}
}
func TestFailedCompletionIsRescheduled(t *testing.T) {
	message := "https://youtu.be/dQw4w9WgXcQ"
	now := time.Date(2026, 9, 4, 12, 0, 0, 0, time.UTC)
	job := Job{DonationID: 7, Generation: 3, Attempts: 2, Message: &message, Amount: "10.00", Currency: "RUB"}
	store := &fakeStore{jobs: []Job{job}, completeErr: errors.New("insert failed")}
	worked, err := newWorker(store, &fakeClock{now}, DefaultConfig()).ProcessNext(context.Background())
	if err != nil || !worked || len(store.retried) != 1 {
		t.Fatalf("worked=%v err=%v retried=%+v", worked, err, store.retried)
	}
	retried := store.retried[0]
	if retried.job.DonationID != 7 || retried.job.Generation != 3 || !retried.availableAt.Equal(now.Add(time.Minute)) ||
		retried.safeError != "scan_failed" {
		t.Fatalf("retried = %+v", retried)
	}

	store = &fakeStore{jobs: []Job{job}, completeErr: ErrLeaseLost}
	if worked, err = newWorker(store, &fakeClock{now}, DefaultConfig()).ProcessNext(context.Background()); err != nil || !worked || len(store.retried) != 0 {
		t.Fatalf("lost lease: worked=%v err=%v retried=%+v", worked, err, store.retried)
	}
}
func TestRunContinuesAfterStoreFailures(t *testing.T) {
	message := "https://youtu.be/dQw4w9WgXcQ"
	store := &fakeStore{
		claimErrs:   []error{errors.New("connection refused"), errors.New("connection refused")},
		jobs:        []Job{{DonationID: 1, Message: &message, Amount: "10.00", Currency: "RUB"}},
		completeErr: errors.New("insert failed"),
		retryErr:    errors.New("connection reset"),
		idle:        make(chan struct{}),
	}
	idle := store.idle
	worker := newWorker(store, &fakeClock{time.Now()}, Config{PollInterval: time.Hour, LeaseDuration: time.Minute})
	worker.errorDelayStart, worker.errorDelayMax = time.Millisecond, 2*time.Millisecond
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() { done <- worker.Run(ctx) }()
	select {
	case <-idle:
	case err := <-done:
		t.Fatalf("worker stopped early: %v", err)
	case <-time.After(5 * time.Second):
		t.Fatal("worker did not recover from store failures")
	}
	cancel()
	if err := <-done; err != nil {
		t.Fatal(err)
	}
	store.mu.Lock()
	defer store.mu.Unlock()
	if store.completeCalls != 1 || len(store.retried) != 1 {
		t.Fatalf("completeCalls=%d retried=%+v", store.completeCalls, store.retried)
	}
}
func TestMetadataRetrySchedule(t *testing.T) {
	for attempt, want := range []time.Duration{15 * time.Second, time.Minute, 5 * time.Minute, 15 * time.Minute, time.Hour, 6 * time.Hour, 24 * time.Hour, 24 * time.Hour} {
		if got := retryDelay(attempt + 1); got != want {
			t.Fatalf("attempt %d: %s != %s", attempt+1, got, want)
		}
	}
}
func intPointer(value int) *int { return &value }

package videoingest

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/url"
	"time"

	"github.com/streambrew-app/streambrew/internal/youtube"
)

// scanFailedError is the bounded category stored when a scan attempt fails.
// Details are logged rather than persisted.
const scanFailedError = "scan_failed"

const (
	workerErrorDelayStart = 5 * time.Second
	workerErrorDelayMax   = time.Minute
)

type jobStore interface {
	Backfill(context.Context) error
	Claim(context.Context, time.Time, time.Duration) (*Job, error)
	Complete(context.Context, Job, []Video, time.Time) error
	Retry(context.Context, Job, time.Time, string, time.Time) error
}

type clock interface {
	Now() time.Time
}

type Config struct {
	PollInterval  time.Duration
	LeaseDuration time.Duration
}

func DefaultConfig() Config {
	return Config{
		PollInterval:  2500 * time.Millisecond,
		LeaseDuration: 2 * time.Minute,
	}
}

type Worker struct {
	store           jobStore
	clock           clock
	config          Config
	errorDelayStart time.Duration
	errorDelayMax   time.Duration
}

func NewWorker(store *Store, config Config) *Worker {
	return newWorker(store, realClock{}, config)
}

func newWorker(store jobStore, workerClock clock, config Config) *Worker {
	return &Worker{
		store:           store,
		clock:           workerClock,
		config:          config,
		errorDelayStart: workerErrorDelayStart,
		errorDelayMax:   workerErrorDelayMax,
	}
}

// Run stops only when its context is cancelled. Failed scans are rescheduled
// individually, and store failures are logged and retried with backoff.
func (worker *Worker) Run(ctx context.Context) error {
	if err := worker.store.Backfill(ctx); err != nil {
		if ctx.Err() != nil {
			return nil //nolint:nilerr // Context cancellation is a graceful worker shutdown.
		}
		return fmt.Errorf("backfill donation video scans: %w", err)
	}
	errorDelay := worker.errorDelayStart
	for {
		worked, err := worker.ProcessNext(ctx)
		if ctx.Err() != nil {
			return nil //nolint:nilerr // Context cancellation is a graceful worker shutdown.
		}
		delay := worker.config.PollInterval
		if err != nil {
			slog.Error("process donation video scan", "error", err, "retry", errorDelay)
			delay = errorDelay
			errorDelay = min(errorDelay*2, worker.errorDelayMax)
		} else {
			errorDelay = worker.errorDelayStart
			if worked {
				continue
			}
		}
		if !waitContext(ctx, delay) {
			return nil
		}
	}
}

// ProcessNext scans one available donation. A scan that cannot be completed is
// rescheduled with backoff; the returned error reports only store failures.
func (worker *Worker) ProcessNext(ctx context.Context) (bool, error) {
	now := worker.clock.Now()
	job, err := worker.store.Claim(ctx, now, worker.config.LeaseDuration)
	if err != nil {
		return false, fmt.Errorf("claim donation video scan: %w", err)
	}
	if job == nil {
		return false, nil
	}

	err = worker.store.Complete(ctx, *job, scanVideos(job.Message), worker.clock.Now())
	if err == nil || errors.Is(err, ErrLeaseLost) || ctx.Err() != nil {
		// Cancellation leaves the lease to expire, so another attempt recovers it.
		return true, nil //nolint:nilerr // A lost lease or cancellation is not a worker failure.
	}
	return true, worker.retry(ctx, *job, err)
}

func (worker *Worker) retry(ctx context.Context, job Job, cause error) error {
	now := worker.clock.Now()
	availableAt := now.Add(retryDelay(job.Attempts))
	slog.Warn("donation video scan failed", "donation_id", job.DonationID, "attempt", job.Attempts,
		"next_attempt_at", availableAt, "error", cause)
	err := worker.store.Retry(ctx, job, availableAt, scanFailedError, now)
	if err == nil || errors.Is(err, ErrLeaseLost) || ctx.Err() != nil {
		return nil //nolint:nilerr // Lease expiry reschedules a job after a lost lease or cancellation.
	}
	return fmt.Errorf("reschedule donation video scan %d: %w", job.DonationID, err)
}

func scanVideos(message *string) []Video {
	videos := make([]Video, 0)
	if message == nil {
		return videos
	}
	for _, rawURL := range youtube.ExtractURLs(*message) {
		providerVideoID, ok := youtube.VideoID(rawURL)
		if !ok {
			continue
		}
		var end *int
		if parsed, err := url.Parse(rawURL); err == nil {
			// An invalid end is ignored; the video remains with an open segment.
			if seconds, valid := youtube.ParseTimestamp(parsed.Query().Get("end")); valid && seconds > 0 {
				end = &seconds
			}
		}
		videos = append(videos, Video{
			ProviderVideoID: providerVideoID,
			URL:             rawURL,
			StartSeconds:    0,
			EndSeconds:      end,
		})
	}
	return videos
}

// waitContext reports false when ctx is cancelled before delay elapses.
func waitContext(ctx context.Context, delay time.Duration) bool {
	timer := time.NewTimer(delay)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return false
	case <-timer.C:
		return true
	}
}

type realClock struct{}

func (realClock) Now() time.Time { return time.Now() }

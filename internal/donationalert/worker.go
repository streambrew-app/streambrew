package donationalert

import (
	"context"
	"errors"
	"log/slog"
	"time"
)

type preparationStore interface {
	ClaimPreparation(context.Context, time.Time) (*Preparation, error)
	CompletePreparation(context.Context, Preparation, Media, time.Time) error
	FailPreparation(context.Context, Preparation, string, time.Time) error
}

type Worker struct {
	store           preparationStore
	synthesizer     Synthesizer
	now             func() time.Time
	idleDelay       time.Duration
	errorDelayStart time.Duration
	errorDelayMax   time.Duration
}

func NewWorker(store *Store, synthesizer Synthesizer) *Worker {
	return newWorker(store, synthesizer)
}

func newWorker(store preparationStore, synthesizer Synthesizer) *Worker {
	return &Worker{
		store:           store,
		synthesizer:     synthesizer,
		now:             time.Now,
		idleDelay:       250 * time.Millisecond,
		errorDelayStart: time.Second,
		errorDelayMax:   time.Minute,
	}
}

// Run stops only when its context is cancelled. Store failures are logged and
// retried with backoff so that they do not stop the donations service.
func (worker *Worker) Run(ctx context.Context) error {
	errorDelay := worker.errorDelayStart
	for ctx.Err() == nil {
		preparation, err := worker.store.ClaimPreparation(ctx, worker.now())
		if err != nil {
			if ctx.Err() != nil {
				return nil //nolint:nilerr // Context cancellation is a graceful worker shutdown.
			}
			slog.Error("Claim donation alert speech preparation", "error", err, "retry", errorDelay)
			if !waitContext(ctx, errorDelay) {
				return nil
			}
			errorDelay = min(errorDelay*2, worker.errorDelayMax)
			continue
		}
		errorDelay = worker.errorDelayStart
		if preparation == nil {
			if !waitContext(ctx, worker.idleDelay) {
				return nil
			}
			continue
		}
		media, err := worker.synthesizer.Synthesize(ctx, ttsPlaybackText(preparation.Text), preparation.Voice)
		if err == nil {
			err = worker.store.CompletePreparation(ctx, *preparation, media, worker.now())
		} else if !errors.Is(err, context.Canceled) {
			slog.Warn("Donation alert speech unavailable", "playbackId", preparation.PlaybackID, "error", err)
			detail := "Speech synthesis is temporarily unavailable"
			var synthesisError *SynthesisError
			if errors.As(err, &synthesisError) && synthesisError.Code == SynthesisInvalidText {
				detail = "Donation message could not be read aloud"
			}
			err = worker.store.FailPreparation(ctx, *preparation, detail, worker.now())
		}
		if err != nil && !errors.Is(err, context.Canceled) && !errors.Is(err, ErrConflict) {
			slog.Error("Prepare donation alert speech", "playbackId", preparation.PlaybackID, "error", err)
		}
	}
	return nil
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

func ttsPlaybackText(text string) string {
	characters := []rune(text)
	if len(characters) <= MaxTTSTextRunes {
		return text
	}
	return string(characters[:MaxTTSTextRunes-1]) + "…"
}

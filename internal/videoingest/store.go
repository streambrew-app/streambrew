package videoingest

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/streambrew-app/streambrew/internal/money"
)

var ErrLeaseLost = errors.New("video ingest lease lost")

type Job struct {
	DonationID int64
	Generation int64
	Attempts   int
	Message    *string
	Amount     string
	Currency   string
}

// Video is a supported link found in a donation message. Its queue amount is
// derived from the donation when the scan completes.
type Video struct {
	Title           string
	ProviderVideoID string
	URL             string
	StartSeconds    int
	EndSeconds      *int
	DurationSeconds *int
}

type Store struct{ pool *pgxpool.Pool }

func NewStore(pool *pgxpool.Pool) *Store { return &Store{pool: pool} }

// Backfill enqueues donations created before the enqueue trigger was installed.
func (store *Store) Backfill(ctx context.Context) error {
	_, err := store.pool.Exec(ctx, `
		INSERT INTO donation_video_scan (donation_id)
		SELECT donation_id
		FROM donation
		WHERE videos_parsed_at IS NULL
		ON CONFLICT (donation_id) DO NOTHING
	`)
	return err
}

func (store *Store) Claim(ctx context.Context, now time.Time, leaseDuration time.Duration) (*Job, error) {
	row := store.pool.QueryRow(ctx, `
		WITH candidate AS (
			SELECT donation_id
			FROM donation_video_scan
			WHERE completed_at IS NULL
				AND available_at <= $1
				AND (lease_expires_at IS NULL OR lease_expires_at <= $1)
			ORDER BY available_at ASC, donation_id ASC
			FOR UPDATE SKIP LOCKED
			LIMIT 1
		), claimed AS (
			UPDATE donation_video_scan
			SET generation = generation + 1,
				attempts = attempts + 1,
				lease_expires_at = $2
			FROM candidate
			WHERE donation_video_scan.donation_id = candidate.donation_id
			RETURNING donation_video_scan.donation_id,
				donation_video_scan.generation,
				donation_video_scan.attempts
		)
		SELECT claimed.donation_id,
			claimed.generation,
			claimed.attempts,
			donation.message,
			donation.amount::text,
			donation.currency::text
		FROM claimed
		JOIN donation USING (donation_id)
	`, now, now.Add(leaseDuration))
	var job Job
	if err := row.Scan(&job.DonationID, &job.Generation, &job.Attempts, &job.Message, &job.Amount, &job.Currency); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil //nolint:nilnil // A nil job is the established signal that the queue is empty.
		}
		return nil, err
	}
	return &job, nil
}

// Complete inserts the scanned videos and finishes the scan in one transaction.
// The queue amount uses the owner's current queue currency, read under a share
// lock: a concurrent currency change either waits and converts these videos or
// commits first and determines their currency.
func (store *Store) Complete(ctx context.Context, job Job, videos []Video, now time.Time) error {
	return pgx.BeginFunc(ctx, store.pool, func(tx pgx.Tx) error {
		result, err := tx.Exec(ctx, `
			UPDATE donation_video_scan
			SET completed_at = $3,
				lease_expires_at = NULL,
				last_error = NULL
			WHERE donation_id = $1
				AND generation = $2
				AND completed_at IS NULL
				AND lease_expires_at > $3
		`, job.DonationID, job.Generation, now)
		if err != nil {
			return err
		}
		if result.RowsAffected() != 1 {
			return ErrLeaseLost
		}
		var queueAmount *string
		if len(videos) > 0 {
			queueAmount, err = convertedQueueAmount(ctx, tx, job)
			if err != nil {
				return err
			}
		}
		for _, video := range videos {
			_, err = tx.Exec(ctx, `
				INSERT INTO video (
					donation_id,
					provider,
					provider_video_id,
					url,
					queue_amount,
					start_seconds,
					end_seconds,
					duration_seconds,
 title
				)
				VALUES ($1, 'youtube', $2, $3, $4, $5, $6, $7, nullif($8, ''))
				ON CONFLICT (donation_id, provider, provider_video_id) DO NOTHING
			`, job.DonationID, video.ProviderVideoID, video.URL, queueAmount, video.StartSeconds, video.EndSeconds, video.DurationSeconds, video.Title)
			if err != nil {
				return err
			}
		}
		_, err = tx.Exec(ctx, `
			UPDATE donation
			SET videos_parsed_at = $2
			WHERE donation_id = $1
				AND videos_parsed_at IS NULL
		`, job.DonationID, now)
		return err
	})
}

// convertedQueueAmount returns nil when the donation amount cannot be assigned
// in the owner's queue currency.
func convertedQueueAmount(ctx context.Context, tx pgx.Tx, job Job) (*string, error) {
	var queueCurrency string
	if err := tx.QueryRow(ctx, `
		SELECT "user".queue_currency::text
		FROM donation
		JOIN "user" USING (user_id)
		WHERE donation.donation_id = $1
		FOR SHARE OF "user"
	`, job.DonationID).Scan(&queueCurrency); err != nil {
		return nil, err
	}
	amount, supported, err := money.ConvertWithDefaultRate(job.Amount, job.Currency, queueCurrency)
	if err != nil {
		return nil, fmt.Errorf("convert donation amount: %w", err)
	}
	if !supported {
		return nil, nil //nolint:nilnil // A NULL queue amount leaves the video without a priority.
	}
	return &amount, nil
}

func (store *Store) Retry(ctx context.Context, job Job, availableAt time.Time, safeError string, now time.Time) error {
	result, err := store.pool.Exec(ctx, `
		UPDATE donation_video_scan
		SET available_at = $3,
			lease_expires_at = NULL,
			last_error = $4
		WHERE donation_id = $1
			AND generation = $2
			AND completed_at IS NULL
			AND lease_expires_at > $5
	`, job.DonationID, job.Generation, availableAt, safeError, now)
	if err != nil {
		return err
	}
	if result.RowsAffected() != 1 {
		return ErrLeaseLost
	}
	return nil
}

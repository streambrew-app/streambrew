package videoingest

import (
	"context"
	"errors"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"
)

type metadataTransport func(*http.Request) (*http.Response, error)

func (transport metadataTransport) RoundTrip(request *http.Request) (*http.Response, error) {
	return transport(request)
}

func TestMetadataFailureThenRecovery(t *testing.T) {
	for _, test := range []struct {
		name     string
		status   int
		body     string
		terminal bool
	}{
		{"missing duration", 200, `<html>no metadata</html>`, false},
		{"rate limited", 429, ``, false},
		{"server failure", 503, ``, false},
		{"forbidden", 403, ``, false},
		{"transport", 0, ``, false},
		{"empty items", 200, `{"items":[]}`, false},
		{"bot challenge", 200, `{"playabilityStatus":{"status":"LOGIN_REQUIRED","reason":"Sign in to confirm you are not a bot"}}`, false},
		{"quota exceeded", 403, `{"error":{"errors":[{"reason":"quotaExceeded"}]}}`, false},
		{"title without duration", 200, `{"items":[{"id":"_JXL6Fn99l8","snippet":{"title":"Independent title"},"contentDetails":{"duration":"PT0S"}}]}`, false},
	} {
		t.Run(test.name, func(t *testing.T) {
			store, pool := newIntegrationStore(t)
			ctx := context.Background()
			seedDonation(t, pool, 1101)
			_, updateErr := pool.Exec(ctx, `UPDATE donation SET message = $1 WHERE donation_id = 1101`, "Посмотри видео, пожалуйста: https://www.youtube.com/watch?v=_JXL6Fn99l8&t=13s")
			if updateErr != nil {
				t.Fatal(updateErr)
			}
			if _, err := NewWorker(store, DefaultConfig()).ProcessNext(ctx); err != nil {
				t.Fatal(err)
			}
			var videoID int64
			var duration *int
			var parsed bool
			if err := pool.QueryRow(ctx, `SELECT video_id, duration_seconds, videos_parsed_at IS NOT NULL FROM video JOIN donation USING (donation_id)`).Scan(&videoID, &duration, &parsed); err != nil {
				t.Fatal(err)
			}
			if duration != nil || !parsed {
				t.Fatalf("duration=%v parsed=%v", duration, parsed)
			}
			client := &http.Client{Transport: metadataTransport(func(request *http.Request) (*http.Response, error) {
				if test.status == 0 {
					return nil, errors.New("connection reset")
				}
				status, body := test.status, test.body

				return &http.Response{StatusCode: status, Header: http.Header{}, Body: io.NopCloser(strings.NewReader(body))}, nil
			})}
			if worked, err := store.processMetadata(ctx, client, "test-key"); err != nil || !worked {
				t.Fatalf("worked=%v err=%v", worked, err)
			}
			var completed bool
			var code string
			var available time.Time
			var title *string
			if err := pool.QueryRow(ctx, `SELECT completed_at IS NOT NULL, last_error_code, available_at, title FROM video_metadata_job JOIN video USING (video_id)`).Scan(&completed, &code, &available, &title); err != nil {
				t.Fatal(err)
			}
			if completed != test.terminal || code == "" || !available.After(time.Now()) {
				t.Fatalf("completed=%v code=%s available=%s title=%v", completed, code, available, title)
			}
			if test.name == "quota exceeded" && (code != "quota_exceeded" || available.Before(time.Now().Add(23*time.Hour))) {
				t.Fatalf("quota backoff not persisted: %s %s", code, available)
			}
			if test.name == "title without duration" && (title == nil || *title != "Independent title") {
				t.Fatal("partial title was lost")
			}
			// Model owner retry and a user edit while the HTTP request is in flight.
			// js_date rounds to milliseconds, so now() can round into the future.
			// Make the retry unambiguously due without depending on runner speed.
			_, retryUpdateErr := pool.Exec(ctx, `UPDATE video_metadata_job SET completed_at = NULL, available_at = now() - interval '1 second'`)
			if retryUpdateErr != nil {
				t.Fatal(retryUpdateErr)
			}
			client.Transport = metadataTransport(func(*http.Request) (*http.Response, error) {
				if _, err := pool.Exec(ctx, `UPDATE video SET start_seconds = 10, end_seconds = 70`); err != nil {
					return nil, err
				}
				return &http.Response{StatusCode: 200, Header: http.Header{}, Body: io.NopCloser(strings.NewReader(`{"items":[{"id":"_JXL6Fn99l8","contentDetails":{"duration":"PT2H1M"},"snippet":{"title":"Provider title"}}]}`))}, nil
			})
			if worked, err := store.processMetadata(ctx, client, "test-key"); err != nil || !worked {
				t.Fatalf("recovery worked=%v err=%v", worked, err)
			}
			var count, end, attempts int
			if err := pool.QueryRow(ctx, `SELECT (SELECT count(*) FROM video), duration_seconds, end_seconds, attempts, completed_at IS NOT NULL FROM video JOIN video_metadata_job USING (video_id) WHERE video_id = $1`, videoID).Scan(&count, &duration, &end, &attempts, &completed); err != nil {
				t.Fatal(err)
			}
			if count != 1 || duration == nil || *duration != 7260 || end != 70 || attempts != 2 || !completed {
				t.Fatalf("count=%d duration=%v end=%d attempts=%d completed=%v", count, duration, end, attempts, completed)
			}
		})
	}
}

func TestMetadataLeaseFence(t *testing.T) {
	store, pool := newIntegrationStore(t)
	ctx := context.Background()
	seedDonation(t, pool, 1)
	if _, err := pool.Exec(ctx, `INSERT INTO video (donation_id, provider, provider_video_id, url, start_seconds) VALUES (1, 'youtube', '_JXL6Fn99l8', 'https://youtu.be/_JXL6Fn99l8', 0)`); err != nil {
		t.Fatal(err)
	}
	client := &http.Client{Transport: metadataTransport(func(*http.Request) (*http.Response, error) {
		// Simulate a new owner reclaiming an expired lease before the old HTTP
		// request returns. Its generation must fence out the stale completion.
		if _, err := pool.Exec(ctx, `UPDATE video_metadata_job SET generation = generation + 1, lease_expires_at = now() + interval '2 minutes'`); err != nil {
			return nil, err
		}
		return &http.Response{StatusCode: 200, Header: http.Header{}, Body: io.NopCloser(strings.NewReader(`{"items":[{"id":"_JXL6Fn99l8","contentDetails":{"duration":"PT100S"},"snippet":{"title":"Stale title"}}]}`))}, nil
	})}
	if _, err := store.processMetadata(ctx, client, "test-key"); err != nil {
		t.Fatal(err)
	}
	var unchanged bool
	if err := pool.QueryRow(ctx, `SELECT duration_seconds IS NULL AND title IS NULL AND completed_at IS NULL FROM video JOIN video_metadata_job USING (video_id)`).Scan(&unchanged); err != nil {
		t.Fatal(err)
	}
	if !unchanged {
		t.Fatal("stale worker committed metadata")
	}
	if worked, err := store.processMetadata(ctx, client, "test-key"); err != nil || worked {
		t.Fatalf("active lease was claimed: %v %v", worked, err)
	}
}

func TestOpenEndResolvesAndAssignsPriority(t *testing.T) {
	store, pool := newIntegrationStore(t)
	ctx := context.Background()
	seedDonation(t, pool, 1)
	if _, err := pool.Exec(ctx, `INSERT INTO video (donation_id, provider, provider_video_id, url, queue_amount, start_seconds) VALUES (1, 'youtube', '_JXL6Fn99l8', 'https://youtu.be/_JXL6Fn99l8', 10, 0)`); err != nil {
		t.Fatal(err)
	}
	client := &http.Client{Transport: metadataTransport(func(*http.Request) (*http.Response, error) {
		return &http.Response{StatusCode: 200, Header: http.Header{}, Body: io.NopCloser(strings.NewReader(`{"items":[{"id":"_JXL6Fn99l8","contentDetails":{"duration":"PT100S"},"snippet":{"title":"Title"}}]}`))}, nil
	})}
	if _, err := store.processMetadata(ctx, client, "test-key"); err != nil {
		t.Fatal(err)
	}
	var assigned bool
	if err := pool.QueryRow(ctx, `SELECT end_seconds = 100 AND duration_seconds = 100 AND video_priority_id IS NOT NULL FROM video`).Scan(&assigned); err != nil {
		t.Fatal(err)
	}
	if !assigned {
		t.Fatal("open end was not resolved and assigned")
	}
}

func TestMetadataUsesStoredProviderVideoID(t *testing.T) {
	store, pool := newIntegrationStore(t)
	seedDonationWithoutScan(t, pool, 1)
	ctx := context.Background()
	if _, err := pool.Exec(ctx, `
		INSERT INTO video (user_id, added_at, provider, provider_video_id, url, queue_amount, start_seconds)
		VALUES (1, now(), 'youtube', 'dQw4w9WgXcQ', $1, 10, 0)
	`, `https://youtube.com\watch?v=dQw4w9WgXcQ`); err != nil {
		t.Fatal(err)
	}
	requests := 0
	client := &http.Client{Transport: metadataTransport(func(request *http.Request) (*http.Response, error) {
		requests++
		if request.URL.Query().Get("id") != "dQw4w9WgXcQ" {
			t.Errorf("requested %s", request.URL)
		}
		body := `{"items":[{"id":"dQw4w9WgXcQ","contentDetails":{"duration":"PT3M33S"},"snippet":{"title":"Title","liveBroadcastContent":"none"}}]}`
		return &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(strings.NewReader(body)), Header: make(http.Header)}, nil
	})}
	if worked, err := store.processMetadata(ctx, client, "key"); err != nil || !worked {
		t.Fatalf("processMetadata() = %v, %v", worked, err)
	}
	var duration *int
	var completed bool
	if err := pool.QueryRow(ctx, `
		SELECT video.duration_seconds, job.completed_at IS NOT NULL
		FROM video
		JOIN video_metadata_job AS job USING (video_id)
	`).Scan(&duration, &completed); err != nil {
		t.Fatal(err)
	}
	if requests != 1 || duration == nil || *duration != 213 || !completed {
		t.Fatalf("requests=%d duration=%v completed=%v", requests, duration, completed)
	}
}

func TestMetadataStopsRetryingInvalidProviderVideoID(t *testing.T) {
	store, pool := newIntegrationStore(t)
	seedDonationWithoutScan(t, pool, 1)
	ctx := context.Background()
	if _, err := pool.Exec(ctx, `
		INSERT INTO video (user_id, added_at, provider, provider_video_id, url, queue_amount, start_seconds)
		VALUES (1, now(), 'youtube', 'not-an-id', 'https://youtube.com/watch%zz?v=not-an-id', 10, 0)
	`); err != nil {
		t.Fatal(err)
	}
	client := &http.Client{Transport: metadataTransport(func(*http.Request) (*http.Response, error) {
		t.Error("unexpected request")
		return nil, errors.New("unexpected request")
	})}
	if worked, err := store.processMetadata(ctx, client, "key"); err != nil || !worked {
		t.Fatalf("processMetadata() = %v, %v", worked, err)
	}
	var code string
	var completed bool
	if err := pool.QueryRow(ctx, `
		SELECT last_error_code, completed_at IS NOT NULL FROM video_metadata_job
	`).Scan(&code, &completed); err != nil {
		t.Fatal(err)
	}
	if code != "invalid_video_id" || !completed {
		t.Fatalf("code=%q completed=%v", code, completed)
	}
}

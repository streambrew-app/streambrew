package youtube

import (
	"context"
	"errors"
	"fmt"
	"math"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"
)

var (
	urlPattern             = regexp.MustCompile(`(?i)(?:(?:https?://)|(?:www\.))(?:[a-z0-9-]+\.)*(?:youtube\.com|youtube-nocookie\.com)(?:/[^\s<>]*)?|(?:(?:https?://)|(?:www\.))youtu\.be(?:/[^\s<>]*)?`)
	timestampPattern       = regexp.MustCompile(`^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$`)
	videoIDPattern         = regexp.MustCompile(`^[A-Za-z0-9_-]{11}$`)
	trailingURLPunctuation = regexp.MustCompile(`[!.,;:?)\]}]+$`)
)

type Timing struct {
	Title           string
	StartSeconds    int
	EndSeconds      int
	DurationSeconds int
}

type RequestedTiming struct {
	StartSeconds int
	EndSeconds   *int
}

type HTTPError struct {
	Status     int
	URL        string
	RetryAfter time.Duration
	Reason     string
}

func (e *HTTPError) Error() string {
	return fmt.Sprintf("http error: GET %s returned %d", e.URL, e.Status)
}

type TransportError struct{ Err error }

func (e *TransportError) Error() string { return "youtube transport: " + e.Err.Error() }

func (e *TransportError) Unwrap() error { return e.Err }

func ExtractURLs(message string) []string {
	matches := urlPattern.FindAllString(message, -1)
	result := make([]string, 0, len(matches))
	seen := make(map[string]struct{}, len(matches))
	for _, match := range matches {
		match = trailingURLPunctuation.ReplaceAllString(match, "")
		parsed, err := parseURL(match)
		if err != nil || !isYoutubeURL(parsed) {
			continue
		}
		parsed.Scheme = "https"
		canonical := parsed.String()
		if _, exists := seen[canonical]; exists {
			continue
		}
		seen[canonical] = struct{}{}
		result = append(result, canonical)
	}
	return result
}

// VideoID returns the provider video ID of a supported YouTube URL. Only IDs in
// YouTube's eleven-character format are accepted, so decoded query values such
// as invalid UTF-8 or NUL bytes never reach storage or API requests.
func VideoID(rawURL string) (string, bool) {
	parsed, err := parseURL(rawURL)
	if err != nil || !isYoutubeURL(parsed) {
		return "", false
	}

	id := parsed.Query().Get("v")
	parts := strings.Split(strings.Trim(parsed.Path, "/"), "/")
	switch {
	case strings.EqualFold(parsed.Hostname(), "youtu.be"):
		id = strings.Split(strings.TrimPrefix(parsed.Path, "/"), "/")[0]
	case id == "" && len(parts) >= 2 && (parts[0] == "embed" || parts[0] == "shorts"):
		id = parts[1]
	}
	if !ValidVideoID(id) {
		return "", false
	}
	return id, true
}

// ValidVideoID reports whether id has the format of a YouTube video ID.
func ValidVideoID(id string) bool {
	return videoIDPattern.MatchString(id)
}

// ParseTimestamp parses a URL time parameter as whole seconds. Values beyond
// the PostgreSQL integer range are rejected, like other invalid timestamps.
func ParseTimestamp(value string) (int, bool) {
	if value == "" {
		return 0, false
	}
	if seconds, err := strconv.ParseInt(value, 10, 32); err == nil && seconds >= 0 {
		return int(seconds), true
	}
	match := timestampPattern.FindStringSubmatch(value)
	if match == nil || match[0] == "" {
		return 0, false
	}
	total := int64(0)
	for i, multiplier := range []int64{3600, 60, 1} {
		component, err := strconv.ParseInt(zeroIfEmpty(match[i+1]), 10, 32)
		if err != nil {
			return 0, false
		}
		total += component * multiplier
		if total > math.MaxInt32 {
			return 0, false
		}
	}
	return int(total), true
}

// GetTiming preserves a successfully retrieved title even when duration is unknown.
func GetTiming(ctx context.Context, client *http.Client, apiKey, rawURL string, requested *RequestedTiming) (Timing, error) {
	parsed, err := parseURL(rawURL)
	if err != nil || !isYoutubeURL(parsed) {
		return Timing{}, errors.New("youtube: invalid url")
	}
	metadata, err := getMetadata(ctx, client, apiKey, rawURL)
	if err != nil {
		return Timing{}, err
	}
	partial := Timing{Title: strings.TrimSpace(metadata.Snippet.Title)}
	if metadata.Snippet.LiveBroadcastContent == "live" || metadata.Snippet.LiveBroadcastContent == "upcoming" {
		return partial, errors.New("youtube: live video duration not final")
	}
	duration, ok := durationSeconds(metadata.ContentDetails.Duration)
	if !ok {
		return partial, errors.New("youtube: duration not found")
	}
	timing, err := timingFromDuration(parsed, duration, requested)
	if err != nil {
		return partial, err
	}
	timing.Title = partial.Title
	return timing, nil
}

func timingFromDuration(parsed *url.URL, duration int, requested *RequestedTiming) (Timing, error) {
	if duration <= 0 {
		return Timing{}, fmt.Errorf("youtube: invalid duration: %d", duration)
	}
	if requested != nil {
		end := duration
		if requested.EndSeconds != nil {
			end = *requested.EndSeconds
		}
		if requested.StartSeconds < 0 || end <= requested.StartSeconds || end > duration {
			return Timing{}, fmt.Errorf("youtube: invalid timing: start=%d end=%d duration=%d", requested.StartSeconds, end, duration)
		}
		return Timing{StartSeconds: requested.StartSeconds, EndSeconds: end, DurationSeconds: duration}, nil
	}

	end := duration
	if requestedEnd, ok := ParseTimestamp(parsed.Query().Get("end")); ok && requestedEnd > 0 && requestedEnd <= duration {
		end = requestedEnd
	}
	return Timing{StartSeconds: 0, EndSeconds: end, DurationSeconds: duration}, nil
}

var durationPattern = regexp.MustCompile(`^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$`)

// YouTube returns whole seconds, optionally including days. Bound the result to
// PostgreSQL integer so malformed upstream data cannot poison a metadata job.
func durationSeconds(value string) (int, bool) {
	match := durationPattern.FindStringSubmatch(value)
	if match == nil || strings.HasSuffix(value, "T") {
		return 0, false
	}
	total := int64(0)
	for i, multiplier := range []int64{86400, 3600, 60, 1} {
		component, err := strconv.ParseInt(zeroIfEmpty(match[i+1]), 10, 32)
		if err != nil {
			return 0, false
		}
		total += component * multiplier
		if total > math.MaxInt32 {
			return 0, false
		}
	}
	return int(total), total > 0
}

func parseURL(rawURL string) (*url.URL, error) {
	if strings.HasPrefix(strings.ToLower(rawURL), "www.") {
		rawURL = "https://" + rawURL
	}
	return url.ParseRequestURI(rawURL)
}

func isYoutubeURL(parsed *url.URL) bool {
	if parsed == nil || (parsed.Scheme != "http" && parsed.Scheme != "https") {
		return false
	}
	host := strings.ToLower(parsed.Hostname())
	return host == "youtu.be" || host == "youtube.com" || strings.HasSuffix(host, ".youtube.com") || host == "youtube-nocookie.com" || strings.HasSuffix(host, ".youtube-nocookie.com")
}

func zeroIfEmpty(value string) string {
	if value == "" {
		return "0"
	}
	return value
}

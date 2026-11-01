package chat

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"reflect"
	"strings"
	"testing"
	"time"
)

type refreshStore struct {
	version *int
	input   refreshStoreInput
	// marked records the token versions marked refresh_required; unmarkable simulates a lost race.
	marked     []int
	unmarkable bool
}

type refreshStoreInput struct {
	connectionID    string
	expectedVersion int
	accessToken     string
	refreshToken    string
	expiresAt       *time.Time
}

func (store *refreshStore) UpdateConnectionCredentials(_ context.Context, connectionID string, expectedVersion int, accessToken, refreshToken string, expiresAt *time.Time) (*int, error) {
	store.input = refreshStoreInput{connectionID: connectionID, expectedVersion: expectedVersion, accessToken: accessToken, refreshToken: refreshToken, expiresAt: expiresAt}
	return store.version, nil
}

func (store *refreshStore) MarkRefreshRequired(_ context.Context, _ string, expectedVersion int) (bool, error) {
	if store.unmarkable {
		return false, nil
	}
	store.marked = append(store.marked, expectedVersion)
	return true, nil
}

func TestTokenRefresherKeepsFreshCredentials(t *testing.T) {
	now := time.Date(2026, 9, 3, 10, 0, 0, 0, time.UTC)
	expiresAt := now.Add(2 * time.Minute)
	source := youtubeTestSource()
	source.Credentials.ExpiresAt = &expiresAt
	store := &refreshStore{}
	refresher := NewTokenRefresher(store, nil, http.DefaultClient)
	refresher.now = func() time.Time { return now }
	actual, err := refresher.Refresh(context.Background(), source)
	if err != nil || actual.Credentials.AccessToken != "access-token" || store.input.connectionID != "" {
		t.Fatalf("source=%#v store=%#v err=%v", actual, store, err)
	}
}

func TestTokenRefresherRotatesCredentialsWithCompareAndSwap(t *testing.T) {
	now := time.Date(2026, 9, 3, 10, 0, 0, 0, time.UTC)
	nextVersion := 2
	store := &refreshStore{version: &nextVersion}
	client := &http.Client{Transport: oauthRoundTripFunc(func(request *http.Request) (*http.Response, error) {
		body, _ := io.ReadAll(request.Body)
		values, _ := url.ParseQuery(string(body))
		if values.Get("refresh_token") != "refresh-token" || values.Get("client_secret") != "secret" {
			t.Fatalf("form = %s", body)
		}
		return youtubeResponse(http.StatusOK, `{"access_token":"next-access","expires_in":3600}`), nil
	})}
	refresher := NewTokenRefresher(store, []RefreshConfig{{Provider: "youtube", ClientID: "client", ClientSecret: "secret", TokenURL: "https://oauth.example/token"}}, client) //nolint:gosec // These are inert test-only credentials for a fake transport.
	refresher.now = func() time.Time { return now }
	source := youtubeTestSource()
	expired := now.Add(-time.Second)
	source.Credentials.ExpiresAt = &expired
	actual, err := refresher.Refresh(context.Background(), source)
	if err != nil {
		t.Fatal(err)
	}
	if actual.Credentials.AccessToken != "next-access" || actual.Credentials.RefreshToken != "refresh-token" || actual.Credentials.TokenVersion != 2 {
		t.Fatalf("credentials = %#v", actual.Credentials)
	}
	if store.input.expectedVersion != 1 || store.input.connectionID != source.Source.ConnectionID || store.input.expiresAt == nil || !store.input.expiresAt.Equal(now.Add(time.Hour)) {
		t.Fatalf("store input = %#v", store.input)
	}
}

func TestTokenRefresherRejectsConcurrentRotation(t *testing.T) {
	store := &refreshStore{}
	client := &http.Client{Transport: oauthRoundTripFunc(func(*http.Request) (*http.Response, error) {
		return youtubeResponse(http.StatusOK, `{"access_token":"next-access"}`), nil
	})}
	refresher := NewTokenRefresher(store, []RefreshConfig{{Provider: "youtube", ClientID: "client", ClientSecret: "secret", TokenURL: "https://oauth.example/token"}}, client) //nolint:gosec // These are inert test-only credentials for a fake transport.
	now := time.Now()
	refresher.now = func() time.Time { return now }
	source := youtubeTestSource()
	source.Credentials.ExpiresAt = &now
	_, err := refresher.Refresh(context.Background(), source)
	var providerError *ProviderError
	if !errors.As(err, &providerError) || providerError.Type != "provider unavailable" {
		t.Fatalf("error = %v", err)
	}
}

func TestTokenRefresherUsesVKIDDeviceAndState(t *testing.T) {
	nextVersion := 2
	store := &refreshStore{version: &nextVersion}
	client := &http.Client{Transport: oauthRoundTripFunc(func(request *http.Request) (*http.Response, error) {
		body, _ := io.ReadAll(request.Body)
		values, _ := url.ParseQuery(string(body))
		query := request.URL.Query()
		if values.Get("refresh_token") != "refresh-token" || values.Has("client_secret") || query.Get("device_id") != "device-1" || query.Get("redirect_uri") != "https://chat.example/oauth/vk_video/callback" || query.Get("state") == "" {
			t.Fatalf("URL=%s body=%s", request.URL, body)
		}
		return youtubeResponse(http.StatusOK, `{"access_token":"next-access","refresh_token":"next-refresh","expires_in":3600,"state":"`+query.Get("state")+`"}`), nil
	})}
	refresher := NewTokenRefresher(store, []RefreshConfig{{Provider: "vk_video", ClientID: "client", TokenURL: "https://id.vk.ru/oauth2/auth", RedirectURL: "https://chat.example/oauth/vk_video/callback", UsesVKID: true}}, client) //nolint:gosec // These are inert test-only credentials for a fake transport.
	now := time.Date(2026, 9, 6, 10, 0, 0, 0, time.UTC)
	refresher.now = func() time.Time { return now }
	source := youtubeTestSource()
	source.Source.Provider = "vk_video"
	source.Credentials.DeviceID = "device-1"
	source.Credentials.ExpiresAt = &now
	actual, err := refresher.Refresh(context.Background(), source)
	if err != nil {
		t.Fatal(err)
	}
	if actual.Credentials.AccessToken != "next-access" || actual.Credentials.RefreshToken != "next-refresh" || actual.Credentials.DeviceID != "device-1" {
		t.Fatalf("credentials = %#v", actual.Credentials)
	}
}

func TestTokenRefresherRejectsExplicitInvalidOptionalFields(t *testing.T) {
	responses := []string{
		`{"access_token":"next-access","refresh_token":""}`,
		`{"access_token":"next-access","expires_in":0}`,
		`{"access_token":"next-access","expires_in":-1}`,
	}
	for _, body := range responses {
		nextVersion := 2
		store := &refreshStore{version: &nextVersion}
		client := &http.Client{Transport: oauthRoundTripFunc(func(*http.Request) (*http.Response, error) {
			return youtubeResponse(http.StatusOK, body), nil
		})}
		refresher := NewTokenRefresher(store, []RefreshConfig{{Provider: "youtube", ClientID: "client", ClientSecret: "secret", TokenURL: "https://oauth.example/token"}}, client) //nolint:gosec // These are inert test-only credentials for a fake transport.
		now := time.Now()
		refresher.now = func() time.Time { return now }
		source := youtubeTestSource()
		source.Credentials.ExpiresAt = &now
		_, err := refresher.Refresh(context.Background(), source)
		var providerError *ProviderError
		if !errors.As(err, &providerError) || providerError.Type != "provider unauthorized" || store.input.connectionID != "" {
			t.Fatalf("body=%s error=%v store=%#v", body, err, store)
		}
	}
}

func TestTokenRefreshConfigs(t *testing.T) {
	credentials := &[2]string{"client", "secret"}
	configs := TokenRefreshConfigs(credentials, credentials, credentials, credentials, "https://chat.example/api/chat")
	if len(configs) != 5 || !strings.Contains(configs[0].TokenURL, "googleapis") || !strings.Contains(configs[1].TokenURL, "twitch") || !strings.Contains(configs[2].TokenURL, "kick") || !configs[3].UsesVKID {
		t.Fatalf("configs = %#v", configs)
	}
}

func TestBoostyRefreshRotatesTokensAndStoresExpiry(t *testing.T) {
	now := time.Date(2026, 9, 6, 10, 0, 0, 0, time.UTC)
	for _, unknown := range []bool{true, false} {
		t.Run(fmt.Sprint("unknownExpiry=", unknown), func(t *testing.T) {
			version := 3
			store := &refreshStore{version: &version}
			calls := 0
			client := &http.Client{Transport: oauthRoundTripFunc(func(r *http.Request) (*http.Response, error) {
				calls++
				if r.URL.Path == "/v1/user/current" {
					if r.Header.Get("Authorization") != "Bearer new-access" {
						t.Fatal("identity was not checked with refreshed token")
					}
					return youtubeResponse(200, `{"id":42,"blogUrl":"My.Blog"}`), nil
				}
				if r.Method != "POST" || r.URL.String() != "https://api.boosty.to/oauth/token/" || r.Header.Get("Content-Type") != "application/x-www-form-urlencoded" {
					t.Fatal("invalid refresh request")
				}
				if err := r.ParseForm(); err != nil {
					t.Fatal(err)
				}
				want := url.Values{"grant_type": {"refresh_token"}, "refresh_token": {"refresh-token"}, "device_id": {"device-1"}, "device_os": {"web"}}
				if !reflect.DeepEqual(r.PostForm, want) {
					t.Fatalf("unexpected fields: %v", r.PostForm)
				}
				return youtubeResponse(200, `{"access_token":"new-access","refresh_token":"new-refresh","expires_in":3600}`), nil
			})}
			refresher := NewTokenRefresher(store, TokenRefreshConfigs(nil, nil, nil, nil, ""), client)
			refresher.now = func() time.Time { return now }
			source := youtubeTestSource()
			source.Source.Provider = "boosty"
			source.Source.ProviderSourceID = "my.blog"
			source.Credentials.DeviceID = "device-1"
			if !unknown {
				expires := now.Add(30 * time.Second)
				source.Credentials.ExpiresAt = &expires
			}
			got, err := refresher.Refresh(context.Background(), source)
			if err != nil {
				t.Fatal(err)
			}
			if calls != 2 || got.Credentials.AccessToken != "new-access" || got.Credentials.RefreshToken != "new-refresh" || got.Credentials.DeviceID != "device-1" || got.Credentials.TokenVersion != 3 || !got.Credentials.ExpiresAt.Equal(now.Add(time.Hour)) {
				t.Fatal("refresh did not retain the complete credential set")
			}
			if store.input.expectedVersion != source.Credentials.TokenVersion || store.input.refreshToken != "new-refresh" {
				t.Fatalf("rotation was not persisted: %+v", store.input)
			}
		})
	}
}

func TestBoostyRefreshRejectsInvalidResponsesWithoutSaving(t *testing.T) {
	for _, body := range []string{
		`{"access_token":"next","expires_in":3600}`,
		`{"access_token":"next","refresh_token":"next"}`,
		`{"access_token":"next","refresh_token":"next","expires_in":-1}`,
		`{"access_token":"next","refresh_token":"next","expires_in":9223372036854775807}`,
		`{"error":"invalid_grant"}`,
	} {
		t.Run(body, func(t *testing.T) {
			store := &refreshStore{}
			client := &http.Client{Transport: oauthRoundTripFunc(func(*http.Request) (*http.Response, error) { return youtubeResponse(200, body), nil })}
			refresher := NewTokenRefresher(store, TokenRefreshConfigs(nil, nil, nil, nil, ""), client)
			source := youtubeTestSource()
			source.Source.Provider = "boosty"
			source.Credentials.DeviceID = "device-1"
			_, err := refresher.Refresh(context.Background(), source)
			if err == nil || store.input.connectionID != "" {
				t.Fatal("invalid credentials were accepted")
			}
		})
	}
}

func TestBoostyRefreshRequiresMatchingAccount(t *testing.T) {
	store := &refreshStore{}
	client := &http.Client{Transport: oauthRoundTripFunc(func(r *http.Request) (*http.Response, error) {
		if r.URL.Path == "/v1/user/current" {
			return youtubeResponse(200, `{"blogUrl":"someone-else"}`), nil
		}
		return youtubeResponse(200, `{"access_token":"next","refresh_token":"next","expires_in":3600}`), nil
	})}
	refresher := NewTokenRefresher(store, TokenRefreshConfigs(nil, nil, nil, nil, ""), client)
	source := youtubeTestSource()
	source.Source.Provider = "boosty"
	source.Source.ProviderSourceID = "my.blog"
	source.Credentials.DeviceID = "device-1"
	_, err := refresher.Refresh(context.Background(), source)
	if providerErrorType(err) != "provider refresh required" || store.input.connectionID != "" || !reflect.DeepEqual(store.marked, []int{1}) {
		t.Fatal("foreign account accepted")
	}
}

func TestBoostyRefreshingProviderUsesRenewedCredentials(t *testing.T) {
	version := 2
	store := &refreshStore{version: &version}
	reads := 0
	client := &http.Client{Transport: oauthRoundTripFunc(func(r *http.Request) (*http.Response, error) {
		switch r.URL.Path {
		case "/oauth/token/":
			return youtubeResponse(200, `{"access_token":"renewed","refresh_token":"rotated","expires_in":3600}`), nil
		case "/v1/user/current":
			return youtubeResponse(200, `{"blogUrl":"my.blog"}`), nil
		case "/v1/blog/my.blog/video_stream":
			if r.Header.Get("Authorization") != "Bearer renewed" {
				t.Error("collector used expired access token")
			}
			reads++
			return youtubeResponse(200, `{"isOnline":false}`), nil
		default:
			t.Errorf("unexpected path: %s", r.URL.Path)
			return youtubeResponse(404, `{}`), nil
		}
	})}
	provider := NewRefreshingProvider(NewBoostyProvider(client), NewTokenRefresher(store, TokenRefreshConfigs(nil, nil, nil, nil, ""), client))
	source := youtubeTestSource()
	source.Source.Provider = "boosty"
	source.Source.ProviderSourceID = "my.blog"
	source.Credentials.DeviceID = "device-1"
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	events, failures := provider.Stream(ctx, source)
	for events != nil || failures != nil {
		select {
		case event, ok := <-events:
			if !ok {
				events = nil
				continue
			}
			if event.State == "offline" {
				cancel()
			}
		case err, ok := <-failures:
			if !ok {
				failures = nil
			} else {
				t.Fatal(err)
			}
		}
	}
	if reads != 1 || store.input.refreshToken != "rotated" {
		t.Fatal("collector never resumed after refresh")
	}
}

func TestBoostyRefreshAllowsExistingAccessOnlyConnection(t *testing.T) {
	client := &http.Client{Transport: oauthRoundTripFunc(func(*http.Request) (*http.Response, error) {
		t.Fatal("unexpected refresh request")
		return nil, errors.New("unexpected request")
	})}
	refresher := NewTokenRefresher(&refreshStore{}, TokenRefreshConfigs(nil, nil, nil, nil, ""), client)
	source := youtubeTestSource()
	source.Source.Provider = "boosty"
	source.Credentials.RefreshToken = ""
	actual, err := refresher.Refresh(context.Background(), source)
	if err != nil || actual.Credentials.AccessToken != source.Credentials.AccessToken {
		t.Fatal("access-only connection changed")
	}
}

func expiredRefreshSource(provider string) ConnectedSource {
	source := youtubeTestSource()
	source.Source.Provider = provider
	source.Source.ProviderSourceID = "my.blog"
	source.Credentials.DeviceID = "device-1"
	expired := time.Now().Add(-time.Minute)
	source.Credentials.ExpiresAt = &expired
	return source
}

func TestTokenRefresherMarksRejectedRefreshTokens(t *testing.T) {
	tests := []struct {
		name     string
		provider string
		status   int
		body     string
	}{
		{name: "OAuth invalid_grant", provider: "youtube", status: http.StatusBadRequest, body: `{"error":"invalid_grant","error_description":"Token has been expired or revoked."}`},
		{name: "Twitch invalid refresh token", provider: "twitch", status: http.StatusBadRequest, body: `{"status":400,"message":"Invalid refresh token"}`},
		{name: "VK ID error body", provider: "vk_video", status: http.StatusOK, body: `{"error":"invalid_grant"}`},
		{name: "Boosty rejection", provider: "boosty", status: http.StatusUnauthorized, body: `{}`},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			store := &refreshStore{}
			client := &http.Client{Transport: oauthRoundTripFunc(func(*http.Request) (*http.Response, error) {
				return youtubeResponse(test.status, test.body), nil
			})}
			credentials := &[2]string{"client", "secret"}
			refresher := NewTokenRefresher(store, TokenRefreshConfigs(credentials, credentials, credentials, credentials, "https://chat.example"), client)
			_, err := refresher.Refresh(context.Background(), expiredRefreshSource(test.provider))
			if providerErrorType(err) != "provider refresh required" || !reflect.DeepEqual(store.marked, []int{1}) || store.input.connectionID != "" {
				t.Fatalf("error=%v marked=%v", err, store.marked)
			}
		})
	}
}

func TestTokenRefresherMarksMissingRenewalCredentials(t *testing.T) {
	for _, provider := range []string{"youtube", "vk_video", "boosty"} {
		t.Run(provider, func(t *testing.T) {
			store := &refreshStore{}
			client := &http.Client{Transport: oauthRoundTripFunc(func(*http.Request) (*http.Response, error) {
				t.Fatal("unexpected refresh request")
				return nil, errors.New("unexpected request")
			})}
			credentials := &[2]string{"client", "secret"}
			refresher := NewTokenRefresher(store, TokenRefreshConfigs(credentials, nil, nil, credentials, "https://chat.example"), client)
			source := expiredRefreshSource(provider)
			if provider == "youtube" {
				source.Credentials.RefreshToken = ""
			} else {
				source.Credentials.DeviceID = ""
			}
			_, err := refresher.Refresh(context.Background(), source)
			if providerErrorType(err) != "provider refresh required" || !reflect.DeepEqual(store.marked, []int{1}) {
				t.Fatalf("error=%v marked=%v", err, store.marked)
			}
		})
	}
}

func TestTokenRefresherKeepsRetryableFailuresConnected(t *testing.T) {
	tests := []struct {
		name     string
		provider string
		status   int
		body     string
		network  bool
	}{
		{name: "server error", provider: "youtube", status: http.StatusInternalServerError, body: `{}`},
		{name: "rate limit", provider: "twitch", status: http.StatusTooManyRequests, body: `{}`},
		{name: "invalid client", provider: "kick", status: http.StatusUnauthorized, body: `{"error":"invalid_client"}`},
		{name: "network failure", provider: "youtube", network: true},
		{name: "Boosty server error", provider: "boosty", status: http.StatusBadGateway, body: `{}`},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			store := &refreshStore{}
			client := &http.Client{Transport: oauthRoundTripFunc(func(*http.Request) (*http.Response, error) {
				if test.network {
					return nil, errors.New("connection reset")
				}
				return youtubeResponse(test.status, test.body), nil
			})}
			credentials := &[2]string{"client", "secret"}
			refresher := NewTokenRefresher(store, TokenRefreshConfigs(credentials, credentials, credentials, nil, ""), client)
			_, err := refresher.Refresh(context.Background(), expiredRefreshSource(test.provider))
			if err == nil || requiresReauthorization(err) || len(store.marked) != 0 {
				t.Fatalf("error=%v marked=%v", err, store.marked)
			}
		})
	}
}

func TestTokenRefresherKeepsNewerCredentialsAfterLostRace(t *testing.T) {
	store := &refreshStore{unmarkable: true}
	client := &http.Client{Transport: oauthRoundTripFunc(func(*http.Request) (*http.Response, error) {
		return youtubeResponse(http.StatusBadRequest, `{"error":"invalid_grant"}`), nil
	})}
	refresher := NewTokenRefresher(store, TokenRefreshConfigs(&[2]string{"client", "secret"}, nil, nil, nil, ""), client)
	_, err := refresher.Refresh(context.Background(), expiredRefreshSource("youtube"))
	if providerErrorType(err) != "provider unavailable" {
		t.Fatalf("error = %v; want a retryable error after a concurrent refresh or reconnect", err)
	}
}

func TestRefreshingProviderPersistsDefinitiveStreamFailure(t *testing.T) {
	client := &http.Client{Transport: oauthRoundTripFunc(func(*http.Request) (*http.Response, error) {
		return youtubeResponse(http.StatusUnauthorized, `{}`), nil
	})}
	store := &refreshStore{}
	provider := NewRefreshingProvider(NewBoostyProvider(client), NewTokenRefresher(store, TokenRefreshConfigs(nil, nil, nil, nil, ""), client))
	source := youtubeTestSource()
	source.Source.Provider = "boosty"
	source.Source.ProviderSourceID = "my.blog"
	source.Credentials.RefreshToken = ""
	source.Credentials.TokenVersion = 4
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	events, failures := provider.Stream(ctx, source)
	var failure error
	for events != nil || failures != nil {
		select {
		case _, open := <-events:
			if !open {
				events = nil
			}
		case err, open := <-failures:
			if !open {
				failures = nil
				continue
			}
			failure = err
		}
	}
	if ctx.Err() != nil {
		t.Fatal("stream kept running after a definitive authorization failure")
	}
	if !requiresReauthorization(failure) || !reflect.DeepEqual(store.marked, []int{4}) {
		t.Fatalf("failure=%v marked=%v", failure, store.marked)
	}
}

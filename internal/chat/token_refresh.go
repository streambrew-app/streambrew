package chat

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

const refreshEarly = time.Minute

type RefreshConfig struct {
	Provider     string
	ClientID     string
	ClientSecret string
	TokenURL     string
	RedirectURL  string
	UsesVKID     bool
	UsesBoosty   bool
}

type CredentialStore interface {
	UpdateConnectionCredentials(context.Context, string, int, string, string, *time.Time) (*int, error)
	MarkRefreshRequired(context.Context, string, int) (bool, error)
}

type TokenRefresher struct {
	store   CredentialStore
	configs map[string]RefreshConfig
	client  *http.Client
	now     func() time.Time
}

func NewTokenRefresher(store CredentialStore, configs []RefreshConfig, client *http.Client) *TokenRefresher {
	byProvider := make(map[string]RefreshConfig, len(configs))
	for _, config := range configs {
		byProvider[config.Provider] = config
	}
	return &TokenRefresher{store: store, configs: byProvider, client: client, now: time.Now}
}

// Refresh renews credentials that are about to expire. A definitive authorization failure marks
// the connection refresh_required before it is returned.
func (refresher *TokenRefresher) Refresh(ctx context.Context, source ConnectedSource) (ConnectedSource, error) {
	refreshed, err := refresher.refresh(ctx, source)
	if requiresReauthorization(err) {
		return ConnectedSource{}, refresher.requireReauthorization(ctx, source, err)
	}
	return refreshed, err
}

// requireReauthorization persists a definitive authorization failure and returns it. The token
// version guard leaves the connection unchanged when a concurrent refresh or reconnect has already
// replaced the rejected credentials; that outcome and storage failures stay retryable.
func (refresher *TokenRefresher) requireReauthorization(ctx context.Context, source ConnectedSource, failure error) error {
	marked, err := refresher.store.MarkRefreshRequired(ctx, source.Source.ConnectionID, source.Credentials.TokenVersion)
	if err != nil {
		return &ProviderError{Type: "provider unavailable", Detail: "Could not save the chat authorization status", Cause: err}
	}
	if !marked {
		return &ProviderError{Type: "provider unavailable", Detail: "Chat authorization was renewed by another service instance"}
	}
	return failure
}

func (refresher *TokenRefresher) refresh(ctx context.Context, source ConnectedSource) (ConnectedSource, error) {
	expiresAt := source.Credentials.ExpiresAt
	unknownBoostyExpiry := source.Source.Provider == "boosty" && expiresAt == nil && source.Credentials.RefreshToken != ""
	if !unknownBoostyExpiry && (expiresAt == nil || expiresAt.After(refresher.now().Add(refreshEarly))) {
		return source, nil
	}
	if source.Credentials.RefreshToken == "" {
		return ConnectedSource{}, refreshRequiredError("The chat connection has no refresh token", nil)
	}
	config, configured := refresher.configs[source.Source.Provider]
	if !configured {
		return ConnectedSource{}, &ProviderError{Type: "provider unauthorized", Detail: "Подключение чата нужно авторизовать заново"}
	}
	values := url.Values{
		"grant_type":    {"refresh_token"},
		"refresh_token": {source.Credentials.RefreshToken},
		"client_id":     {config.ClientID},
		"client_secret": {config.ClientSecret},
	}
	if config.UsesBoosty {
		if source.Credentials.DeviceID == "" {
			return ConnectedSource{}, refreshRequiredError("Reconnect Boosty with a refresh token and device ID", nil)
		}
		values = url.Values{"grant_type": {"refresh_token"}, "refresh_token": {source.Credentials.RefreshToken}, "device_id": {source.Credentials.DeviceID}, "device_os": {"web"}}
	}
	tokenURL := config.TokenURL
	state := ""
	if config.UsesVKID {
		if source.Credentials.DeviceID == "" {
			return ConnectedSource{}, refreshRequiredError("The VK Video connection has no device ID", nil)
		}
		generatedState, randomErr := randomBase64URL(32)
		if randomErr != nil {
			return ConnectedSource{}, refreshProviderError("Не удалось обновить авторизацию чата", randomErr)
		}
		state = generatedState
		query := url.Values{"grant_type": {"refresh_token"}, "redirect_uri": {config.RedirectURL}, "client_id": {config.ClientID}, "device_id": {source.Credentials.DeviceID}, "state": {state}}
		tokenURL += "?" + query.Encode()
		values = url.Values{"refresh_token": {source.Credentials.RefreshToken}}
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, tokenURL, strings.NewReader(values.Encode()))
	if err != nil {
		return ConnectedSource{}, refreshProviderError("Не удалось обновить авторизацию чата", err)
	}
	request.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	response, err := refresher.client.Do(request)
	if err != nil {
		if config.UsesBoosty {
			return ConnectedSource{}, operationError("Could not refresh Boosty authorization", err)
		}
		return ConnectedSource{}, refreshProviderError("Не удалось обновить авторизацию чата", err)
	}
	defer func() { _ = response.Body.Close() }()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return ConnectedSource{}, refreshResponseError(config, response)
	}
	var token struct {
		AccessToken  string  `json:"access_token"`
		RefreshToken *string `json:"refresh_token"`
		ExpiresIn    *int    `json:"expires_in"`
		State        string  `json:"state"`
		Error        string  `json:"error"`
	}
	decodeErr := json.NewDecoder(response.Body).Decode(&token)
	if token.Error == "invalid_grant" {
		return ConnectedSource{}, refreshRequiredError("The provider rejected the chat refresh token", errors.New(token.Error))
	}
	if decodeErr != nil || token.AccessToken == "" || (token.RefreshToken != nil && *token.RefreshToken == "") || (token.ExpiresIn != nil && *token.ExpiresIn <= 0) || (config.UsesVKID && token.State != state) || (config.UsesBoosty && (token.RefreshToken == nil || token.ExpiresIn == nil || *token.ExpiresIn <= 0 || *token.ExpiresIn > 31_536_000)) {
		if decodeErr == nil {
			decodeErr = errors.New("invalid token response")
		}
		return ConnectedSource{}, refreshProviderError("Не удалось обновить авторизацию чата", decodeErr)
	}
	if config.UsesBoosty {
		var identity boostyUser
		if identityErr := NewBoostyProvider(refresher.client).request(ctx, token.AccessToken, "/v1/user/current", &identity); identityErr != nil {
			if providerErrorType(identityErr) == "provider unauthorized" {
				return ConnectedSource{}, refreshRequiredError("Boosty rejected the renewed access token", identityErr)
			}
			return ConnectedSource{}, identityErr
		}
		if strings.ToLower(strings.TrimSpace(identity.BlogURL)) != source.Source.ProviderSourceID {
			return ConnectedSource{}, refreshRequiredError("Boosty refresh token belongs to a different account", nil)
		}
	}
	refreshToken := source.Credentials.RefreshToken
	if token.RefreshToken != nil {
		refreshToken = *token.RefreshToken
	}
	var nextExpiry *time.Time
	if token.ExpiresIn != nil {
		value := refresher.now().Add(time.Duration(*token.ExpiresIn) * time.Second)
		nextExpiry = &value
	}
	nextVersion, err := refresher.store.UpdateConnectionCredentials(ctx, source.Source.ConnectionID, source.Credentials.TokenVersion, token.AccessToken, refreshToken, nextExpiry)
	if err != nil {
		return ConnectedSource{}, err
	}
	if nextVersion == nil {
		return ConnectedSource{}, &ProviderError{Type: "provider unavailable", Detail: "Авторизация чата уже обновляется другим экземпляром сервиса"}
	}
	next := source
	next.Credentials = ProviderCredentials{AccessToken: token.AccessToken, RefreshToken: refreshToken, DeviceID: source.Credentials.DeviceID, ExpiresAt: nextExpiry, Scopes: append([]string(nil), source.Credentials.Scopes...), TokenVersion: *nextVersion}
	return next, nil
}

func refreshProviderError(detail string, cause error) error {
	return &ProviderError{Type: "provider unauthorized", Detail: detail, Cause: cause}
}

// refreshRequiredError reports a definitive authorization failure: no refresh can restore access
// until the streamer reconnects the provider account.
func refreshRequiredError(detail string, cause error) error {
	return &ProviderError{Type: "provider refresh required", Detail: detail, Cause: cause}
}

func requiresReauthorization(err error) bool {
	return providerErrorType(err) == "provider refresh required"
}

// refreshResponseError classifies a failed token request. Only a rejected refresh token is
// definitive; other responses, such as 5xx or rate limits, keep the collector backoff.
func refreshResponseError(config RefreshConfig, response *http.Response) error {
	var body struct {
		Error   string `json:"error"`
		Message string `json:"message"`
	}
	_ = json.NewDecoder(io.LimitReader(response.Body, 64<<10)).Decode(&body)
	_, _ = io.Copy(io.Discard, response.Body)
	cause := &ProviderHTTPError{Status: response.StatusCode}
	if rejectsRefreshToken(config, response.StatusCode, body.Error, body.Message) {
		return refreshRequiredError("The provider rejected the chat refresh token", cause)
	}
	if config.UsesBoosty {
		return operationError("Could not refresh Boosty authorization", cause)
	}
	return refreshProviderError("Не удалось обновить авторизацию чата", cause)
}

// rejectsRefreshToken recognizes revoked or expired refresh tokens. OAuth providers report them
// as invalid_grant (RFC 6749, section 5.2); Twitch answers HTTP 400 "Invalid refresh token".
func rejectsRefreshToken(config RefreshConfig, status int, code, message string) bool {
	if config.UsesBoosty {
		return status == http.StatusBadRequest || status == http.StatusUnauthorized || status == http.StatusForbidden
	}
	return code == "invalid_grant" || (status == http.StatusBadRequest && strings.EqualFold(message, "Invalid refresh token"))
}

type RefreshingProvider struct {
	delegate  Provider
	refresher *TokenRefresher
}

func NewRefreshingProvider(delegate Provider, refresher *TokenRefresher) *RefreshingProvider {
	return &RefreshingProvider{delegate: delegate, refresher: refresher}
}

func (provider *RefreshingProvider) Name() string       { return provider.delegate.Name() }
func (provider *RefreshingProvider) Collection() string { return provider.delegate.Collection() }

func (provider *RefreshingProvider) Stream(ctx context.Context, source ConnectedSource) (<-chan StreamEvent, <-chan error) {
	events := make(chan StreamEvent)
	errorsChannel := make(chan error)
	go func() {
		defer close(events)
		defer close(errorsChannel)
		refreshed, err := provider.refresher.Refresh(ctx, source)
		retry := 5 * time.Second
		for err != nil {
			sendProviderError(ctx, errorsChannel, err)
			// Refresh has already persisted a definitive failure; a reconnect starts a new collector.
			if source.Source.Provider != "boosty" || requiresReauthorization(err) {
				return
			}
			if providerErrorType(err) == "provider unauthorized" {
				<-ctx.Done()
				return
			}
			if !waitFor(ctx, retry) {
				return
			}
			retry = min(retry*2, time.Minute)
			refreshed, err = provider.refresher.Refresh(ctx, source)
		}
		streamCtx, cancel := context.WithCancel(ctx)
		defer cancel()
		if refreshed.Credentials.ExpiresAt != nil {
			delay := refreshed.Credentials.ExpiresAt.Sub(provider.refresher.now()) - refreshEarly
			if delay <= 0 {
				// Short-lived tokens renew halfway through their remaining lifetime.
				delay = max(time.Millisecond, refreshed.Credentials.ExpiresAt.Sub(provider.refresher.now())/2)
			}
			timer := time.AfterFunc(delay, cancel)
			defer timer.Stop()
		}
		delegateEvents, delegateErrors := provider.delegate.Stream(streamCtx, refreshed)
		for delegateEvents != nil || delegateErrors != nil {
			select {
			case <-ctx.Done():
				return
			case event, open := <-delegateEvents:
				if !open {
					delegateEvents = nil
					continue
				}
				sendStreamEvent(ctx, events, event)
			case providerError, open := <-delegateErrors:
				if !open {
					delegateErrors = nil
					continue
				}
				if requiresReauthorization(providerError) {
					// The provider cannot continue with these credentials, so the session ends here.
					sendProviderError(ctx, errorsChannel, provider.refresher.requireReauthorization(ctx, refreshed, providerError))
					return
				}
				sendProviderError(ctx, errorsChannel, providerError)
			}
		}
	}()
	return events, errorsChannel
}

func (provider *RefreshingProvider) SendMessage(ctx context.Context, source ConnectedSource, text string) error {
	refreshed, err := provider.refresher.Refresh(ctx, source)
	if err != nil {
		return err
	}
	return provider.delegate.SendMessage(ctx, refreshed, text)
}

func (provider *RefreshingProvider) Moderate(ctx context.Context, source ConnectedSource, command ModerationCommand, providerBanID string) (ProviderCommandSuccess, error) {
	refreshed, err := provider.refresher.Refresh(ctx, source)
	if err != nil {
		return ProviderCommandSuccess{}, err
	}
	return provider.delegate.Moderate(ctx, refreshed, command, providerBanID)
}

func TokenRefreshConfigs(youtube, twitch, kick, vkVideo *[2]string, publicURL string) []RefreshConfig {
	configs := make([]RefreshConfig, 0, 4)
	if youtube != nil {
		configs = append(configs, tokenRefreshConfig(youtube, "youtube", "https://oauth2.googleapis.com/token"))
	}
	if twitch != nil {
		configs = append(configs, tokenRefreshConfig(twitch, "twitch", "https://id.twitch.tv/oauth2/token"))
	}
	if kick != nil {
		configs = append(configs, tokenRefreshConfig(kick, "kick", "https://id.kick.com/oauth/token"))
	}
	if vkVideo != nil {
		callbackURL := strings.TrimSuffix(publicURL, "/") + "/oauth/vk_video/callback"
		config := tokenRefreshConfig(vkVideo, "vk_video", "https://id.vk.ru/oauth2/auth")
		config.RedirectURL = callbackURL
		config.UsesVKID = true
		configs = append(configs, config)
	}
	boosty := RefreshConfig{Provider: "boosty", UsesBoosty: true}
	boosty.TokenURL = "https://api.boosty.to/oauth/token/"
	return append(configs, boosty)
}

func tokenRefreshConfig(credentials *[2]string, provider, tokenURL string) RefreshConfig {
	return RefreshConfig{Provider: provider, ClientID: credentials[0], ClientSecret: credentials[1], TokenURL: tokenURL}
}

var _ CredentialStore = (*Store)(nil)
var _ Provider = (*RefreshingProvider)(nil)

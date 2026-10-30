package donationalerts

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/streambrew-app/streambrew/internal/money"
)

const (
	defaultBaseURL            = "https://www.donationalerts.com"
	donationDateLayout        = "2006-01-02 15:04:05"
	maximumRecentHistoryPages = 4
	providerRequestInterval   = 1050 * time.Millisecond
	recentHistoryRequestLimit = 10 * time.Second
)

var scopes = []string{"oauth-user-show", "oauth-donation-subscribe", "oauth-donation-index"}
var currencyPattern = regexp.MustCompile(`^[A-Z]{3}$`)

type stringOrNumber string

func (value *stringOrNumber) UnmarshalJSON(body []byte) error {
	if len(body) == 0 {
		return errors.New("empty scalar")
	}
	if body[0] == '"' {
		var text string
		if err := json.Unmarshal(body, &text); err != nil {
			return err
		}
		*value = stringOrNumber(text)
		return nil
	}
	var number json.Number
	if err := json.Unmarshal(body, &number); err != nil {
		return err
	}
	*value = stringOrNumber(number.String())
	return nil
}

type numberOnly string

func (value *numberOnly) UnmarshalJSON(body []byte) error {
	if len(body) == 0 || body[0] == '"' {
		return errors.New("expected number")
	}
	var number json.Number
	if err := json.Unmarshal(body, &number); err != nil {
		return err
	}
	*value = numberOnly(number.String())
	return nil
}

type Config struct {
	ClientID     string
	ClientSecret string
}

type Tokens struct {
	AccessToken  string
	RefreshToken string
}

type Connection struct {
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

// RejectedDonation is a history row that failed validation. It is skipped so
// one malformed row cannot block the rest of the account's history.
type RejectedDonation struct {
	SourceDonationID string
	Err              error
}

// History contains the valid donations read from DonationAlerts and the rows
// skipped because they failed validation.
type History struct {
	Donations []Donation
	Rejected  []RejectedDonation
}

type RequestError struct {
	Unauthorized bool
	Status       int
	Operation    string
	Cause        error
}

func (e *RequestError) Error() string {
	if e.Status != 0 {
		return fmt.Sprintf("donationalerts: %s returned HTTP %d", e.Operation, e.Status)
	}
	return fmt.Sprintf("donationalerts: %s: %v", e.Operation, e.Cause)
}

func (e *RequestError) Unwrap() error { return e.Cause }

type Client struct {
	HTTPClient *http.Client
	BaseURL    string
	PageDelay  time.Duration
	limiter    *requestLimiter
}

func NewClient(httpClient *http.Client) *Client {
	return &Client{
		HTTPClient: httpClient,
		BaseURL:    defaultBaseURL,
		PageDelay:  250 * time.Millisecond,
		limiter:    newRequestLimiter(providerRequestInterval),
	}
}

func AuthorizationURL(clientID, redirectURI string) string {
	parameters := url.Values{
		"client_id":     {clientID},
		"redirect_uri":  {redirectURI},
		"response_type": {"code"},
		"scope":         {strings.Join(scopes, " ")},
	}
	return defaultBaseURL + "/oauth/authorize?" + parameters.Encode()
}

func (client *Client) IssueConnection(ctx context.Context, config Config, authCode, redirectURI string) (Connection, error) {
	values := url.Values{
		"grant_type":    {"authorization_code"},
		"client_id":     {config.ClientID},
		"client_secret": {config.ClientSecret},
		"redirect_uri":  {redirectURI},
		"code":          {authCode},
	}
	tokens, err := client.fetchTokens(ctx, values)
	if err != nil {
		return Connection{}, err
	}
	var profile struct {
		Data struct {
			ID stringOrNumber `json:"id"`
		} `json:"data"`
	}
	if err := client.doJSON(ctx, http.MethodGet, "/api/v1/user/oauth", nil, tokens.AccessToken, &profile); err != nil {
		return Connection{}, err
	}
	if profile.Data.ID == "" {
		return Connection{}, requestValidationError("read profile", errors.New("missing user id"))
	}
	return Connection{Tokens: tokens, SourceUserID: string(profile.Data.ID)}, nil
}

func (client *Client) RefreshTokens(ctx context.Context, config Config, refreshToken string) (Tokens, error) {
	values := url.Values{
		"grant_type":    {"refresh_token"},
		"client_id":     {config.ClientID},
		"client_secret": {config.ClientSecret},
		"refresh_token": {refreshToken},
		"scope":         {strings.Join(scopes, " ")},
	}
	return client.fetchTokens(ctx, values)
}

func (client *Client) GetDonations(ctx context.Context, accessToken string) (History, error) {
	return client.getDonations(ctx, accessToken, nil, 0, regularRequest)
}

// GetDonationsAfter reads a bounded recovery window instead of walking an
// account's lifetime history. Four pages cover the alert queue's 100-item
// bound while preventing one account from monopolizing a recovery pass. The
// provider does not guarantee response ordering, so every page in the bounded
// window is inspected.
func (client *Client) GetDonationsAfter(ctx context.Context, accessToken string, occurredAfter time.Time) (History, error) {
	return client.getDonations(ctx, accessToken, &occurredAfter, maximumRecentHistoryPages, recoveryRequest)
}

func (client *Client) getDonations(ctx context.Context, accessToken string, occurredAfter *time.Time, maximumPages int, priority requestPriority) (History, error) {
	history := History{Donations: make([]Donation, 0)}
	for pageNumber := 1; ; pageNumber++ {
		if pageNumber > 1 && client.PageDelay > 0 {
			timer := time.NewTimer(client.PageDelay)
			select {
			case <-ctx.Done():
				timer.Stop()
				return History{}, ctx.Err()
			case <-timer.C:
			}
		}
		var page struct {
			// Rows are decoded individually so one malformed row is skipped
			// instead of rejecting its whole page.
			Data []json.RawMessage `json:"data"`
			Meta struct {
				LastPage int `json:"last_page"`
			} `json:"meta"`
		}
		path := "/api/v1/alerts/donations?page=" + strconv.Itoa(pageNumber)
		requestCtx := ctx
		cancel := func() {}
		if priority == recoveryRequest {
			requestCtx, cancel = context.WithTimeout(ctx, recentHistoryRequestLimit)
		}
		err := client.doJSONPriority(requestCtx, http.MethodGet, path, nil, accessToken, "", &page, priority)
		cancel()
		if err != nil {
			return History{}, err
		}
		if page.Meta.LastPage <= 0 {
			return History{}, requestValidationError("read donations", errors.New("invalid last_page"))
		}
		for _, body := range page.Data {
			donation, err := decodeDonation(body)
			if err != nil {
				history.Rejected = append(history.Rejected, RejectedDonation{SourceDonationID: rejectedDonationID(body), Err: err})
				continue
			}
			if occurredAfter != nil && !donation.OccurredAt.After(*occurredAfter) {
				continue
			}
			history.Donations = append(history.Donations, donation)
		}
		if len(page.Data) == 0 || pageNumber >= page.Meta.LastPage || maximumPages > 0 && pageNumber >= maximumPages {
			return history, nil
		}
	}
}

type SocketProfile struct {
	UserID                string
	SocketConnectionToken string
}

func (client *Client) SocketProfile(ctx context.Context, accessToken string) (SocketProfile, error) {
	var payload struct {
		Data struct {
			ID                    stringOrNumber `json:"id"`
			SocketConnectionToken string         `json:"socket_connection_token"`
		} `json:"data"`
	}
	if err := client.doJSON(ctx, http.MethodGet, "/api/v1/user/oauth", nil, accessToken, &payload); err != nil {
		return SocketProfile{}, err
	}
	if payload.Data.ID == "" || payload.Data.SocketConnectionToken == "" {
		return SocketProfile{}, requestValidationError("read socket profile", errors.New("missing socket profile fields"))
	}
	return SocketProfile{UserID: string(payload.Data.ID), SocketConnectionToken: payload.Data.SocketConnectionToken}, nil
}

func (client *Client) ChannelToken(ctx context.Context, accessToken, channel, socketClientID string) (string, error) {
	body, err := json.Marshal(map[string]any{"channels": []string{channel}, "client": socketClientID})
	if err != nil {
		return "", requestValidationError("encode channel subscription", err)
	}
	var payload struct {
		Channels []struct {
			Channel string `json:"channel"`
			Token   string `json:"token"`
		} `json:"channels"`
	}
	if err := client.doJSONContentType(ctx, http.MethodPost, "/api/v1/centrifuge/subscribe", strings.NewReader(string(body)), accessToken, "application/json", &payload); err != nil {
		return "", err
	}
	for _, subscription := range payload.Channels {
		if subscription.Channel == channel && subscription.Token != "" {
			return subscription.Token, nil
		}
	}
	return "", requestValidationError("read channel subscription", errors.New("requested channel token not returned"))
}

type rawDonation struct {
	ID        numberOnly     `json:"id"`
	Username  *string        `json:"username"`
	Message   *string        `json:"message"`
	Amount    stringOrNumber `json:"amount"`
	Currency  string         `json:"currency"`
	CreatedAt string         `json:"created_at"`
}

// decodeDonation parses one REST row or socket publication at the provider seam.
func decodeDonation(body []byte) (Donation, error) {
	var raw rawDonation
	if err := json.Unmarshal(body, &raw); err != nil {
		return Donation{}, fmt.Errorf("invalid DonationAlerts donation: %w", err)
	}
	return raw.donation()
}

// rejectedDonationID identifies a rejected row in diagnostics when its id is
// readable, including string ids that the donation parser rejects.
func rejectedDonationID(body []byte) string {
	var identity struct {
		ID stringOrNumber `json:"id"`
	}
	if json.Unmarshal(body, &identity) != nil {
		return ""
	}
	return string(identity.ID)
}

func (raw rawDonation) donation() (Donation, error) {
	if raw.ID == "" || !currencyPattern.MatchString(raw.Currency) {
		return Donation{}, errors.New("invalid donation identity or currency")
	}
	amount, err := money.NormalizeDonationAmount(string(raw.Amount))
	if err != nil {
		return Donation{}, err
	}
	occurredAt, err := time.ParseInLocation(donationDateLayout, raw.CreatedAt, time.UTC)
	if err != nil {
		return Donation{}, fmt.Errorf("invalid donation date: %w", err)
	}
	return Donation{
		SourceDonationID: string(raw.ID),
		Author:           donorText(raw.Username),
		Message:          donorText(raw.Message),
		Amount:           amount,
		Currency:         raw.Currency,
		SourceCreatedAt:  raw.CreatedAt,
		OccurredAt:       occurredAt,
	}, nil
}

// donorText removes NUL characters from donor-controlled text because
// PostgreSQL text values cannot store them.
func donorText(value *string) *string {
	if value == nil || !strings.ContainsRune(*value, 0) {
		return value
	}
	cleaned := strings.ReplaceAll(*value, "\x00", "")
	return &cleaned
}

func (client *Client) fetchTokens(ctx context.Context, values url.Values) (Tokens, error) {
	var payload struct {
		AccessToken  string `json:"access_token"`
		RefreshToken string `json:"refresh_token"`
	}
	if err := client.doJSON(ctx, http.MethodPost, "/oauth/token", strings.NewReader(values.Encode()), "", &payload); err != nil {
		return Tokens{}, err
	}
	if payload.AccessToken == "" || payload.RefreshToken == "" {
		return Tokens{}, requestValidationError("fetch tokens", errors.New("missing token"))
	}
	return Tokens{AccessToken: payload.AccessToken, RefreshToken: payload.RefreshToken}, nil
}

func (client *Client) doJSON(ctx context.Context, method, path string, body io.Reader, accessToken string, target any) error {
	contentType := ""
	if body != nil {
		contentType = "application/x-www-form-urlencoded"
	}
	return client.doJSONPriority(ctx, method, path, body, accessToken, contentType, target, criticalRequest)
}

func (client *Client) doJSONContentType(ctx context.Context, method, path string, body io.Reader, accessToken, contentType string, target any) error {
	return client.doJSONPriority(ctx, method, path, body, accessToken, contentType, target, criticalRequest)
}

func (client *Client) doJSONPriority(ctx context.Context, method, path string, body io.Reader, accessToken, contentType string, target any, priority requestPriority) error {
	request, err := http.NewRequestWithContext(ctx, method, strings.TrimRight(client.BaseURL, "/")+path, body)
	if err != nil {
		return &RequestError{Operation: method + " " + path, Cause: err}
	}
	if accessToken != "" {
		request.Header.Set("Authorization", "Bearer "+accessToken)
	}
	if contentType != "" {
		request.Header.Set("Content-Type", contentType)
	}
	if waitErr := client.limiter.wait(ctx, priority); waitErr != nil {
		return &RequestError{Operation: method + " " + path, Cause: waitErr}
	}
	response, err := client.HTTPClient.Do(request)
	if err != nil {
		return &RequestError{Operation: method + " " + path, Cause: err}
	}
	defer func() { _ = response.Body.Close() }()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		unauthorized := response.StatusCode == http.StatusUnauthorized
		if response.StatusCode == http.StatusBadRequest && path == "/oauth/token" {
			// OAuth reports a revoked or expired refresh token as 400 invalid_grant.
			unauthorized = tokenGrantInvalid(response.Body)
		}
		return &RequestError{Unauthorized: unauthorized, Status: response.StatusCode, Operation: method + " " + path}
	}
	decoder := json.NewDecoder(response.Body)
	decoder.UseNumber()
	if err := decoder.Decode(target); err != nil {
		return requestValidationError(method+" "+path, err)
	}
	return nil
}

func tokenGrantInvalid(body io.Reader) bool {
	var oauthError struct {
		Error string `json:"error"`
	}
	// OAuth error bodies are small; the bound also prevents an unexpected response from being buffered.
	decoder := json.NewDecoder(io.LimitReader(body, 4096))
	return decoder.Decode(&oauthError) == nil && oauthError.Error == "invalid_grant"
}

func requestValidationError(operation string, cause error) error {
	return &RequestError{Operation: operation, Cause: cause}
}

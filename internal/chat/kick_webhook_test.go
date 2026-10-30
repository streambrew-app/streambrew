package chat

import (
	"context"
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/pem"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

type kickTestStore struct {
	source *OwnedConnectedSource
	err    error
}

func (store *kickTestStore) GetEnabledSourceByProviderID(context.Context, string, string) (*OwnedConnectedSource, error) {
	return store.source, store.err
}

type kickTestBroker struct {
	userID int
	event  StreamEvent
	key    string
}

func (broker *kickTestBroker) Publish(_ context.Context, userID int, event StreamEvent, key string) error {
	broker.userID, broker.event, broker.key = userID, event, key
	return nil
}
func (*kickTestBroker) Stream(context.Context, int) <-chan StreamEvent {
	result := make(chan StreamEvent)
	close(result)
	return result
}

func TestKickWebhookVerifiesAndPublishes(t *testing.T) {
	privateKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	publicDER, err := x509.MarshalPKIXPublicKey(&privateKey.PublicKey)
	if err != nil {
		t.Fatal(err)
	}
	publicPEM := pem.EncodeToMemory(&pem.Block{Type: "PUBLIC KEY", Bytes: publicDER})
	store := &kickTestStore{source: &OwnedConnectedSource{UserID: 42, ConnectedSource: connectedSource(youtubeSourceID, "kick", CapabilityRead)}}
	store.source.ConnectedSource.Source.ConnectionID = "connection-id"
	broker := &kickTestBroker{}
	handler, err := NewKickWebhookHandler(string(publicPEM), store, broker)
	if err != nil {
		t.Fatal(err)
	}
	now := time.Date(2026, 9, 3, 12, 0, 0, 0, time.UTC)
	handler.now = func() time.Time { return now }
	body := `{"message_id":"provider-message","broadcaster":{"user_id":123,"username":"streamer"},"sender":{"user_id":"viewer-1","username":"Viewer"},"content":"hello","created_at":"2026-09-03T12:00:00Z"}`
	messageID, timestamp := "event-message-id", now.Format(time.RFC3339)
	digest := sha256.Sum256([]byte(messageID + "." + timestamp + "." + body))
	signature, err := rsa.SignPKCS1v15(rand.Reader, privateKey, crypto.SHA256, digest[:])
	if err != nil {
		t.Fatal(err)
	}
	headers := http.Header{"Kick-Event-Message-Id": {messageID}, "Kick-Event-Message-Timestamp": {timestamp}, "Kick-Event-Signature": {base64.StdEncoding.EncodeToString(signature)}, "Kick-Event-Type": {"chat.message.sent"}}
	if err := handler.Handle(context.Background(), headers, body); err != nil {
		t.Fatal(err)
	}
	if broker.userID != 42 || broker.key != "kick:event-message-id" || broker.event.Message == nil || broker.event.Message.Author.ID != "viewer-1" || broker.event.Message.Text != "hello" {
		t.Fatalf("unexpected publication: user=%d key=%q event=%#v", broker.userID, broker.key, broker.event)
	}
}

func TestKickWebhookRejectsStaleTimestamp(t *testing.T) {
	privateKey, _ := rsa.GenerateKey(rand.Reader, 2048)
	publicDER, _ := x509.MarshalPKIXPublicKey(&privateKey.PublicKey)
	handler, err := NewKickWebhookHandler(string(pem.EncodeToMemory(&pem.Block{Type: "PUBLIC KEY", Bytes: publicDER})), &kickTestStore{}, &kickTestBroker{})
	if err != nil {
		t.Fatal(err)
	}
	handler.now = func() time.Time { return time.Date(2026, 9, 3, 12, 10, 0, 0, time.UTC) }
	headers := http.Header{"Kick-Event-Message-Id": {"id"}, "Kick-Event-Message-Timestamp": {"2026-09-03T12:00:00Z"}, "Kick-Event-Signature": {"invalid"}, "Kick-Event-Type": {"chat.message.sent"}}
	if err := handler.Handle(context.Background(), headers, `{}`); err == nil {
		t.Fatal("expected stale webhook to be rejected")
	}
}

const kickTestBody = `{"message_id":"provider-message","broadcaster":{"user_id":123,"username":"streamer"},"sender":{"user_id":"viewer-1","username":"Viewer"},"content":"hello","created_at":"2026-09-03T12:00:00Z"}`

// newSignedKickWebhookTest returns an HTTP handler with a Kick webhook and a request signer.
func newSignedKickWebhookTest(t *testing.T, store KickSourceStore) (*HTTPHandler, func(body string) *http.Request) {
	t.Helper()
	privateKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	publicDER, err := x509.MarshalPKIXPublicKey(&privateKey.PublicKey)
	if err != nil {
		t.Fatal(err)
	}
	webhook, err := NewKickWebhookHandler(string(pem.EncodeToMemory(&pem.Block{Type: "PUBLIC KEY", Bytes: publicDER})), store, &kickTestBroker{})
	if err != nil {
		t.Fatal(err)
	}
	now := time.Date(2026, 9, 3, 12, 0, 0, 0, time.UTC)
	webhook.now = func() time.Time { return now }
	handler := NewHTTPHandler(&httpTestApplication{}, &httpTestActivity{}, &httpTestOauth{available: map[string]bool{}}, &httpTestStore{}, httpTestSecret, "https://web.example", webhook, nil, &httpTestDeadLetters{})
	sign := func(body string) *http.Request {
		messageID, timestamp := "event-message-id", now.Format(time.RFC3339)
		digest := sha256.Sum256([]byte(messageID + "." + timestamp + "." + body))
		signature, signErr := rsa.SignPKCS1v15(rand.Reader, privateKey, crypto.SHA256, digest[:])
		if signErr != nil {
			t.Fatal(signErr)
		}
		request := authorizedRequest(http.MethodPost, "/webhooks/kick", body)
		request.Header.Set("Kick-Event-Message-Id", messageID)
		request.Header.Set("Kick-Event-Message-Timestamp", timestamp)
		request.Header.Set("Kick-Event-Signature", base64.StdEncoding.EncodeToString(signature))
		request.Header.Set("Kick-Event-Type", "chat.message.sent")
		return request
	}
	return handler, sign
}

func TestKickWebhookHTTPStatuses(t *testing.T) {
	handler, sign := newSignedKickWebhookTest(t, &kickTestStore{err: errors.New("database password=secret unavailable")})

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, sign(kickTestBody))
	if response.Code != http.StatusInternalServerError || strings.Contains(response.Body.String(), "secret") {
		t.Fatalf("internal failure: status=%d body=%s", response.Code, response.Body.String())
	}

	response = httptest.NewRecorder()
	handler.ServeHTTP(response, sign(`{"message_id":""}`))
	if response.Code != http.StatusBadRequest {
		t.Fatalf("invalid payload: status=%d body=%s", response.Code, response.Body.String())
	}

	tampered := sign(kickTestBody)
	tampered.Body = httptest.NewRequest(http.MethodPost, "/", strings.NewReader(strings.Replace(kickTestBody, "hello", "bye", 1))).Body
	response = httptest.NewRecorder()
	handler.ServeHTTP(response, tampered)
	if response.Code != http.StatusUnauthorized {
		t.Fatalf("invalid signature: status=%d body=%s", response.Code, response.Body.String())
	}

	response = httptest.NewRecorder()
	handler.ServeHTTP(response, sign(strings.Repeat(" ", kickWebhookMaxBodyBytes)+kickTestBody))
	if response.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("oversized body: status=%d body=%s", response.Code, response.Body.String())
	}
}

func TestKickWebhookHTTPAcceptsUnknownSource(t *testing.T) {
	handler, sign := newSignedKickWebhookTest(t, &kickTestStore{})
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, sign(kickTestBody))
	if response.Code != http.StatusAccepted {
		t.Fatalf("status=%d body=%s", response.Code, response.Body.String())
	}
}

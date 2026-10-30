package tourniquet

import (
	"context"
	"errors"
	"reflect"
	"testing"
	"time"
)

type sourceTestSocket struct {
	reads  [][]byte
	writes [][]byte
}

func (socket *sourceTestSocket) Read(context.Context) ([]byte, error) {
	if len(socket.reads) == 0 {
		return nil, errors.New("closed")
	}
	body := socket.reads[0]
	socket.reads = socket.reads[1:]
	return body, nil
}

func (socket *sourceTestSocket) Write(_ context.Context, body []byte) error {
	socket.writes = append(socket.writes, append([]byte(nil), body...))
	return nil
}

func (*sourceTestSocket) Close() error { return nil }

func TestRunSessionSubscribesPongsAndEmitsDonation(t *testing.T) {
	socket := &sourceTestSocket{reads: [][]byte{
		[]byte(`{"event":"pusher:connection_established","data":"{\"socket_id\":\"1.2\"}"}`),
		[]byte(`{"event":"pusher_internal:subscription_succeeded","channel":"donation_channel","data":"{}"}`),
		[]byte(`{"event":"pusher:ping","data":{}}`),
		[]byte(`{"event":"donation-paidWidgetToken1234567890","channel":"donation_channel","data":"{\"order_id\":\"order-1\",\"username\":\"Supporter\",\"text\":\"hello\",\"amount\":100,\"fiat\":\"USD\",\"money_type\":\"FIAT\",\"updated_at\":\"2026-09-15 12:00:00\"}"}`),
	}}
	source := NewSource()
	source.dial = func(context.Context, string) (Socket, error) { return socket, nil }
	var donation Donation
	established, err := source.runSession(context.Background(), "WidgetToken1234567890", func(value Donation) error {
		donation = value
		return errors.New("stop")
	})
	if err == nil || err.Error() != "stop" || !established {
		t.Fatalf("established=%v err=%v", established, err)
	}
	expectedWrites := [][]byte{
		[]byte(`{"event":"pusher:subscribe","data":{"auth":"","channel":"donation_channel"}}`),
		[]byte(`{"event":"pusher:pong","data":{}}`),
	}
	if !reflect.DeepEqual(socket.writes, expectedWrites) {
		t.Fatalf("writes=%q", socket.writes)
	}
	if donation.SourceDonationID != "order-1" || donation.Amount != "100" || donation.Currency != "USD" {
		t.Fatalf("donation=%#v", donation)
	}
}

func TestRunSessionIgnoresTestAndMalformedEvents(t *testing.T) {
	socket := &sourceTestSocket{reads: [][]byte{
		[]byte(`{"event":"donation-paidWidgetToken1234567890","data":"{\"username\":\"Based One\",\"amount\":100,\"fiat\":\"USD\"}"}`),
		[]byte(`{"event":"donation-paidWidgetToken1234567890","data":"not-json"}`),
	}}
	source := NewSource()
	source.dial = func(context.Context, string) (Socket, error) { return socket, nil }
	called := false
	_, err := source.runSession(context.Background(), "WidgetToken1234567890", func(Donation) error {
		called = true
		return nil
	})
	if err == nil || called {
		t.Fatalf("called=%v err=%v", called, err)
	}
}

func TestDecodeDonationAcceptsObjectData(t *testing.T) {
	raw, err := decodeDonation([]byte(`{"order_id":"order-2","amount":"1","fiat":"EUR","updated_at":"2026-09-15 12:00:00"}`))
	if err != nil || raw.OrderID != "order-2" {
		t.Fatalf("raw=%#v err=%v", raw, err)
	}
}

func TestRunResetsBackoffAfterSubscribedSession(t *testing.T) {
	source := NewSource()
	source.dial = func(context.Context, string) (Socket, error) {
		return &sourceTestSocket{reads: [][]byte{
			[]byte(`{"event":"pusher:connection_established","data":"{\"socket_id\":\"1.2\"}"}`),
			[]byte(`{"event":"pusher_internal:subscription_succeeded","channel":"donation_channel","data":"{}"}`),
		}}, nil
	}
	ctx, cancel := context.WithCancel(context.Background())
	waits := make([]time.Duration, 0, 3)
	source.wait = func(_ context.Context, duration time.Duration) error {
		waits = append(waits, duration)
		if len(waits) == 3 {
			cancel()
			return context.Canceled
		}
		return nil
	}
	if err := source.Run(ctx, "WidgetToken1234567890", func(Donation) error { return nil }); err != nil {
		t.Fatal(err)
	}
	expected := []time.Duration{source.retryStart, source.retryStart, source.retryStart}
	if !reflect.DeepEqual(waits, expected) {
		t.Fatalf("backoff = %v; want %v after subscribed sessions", waits, expected)
	}
}

func TestRunBacksOffWhenSessionsDoNotSubscribe(t *testing.T) {
	source := NewSource()
	source.dial = func(context.Context, string) (Socket, error) {
		return &sourceTestSocket{reads: [][]byte{
			[]byte(`{"event":"pusher:connection_established","data":"{\"socket_id\":\"1.2\"}"}`),
			[]byte(`{"event":"pusher_internal:subscription_succeeded","channel":"another_channel","data":"{}"}`),
		}}, nil
	}
	ctx, cancel := context.WithCancel(context.Background())
	waits := make([]time.Duration, 0, 3)
	source.wait = func(_ context.Context, duration time.Duration) error {
		waits = append(waits, duration)
		if len(waits) == 3 {
			cancel()
			return context.Canceled
		}
		return nil
	}
	if err := source.Run(ctx, "WidgetToken1234567890", func(Donation) error { return nil }); err != nil {
		t.Fatal(err)
	}
	expected := []time.Duration{5 * time.Second, 10 * time.Second, 20 * time.Second}
	if !reflect.DeepEqual(waits, expected) {
		t.Fatalf("backoff = %v; want %v", waits, expected)
	}
}

func TestDonationStripsNULFromDonorText(t *testing.T) {
	raw, err := decodeDonation([]byte(`{"order_id":"order-3","username":"Sup\u0000porter","text":"hi\u0000","amount":"1","fiat":"EUR","updated_at":"2026-09-15 12:00:00"}`))
	if err != nil {
		t.Fatal(err)
	}
	donation, accepted, err := raw.donation()
	if err != nil || !accepted || donation.Author == nil || *donation.Author != "Supporter" || donation.Message == nil || *donation.Message != "hi" {
		t.Fatalf("donation=%#v accepted=%v err=%v", donation, accepted, err)
	}
}

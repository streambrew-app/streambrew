# DonationAlerts donation integration

This guide describes the DonationAlerts provider integration implemented in
StreamBrew. The source identifier is `donationalerts`. StreamBrew's own OBS alert
presentation and playback rules are documented in
[Donation alerts](../features/donation-alerts.md).

## Ownership and connection

The web application authenticates the streamer and exposes the public
`/api/integration/donationalerts/authorize` and
`/api/integration/donationalerts/callback` routes. It passes the authenticated
user ID, authorization code, and callback URL to the private donations service.
The callback URL is resolved against `APP_DOMAIN`.

`apps/donations` and `internal/donations` own code exchange, profile loading,
history import, connection persistence, token refresh, and realtime listeners.
The provider implementation lives in `internal/donationalerts`. The web application
uses `DONATIONS_SERVICE_URL` and `DONATIONS_SERVICE_SECRET` to reach the service;
the provider client uses `DONATION_ALERTS_CLIENT_ID` and
`DONATION_ALERTS_CLIENT_SECRET`. See the
[deployment guide](../operations/deployment.md#github-configuration) for environment wiring.

Connecting loads the provider profile and complete available donation history
before atomically saving the connection and donations. A history failure leaves
the existing database state unchanged and causes the callback to report failure.
Reconnecting replaces the streamer's connection and increments its token version.

## OAuth contract in the implementation

The [provider client](../../internal/donationalerts/client.go) constructs an
authorization-code request to `https://www.donationalerts.com/oauth/authorize`
with the exact callback URI and these scopes:

- `oauth-user-show`
- `oauth-donation-subscribe`
- `oauth-donation-index`

Code exchange and token refresh use `POST /oauth/token`; authenticated REST
requests use a bearer access token. `GET /api/v1/user/oauth` supplies the provider
user ID and, when opening a socket, its `socket_connection_token`.

The existing DonationAlerts flow is tied to the authenticated StreamBrew session
but does not send or validate OAuth `state`. This is a known exception and
login-CSRF risk recorded in the
[provider ownership ADR](../adr/0004-donations-service-ownership.md); new
integrations must not copy it.

## Donation history and normalization

History comes from `GET /api/v1/alerts/donations?page=<number>`. Initial import
walks pages until an empty page or `meta.last_page`. The shared application also
performs periodic full-history reconciliation and bounded recent-history recovery.
The DonationAlerts recovery client checks at most four pages and filters every
returned donation by its timestamp; it does not assume page ordering.

The provider boundary normalizes donation data once:

- Numeric `id` becomes the string `source_donation_id`; string IDs are rejected
  by the current parser.
- `amount` accepts a JSON number or string and is normalized as decimal text.
- `currency` must be three uppercase letters in this provider adapter.
- `created_at` is parsed as `YYYY-MM-DD HH:mm:ss` in UTC; the original text is
  preserved as `source_created_at`.
- Nullable `username` and `message` become the donation's author and message.

Persistence deduplicates by `(user_id, source, source_donation_id)`. Initial
history never enqueues incoming alerts. New donations accepted from realtime or
recovery use the shared [alert eligibility rules](../features/donation-alerts.md#donation-ingestion).
Video extraction follows the [video processing guide](../features/video-metadata.md),
and original donation money follows the [currency rules](../features/currencies.md).

## Realtime and credential lifecycle

The [source](../../internal/donationalerts/source.go) connects to
`wss://centrifugo.donationalerts.com/connection/websocket` using the profile's
connection token. It obtains a channel token with
`POST /api/v1/centrifuge/subscribe` for `$alerts:donation_<provider-user-id>` and
the socket client ID. Publications pass through the same donation parser as REST
history before being persisted.

The [socket session](../../internal/donationalerts/socket_session.go) handles
heartbeats, expiring connection and subscription tokens, and recovery positions.
Recovery state is held in memory across reconnects within a listener run. Failed
persistence does not advance the accepted position. Incomplete socket recovery
is logged; REST reconciliation provides an additional recovery path. Duplicate
empty command acknowledgements are debug-level diagnostics; unexpected reply IDs
and replies with content remain warnings.

Transport failures reconnect with bounded backoff. An unauthorized provider
response returns control to the shared application, which refreshes OAuth tokens
and stores them only if the token version still matches. Reconciliation cancels
listeners when their connection disappears or its version changes. For
DonationAlerts, an unauthorized refresh removes only the matching connection
version; existing donations remain stored.

## Implementation evidence and checks

- [Web routes](../../apps/web/src/server/api/integration.ts) and
  [callback URL construction](../../apps/web/src/server/donationalerts.ts).
- [Shared connection and reconciliation lifecycle](../../internal/donations/application.go)
  and [transactional persistence](../../internal/donations/store.go).
- [Client contract tests](../../internal/donationalerts/client_test.go) cover OAuth,
  pagination, bounded recovery, normalization, and unauthorized responses.
- [Source tests](../../internal/donationalerts/source_test.go) cover token renewal,
  reconnects, heartbeat handling, recovery, cancellation, and persistence failures.

Run `just test-donations` for provider and donation-service tests. These contracts
describe the checked-in implementation; mocked tests do not establish live
provider availability or credential configuration.

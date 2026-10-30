# Multichat

## Domain language

- A **chat provider connection** is one authorization from a StreamBrew user to one provider account.
  Providers use OAuth except where this guide explicitly documents another authorization method. A
  user may have multiple connections for the same provider. Credentials stay inside the chat
  aggregation module.
- A **chat source** is one provider-owned channel whose messages are included in a user's multichat.
  Every source belongs to exactly one chat provider connection; arbitrary public sources are not
  supported.
- A **chat capability** is an operation a connection can perform: read, send, delete, timeout, ban,
  or unban. Product behavior is derived from capabilities instead of provider names.
- A **broadcast message** is one user command that independently sends the same text to every
  enabled source with the `send_message` capability. Its result contains one outcome per source;
  the operation is not transactional across providers.
- The **chat aggregation module** is the separately deployed `apps/chat` service. It owns provider
  connections, collectors, provider webhooks, normalized events, moderation commands, broadcast
  messages, and the moderation audit. `apps/web` owns the public tRPC interface, StreamBrew
  authentication, and validation at the module's external seam.

The browser uses the same `/api/trpc` client as the rest of the application and never connects to
`apps/chat` directly.

The product accepts only provider accounts owned by the streamer. Providers use OAuth, except
Boosty, which uses manually supplied access/refresh tokens and a device ID through its unofficial API.
Multiple accounts from the same provider are supported. The old arbitrary live-stream URL editor
is no longer used. Its legacy PostgreSQL table remains during the non-destructive rollout, but no
application path reads or writes it.

A streamer may disable an individual chat source without disconnecting its provider account. A
disabled source keeps its credentials and configuration, but does not collect messages, receive
broadcast sends, or allow moderation until it is enabled again. Source changes trigger collector
reconciliation immediately; the periodic reconciliation remains a fallback.

## Runtime shape

```text
browser ── session ──► apps/web tRPC ── authenticated JSON/NDJSON ──► apps/chat
                                                                          │
                                                             ┌────────────┴────────────┐
                                                             │                         │
                                                      PostgreSQL                 NATS JetStream
                                                 connections, sources,      live events and leases
                                                  encrypted tokens,                  │
                                                   moderation audit        provider collectors/webhooks
```

The Go provider adapters expose one normalized stream of `StreamEvent` values and provider errors,
plus send and moderation commands. The application layer is provider-agnostic and invokes the
capabilities declared by each connection.

Every pull collector owns a NATS KV lease keyed by `chat_source_id`. The lease has a 30-second TTL
and a 10-second heartbeat. This permits multiple `apps/chat` replicas while keeping exactly one
active collector per source under normal operation. JetStream deduplicates provider events by
their source/message identity and retains a short, bounded transient window. Browser subscribers
receive the live NATS subject for their StreamBrew user. The latest source state is cached in a
short-lived NATS KV bucket so a newly opened editor does not incorrectly show an active source as
offline; an incoming provider message also marks that source live.

The administration overview counts unique streamers with an open multichat or OBS overlay stream.
`apps/chat` records only the internal user ID, consumer kind, and last-seen time in namespace-scoped
NATS KV buckets. A 15-second heartbeat and 45-second live TTL provide the current count; a
file-backed 31-day TTL provides the 24-hour, 7-day, and 30-day windows across chat replicas and
service restarts. The overview exposes when tracking began so a newly deployed instance does not
present an incomplete rolling window as a full history. These activity records contain no chat
messages, provider identities, or overlay tokens.

Messages are never written to PostgreSQL. The browser keeps at most 500 normalized messages.
The feed identifies arrivals by source and message ID, so following new messages
and counting unread messages continue when that buffer is full. Scrolling away,
editing, or deleting existing messages does not add unread messages. Returning to
the bottom clears the unread count. Moderation actions remain visible on touch
devices, and their accessible labels follow the interface language.
PostgreSQL stores command audit rows without message text: provider, source, action, provider
message/user ID, duration, status, safe detail, and timestamp. Disconnecting an account does not
delete those audit rows.

YouTube and VK Video perform active-broadcast discovery once when their collectors start. If a
channel is offline or the broadcast ends, discovery remains idle until the streamer selects
**Check stream** for that source. The command is distributed through NATS so it reaches the replica
that owns the collector lease. Transport failures during an active operation still reconnect
automatically with bounded exponential backoff.

When a collector session ends, for example because a refresh token was revoked, the collector
restarts it after 2 seconds and doubles the delay after each further short session, up to
5 minutes. A session that lasts at least one minute resets the delay. The first restart of a
failure streak after a provider error is logged with the error type and safe detail; later
restarts in the same streak are not, because operational logs reach Telegram. A changed token
version or **Check stream** starts a new collector immediately. Twitch reconnects its EventSub
socket with its own backoff from 1.5 seconds to 1 minute, reset after a session that subscribed
to chat. A Twitch socket that stays silent longer than the welcome message's keepalive timeout
plus 5 seconds is treated as dropped and reconnected. A source whose stored credentials cannot be
decrypted is logged and skipped; other sources keep collecting.

## Provider capabilities

| Provider | Read | Send | Delete | Timeout / ban / unban | Collection                                                     |
| -------- | ---- | ---- | ------ | --------------------- | -------------------------------------------------------------- |
| YouTube  | yes  | yes  | yes    | yes                   | manual active-broadcast discovery + server-streaming live chat |
| Twitch   | yes  | yes  | yes    | yes                   | EventSub WebSocket                                             |
| Kick     | yes  | yes  | yes    | yes                   | signed `chat.message.sent` webhook                             |
| Boosty   | yes  | no   | no     | no                    | unofficial web API, HTTP polling                               |
| VK Video | yes  | no   | no     | no                    | active-broadcast discovery + video Long Poll                   |

VK Video uses the official VK API `video.get` and `video.getLongPollServer` methods. It is read-only,
uses the streamer's VK profile as its chat source, and never uses scraping or user cookies. Boosty
uses a separate token connection flow; see [setup, protocol evidence, and limitations](../integrations/boosty.md).

## OAuth and credentials

OAuth attempts use random state, PKCE-S256, a ten-minute expiry, and single-use rows. Provider
access and refresh tokens are encrypted with AES-256-GCM before storage. Chat credentials are
separate from Better Auth sign-in accounts.
Incomplete or expired public OAuth callbacks return the usual connection error to the browser
without sending an operational alert. Exchange, profile, and storage failures remain operational
errors.

A callback is accepted only in the browser of the StreamBrew user who started it. `apps/web`
resolves the signed-in user from the session and sends its ID to `apps/chat` in the
`X-StreamBrew-Session-User-Id` header over the authenticated service channel, replacing any
client-supplied value. `apps/chat` consumes the attempt and, before redeeming the authorization
code, rejects the callback with the `oauth session mismatch` error when no user is signed in or
the user differs from the attempt's owner.

A provider account belongs to at most one StreamBrew user. Connecting an account that another
user already connected fails with the `chat account connected to another user` error, for OAuth
and Boosty alike. Reconnecting an existing source keeps its position; a new source takes the
lowest free position below the 20-source limit.

Token refresh is centralized in the chat service. Updates use `token_version` as a compare-and-swap
guard so concurrent replicas cannot overwrite a newer token. Provider calls retry with the next
collector/config snapshot after a refresh race.

Required service settings:

```text
DATABASE_URL
NATS_SERVERS
CHAT_PORT
CHAT_PUBLIC_URL
CHAT_WEB_URL
```

`NATS_NAMESPACE` is optional. Development assigns a distinct value to each
worktree so its streams, subjects, collector leases, cached source states, and
collector refresh requests do not cross worktree boundaries. Production keeps
the unnamespaced resource names when the setting is absent.

Live chat consumers use explicit acknowledgements. An event that cannot be decoded or validated is
negatively acknowledged and processed three times, then published to a dedicated file-backed
dead-letter JetStream and terminated. If dead-letter publication fails, delivery continues until the
record is safely stored. The stream retains at most 10,000 records or 64 MiB for
30 days. Each record includes the original subject, failure time, error, and up to 64 KiB of the
original payload. Publishing uses a content hash as the NATS message ID so multiple live subscribers
do not duplicate the same poison message. Administrators can inspect these records at `/admin/dlq`.

`apps/web` additionally requires `CHAT_SERVICE_URL`.
Set `ADMIN_EMAILS` to a comma-separated list of normalized sign-in email addresses allowed to open
operational administration pages. When it is empty, no account has administrative access.

Provider settings are enabled as complete groups:

```text
YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET
TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET
KICK_CLIENT_ID / KICK_CLIENT_SECRET / KICK_WEBHOOK_PUBLIC_KEY
VK_VIDEO_CLIENT_ID / VK_VIDEO_CLIENT_SECRET
```

`CHAT_SERVICE_SECRET` must have the same value in `apps/web` and `apps/chat`. It authenticates the
private service-to-service interface and is never sent to the browser. `apps/web` also requires
`CHAT_SERVICE_URL`, the private origin of `apps/chat` (`http://chat:3001` in Compose).
`CHAT_TOKEN_ENCRYPTION_SECRET` should be a separate stable secret; changing it makes existing
provider tokens unreadable. For backwards-compatible local rollout, the encryption secret falls
back to `BETTER_AUTH_SECRET` when omitted. Production should set both secrets explicitly. In production,
`CHAT_PUBLIC_URL` is `${APP_DOMAIN}/api/chat` and the Kick developer application webhook is
`${APP_DOMAIN}/api/chat/webhooks/kick`.

`CHAT_WEB_URL` falls back to `APP_DOMAIN`; `CHAT_PUBLIC_URL` falls back to its `/api/chat` path.
Their explicit values remain useful when local ports differ.

`GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET` belong only to Better Auth sign-in. YouTube chat requests
`youtube.force-ssl` using its separate `YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET` pair. Twitch
requests chat read/write and moderation scopes. Kick
requests user/channel read, event subscription, chat write, message moderation, and ban scopes.
Kick webhook signatures are verified over `message-id.timestamp.raw-body` with RSA-SHA256, stale
timestamps are rejected, and `Kick-Event-Message-Id` is the JetStream idempotency key. Both
`apps/web` and `apps/chat` reject webhook bodies over 64 KiB with HTTP 413. Missing headers, stale
timestamps, and invalid signatures return 401; an invalid payload returns 400; a message for an
unknown source returns 202; storage and NATS failures return 500 with a generic message so Kick can
retry.

VK Video uses VK ID OAuth 2.1 with PKCE-S256. Register a web application in VK ID and add the exact
callback `${CHAT_PUBLIC_URL}/oauth/vk_video/callback`. The integration requests the `video` scope,
stores the returned `device_id` with the encrypted tokens for refresh, discovers a live video on
the connected VK profile, and consumes its official video Long Poll URL. The registered redirect
URI must exactly match the public callback, including scheme and path.

## Moderation and broadcast

The normalized moderation commands are:

- delete message;
- timeout user (seconds in the domain; converted to provider units at the adapter seam);
- ban user;
- unban user.

YouTube unban requires the provider ban ID returned when the ban is created, so that mapping is
stored separately from the audit. Kick timeout seconds are rounded up to minutes. UI actions are
shown only when the connection granted the required scope.

The broadcast composer sends the same normalized text to every enabled source with
`send_message`. Read-only sources return `unsupported`; provider failures return `failed`; other
providers continue independently. The UI shows these partial results per source.

## OBS overlay

Rotating the overlay URL creates a random 256-bit token. PostgreSQL stores only its SHA-256 hash.
The public overlay page presents the token to an `apps/web` tRPC subscription. `apps/web` resolves
the owner and relays only that user's feed from `apps/chat`. Rotation invalidates the previous URL
immediately. Each open overlay stream rechecks its token every five seconds and ends with
`NOT_FOUND` once the token has been rotated, on any web instance.

The overlay URL accepts a `background` query parameter with `transparent`, `black`, or `white`.
Missing and invalid values resolve to `transparent`. The authenticated multichat page adds the
selected value when it copies the OBS link; background selection does not require token rotation
or persistent storage. On the black background, messages render without their own card surface so
they blend into the overlay; transparent and white backgrounds retain contrast behind each message.

## Development and operations

`just dev-db-up` starts the repository-wide PostgreSQL and NATS infrastructure and creates the
current worktree's database. `just dev` starts the TypeScript web app and the Go chat, donation,
and video services. `just typecheck` and `just test` include the Go services. When an internal chat
request, response, or stream event changes, update the Go handler together
with the `apps/web` adapter and shared Zod schemas, then verify both sides.

`just dev-cleanup`, run manually from the primary checkout, removes NATS namespaces belonging to
secondary and already-deleted worktrees while preserving the primary checkout's namespace.

`apps/chat` reconnects to NATS indefinitely every 2 seconds and, after a reconnect, recreates
missing streams and buckets. On shutdown it ends open NDJSON streams, then waits for collectors to
stop before closing NATS, all within 10 seconds.

Production Compose runs NATS with JetStream storage and healthchecks the chat service. Caddy sends
all public traffic to `apps/web`; only the web container reaches chat port 3001. Scale chat
collectors independently through NATS, and scale web with the number of browser and overlay
streams. PostgreSQL remains the source of truth for account configuration and audit.

# StreamBrew

StreamBrew is a workspace for streamers who use multiple platforms. It brings
donations and chat together, manages video queues from donation links and manual
additions, displays donation alerts in OBS, and forwards a live stream to multiple
destinations. The primary user is the streamer; integrations connect their external
platform accounts. Viewers can consult a streamer's public video queues.

The interface supports Russian and English, desktop and mobile, and light and dark
themes. Prioritize legible messages and predictable controls during live broadcasts.
See [PRODUCT.md](PRODUCT.md) for product and design context.

## Core concepts

Use these distinctions consistently in product text, documentation, and code:

- **User / стример:** the StreamBrew account that owns its integrations and content.
- **Donation / донат:** an immutable support event received from a donation source.
  One donation can produce zero or more videos.
- **Video / видео:** a supported video link from a donation or a manual addition.
  Manual additions belong to the streamer without creating a donation.
- **Video queue / очередь видео:** an independent collection of the streamer's videos.
- **Video priority / приоритет видео:** a threshold level shared across the
  streamer's queues; it is distinct from the queue itself.
- **Donation alert / алерт доната:** the presentation of a donation in OBS.
  Replaying an alert does not create another donation.
- **Multichat / мультичат:** chat from the streamer's connected platform accounts
  in one interface.
- **Multistream / мультистрим:** forwarding one live stream to multiple
  destinations without transcoding; English code uses `restream`.

Preserve a donation's original amount and currency. Converted money belongs to
videos as their queue amount, in the streamer's shared queue currency.
Exact identifiers and translations live in the [domain glossary](docs/glossary.md);
behavior belongs to the domain guides below.

## Repository map

- `apps/web`: TypeScript web interface, authentication, widgets, and public API.
- `packages`: shared TypeScript packages.
- `apps/*` Go entrypoints and `internal`: chat, donations, video processing,
  restream, and operational services.
- `db` and API contracts: shared boundaries; keep terminology and behavior
  consistent across Go and TypeScript.
- `docs`: domain behavior, engineering guides, operations, and architecture decisions.

## Working agreements

- Before changing code, read [CONTRIBUTING.md](CONTRIBUTING.md). Work through an
  open issue, a task branch, and a PR. Read-only tasks do not require an issue.
- Complete code work with a green, review-ready PR. Merge a specific PR only when
  the user explicitly requests that merge.
- Obtain explicit user authorization before changing the data schema, applying
  migrations (including `just db-migrate`), or removing legacy code or compatibility
  paths. Authorization already given for the action need not be requested again.
- Create or edit files in `scripts/` only when the user explicitly requests a
  `scripts/` change; add helper commands to `justfile`.
- Resolve routine implementation details independently. Ask before introducing
  product behavior outside the request, changing architectural boundaries, or
  choosing a materially different trade-off in scope, cost, or data handling that
  the request leaves unresolved. Follow decisions already authorized by the user.

## Task guides

Before editing, read the guides for every area the task touches. Read any nested
`AGENTS.md` governing the files you will change, even when working from the root.
Keep these guides current when changing the behavior they describe.

| Task                                                           | Read first                                                            |
| -------------------------------------------------------------- | --------------------------------------------------------------------- |
| Domain terms, identifiers, or translations                     | [Domain glossary](docs/glossary.md) and the relevant domain guide     |
| Donation sources or ingestion                                  | [Donation integrations](docs/integrations.md)                         |
| Donation alerts, playback, widgets, media, or settings         | [Donation alerts](docs/donation-alerts.md)                            |
| Chat providers, collectors, streams, overlays, or integrations | [Multichat](docs/multichat.md)                                        |
| Video queues, priority assignment, or rollout                  | [Video queues](docs/video-queues.md)                                  |
| Money, conversion, or queue currency                           | [Currencies](docs/currencies.md)                                      |
| Donation link scanning or video metadata                       | [Video metadata](docs/video-metadata.md)                              |
| Multistream behavior or media infrastructure                   | [Multistream](docs/restream.md)                                       |
| TypeScript or TSX in any package                               | [TypeScript guide](docs/typescript.md), including local skill loading |
| Web application                                                | [Web instructions](apps/web/AGENTS.md)                                |
| PostgreSQL schema or SQL in Go or TypeScript                   | [SQL guide](docs/sql.md)                                              |
| Localized copy, locale handling, or formatting                 | [Internationalization](docs/i18n.md)                                  |
| Environment variables, deployment, or infrastructure           | [Deployment](docs/deployment.md)                                      |

## Verification

Use repository-wide `just` recipes. Run checks relevant to the change and required
CI checks; report failures and unavailable checks explicitly.

- `just typecheck`: type-check TypeScript and compile Go service packages.
- `just test`: run TypeScript and Go tests.
- `just fmt`: format supported repository files.
- `just check`: run lint, formatting checks, and tests.

For development setup, read [README.md](README.md#start-locally); for documentation
validation and PR completion, follow [CONTRIBUTING.md](CONTRIBUTING.md#validation).

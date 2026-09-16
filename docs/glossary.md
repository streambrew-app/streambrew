# Domain glossary

Use these names consistently in product text, documentation, Go, TypeScript,
API schemas, SQL, and migrations. English identifiers use the names in the
**Code/DB** column; Russian UI copy uses the names in the **Russian** column.
Apply each language's casing conventions: SQL uses `snake_case`, TypeScript uses
`camelCase` or `PascalCase`, and Go uses `PascalCase` with initialisms such as
`ID` (for example, `SourceDonationID`).

| Term                 | Russian                          | Code/DB                                        | Definition                                                                                                                         |
| -------------------- | -------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| donation             | донат                            | `donation` / `Donation`                        | An immutable support event received from a donation platform.                                                                      |
| donation source      | источник доната                  | `source` / `DonationSource`                    | The platform that supplied a donation, such as `donationalerts`.                                                                   |
| source donation ID   | идентификатор доната в источнике | `source_donation_id` / `sourceDonationId`      | The source-assigned identifier. Together with user and source, it makes a donation idempotent.                                     |
| original money       | исходная сумма                   | `amount`, `currency`                           | The amount and currency as reported by the source. It is stored only on `donation` and is never converted.                         |
| user                 | стример                          | `"user"` / `UserInfo`                          | The StreamBrew account that owns donations and its video queues.                                                                   |
| queue currency       | валюта очереди                   | `user.queue_currency` / `queueCurrency`        | The one currency selected by a user for every queue amount and threshold. It is not duplicated in `video` or `video_priority`.     |
| video                | видео                            | `video` / `Video`                              | A supported video link in the queue, originating from a donation or added manually by its owner.                                   |
| video source         | источник видео                   | `Video.source`                                 | Whether a video came from a `donation` or was added `manual` by the streamer.                                                      |
| manual video         | видео, добавленное вручную       | `video.user_id` / `video.added_at`             | A video added directly by the streamer without creating a donation.                                                                |
| queue amount         | сумма для очереди                | `video.queue_amount` / `queueAmount`           | The amount used to assign a video priority, expressed in the current user queue currency. `NULL` means it cannot be queued.        |
| video queue          | очередь видео                    | `video_queue` / `VideoQueue`                   | A user's named collection of videos. Every video belongs to exactly one video queue.                                               |
| video priority       | приоритет видео                  | `video_priority` / `VideoPriority`             | A user-defined threshold and label shared by all of the user's video queues.                                                       |
| queue threshold      | порог очереди                    | `min_price_per_minute` / `minPricePerMinute`   | The minimum queue amount per minute of watch time required for a video priority.                                                   |
| default queue        | очередь по умолчанию             | `video_queue.is_default` / `isDefault`         | The user's single queue for incoming donation videos and manual videos without an explicit queue selection.                        |
| default priority     | приоритет по умолчанию           | `video_priority.is_default` / `isDefault`      | The user's single zero-threshold priority, used when no higher threshold applies.                                                  |
| queue assignment     | назначение в очередь             | `video_queue_id` / `videoQueueId`              | The queue selected for a video, including while metadata is pending.                                                               |
| priority assignment  | назначение приоритета            | `video_priority_id` / `videoPriorityId`        | The user's priority selected for a video. Moving queues and changing queue currency preserve it.                                   |
| unparsed donation    | необработанный донат             | `videos_parsed_at IS NULL`                     | A donation whose message has not yet been scanned for supported video links.                                                       |
| parsed donation      | обработанный донат               | `videos_parsed_at`                             | A donation whose video-link scan has completed, including when it produced no videos.                                              |
| watched video        | просмотренное видео              | `watched_at` / `watchedAt`                     | A video marked as watched by its owner.                                                                                            |
| bookmarked video     | видео в закладках                | `bookmarked_at` / `bookmarkedAt`               | A video bookmarked by its owner.                                                                                                   |
| video start          | начало видео                     | `start_seconds` / `startSeconds`               | The offset in seconds where playback of a video begins.                                                                            |
| video end            | окончание видео                  | `end_seconds` / `endSeconds`                   | The offset in seconds where playback of a video ends.                                                                              |
| watch time           | время просмотра                  | `endSeconds - startSeconds`                    | The exact duration of the selected video segment, unknown while endSeconds is NULL. It is calculated and is not stored separately. |
| multistream          | мультистрим                      | `restream` / `Restream`                        | The capability that accepts one live stream and forwards it unchanged to several streaming platforms.                              |
| restream ingest      | входящий поток                   | `restream_ingest` / `RestreamIngest`           | A user's authenticated source stream entering the StreamBrew media plane.                                                          |
| restream destination | площадка                         | `restream_destination` / `RestreamDestination` | One configured streaming platform or custom RTMP endpoint that receives the user's live stream.                                    |
| restream session     | эфир                             | `restream_session` / `RestreamSession`         | One connection of a user's restream ingest, from publisher authorization until disconnect.                                         |

## Related domain guides

- [Donation integrations](integrations/README.md) and [donation alerts](features/donation-alerts.md).
- [Currencies](features/currencies.md), [video queues](features/video-queues.md), and [video metadata](features/video-metadata.md).
- [Multichat terminology and behavior](features/multichat.md#domain-language).
- [Multistream architecture and operations](features/restream.md).

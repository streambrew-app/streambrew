export type VideoQueueErrorType =
  | "invalid youtube url"
  | "youtube timing unavailable"
  | "invalid video timing"
  | "video not found"
  | "video queue not found"
  | "video queue name taken"
  | "video priority not found"
  | "video priority label taken"
  | "invalid video priority threshold";

export class VideoQueueError extends Error {
  constructor(
    readonly type: VideoQueueErrorType,
    options?: ErrorOptions,
  ) {
    super(type, options);
    this.name = "VideoQueueError";
  }
}

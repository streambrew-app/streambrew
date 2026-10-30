// @vitest-environment happy-dom
import { VideoSchema } from "@streambrew/packages/schemas.js";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { I18nMessages } from "../lib/i18n";

vi.mock("../lib/i18n", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/i18n")>();
  return {
    ...actual,
    useI18n: (translations: I18nMessages) => ({
      locale: "en",
      t: actual.createTranslator("en", translations),
    }),
  };
});

import VideoCard from "./video-card";

const video = VideoSchema.parse({
  title: "Video",
  videoId: "1",
  videoQueueId: 1,
  videoPriorityId: null,
  provider: "youtube",
  providerVideoId: "_JXL6Fn99l8",
  url: "https://www.youtube.com/watch?v=_JXL6Fn99l8",
  startSeconds: 0,
  endSeconds: null,
  durationSeconds: null,
  watchedAt: null,
  bookmarkedAt: null,
  priorityLabel: null,
  createdAt: "2026-09-08T09:00:00Z",
  metadataUnavailable: false,
  metadataRetryAt: "2026-09-08T09:02:00Z",
  source: "manual",
  donation: null,
  queueAmount: "10.00",
  queueCurrency: "RUB",
});

function trpcError(code: string) {
  return Object.assign(new Error("English server detail"), { data: { code } });
}

describe("VideoCard failures", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  function button(name: string) {
    const element = [...container.querySelectorAll("button")].find(
      (candidate) => (candidate.getAttribute("aria-label") ?? candidate.textContent) === name,
    );
    if (!element) throw new Error(`Button ${name} not rendered`);
    return element;
  }

  function alerts() {
    return [...container.querySelectorAll('[role="alert"]')].map((alert) => alert.textContent);
  }

  it("explains a failed watched toggle", async () => {
    const onStatusChange = vi.fn(() => Promise.reject(trpcError("INTERNAL_SERVER_ERROR")));
    await act(async () => root.render(<VideoCard onStatusChange={onStatusChange} video={video} />));

    await act(async () => button("Mark video as watched").click());

    expect(onStatusChange).toHaveBeenCalledOnce();
    expect(alerts()).toEqual(["Couldn't update the video status. Please try again."]);
  });

  it("explains a failed metadata retry", async () => {
    const onRetryMetadata = vi.fn(() => Promise.reject(trpcError("TOO_MANY_REQUESTS")));
    await act(async () =>
      root.render(<VideoCard onRetryMetadata={onRetryMetadata} video={video} />),
    );

    await act(async () => button("Retry metadata").click());

    expect(alerts()).toEqual(["Too many attempts. Wait a moment and try again."]);
  });

  it("keeps the editor open with a localized error when saving fails", async () => {
    const onUpdate = vi.fn(() => Promise.reject(trpcError("BAD_REQUEST")));
    await act(async () => root.render(<VideoCard onUpdate={onUpdate} video={video} />));
    await act(async () => button("Edit video details").click());

    const form = container.querySelector("form");
    await act(async () =>
      form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
    );

    expect(onUpdate).toHaveBeenCalledWith({ amount: "10", endSeconds: null, startSeconds: 0 });
    expect(container.querySelector("form")).not.toBeNull();
    expect(alerts()).toEqual(["Check the entered values and try again."]);

    await act(async () => button("Cancel editing").click());
    await act(async () => button("Edit video details").click());
    expect(alerts()).toEqual([]);
  });
});

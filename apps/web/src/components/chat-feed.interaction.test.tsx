// @vitest-environment happy-dom
import type { ChatMessage } from "@streambrew/packages/chat.js";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { I18nMessages } from "../lib/i18n";

vi.mock("../lib/i18n", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/i18n")>();
  return {
    ...actual,
    useI18n: (messages: I18nMessages) => ({
      locale: "en",
      t: actual.createTranslator("en", messages),
    }),
  };
});

import { ChatFeed } from "./chat-feed";

function messages(start: number, count = 500): ChatMessage[] {
  return Array.from({ length: count }, (_, index) => ({
    id: String(start + index),
    sourceId: "00000000-0000-4000-8000-000000000001",
    connectionId: "00000000-0000-4000-8000-000000000002",
    provider: "youtube",
    author: { id: "viewer", displayName: "Viewer" },
    text: `Message ${start + index}`,
    occurredAt: new Date((start + index) * 1000),
  }));
}

describe("ChatFeed live updates", () => {
  let container: HTMLDivElement;
  let root: Root;
  const scrollTo = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.spyOn(HTMLElement.prototype, "scrollTo").mockImplementation(scrollTo);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    scrollTo.mockClear();
  });

  async function render(feed: ChatMessage[], overlay = false) {
    await act(async () =>
      root.render(<ChatFeed emptyLabel="Waiting" messages={feed} overlay={overlay} />),
    );
  }

  async function scrollAway() {
    const viewport = container.querySelector<HTMLDivElement>(".overflow-y-auto");
    if (!viewport) throw new Error("Chat viewport not rendered");
    Object.defineProperties(viewport, {
      scrollHeight: { configurable: true, value: 20000 },
      clientHeight: { configurable: true, value: 300 },
    });
    viewport.scrollTop = 0;
    await act(() => viewport.dispatchEvent(new Event("scroll")));
  }

  it.each([false, true])(
    "follows new messages at the 500-message cap (overlay=%s)",
    async (overlay) => {
      await render(messages(0), overlay);
      scrollTo.mockClear();
      await render(messages(1), overlay);
      expect(scrollTo).toHaveBeenCalledOnce();
    },
  );

  it("does not invent unread messages when scrolling away", async () => {
    await render(messages(0));
    await scrollAway();
    expect(container.querySelector("button")).toBeNull();
  });

  it("counts arrivals at the cap, but not edits or deletions, and clears them on jump", async () => {
    await render(messages(0));
    await scrollAway();
    scrollTo.mockClear();
    await render(messages(3));
    expect(container.querySelector("button")?.textContent).toBe("3");
    expect(scrollTo).not.toHaveBeenCalled();
    await render(messages(3).map((message) => ({ ...message, text: "Edited" })));
    await render(messages(3).slice(1));
    const jump = container.querySelector("button");
    expect(jump?.textContent).toBe("3");
    act(() => jump?.click());
    expect(container.querySelector("button")).toBeNull();
    expect(scrollTo).toHaveBeenCalledOnce();
  });

  it("distinguishes identical provider message IDs from different sources", async () => {
    await render(messages(0, 1));
    await scrollAway();
    await render([
      ...messages(0, 1),
      ...messages(0, 1).map((message) => ({
        ...message,
        sourceId: "00000000-0000-4000-8000-000000000003",
      })),
    ]);
    expect(container.querySelector("button")?.textContent).toBe("1");
    expect(container.querySelectorAll("article")).toHaveLength(2);
  });
});

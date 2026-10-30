// @vitest-environment happy-dom
import type { ChatStreamEvent } from "@streambrew/packages/chat.js";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Observer = Readonly<{
  onStarted: () => void;
  onData: (event: ChatStreamEvent) => void;
  onConnectionStateChange: (connection: { state: string; error: unknown }) => void;
  onError: (error: unknown) => void;
  onComplete: () => void;
}>;

type Subscription = Readonly<{ input: unknown; observer: Observer; unsubscribe: () => void }>;

const subscriptions = vi.hoisted((): Subscription[] => []);

vi.mock("@web/lib/trpc", () => {
  const subscribe = (input: unknown, observer: Observer) => {
    let active = true;
    // Like tRPC, unsubscribing completes the observer.
    const unsubscribe = () => {
      if (!active) return;
      active = false;
      observer.onComplete();
    };
    subscriptions.push({ input, observer, unsubscribe });
    return { unsubscribe };
  };
  const trpcClient = { chat: { stream: { subscribe }, overlayStream: { subscribe } } };
  return { useApi: () => ({ trpcClient }) };
});

import { useChatServiceStream } from "./use-chat-service-stream";

const messageEvent: ChatStreamEvent = {
  type: "message",
  message: {
    id: "message-1",
    sourceId: "00000000-0000-4000-8000-000000000001",
    connectionId: "00000000-0000-4000-8000-000000000002",
    provider: "twitch",
    author: { id: "viewer", displayName: "Viewer" },
    text: "Hello",
    occurredAt: new Date("2026-10-31T12:00:00Z"),
  },
};

describe("useChatServiceStream", () => {
  let container: HTMLDivElement;
  let root: Root;
  let stream: ReturnType<typeof useChatServiceStream> | undefined;

  function Probe({ mode, token }: { mode: "editor" | "overlay"; token?: string }) {
    stream = useChatServiceStream(mode, token);
    return null;
  }

  function latest() {
    const subscription = subscriptions.at(-1);
    if (!subscription) throw new Error("No chat subscription was opened");
    return subscription;
  }

  async function render(mode: "editor" | "overlay" = "editor", token?: string) {
    await act(async () => root.render(<Probe mode={mode} token={token} />));
  }

  function advance(milliseconds: number) {
    act(() => {
      vi.advanceTimersByTime(milliseconds);
    });
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    subscriptions.length = 0;
    stream = undefined;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("reports a clean server stop and resubscribes with growing, bounded delays", async () => {
    await render();
    act(() => {
      latest().observer.onStarted();
      latest().observer.onData(messageEvent);
    });
    expect(stream?.messages).toHaveLength(1);

    act(() => latest().observer.onComplete());
    expect(stream?.connectionError).toBe("transport_unavailable");
    expect(subscriptions).toHaveLength(1);

    advance(999);
    expect(subscriptions).toHaveLength(1);
    advance(1);
    expect(subscriptions).toHaveLength(2);
    expect(stream?.messages).toHaveLength(1);

    act(() => latest().observer.onStarted());
    expect(stream?.connectionError).toBeNull();

    for (const delay of [2_000, 4_000, 8_000, 16_000, 30_000, 30_000]) {
      const opened = subscriptions.length;
      act(() => latest().observer.onComplete());
      advance(delay - 1);
      expect(subscriptions).toHaveLength(opened);
      advance(1);
      expect(subscriptions).toHaveLength(opened + 1);
    }
  });

  it("restarts the backoff after a subscription stayed healthy", async () => {
    await render();
    act(() => latest().observer.onComplete());
    advance(1_000);
    act(() => latest().observer.onComplete());
    advance(2_000);
    expect(subscriptions).toHaveLength(3);

    act(() => latest().observer.onStarted());
    advance(30_000);
    act(() => latest().observer.onComplete());
    advance(1_000);
    expect(subscriptions).toHaveLength(4);
  });

  it("surfaces transport reconnects and authorization failures as codes", async () => {
    await render();
    act(() =>
      latest().observer.onConnectionStateChange({ state: "connecting", error: new Error("lost") }),
    );
    expect(stream?.connectionError).toBe("transport_unavailable");

    act(() => latest().observer.onStarted());
    expect(stream?.connectionError).toBeNull();

    act(() => latest().observer.onError({ data: { code: "UNAUTHORIZED" } }));
    expect(stream?.connectionError).toBe("unauthorized");
  });

  it("resubscribes an overlay with its token, but not after the link was revoked", async () => {
    await render("overlay", "overlay-token");
    expect(latest().input).toEqual({ token: "overlay-token" });

    act(() => latest().observer.onComplete());
    advance(1_000);
    expect(subscriptions).toHaveLength(2);
    expect(latest().input).toEqual({ token: "overlay-token" });

    act(() => latest().observer.onError({ data: { code: "NOT_FOUND" } }));
    expect(stream?.connectionError).toBe("overlay_not_found");
    advance(60_000);
    expect(subscriptions).toHaveLength(2);
  });

  it("stops reconnecting after unmount", async () => {
    await render();
    act(() => latest().observer.onComplete());
    act(() => root.unmount());
    advance(60_000);
    expect(subscriptions).toHaveLength(1);

    root = createRoot(container);
    await render();
    expect(subscriptions).toHaveLength(2);
    act(() => root.unmount());
    advance(60_000);
    expect(subscriptions).toHaveLength(2);
    root = createRoot(container);
  });
});

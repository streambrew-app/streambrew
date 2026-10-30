import { afterEach, describe, expect, it, vi } from "vitest";

const { config, getUserIdByOverlayToken, stream } = vi.hoisted(() => ({
  config: vi.fn(),
  getUserIdByOverlayToken: vi.fn(),
  stream: vi.fn(),
}));

vi.mock("../../chat/client.js", () => ({
  chatService: { config, stream },
  ChatServiceError: class ChatServiceError extends Error {
    readonly status?: number;

    constructor(_detail: string, options: ErrorOptions & { status?: number } = {}) {
      super("Chat service error", options);
      this.status = options.status;
    }
  },
}));
vi.mock("../../chat/store.js", () => ({ getUserIdByOverlayToken, rotateOverlayToken: vi.fn() }));
vi.mock("../_util.js", () => ({ getViewer: vi.fn() }));

import { ChatServiceError } from "../../chat/client.js";
import { chatRouter } from "./chat.js";

const keepalive = { type: "state", sourceId: "source", state: "live" };

afterEach(() => {
  vi.useRealTimers();
  vi.resetAllMocks();
});

function createCaller(userId: number | null, signal?: AbortSignal) {
  return chatRouter.createCaller(
    { request: new Request("https://streambrew.test/api/trpc"), userId: userId as never },
    { signal },
  );
}

describe("chat router", () => {
  it.each([
    [400, "BAD_REQUEST"],
    [404, "NOT_FOUND"],
    [409, "CONFLICT"],
    [503, "INTERNAL_SERVER_ERROR"],
    [undefined, "INTERNAL_SERVER_ERROR"],
  ] as const)("translates a chat service status %s to %s", async (status, code) => {
    const serviceError = new ChatServiceError("http error", { status });
    config.mockRejectedValue(serviceError);

    await expect(createCaller(42).config()).rejects.toMatchObject({ code, cause: serviceError });
  });

  it("ends an open overlay stream after its token is rotated", async () => {
    vi.useFakeTimers();
    getUserIdByOverlayToken.mockResolvedValueOnce(42).mockResolvedValue(null);
    stream.mockImplementation(async function* (
      _userId: number,
      _consumer: string,
      signal: AbortSignal,
    ) {
      yield keepalive;
      await new Promise((resolve) => signal.addEventListener("abort", resolve, { once: true }));
    });
    const subscription = await createCaller(null, new AbortController().signal).overlayStream({
      token: "t".repeat(32),
    });
    const events = subscription[Symbol.asyncIterator]();

    await expect(events.next()).resolves.toEqual({ done: false, value: keepalive });
    const ended = events.next();
    const outcome = expect(ended).rejects.toMatchObject({ code: "NOT_FOUND" });
    await vi.advanceTimersByTimeAsync(5_000);

    await outcome;
    expect(stream).toHaveBeenCalledWith(42, "overlay", expect.any(AbortSignal));
    expect(getUserIdByOverlayToken).toHaveBeenCalledTimes(2);
  });

  it("keeps an overlay stream open while its token remains current", async () => {
    vi.useFakeTimers();
    getUserIdByOverlayToken.mockResolvedValue(42);
    const controller = new AbortController();
    stream.mockImplementation(async function* (
      _userId: number,
      _consumer: string,
      signal: AbortSignal,
    ) {
      yield keepalive;
      await new Promise((resolve) => signal.addEventListener("abort", resolve, { once: true }));
    });
    const subscription = await createCaller(null, controller.signal).overlayStream({
      token: "t".repeat(32),
    });
    const events = subscription[Symbol.asyncIterator]();
    await events.next();
    const ended = events.next();

    await vi.advanceTimersByTimeAsync(15_000);
    controller.abort();

    await expect(ended).resolves.toEqual({ done: true, value: undefined });
    expect(getUserIdByOverlayToken).toHaveBeenCalledTimes(4);
  });
});

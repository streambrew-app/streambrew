import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { connect } = vi.hoisted(() => ({ connect: vi.fn() }));

vi.mock("nats", async (importOriginal) => ({
  ...(await importOriginal<typeof import("nats")>()),
  connect,
}));

function fakeConnection() {
  let close: (value: void) => void = () => undefined;
  const closed = new Promise<void>((resolve) => {
    close = resolve;
  });
  const publish = vi.fn(async () => ({}));
  const connection = {
    closed: () => closed,
    close: vi.fn(async () => close()),
    jetstream: () => ({ publish }),
    jetstreamManager: async () => ({ streams: { info: async () => ({}) } }),
  };
  return { connection, publish, close };
}

beforeEach(() => {
  vi.resetModules();
  vi.spyOn(console, "log").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  connect.mockReset();
});

describe("server logger", () => {
  it("reconnects after the NATS client closes its connection", async () => {
    const first = fakeConnection();
    const second = fakeConnection();
    connect.mockResolvedValueOnce(first.connection).mockResolvedValueOnce(second.connection);
    const { logInfo } = await import("./server-logger.js");

    logInfo("before outage");
    await vi.waitFor(() => expect(first.publish).toHaveBeenCalledOnce());
    logInfo("still connected");
    await vi.waitFor(() => expect(first.publish).toHaveBeenCalledTimes(2));
    first.close();
    await new Promise((resolve) => setTimeout(resolve, 0));
    logInfo("after outage");

    await vi.waitFor(() => expect(second.publish).toHaveBeenCalledOnce());
    expect(connect).toHaveBeenCalledTimes(2);
    expect(first.publish).toHaveBeenCalledTimes(2);
  });

  it("closes a connection whose stream setup fails and retries on the next event", async () => {
    const failed = fakeConnection();
    const recovered = fakeConnection();
    const reportFailure = vi.spyOn(console, "error").mockImplementation(() => undefined);
    connect
      .mockResolvedValueOnce({
        ...failed.connection,
        jetstreamManager: async () => await Promise.reject(new Error("JetStream unavailable")),
      })
      .mockResolvedValueOnce(recovered.connection);
    const { logInfo } = await import("./server-logger.js");

    logInfo("during setup failure");
    await vi.waitFor(() => expect(reportFailure).toHaveBeenCalledOnce());
    expect(failed.connection.close).toHaveBeenCalledOnce();
    logInfo("after setup failure");

    await vi.waitFor(() => expect(recovered.publish).toHaveBeenCalledOnce());
    expect(failed.publish).not.toHaveBeenCalled();
  });
});

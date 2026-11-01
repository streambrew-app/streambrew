import { afterEach, describe, expect, it, vi } from "vitest";

import { healthResponse } from "./health.js";

afterEach(() => {
  vi.useRealTimers();
});

describe("healthResponse", () => {
  it("reports healthy when PostgreSQL answers", async () => {
    const response = await healthResponse(() => Promise.resolve([{ "?column?": 1 }]));

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("ok");
  });

  it("reports unavailable when the PostgreSQL query fails", async () => {
    const response = await healthResponse(() => Promise.reject(new Error("connection refused")));

    expect(response.status).toBe(503);
  });

  it("reports unavailable when PostgreSQL does not answer in time", async () => {
    vi.useFakeTimers();
    const pending = healthResponse(() => new Promise(() => undefined), 2_000);
    await vi.advanceTimersByTimeAsync(2_000);

    expect((await pending).status).toBe(503);
  });
});

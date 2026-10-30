// @vitest-environment happy-dom
import { fmtListDate } from "@web/lib/fmt";
import { act, type ReactNode } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LocalTime } from "./local-time";

const value = new Date("2026-09-08T14:05:00Z");
const originalTimeZone = process.env["TZ"];

function setTimeZone(timeZone: string | undefined) {
  if (timeZone === undefined) delete process.env["TZ"];
  else process.env["TZ"] = timeZone;
}

/** Renders on a UTC server, then hydrates in a Moscow browser like production does. */
async function hydrateAcrossTimeZones(render: () => ReactNode) {
  setTimeZone("UTC");
  const html = renderToString(render());
  setTimeZone("Europe/Moscow");
  const container = document.createElement("div");
  container.innerHTML = html;
  const onRecoverableError = vi.fn();
  const root = await act(async () => hydrateRoot(container, render(), { onRecoverableError }));
  return { container, html, onRecoverableError, unmount: () => act(() => root.unmount()) };
}

describe("LocalTime", () => {
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  });

  afterEach(() => {
    setTimeZone(originalTimeZone);
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("detects the mismatch caused by formatting in the server time zone", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { onRecoverableError, unmount } = await hydrateAcrossTimeZones(() => (
      <time>{fmtListDate(value, "en")}</time>
    ));

    expect(onRecoverableError).toHaveBeenCalled();
    unmount();
  });

  it("hydrates server HTML without a mismatch and then shows browser-local time", async () => {
    const { container, html, onRecoverableError, unmount } = await hydrateAcrossTimeZones(() => (
      <LocalTime locale="en" showFullDate value={value} />
    ));

    expect(html).toContain('dateTime="2026-09-08T14:05:00.000Z"');
    expect(html).toContain("—");
    expect(html).not.toContain("title=");
    expect(onRecoverableError).not.toHaveBeenCalled();
    const time = container.querySelector("time");
    expect(time?.textContent).toContain("05:05 PM");
    expect(time?.getAttribute("title")).toContain("05:05 PM");
    unmount();
  });

  it("places the value in surrounding copy", async () => {
    const { container, html, onRecoverableError, unmount } = await hydrateAcrossTimeZones(() => (
      <LocalTime format="date" locale="ru" value={value}>
        {(date) => `С ${date}`}
      </LocalTime>
    ));

    expect(html).toContain("С —");
    expect(onRecoverableError).not.toHaveBeenCalled();
    expect(container.querySelector("time")?.textContent).toBe("С 8 сентября, 17:05");
    unmount();
  });
});

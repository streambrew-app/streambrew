// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { I18nMessages } from "../lib/i18n";

const testLocale = vi.hoisted((): { value: "en" | "ru" } => ({ value: "en" }));

vi.mock("../lib/i18n", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/i18n")>();
  return {
    ...actual,
    useI18n: (messages: I18nMessages) => ({
      locale: testLocale.value,
      t: actual.createTranslator(testLocale.value, messages),
    }),
  };
});

import { ChatReconnectNotice } from "./chat-reconnect-notice";

function markup(status: "connected" | "refresh_required" | "error", locale: "en" | "ru" = "en") {
  testLocale.value = locale;
  return renderToStaticMarkup(
    <ChatReconnectNotice
      disabled={false}
      onReconnect={() => {}}
      pending={false}
      provider="twitch"
      status={status}
    />,
  );
}

describe("ChatReconnectNotice", () => {
  it("explains expired access in the interface language", () => {
    expect(markup("refresh_required")).toContain(
      "Twitch access has expired. Reconnect the account to resume chat.",
    );
    expect(markup("refresh_required", "ru")).toContain(
      "Доступ к Twitch истёк. Подключите аккаунт заново, чтобы возобновить чат.",
    );
    expect(markup("refresh_required", "ru")).toContain("Подключить заново");
  });

  it("offers the same reconnect action for a failed connection", () => {
    expect(markup("error")).toContain("The Twitch connection has failed.");
    expect(markup("error")).toContain("Reconnect");
  });

  it("stays hidden while the connection is connected", () => {
    expect(markup("connected")).toBe("");
  });
});

describe("ChatReconnectNotice action", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    testLocale.value = "en";
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  async function render(props: { disabled: boolean; pending: boolean }, onReconnect: () => void) {
    await act(async () =>
      root.render(
        <ChatReconnectNotice
          {...props}
          onReconnect={onReconnect}
          provider="boosty"
          status="refresh_required"
        />,
      ),
    );
    const button = container.querySelector("button");
    if (!button) throw new Error("The reconnect action is missing");
    return button;
  }

  it("reconnects the account", async () => {
    const onReconnect = vi.fn();
    const button = await render({ disabled: false, pending: false }, onReconnect);

    act(() => button.click());

    expect(onReconnect).toHaveBeenCalledOnce();
  });

  it("disables the action while reconnecting or when the provider is unavailable", async () => {
    for (const props of [
      { disabled: false, pending: true },
      { disabled: true, pending: false },
    ]) {
      const onReconnect = vi.fn();
      const button = await render(props, onReconnect);

      act(() => button.click());

      expect(button.disabled).toBe(true);
      expect(onReconnect).not.toHaveBeenCalled();
    }
  });
});

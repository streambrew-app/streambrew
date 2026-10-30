// @vitest-environment happy-dom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { I18nMessages } from "../lib/i18n";

const setSlugM = vi.hoisted(() => ({
  error: null as unknown,
  isPending: false,
  mutate: vi.fn(),
}));

vi.mock("../lib/i18n", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/i18n")>();
  return {
    ...actual,
    useI18n: (translations: I18nMessages) => ({
      locale: "ru",
      t: actual.createTranslator("ru", translations),
    }),
  };
});

vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  Link: ({ children, className }: { children: ReactNode; className?: string }) => (
    <a className={className}>{children}</a>
  ),
}));

vi.mock("@web/hooks/api", () => ({
  useSetSlugM: () => setSlugM,
  useUserInfo: () => ({ publicQueueSettings: { enabled: true }, slug: "old-slug" }),
}));

import { SlugEditor } from "./slug-editor";

describe("SlugEditor", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    setSlugM.error = null;
    setSlugM.mutate.mockReset();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root.render(<SlugEditor />));
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it("saves the lowercased handle that the input shows", async () => {
    const input = container.querySelector<HTMLInputElement>("#public-video-queue-slug");
    if (!input) throw new Error("Slug input not rendered");

    await act(async () => {
      // Use the native setter so React's value tracking sees a change, as with typing or pasting.
      Reflect.set(HTMLInputElement.prototype, "value", "MyChannel", input);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () =>
      container
        .querySelector("form")
        ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
    );

    expect(input.value).toBe("mychannel");
    expect(setSlugM.mutate).toHaveBeenCalledWith({ slug: "mychannel" }, expect.anything());
  });

  it("explains a taken handle in the interface language", async () => {
    setSlugM.error = Object.assign(new Error("This slug is already in use."), {
      data: { code: "CONFLICT" },
    });
    await act(async () => root.render(<SlugEditor />));

    expect(container.querySelector('[role="alert"]')?.textContent).toBe("Этот адрес уже занят.");
  });
});

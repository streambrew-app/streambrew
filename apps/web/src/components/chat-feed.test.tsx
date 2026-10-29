import type { ChatMessage } from "@streambrew/packages/chat.js";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

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

import { ChatFeed } from "./chat-feed";

const message: ChatMessage = {
  id: "message-1",
  sourceId: "00000000-0000-4000-8000-000000000001",
  connectionId: "00000000-0000-4000-8000-000000000002",
  provider: "youtube",
  author: { id: "viewer-1", displayName: "Кофейный зритель" },
  text: "Очень длинное сообщение остаётся читаемым поверх трансляции",
  occurredAt: new Date("2026-09-11T12:00:00Z"),
};

describe("ChatFeed overlay", () => {
  it("keeps waiting and connection details off the broadcast", () => {
    const html = renderToStaticMarkup(
      <ChatFeed emptyLabel="Internal connection error" messages={[]} overlay />,
    );

    expect(html).not.toContain("Internal connection error");
  });

  it("renders incoming messages as a bounded bottom-aligned stack", () => {
    const html = renderToStaticMarkup(
      <ChatFeed emptyLabel="Waiting" messages={[message]} overlay />,
    );

    expect(html).toContain("Кофейный зритель");
    expect(html).toContain("max-w-[min(46rem,calc(100vw-2rem))]");
    expect(html).toContain("mt-auto");
  });

  it("can blend messages into a solid overlay background", () => {
    const html = renderToStaticMarkup(
      <ChatFeed
        emptyLabel="Waiting"
        messages={[message]}
        overlay
        overlayMessageSurface="transparent"
      />,
    );

    expect(html).not.toContain("bg-chat-overlay/88");
    expect(html).not.toContain("backdrop-blur-md");
  });
});

it.each([
  {
    locale: "en",
    labels: ["Delete message", "Time out for 10 minutes", "Ban author", "Unban author"],
  },
  {
    locale: "ru",
    labels: [
      "Удалить сообщение",
      "Тайм-аут на 10 минут",
      "Заблокировать автора",
      "Разблокировать автора",
    ],
  },
] as const)("localizes moderation controls in $locale", ({ locale, labels }) => {
  testLocale.value = locale;
  const html = renderToStaticMarkup(
    <ChatFeed
      capabilitiesForSource={() => ["delete_message", "timeout_user", "ban_user", "unban_user"]}
      emptyLabel="Waiting"
      messages={[message]}
      onModerate={() => undefined}
    />,
  );
  for (const label of labels) {
    expect(html).toContain(`aria-label="${label}"`);
    expect(html).toContain(`title="${label}"`);
  }
});

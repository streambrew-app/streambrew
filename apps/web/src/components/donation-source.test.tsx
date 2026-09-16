import { DonationSourceSchema } from "@streambrew/packages/schemas.js";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

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

import { DonationSourceBadge, DonationSourceMark } from "./donation-source";
import { DonationSourceIcons } from "./icons";

it("registers a distinct local icon for every donation source", () => {
  expect(new Set(Object.values(DonationSourceIcons)).size).toBe(
    DonationSourceSchema.options.length,
  );
});

describe.each(DonationSourceSchema.options)("%s donation source identity", (source) => {
  it("uses its local service icon in full and compact representations", () => {
    const mark = renderToStaticMarkup(<DonationSourceMark source={source} />);
    const badge = renderToStaticMarkup(<DonationSourceBadge source={source} />);

    expect(mark).toContain(`<img alt=""`);
    expect(badge).toContain(`<img alt=""`);
  });
});

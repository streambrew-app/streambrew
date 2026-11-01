import { describe, expect, it } from "vitest";

import { cn } from "./utils";

describe("cn", () => {
  it("keeps an overlay message's text color when applying its size", () => {
    expect(cn("text-white text-sm", "text-overlay-message")).toBe(
      "text-white text-overlay-message",
    );
  });

  it("keeps custom sizing when applying a status color", () => {
    expect(cn("text-error-display font-bold", "text-status-warning-text")).toBe(
      "text-error-display font-bold text-status-warning-text",
    );
  });

  it("merges responsive type sizes independently from text colors", () => {
    expect(cn("text-card-foreground text-display md:text-reading-title", "md:text-lg")).toBe(
      "text-card-foreground text-display md:text-lg",
    );
  });
});

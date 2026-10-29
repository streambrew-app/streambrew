import { describe, expect, it } from "vitest";

import { cn } from "./utils";

describe("cn", () => {
  it("keeps a compact button's text color when applying its size", () => {
    expect(cn("bg-secondary text-secondary-foreground text-sm", "text-compact")).toBe(
      "bg-secondary text-secondary-foreground text-compact",
    );
  });

  it("keeps metadata sizing when applying a status color", () => {
    expect(cn("text-micro font-bold", "text-status-warning-text")).toBe(
      "text-micro font-bold text-status-warning-text",
    );
  });

  it("merges responsive type sizes independently from text colors", () => {
    expect(cn("text-card-foreground text-display md:text-reading-title", "md:text-lg")).toBe(
      "text-card-foreground text-display md:text-lg",
    );
  });
});

import { isNotFound } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";

import { Route } from "./$.js";

describe("the catch-all route", () => {
  it("reports unknown paths as not found", async () => {
    const { loader } = Route.options;
    expect(loader).toBeTypeOf("function");
    if (typeof loader !== "function") {
      expect.unreachable("the catch-all route should define a loader");
    }

    try {
      await loader({} as never);
    } catch (error) {
      expect(isNotFound(error)).toBe(true);
      return;
    }

    expect.unreachable("the catch-all route should reject an unknown path");
  });
});

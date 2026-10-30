import { isNotFound } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";

import { Route } from "./videos.js";

describe("the public video queue route", () => {
  const parse = Route.options.params?.parse;

  it("reads the slug after @", () => {
    expect(parse?.({ slug: "@streamer" })).toEqual({ slug: "streamer" });
  });

  it.each(["streamer", "@", "@Not a slug"])("reports %j as not found", (slug) => {
    try {
      parse?.({ slug });
    } catch (error) {
      expect(isNotFound(error)).toBe(true);
      return;
    }
    expect.unreachable("an invalid public queue address should be rejected");
  });
});

import { describe, expect, it, vi } from "vitest";

import { startInstance } from "./start";

async function requestThroughFirstMiddleware(path: string, method = "GET") {
  const { requestMiddleware } = await startInstance.getOptions();
  const handler = requestMiddleware?.[0].options.server;
  if (!handler) throw new Error("The first request middleware must have a server handler.");

  const fallback = new Response("Not found", { status: 404 });
  const next = vi.fn(async () => ({ response: fallback }));
  const result = await handler({
    request: new Request(`https://streambrew.app${path}`, { method }),
    pathname: new URL(`https://streambrew.app${path}`).pathname,
    handlerType: "router",
    context: {},
    next,
  } as never);

  return { response: result instanceof Response ? result : result.response, next };
}

describe("indexed authenticated layout URLs", () => {
  it.each([
    ["/_authenticated", "GET"],
    ["/_authenticated/", "GET"],
    ["/_authenticated", "HEAD"],
    ["/_authenticated/", "HEAD"],
  ])("permanently redirects %s (%s) directly home", async (path, method) => {
    const { response, next } = await requestThroughFirstMiddleware(path, method);

    expect(response.status).toBe(308);
    expect(response.headers.get("Location")).toBe("/");
    expect(await response.text()).toBe("");
    expect(next).not.toHaveBeenCalled();
  });

  it("preserves query parameters on the public home URL", async () => {
    const { response } = await requestThroughFirstMiddleware("/_authenticated/?period=month");

    expect(response.status).toBe(308);
    expect(response.headers.get("Location")).toBe("/?period=month");
  });

  it.each(["/", "/missing", "/_authenticated/missing", "/_authenticated-other"])(
    "lets normal request handling decide the response for %s",
    async (path) => {
      const { response, next } = await requestThroughFirstMiddleware(path);

      expect(response.status).toBe(404);
      expect(response.headers.has("Location")).toBe(false);
      expect(next).toHaveBeenCalledOnce();
    },
  );

  it("does not forward a POST to the home page", async () => {
    const { response, next } = await requestThroughFirstMiddleware("/_authenticated", "POST");

    expect(response.headers.has("Location")).toBe(false);
    expect(next).toHaveBeenCalledOnce();
  });
});

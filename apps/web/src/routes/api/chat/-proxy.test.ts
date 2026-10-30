import { afterEach, describe, expect, it, vi } from "vitest";

const { getUserId } = vi.hoisted(() => ({ getUserId: vi.fn() }));
vi.mock("@web/server/api/_util", () => ({ getUserId }));

import { Route } from "./$.js";

type ProxyHandler = (context: { request: Request }) => Promise<Response>;

function proxy(request: Request) {
  const handlers = Route.options.server?.handlers as
    | Record<"GET" | "POST", ProxyHandler>
    | undefined;
  if (!handlers) throw new Error("The chat proxy must define server handlers.");
  return handlers[request.method as "GET" | "POST"]({ request });
}

function upstreamRequest(fetchMock: ReturnType<typeof vi.fn>) {
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  return { url, init, headers: new Headers(init.headers) };
}

function mockUpstream(response = new Response(null, { status: 204 })) {
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const callbackUrl = "https://streambrew.example/api/chat/oauth/twitch/callback?state=s&code=c";
const webhookUrl = "https://streambrew.example/api/chat/webhooks/kick";

afterEach(() => {
  vi.unstubAllGlobals();
  getUserId.mockReset();
});

describe("chat service proxy", () => {
  it("binds an OAuth callback to the signed-in user instead of client headers", async () => {
    getUserId.mockResolvedValue(42);
    const fetchMock = mockUpstream(new Response(null, { status: 302 }));

    await proxy(
      new Request(callbackUrl, {
        headers: { cookie: "session=secret", "X-StreamBrew-Session-User-Id": "7" },
      }),
    );

    const { url, headers } = upstreamRequest(fetchMock);
    expect(url).toBe("http://127.0.0.1:3001/oauth/twitch/callback?state=s&code=c");
    expect(headers.get("X-StreamBrew-Session-User-Id")).toBe("42");
    expect(headers.get("cookie")).toBeNull();
    expect(headers.get("Authorization")).toMatch(/^Bearer /);
  });

  it("forwards no user for an OAuth callback without a session", async () => {
    getUserId.mockResolvedValue(null);
    const fetchMock = mockUpstream(new Response(null, { status: 302 }));

    await proxy(new Request(callbackUrl, { headers: { "X-StreamBrew-Session-User-Id": "7" } }));

    expect(upstreamRequest(fetchMock).headers.has("X-StreamBrew-Session-User-Id")).toBe(false);
  });

  it("forwards a Kick webhook body without resolving a session", async () => {
    const fetchMock = mockUpstream();
    const body = JSON.stringify({ message_id: "message-1" });

    const response = await proxy(new Request(webhookUrl, { method: "POST", body }));

    expect(response.status).toBe(204);
    expect(getUserId).not.toHaveBeenCalled();
    const { init, headers } = upstreamRequest(fetchMock);
    expect(new TextDecoder().decode(init.body as Uint8Array)).toBe(body);
    expect(headers.has("X-StreamBrew-Session-User-Id")).toBe(false);
  });

  it("rejects an oversized Kick webhook before contacting the chat service", async () => {
    const fetchMock = mockUpstream();

    const response = await proxy(
      new Request(webhookUrl, { method: "POST", body: "x".repeat(64 * 1024 + 1) }),
    );

    expect(response.status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

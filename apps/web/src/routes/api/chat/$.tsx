import { rurl } from "@lebedevna/readonly-url";
import { createFileRoute } from "@tanstack/react-router";
import { getUserId } from "@web/server/api/_util";
import { env } from "@web/server/env";
import {
  BoundedRequestBodyError,
  readBoundedRequestBody,
  validateContentLength,
} from "@web/server/request-body";

// apps/chat accepts an OAuth callback only for the StreamBrew user signed in to this browser.
const SESSION_USER_HEADER = "X-StreamBrew-Session-User-Id";
const MAX_WEBHOOK_BYTES = 64 * 1024;

function isOauthCallback(method: string, pathname: string) {
  return (
    method === "GET" &&
    /^\/api\/chat\/oauth\/(youtube|twitch|kick|vk_video)\/callback$/.test(pathname)
  );
}

function isKickWebhook(method: string, pathname: string) {
  return method === "POST" && pathname === "/api/chat/webhooks/kick";
}

async function readWebhookBody(request: Request): Promise<Uint8Array<ArrayBuffer> | Response> {
  try {
    validateContentLength(request, MAX_WEBHOOK_BYTES, false);
    return request.body === null
      ? new Uint8Array()
      : await readBoundedRequestBody(request.body, MAX_WEBHOOK_BYTES, request.signal);
  } catch (error) {
    if (error instanceof BoundedRequestBodyError) {
      return Response.json(
        { error: "Invalid request" },
        { status: error.kind === "too-large" ? 413 : 400 },
      );
    }
    throw error;
  }
}

async function handler({ request }: { request: Request }) {
  const publicUrl = rurl(request.url);
  const oauthCallback = isOauthCallback(request.method, publicUrl.pathname);
  if (!oauthCallback && !isKickWebhook(request.method, publicUrl.pathname)) {
    return new Response("Not found", { status: 404 });
  }

  const body = oauthCallback ? undefined : await readWebhookBody(request);
  if (body instanceof Response) return body;
  const sessionUserId = oauthCallback ? await getUserId(request) : null;

  const upstreamUrl = rurl(env.CHAT_SERVICE_URL)
    .withPathname(publicUrl.pathname.slice("/api/chat".length))
    .withSearch(publicUrl.search);
  const headers = new Headers(request.headers);
  headers.delete("cookie");
  headers.delete("host");
  headers.delete(SESSION_USER_HEADER);
  if (sessionUserId !== null) headers.set(SESSION_USER_HEADER, String(sessionUserId));
  headers.set("Authorization", `Bearer ${env.CHAT_SERVICE_SECRET}`);
  headers.set("X-Forwarded-Host", publicUrl.host);
  headers.set("X-Forwarded-Prefix", "/api/chat");
  headers.set("X-Forwarded-Proto", publicUrl.protocol.slice(0, -1));

  const response = await fetch(upstreamUrl.href, {
    method: request.method,
    headers,
    redirect: "manual",
    ...(body === undefined ? {} : { body }),
  });
  return new Response(response.body, {
    status: response.status,
    headers: response.headers,
  });
}

export const Route = createFileRoute("/api/chat/$")({
  server: { handlers: { GET: handler, POST: handler } },
});

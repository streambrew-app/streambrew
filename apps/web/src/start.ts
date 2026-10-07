import { createCsrfMiddleware, createMiddleware, createStart } from "@tanstack/react-start";
import { getCookie, getRequestHeader, setCookie } from "@tanstack/react-start/server";

import { localeCookieName, resolveLocale } from "./lib/locale";

const csrfMiddleware = createCsrfMiddleware({
  filter: (context) => context.handlerType === "serverFn",
});

const authenticatedLayoutRedirectMiddleware = createMiddleware().server(({ request, next }) => {
  if (request.method !== "GET" && request.method !== "HEAD") return next();

  const url = new URL(request.url);
  if (url.pathname !== "/_authenticated" && url.pathname !== "/_authenticated/") return next();

  return new Response(null, {
    status: 308,
    headers: { Location: `/${url.search}` },
  });
});

const localeMiddleware = createMiddleware().server(({ next }) => {
  const cookieLocale = getCookie(localeCookieName);
  const locale = resolveLocale(cookieLocale, getRequestHeader("accept-language"));

  if (cookieLocale !== locale) {
    setCookie(localeCookieName, locale, {
      maxAge: 60 * 60 * 24 * 365,
      path: "/",
      sameSite: "lax",
    });
  }

  return next({ context: { locale } });
});

export const startInstance = createStart(() => ({
  requestMiddleware: [authenticatedLayoutRedirectMiddleware, csrfMiddleware, localeMiddleware],
}));

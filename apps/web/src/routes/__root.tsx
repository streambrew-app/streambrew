import {
  HeadContent,
  Link,
  Outlet,
  Scripts,
  createRootRouteWithContext,
  useRouterState,
} from "@tanstack/react-router";
import { createIsomorphicFn } from "@tanstack/react-start";
import { CosmicArt } from "@web/components/cosmic-art";
import { Icons } from "@web/components/icons";
import { LanguageMenu } from "@web/components/language-menu";
import SignIn from "@web/components/sign-in";
import { Button, buttonVariants } from "@web/components/ui/button";
import { Sidebar, SidebarProvider, SidebarTrigger, useSidebar } from "@web/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@web/components/ui/tooltip";
import { useUserInfoSafe } from "@web/hooks/api";
import { cn } from "@web/lib/utils";
import { parseCookie } from "cookie-es";
import { Suspense, useEffect, useState } from "react";

import favicon from "../../assets/favicon.png";
import productMark from "../../assets/logo.webp";
import { Skeleton } from "../components/ui/skeleton";
import { signOut } from "../lib/auth-client";
import type { Locale } from "../lib/i18n";
import { createTranslations, I18nProvider, useI18n } from "../lib/i18n";
import { localeCookieName, resolveLocale } from "../lib/locale";
import type { Theme } from "../lib/theme";
import { resolveTheme, themeCookieName } from "../lib/theme";
import type { Api } from "../lib/trpc";
import type { Viewer } from "../server/api/_util";
import { currentViewerQueryOptions } from "../server/viewer";
import PageLoadingSkeleton from "./-components/page-loading-skeleton";

import alertCss from "../../alerts.css?url";
import appCss from "../../styles.css?url";

const translations = createTranslations({
  overview: {
    en: "Overview",
    ru: "Главная",
  },
  donations: {
    en: "Donations",
    ru: "Донаты",
  },
  integrations: {
    en: "Integrations",
    ru: "Интеграции",
  },
  alerts: {
    en: "Alerts",
    ru: "Оповещения",
  },
  settings: {
    en: "Settings",
    ru: "Настройки",
  },
  adminPanel: {
    en: "Admin panel",
    ru: "Админская панель",
  },
  signOut: {
    en: "Sign out",
    ru: "Выйти",
  },
  logOut: {
    en: "Log out",
    ru: "Выйти",
  },
  switchToLightMode: {
    en: "Switch to light mode",
    ru: "Включить светлую тему",
  },
  switchToDarkMode: {
    en: "Switch to dark mode",
    ru: "Включить тёмную тему",
  },
  openNavigation: {
    en: "Open navigation",
    ru: "Открыть меню",
  },
  skipToContent: {
    en: "Skip to content",
    ru: "Перейти к содержимому",
  },
  activeDevelopment: {
    en: "StreamBrew is under active development. Breaking changes and data loss are possible.",
    ru: "StreamBrew активно развивается. Некоторые функции могут измениться, а данные — потеряться.",
  },
  dismissDevelopmentWarning: {
    en: "Dismiss development warning",
    ru: "Скрыть предупреждение",
  },
  videos: {
    en: "Videos",
    ru: "Видео",
  },
  chat: {
    en: "Multichat",
    ru: "Мультичат",
  },
  multistream: {
    en: "Multistream",
    ru: "Мультистрим",
  },
});

const navItem =
  "group flex min-h-12 shrink-0 items-center gap-3 rounded-xl border border-transparent px-3 text-sm font-medium text-sidebar-foreground/75 transition-colors outline-none hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-inset [&_svg]:size-[18px]";
const activeNavItem =
  "border-sidebar-primary/25 bg-sidebar-primary/10 font-semibold text-sidebar-primary [&_svg]:text-sidebar-primary";
const themeCookieMaxAge = 60 * 60 * 24 * 365;

const getRoutePreferences = createIsomorphicFn()
  .client(() => {
    const cookies = parseCookie(document.cookie);
    return {
      locale: resolveLocale(cookies[localeCookieName], navigator.language),
      theme: resolveTheme(cookies[themeCookieName]),
    };
  })
  .server(async () => {
    const { getCookie, getRequestHeader } = await import("@tanstack/react-start/server");
    return {
      locale: resolveLocale(getCookie(localeCookieName), getRequestHeader("accept-language")),
      theme: resolveTheme(getCookie(themeCookieName)),
    };
  });

export const Route = createRootRouteWithContext<
  Api & {
    locale: Locale;
    theme: Theme;
    viewer: Viewer | null;
  }
>()({
  beforeLoad: async ({ context }) => {
    const [preferences, viewer] = await Promise.all([
      getRoutePreferences(),
      context.queryClient.ensureQueryData({
        ...currentViewerQueryOptions(),
        revalidateIfStale: true,
      }),
    ]);
    return { ...preferences, viewer };
  },
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { content: "width=device-width, initial-scale=1", name: "viewport" },
      { title: "StreamBrew" },
    ],
    links: [
      { href: appCss, rel: "stylesheet" },
      { href: alertCss, rel: "stylesheet" },
      { href: favicon, rel: "icon", type: "image/png" },
    ],
  }),
  component: RootDocument,
});

function RootDocument() {
  const { locale, theme } = Route.useRouteContext();
  const isOverlay = useRouterState({
    select: ({ location }) =>
      location.pathname === "/alerts/overlay" || location.pathname.startsWith("/chat/overlay/"),
  });

  return (
    <html className={theme === "dark" ? "dark" : undefined} lang={locale} suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className={isOverlay ? "overlay-document" : undefined}>
        <I18nProvider initialLocale={locale}>
          <TooltipProvider>
            <Outlet />
          </TooltipProvider>
        </I18nProvider>
        <Scripts />
      </body>
    </html>
  );
}

function useDark(initialTheme: Theme) {
  const [isDark, setIsDark] = useState(initialTheme === "dark");
  const toggleDark = () => {
    const theme = isDark ? "light" : "dark";
    setIsDark(theme === "dark");
    document.cookie = `${themeCookieName}=${theme}; Path=/; Max-Age=${themeCookieMaxAge}; SameSite=Lax`;
  };
  return { isDark, toggleDark };
}

export function AuthenticatedRoot() {
  const { viewer } = Route.useRouteContext();

  if (!viewer) {
    return <SignIn />;
  }

  return (
    <Suspense fallback={<PageLoadingSkeleton />}>
      <AuthenticatedApplication />
    </Suspense>
  );
}

function AuthenticatedApplication() {
  return (
    <SidebarProvider>
      <AuthenticatedApplicationContent />
    </SidebarProvider>
  );
}

function AuthenticatedApplicationContent() {
  const { theme, viewer } = Route.useRouteContext();
  const { isDark, toggleDark } = useDark(theme);
  const { t } = useI18n(translations);
  const { setOpenMobile } = useSidebar();
  const [isDevelopmentWarningVisible, setIsDevelopmentWarningVisible] = useState(true);
  const userInfo = useUserInfoSafe();

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [isDark]);

  if (!viewer || !userInfo) {
    return <SignIn />;
  }

  const user = viewer.user;

  return (
    // This route owns the viewport dimensions of the authenticated shell.
    // oxlint-disable-next-line tw-no-self-positioning/no-dimensions
    <main className="flex h-dvh w-full min-w-0 bg-background font-sans text-foreground transition-colors duration-300">
      <a
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground focus:outline-2 focus:outline-offset-2 focus:outline-ring"
        href="#app-content"
      >
        {t("skipToContent")}
      </a>
      <Sidebar>
        <aside className="coffee-sidebar relative flex size-full flex-col overflow-hidden border-r border-sidebar-border bg-sidebar px-4 pt-7 pb-5 transition-colors duration-300">
          <div className="relative z-10 flex shrink-0 items-center gap-3">
            <Link
              to="/"
              className="flex items-center gap-2.5 px-1 font-heading text-2xl font-semibold tracking-tight text-sidebar-foreground focus-visible:rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sidebar-ring"
            >
              <img alt="" src={productMark} className="size-10 object-contain" />
              StreamBrew
            </Link>
          </div>
          <nav
            className="relative z-10 flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto overscroll-contain pt-8 pb-4"
            aria-label={t("overview")}
          >
            <Link
              activeOptions={{ exact: true }}
              activeProps={{ className: activeNavItem }}
              className={navItem}
              onClick={() => setOpenMobile(false)}
              to="/"
            >
              <Icons.dashboard aria-hidden="true" />
              {t("overview")}
            </Link>
            <Link
              activeProps={{ className: activeNavItem }}
              className={navItem}
              onClick={() => setOpenMobile(false)}
              to="/donations"
            >
              <Icons.wallet aria-hidden="true" />
              {t("donations")}
            </Link>
            <Link
              activeProps={{ className: activeNavItem }}
              className={navItem}
              onClick={() => setOpenMobile(false)}
              to="/videos"
            >
              <Icons.video aria-hidden="true" />
              {t("videos")}
            </Link>
            <Link
              activeProps={{ className: activeNavItem }}
              className={navItem}
              onClick={() => setOpenMobile(false)}
              to="/integrations"
            >
              <Icons.integrations aria-hidden="true" />
              {t("integrations")}
            </Link>
            <Link
              activeProps={{ className: activeNavItem }}
              className={navItem}
              onClick={() => setOpenMobile(false)}
              to="/chat"
            >
              <Icons.chat aria-hidden="true" />
              {t("chat")}
            </Link>
            <Link
              activeProps={{ className: activeNavItem }}
              className={navItem}
              onClick={() => setOpenMobile(false)}
              to="/multistream"
            >
              <Icons.multistream aria-hidden="true" />
              {t("multistream")}
            </Link>
            <Link
              activeProps={{ className: activeNavItem }}
              className={navItem}
              onClick={() => setOpenMobile(false)}
              to="/alerts"
            >
              <Icons.alerts aria-hidden="true" />
              {t("alerts")}
            </Link>
            {viewer.isAdmin && (
              <Link
                activeProps={{ className: activeNavItem }}
                className={navItem}
                onClick={() => setOpenMobile(false)}
                to="/admin"
              >
                <Icons.secure aria-hidden="true" />
                {t("adminPanel")}
              </Link>
            )}
          </nav>

          <CosmicArt
            className="pointer-events-none absolute right-[-42px] bottom-28 w-52 rotate-[-8deg] text-sidebar-foreground/20 opacity-35"
            variant="orbit"
          />
          <div className="relative z-10 mt-auto flex shrink-0 flex-col gap-5">
            <div className="flex items-center justify-between px-3">
              <Link
                aria-label={t("settings")}
                activeProps={{ className: activeNavItem }}
                className={buttonVariants({ variant: "sidebar", size: "icon" })}
                onClick={() => setOpenMobile(false)}
                to="/settings"
              >
                <Icons.settings aria-hidden="true" size={18} />
              </Link>
              <div className="flex items-center gap-1.5">
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        aria-label={t(isDark ? "switchToLightMode" : "switchToDarkMode")}
                        aria-pressed={isDark}
                        onClick={() => toggleDark()}
                        size="icon"
                        type="button"
                        variant="sidebar"
                      />
                    }
                  >
                    {isDark ? (
                      <Icons.sun aria-hidden="true" size={15} />
                    ) : (
                      <Icons.moon aria-hidden="true" size={15} />
                    )}
                  </TooltipTrigger>
                  <TooltipContent>
                    {t(isDark ? "switchToLightMode" : "switchToDarkMode")}
                  </TooltipContent>
                </Tooltip>
                <LanguageMenu />
              </div>
            </div>
            <div className="flex items-center gap-2.5 border-t border-sidebar-border px-2 pt-5">
              <AccountAvatar
                className="size-8"
                key={user.image}
                image={user.image}
                name={user.name}
              />
              <div className="min-w-0 grow">
                <strong className="block truncate text-xs text-sidebar-foreground">
                  {user.name}
                </strong>
                <small className="mt-0.5 block truncate text-micro text-sidebar-foreground/65">
                  @{userInfo.slug}
                </small>
              </div>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      aria-label={t("signOut")}
                      onClick={() => {
                        void signOut().then(() => window.location.assign("/"));
                      }}
                      size="icon-sm"
                      type="button"
                      variant="sidebar"
                    />
                  }
                >
                  <Icons.logout aria-hidden="true" size={18} />
                </TooltipTrigger>
                <TooltipContent>{t("logOut")}</TooltipContent>
              </Tooltip>
            </div>
          </div>
        </aside>
      </Sidebar>
      <div className="flex min-h-0 min-w-0 grow flex-col">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-sidebar-border bg-sidebar px-3 pt-[env(safe-area-inset-top)] text-sidebar-foreground lg:hidden">
          <SidebarTrigger aria-label={t("openNavigation")} />
          <Link
            to="/"
            className="flex items-center gap-2 font-heading text-xl font-semibold tracking-tight text-sidebar-foreground"
          >
            <img alt="" src={productMark} className="size-9 object-contain" />
            StreamBrew
          </Link>
        </header>
        {isDevelopmentWarningVisible && (
          <div
            className="flex shrink-0 items-center gap-2 border-b border-status-warning-border bg-status-warning-surface px-4 py-3 text-sm text-status-warning-deep dark:border-status-warning-dark-surface/25 dark:bg-status-warning-dark-surface/10 dark:text-status-warning-on-deep"
            role="alert"
          >
            <Icons.warn
              aria-hidden="true"
              className="size-5 shrink-0 text-status-warning-text dark:text-status-warning-dark-text"
            />
            <p className="min-w-0 grow">{t("activeDevelopment")}</p>
            <Button
              aria-label={t("dismissDevelopmentWarning")}
              onClick={() => setIsDevelopmentWarningVisible(false)}
              size="icon-sm"
              type="button"
              variant="ghost"
            >
              <Icons.cancel aria-hidden="true" size={16} />
            </Button>
          </div>
        )}
        <div
          id="app-content"
          className="min-h-0 min-w-0 grow overflow-hidden outline-none"
          tabIndex={-1}
        >
          <div className="mx-auto flex h-full min-h-0 w-full max-w-[1500px] flex-col p-0 sm:p-3 [&>*]:h-full">
            <Suspense
              fallback={
                <div aria-busy="true" className="flex min-h-full flex-col gap-3">
                  <Skeleton className="h-8 w-52" />
                  <Skeleton className="h-24" />
                  <Skeleton className="h-24" />
                </div>
              }
            >
              <Outlet />
            </Suspense>
          </div>
        </div>
      </div>
    </main>
  );
}

function AccountAvatar({
  className,
  image,
  name,
}: {
  className?: string;
  image: string | null;
  name: string;
}) {
  const [failed, setFailed] = useState(false);

  return image && !failed ? (
    <img
      alt=""
      className={cn("shrink-0 rounded-lg object-cover", className)}
      src={image}
      ref={(element) => {
        if (element?.complete && element.naturalWidth === 0) setFailed(true);
      }}
      onError={() => setFailed(true)}
    />
  ) : (
    <span
      aria-hidden="true"
      className={cn(
        "grid shrink-0 place-items-center rounded-lg bg-sidebar-accent text-caption font-semibold text-sidebar-primary",
        className,
      )}
    >
      {name
        .split(/\s+/)
        .map((part) => part.charAt(0))
        .slice(0, 2)
        .join("")
        .toUpperCase()}
    </span>
  );
}

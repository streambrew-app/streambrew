import { Link, useMatch, useRouter } from "@tanstack/react-router";
import type { ReactNode } from "react";

import productMark from "../../assets/logo.webp";
import { createTranslations, createTranslator } from "../lib/i18n";
import { CosmicArt } from "./cosmic-art";
import { Icons } from "./icons";
import { Button, buttonVariants } from "./ui/button";

const translations = createTranslations({
  errorTitle: {
    en: "Something went wrong",
    ru: "Что-то пошло не так",
  },
  errorDescription: {
    en: "This page couldn't be displayed. Try again or return to the home page.",
    ru: "Не удалось показать эту страницу. Попробуйте ещё раз или вернитесь на главную.",
  },
  tryAgain: {
    en: "Try again",
    ru: "Повторить",
  },
  notFoundTitle: {
    en: "Page not found",
    ru: "Страница не найдена",
  },
  notFoundDescription: {
    en: "This address does not point to a StreamBrew page. Check the link or return to the home page.",
    ru: "По этому адресу нет страницы StreamBrew. Проверьте ссылку или вернитесь на главную.",
  },
  returnHome: {
    en: "Return home",
    ru: "Вернуться на главную",
  },
});

/**
 * A route boundary can render where the root document, and with it the I18n provider, failed.
 * The locale therefore comes from the failing match's route context.
 */
function useRouteStatus() {
  const router = useRouter();
  const match = useMatch({ strict: false, shouldThrow: false });
  const locale = match?.context.locale ?? router.options.context.locale;
  return {
    insideApplicationShell: match?.routeId.startsWith("/_authenticated/") ?? false,
    t: createTranslator(locale, translations),
  };
}

function RouteStatusLayout({
  actions,
  description,
  insideApplicationShell,
  title,
}: {
  actions: ReactNode;
  description: string;
  insideApplicationShell: boolean;
  title: string;
}) {
  const art = (
    <CosmicArt
      className="pointer-events-none absolute -right-20 -bottom-16 w-72 text-primary/35 opacity-35 sm:-right-10 sm:w-80"
      variant="orbit"
    />
  );

  // The authenticated shell already provides the landmark, navigation, and page height.
  if (insideApplicationShell) {
    return (
      <section className="cosmic-panel relative grid min-h-0 min-w-0 place-items-center overflow-hidden p-6 sm:p-10">
        <div className="relative z-10 flex max-w-xl flex-col items-start gap-5">
          <h1 className="font-heading text-3xl leading-tight font-medium tracking-tight text-balance">
            {title}
          </h1>
          <p className="max-w-[60ch] text-base leading-7 text-muted-foreground">{description}</p>
          <div className="flex flex-wrap gap-3">{actions}</div>
        </div>
        {art}
      </section>
    );
  }

  return (
    <main className="relative grid min-h-dvh place-items-center overflow-hidden bg-background px-5 py-8 text-foreground sm:px-8">
      <section className="relative flex w-full max-w-3xl flex-col items-start gap-9 overflow-hidden border-y border-border py-10 sm:gap-12 sm:py-14">
        <Link
          className="relative z-10 flex w-fit items-center gap-2 font-heading text-xl font-medium hover:text-primary focus-visible:rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring sm:text-2xl"
          to="/"
        >
          <img alt="" className="size-9 object-contain" src={productMark} />
          StreamBrew
        </Link>
        <div className="relative z-10 flex max-w-xl flex-col items-start gap-5">
          <h1 className="font-heading text-error-display leading-none font-medium tracking-display text-balance">
            {title}
          </h1>
          <p className="max-w-[60ch] text-base leading-7 text-muted-foreground">{description}</p>
          <div className="flex flex-wrap gap-3">{actions}</div>
        </div>
        {art}
      </section>
    </main>
  );
}

/** Router-wide error boundary. Server error text is never shown; retry reloads the route data. */
export function RouteErrorPage() {
  const router = useRouter();
  const { insideApplicationShell, t } = useRouteStatus();

  return (
    <RouteStatusLayout
      actions={
        <>
          <Button onClick={() => void router.invalidate()} size="lg" type="button">
            <Icons.retry aria-hidden="true" />
            {t("tryAgain")}
          </Button>
          <Link className={buttonVariants({ size: "lg", variant: "outline" })} to="/">
            {t("returnHome")}
          </Link>
        </>
      }
      description={t("errorDescription")}
      insideApplicationShell={insideApplicationShell}
      title={t("errorTitle")}
    />
  );
}

/** Router-wide not-found boundary for resources that a route reports as missing. */
export function RouteNotFoundPage() {
  const { insideApplicationShell, t } = useRouteStatus();

  return (
    <RouteStatusLayout
      actions={
        <Link className={buttonVariants({ size: "lg" })} to="/">
          {t("returnHome")}
        </Link>
      }
      description={t("notFoundDescription")}
      insideApplicationShell={insideApplicationShell}
      title={t("notFoundTitle")}
    />
  );
}

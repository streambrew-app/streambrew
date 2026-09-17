import { Link, createFileRoute, notFound } from "@tanstack/react-router";
import { CosmicArt } from "@web/components/cosmic-art";
import { buttonVariants } from "@web/components/ui/button";
import { createTranslations, createTranslator, useI18n } from "@web/lib/i18n";

import productMark from "../../assets/logo.png";

const translations = createTranslations({
  pageTitle: {
    en: "Page not found",
    ru: "Страница не найдена",
  },
  pageDescription: {
    en: "This address does not point to a StreamBrew page. Check the link or return to the home page.",
    ru: "По этому адресу нет страницы StreamBrew. Проверьте ссылку или вернитесь на главную.",
  },
  returnHome: {
    en: "Return home",
    ru: "Вернуться на главную",
  },
});

export const Route = createFileRoute("/$")({
  head: ({ match }) => ({
    meta: [
      {
        title: `${createTranslator(match.context.locale, translations)("pageTitle")} · StreamBrew`,
      },
      { content: "noindex, nofollow", name: "robots" },
    ],
  }),
  loader: () => {
    throw notFound();
  },
  notFoundComponent: NotFoundPage,
});

function NotFoundPage() {
  const { t } = useI18n(translations);

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
          <h1 className="font-heading text-[clamp(2rem,7vw,4rem)] leading-none font-medium tracking-[-0.035em] text-balance">
            {t("pageTitle")}
          </h1>
          <p className="max-w-[60ch] text-base leading-7 text-muted-foreground">
            {t("pageDescription")}
          </p>
          <Link className={buttonVariants({ size: "lg" })} to="/">
            {t("returnHome")}
          </Link>
        </div>
        <CosmicArt
          className="pointer-events-none absolute -right-20 -bottom-16 w-72 text-primary/35 opacity-35 sm:-right-10 sm:w-80"
          variant="orbit"
        />
      </section>
    </main>
  );
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { CosmicArt } from "@web/components/cosmic-art";
import { Metric } from "@web/components/dashboard/metric";
import {
  DonationAlertsConnectionStatus,
  DonationAlertsMark,
  DonationAlertsNameLink,
} from "@web/components/donation-alerts";
import DonationCard from "@web/components/donation-card";
import {
  DonationSourceConnectionStatus,
  DonationSourceMark,
  DonationSourceNameLink,
} from "@web/components/donation-source";
import { Icons } from "@web/components/icons";
import { DashboardSkeleton } from "@web/components/loading-skeletons";
import MockChart from "@web/components/mock-chart";
import QueryErrorState from "@web/components/query-error-state";
import {
  StreamElementsConnectionStatus,
  StreamElementsMark,
  StreamElementsNameLink,
} from "@web/components/streamelements";
import {
  StreamlabsConnectionStatus,
  StreamlabsMark,
  StreamlabsNameLink,
} from "@web/components/streamlabs";
import { buttonVariants } from "@web/components/ui/button";
import { CosmicPageHeader } from "@web/components/ui/cosmic-page-header";
import { EmptyState } from "@web/components/ui/empty-state";
import { fmtAmount } from "@web/lib/fmt";
import { createTranslations, createTranslator, useI18n, type Locale } from "@web/lib/i18n";
import { preloadRouteQuery } from "@web/lib/trpc";
import { cn } from "@web/lib/utils";
import { z } from "zod";

import { useDonationOverviewQ, useUserInfoSafe } from "../../hooks/api";

const translations = createTranslations({
  overview: {
    en: "Overview",
    ru: "Главная",
  },
  donations: {
    en: "Donations",
    ru: "Донаты",
  },
  streamStatistics: {
    en: "Stream stats",
    ru: "Статистика стрима",
  },
  totalReceived: {
    en: "Total received",
    ru: "Всего получено",
  },
  averageDonation: {
    en: "Average donation",
    ru: "Средний донат",
  },
  averageDonationNote: {
    en: ({ otherAmounts }: { otherAmounts: readonly string[] }) =>
      otherAmounts.length === 0
        ? "Across connected platforms"
        : `Across connected platforms. Other currencies: ${otherAmounts.join(", ")}`,
    ru: ({ otherAmounts }: { otherAmounts: readonly string[] }) =>
      otherAmounts.length === 0
        ? "По всем подключённым платформам"
        : `По всем подключённым платформам. Другие валюты: ${otherAmounts.join(", ")}`,
  },
  recentActivity: {
    en: "Recent donations",
    ru: "Последние донаты",
  },
  noDonations: {
    en: "No donations yet",
    ru: "Донатов пока нет",
  },
  donationsWillAppear: {
    en: "New donations will appear here.",
    ru: "Новые донаты появятся здесь.",
  },
  viewAll: {
    en: "View all",
    ru: "Посмотреть все",
  },
  donationTrends: {
    en: "Donation trends",
    ru: "Динамика донатов",
  },
  automaticSync: {
    en: "Donations sync automatically.",
    ru: "Новые донаты загружаются автоматически.",
  },
  connectAllDonations: {
    en: "Connect a donation source to receive donations.",
    ru: "Подключите источник, чтобы получать донаты.",
  },
  donationSources: {
    en: "Donation sources",
    ru: "Источники донатов",
  },
  manage: {
    en: "Manage",
    ru: "Настроить",
  },
  readyForOverlay: {
    en: "Chat in OBS",
    ru: "Чат в OBS",
  },
  createOverlay: {
    en: "Set up overlay",
    ru: "Настроить оверлей",
  },
  landingPageTitle: {
    en: "Donations, video queue, and multichat for streamers",
    ru: "Донаты, очередь видео и мультичат для стримеров",
  },
  connected: {
    en: "Connected",
    ru: "Подключено",
  },
  notConnected: {
    en: "Not connected",
    ru: "Не подключено",
  },
  allTime: {
    en: "All time",
    ru: "За всё время",
  },
  totalReceivedNote: {
    en: ({ otherAmounts }: { otherAmounts: readonly string[] }) =>
      otherAmounts.length === 0
        ? "All time"
        : `All time. Other currencies: ${otherAmounts.join(", ")}`,
    ru: ({ otherAmounts }: { otherAmounts: readonly string[] }) =>
      otherAmounts.length === 0
        ? "За всё время"
        : `За всё время. Другие валюты: ${otherAmounts.join(", ")}`,
  },
  sampleChart: {
    en: "Example",
    ru: "Пример",
  },
  sampleChartDescription: {
    en: "Sample data, not your donations.",
    ru: "Пример данных, не ваши донаты.",
  },
  loadingDonations: {
    en: "Loading donations",
    ru: "Загружаем донаты…",
  },
});

export const Route = createFileRoute("/_authenticated/")({
  component: Overview,
  head: ({ match }) => ({
    meta: [
      {
        title: `${createTranslator(
          match.context.locale,
          translations,
        )(match.context.viewer ? "overview" : "landingPageTitle")} · StreamBrew`,
      },
    ],
  }),
  loader: async ({ context }) => {
    if (!context.viewer) {
      return;
    }
    await preloadRouteQuery(context.queryClient, context.trpc.donationOverview.queryOptions());
  },
  validateSearch: z.object({
    success: z.boolean().optional().catch(undefined),
  }),
});

type DonationCurrencySummary = NonNullable<
  ReturnType<typeof useDonationOverviewQ>["data"]
>["currencies"][number];

/**
 * Formats one amount per original currency. The most frequently received currency becomes the
 * metric value; the others stay visible in its note instead of being summed or converted.
 */
function currencyMetric(
  currencies: readonly DonationCurrencySummary[],
  amount: (summary: DonationCurrencySummary) => DonationCurrencySummary["totalAmount"],
  locale: Locale,
) {
  const [primary, ...others] = currencies.map((summary) =>
    fmtAmount(amount(summary), summary.currency, locale),
  );
  return { value: primary ?? "0", others };
}

const panel = "cosmic-panel overflow-hidden";

function donationSourceConnections(userInfo: ReturnType<typeof useUserInfoSafe>) {
  const donationAlertsConnected = userInfo?.hasDonationAlertsConnection ?? false;
  const donateStreamConnected = userInfo?.hasDonateStreamConnection ?? false;
  const streamlabsConnected = userInfo?.hasStreamlabsConnection ?? false;
  const streamElementsConnected = userInfo?.hasStreamElementsConnection ?? false;
  const tourniquetConnected = userInfo?.hasTourniquetConnection ?? false;

  return [
    {
      source: "donationalerts",
      connected: donationAlertsConnected,
      mark: <DonationAlertsMark />,
      name: <DonationAlertsNameLink />,
      status: <DonationAlertsConnectionStatus connected={donationAlertsConnected} />,
    },
    {
      source: "donate_stream",
      connected: donateStreamConnected,
      mark: <DonationSourceMark source="donate_stream" />,
      name: <DonationSourceNameLink source="donate_stream" />,
      status: <DonationSourceConnectionStatus connected={donateStreamConnected} />,
    },
    {
      source: "streamlabs",
      connected: streamlabsConnected,
      mark: <StreamlabsMark />,
      name: <StreamlabsNameLink />,
      status: <StreamlabsConnectionStatus connected={streamlabsConnected} />,
    },
    {
      source: "streamelements",
      connected: streamElementsConnected,
      mark: <StreamElementsMark />,
      name: <StreamElementsNameLink />,
      status: <StreamElementsConnectionStatus connected={streamElementsConnected} />,
    },
    {
      source: "tourniquet",
      connected: tourniquetConnected,
      mark: <DonationSourceMark source="tourniquet" />,
      name: <DonationSourceNameLink source="tourniquet" />,
      status: <DonationSourceConnectionStatus connected={tourniquetConnected} />,
    },
  ];
}

function Overview() {
  const userInfo = useUserInfoSafe();
  const donationOverviewQ = useDonationOverviewQ();
  const success = Route.useSearch({ select: (search) => search.success });
  const donationConnections = donationSourceConnections(userInfo);
  const hasDonationConnection = donationConnections.some(({ connected }) => connected);
  const { locale, t } = useI18n(translations);

  const currencies = donationOverviewQ.data?.currencies ?? [];
  const donationsLength = donationOverviewQ.data?.donationCount ?? 0;
  const totalReceived = currencyMetric(currencies, (summary) => summary.totalAmount, locale);
  const averageDonation = currencyMetric(currencies, (summary) => summary.averageAmount, locale);
  const chartDates = ["2026-06-29", "2026-07-06", "2026-07-13", "2026-07-20", "2026-07-27"].map(
    (date) =>
      new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", {
        day: "numeric",
        month: "short",
      }).format(new Date(`${date}T00:00:00`)),
  );

  return (
    <section className="cosmic-panel flex min-h-0 min-w-0 flex-col overflow-hidden" id="top">
      <CosmicPageHeader title={t("overview")} />
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="flex flex-col gap-4 p-4 sm:p-5">
          {success !== undefined && (
            <div
              className={`rounded-xl border px-3.5 py-3 text-compact ${success ? "border-status-success-border/50 bg-status-success-surface text-status-success-text dark:bg-status-success-dark-surface/10 dark:text-status-success-dark-text" : "border-status-error-border/50 bg-status-error-surface text-status-error-text dark:bg-status-error-dark-surface/10 dark:text-status-error-dark-text"}`}
            >
              {success ? t("connected") : t("notConnected")}
            </div>
          )}
          {donationOverviewQ.isLoading ? (
            <DashboardSkeleton
              aria-busy="true"
              aria-label={t("loadingDonations")}
              className="mt-7"
            />
          ) : donationOverviewQ.isError ? (
            <QueryErrorState
              className="mt-7 rounded-2xl border border-border bg-card sm:mt-9"
              isRetrying={donationOverviewQ.isFetching}
              onRetry={() => void donationOverviewQ.refetch()}
            />
          ) : (
            <>
              <section className="grid gap-4 md:grid-cols-3" aria-label={t("streamStatistics")}>
                <Metric
                  title={t("totalReceived")}
                  value={totalReceived.value}
                  note={t("totalReceivedNote", { otherAmounts: totalReceived.others })}
                  icon={Icons.wallet}
                  iconClass="bg-solar-mango/20 text-status-warning-text dark:text-status-warning-dark-text"
                />
                <Metric
                  title={t("donations")}
                  value={String(donationsLength)}
                  note={t("allTime")}
                  icon={Icons.donations}
                  iconClass="bg-comet-coral/15 text-destructive"
                />
                <Metric
                  title={t("averageDonation")}
                  value={averageDonation.value}
                  note={t("averageDonationNote", { otherAmounts: averageDonation.others })}
                  icon={Icons.platform}
                  iconClass="bg-mint-signal/18 text-status-success-text dark:text-status-success-dark-text"
                />
              </section>
              <section className="grid gap-4 xl:grid-cols-[1.03fr_.97fr]">
                <article className={panel} id="donations">
                  <div className="flex items-start justify-between p-5">
                    <div className="flex flex-col gap-1">
                      <h2 className="font-heading text-lg font-semibold text-card-foreground">
                        {t("recentActivity")}
                      </h2>
                    </div>
                    <Link
                      to="/donations"
                      className="flex items-center text-xs font-bold text-primary hover:text-primary/75"
                    >
                      {t("viewAll")} <Icons.chevronRight aria-hidden="true" size={16} />
                    </Link>
                  </div>
                  {donationOverviewQ.data?.recentDonations.length ? (
                    <div>
                      {donationOverviewQ.data.recentDonations.map((donation) => (
                        <DonationCard
                          key={donation.donationId}
                          className="border-t border-border"
                          donation={donation}
                        />
                      ))}
                    </div>
                  ) : (
                    <EmptyState
                      art={false}
                      className="min-h-0"
                      description={t("donationsWillAppear")}
                      headingLevel={3}
                      icon={Icons.donations}
                      title={t("noDonations")}
                    />
                  )}
                </article>
                <article className={`${panel} min-h-[290px] overflow-hidden`}>
                  <div className="flex items-start justify-between p-5 pb-1">
                    <div>
                      <h2 className="font-heading text-lg font-semibold text-card-foreground">
                        {t("donationTrends")}
                      </h2>
                      <p className="mt-1.5 max-w-sm text-xs leading-relaxed text-muted-foreground">
                        {t("sampleChartDescription")}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-md bg-muted px-2 py-1.5 text-caption font-medium text-muted-foreground">
                      {t("sampleChart")}
                    </span>
                  </div>
                  <div className="relative h-52 px-4 pt-3 pb-2 pl-10">
                    <div className="absolute bottom-9 left-2 flex h-[164px] flex-col justify-between text-micro text-muted-foreground">
                      <span>6k</span>
                      <span>4k</span>
                      <span>2k</span>
                      <span>0</span>
                    </div>
                    <MockChart className="h-[164px] w-full" />
                    <div className="flex justify-between text-micro text-muted-foreground">
                      {chartDates.map((date) => (
                        <span key={date}>{date}</span>
                      ))}
                    </div>
                  </div>
                </article>
              </section>
              <section className="grid items-start gap-4 xl:grid-cols-2">
                <article
                  className={`${panel} flex min-h-[120px] flex-col gap-4 p-5`}
                  id="integrations"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h2 className="font-heading text-base font-semibold text-card-foreground">
                        {t("donationSources")}
                      </h2>
                      <p className="text-xs text-muted-foreground">
                        {t(hasDonationConnection ? "automaticSync" : "connectAllDonations")}
                      </p>
                    </div>
                    <Link
                      className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-2 text-caption font-bold text-foreground transition hover:bg-muted"
                      to="/integrations"
                    >
                      {t("manage")} <Icons.chevronRight aria-hidden="true" size={16} />
                    </Link>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                    {donationConnections.map(({ name, source, mark, status }) => (
                      <div
                        className="flex min-w-0 items-center gap-2 rounded-xl bg-muted/55 p-2.5"
                        key={source}
                      >
                        {mark}
                        <span className="min-w-0 grow truncate text-xs font-semibold text-card-foreground">
                          {name}
                        </span>
                        {status}
                      </div>
                    ))}
                  </div>
                </article>
                <article className="relative flex min-h-[120px] flex-wrap items-center gap-3 overflow-hidden rounded-2xl bg-overlay-invite p-5 text-milky-paper">
                  <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-white/15">
                    <Icons.copy aria-hidden="true" />
                  </div>
                  <div>
                    <h2 className="font-heading text-base font-semibold">{t("readyForOverlay")}</h2>
                  </div>
                  <Link
                    className={cn(
                      buttonVariants(),
                      "z-10 ml-auto h-auto bg-white px-2.5 py-2 text-caption font-bold text-overlay-invite hover:bg-white/90",
                    )}
                    to="/chat"
                  >
                    {t("createOverlay")} <Icons.chevronRight aria-hidden="true" size={17} />
                  </Link>
                  <CosmicArt
                    className="pointer-events-none absolute -right-4 -bottom-9 w-40 text-white/30 opacity-35"
                    variant="orbit"
                  />
                </article>
              </section>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

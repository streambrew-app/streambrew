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

  return (
    <section className="cosmic-panel flex min-h-0 min-w-0 flex-col overflow-hidden" id="top">
      <CosmicPageHeader title={t("overview")} />
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="flex flex-col gap-8 p-4 sm:p-6">
          {success !== undefined && (
            <div
              className={`rounded-xl border px-4 py-3 text-sm ${success ? "border-status-success-border/50 bg-status-success-surface text-status-success-text dark:bg-status-success-dark-surface/10 dark:text-status-success-dark-text" : "border-status-error-border/50 bg-status-error-surface text-status-error-text dark:bg-status-error-dark-surface/10 dark:text-status-error-dark-text"}`}
            >
              {success ? t("connected") : t("notConnected")}
            </div>
          )}
          {donationOverviewQ.isLoading ? (
            <DashboardSkeleton aria-busy="true" aria-label={t("loadingDonations")} />
          ) : donationOverviewQ.isError ? (
            <QueryErrorState
              className="rounded-2xl border border-border bg-card"
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
              <section className="grid items-start gap-4 xl:grid-cols-2">
                <article className={panel} id="donations">
                  <div className="flex items-center justify-between gap-3 p-6">
                    <h2 className="font-heading text-lg font-semibold text-card-foreground">
                      {t("recentActivity")}
                    </h2>
                    <Link
                      className={buttonVariants({ variant: "outline", size: "sm" })}
                      to="/donations"
                    >
                      {t("viewAll")}{" "}
                      <Icons.chevronRight aria-hidden="true" data-icon="inline-end" />
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
                <div className="flex min-w-0 flex-col gap-4">
                  <article className={`${panel} flex flex-col gap-4 p-6`} id="integrations">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex flex-col gap-1">
                        <h2 className="font-heading text-lg font-semibold text-card-foreground">
                          {t("donationSources")}
                        </h2>
                        <p className="text-xs text-muted-foreground">
                          {t(hasDonationConnection ? "automaticSync" : "connectAllDonations")}
                        </p>
                      </div>
                      <Link
                        className={buttonVariants({ variant: "outline", size: "sm" })}
                        to="/integrations"
                      >
                        {t("manage")}{" "}
                        <Icons.chevronRight aria-hidden="true" data-icon="inline-end" />
                      </Link>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                      {donationConnections.map(({ name, source, mark, status }) => (
                        <div
                          className="flex min-w-0 items-center gap-2 rounded-xl bg-muted/55 p-2"
                          key={source}
                        >
                          {mark}
                          <span className="min-w-0 grow truncate text-sm font-medium text-card-foreground">
                            {name}
                          </span>
                          {status}
                        </div>
                      ))}
                    </div>
                  </article>
                  <article className="relative flex flex-wrap items-center gap-3 overflow-hidden rounded-2xl bg-overlay-invite p-6 text-milky-paper">
                    <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-white/15">
                      <Icons.copy aria-hidden="true" />
                    </div>
                    <h2 className="font-heading text-lg font-semibold">{t("readyForOverlay")}</h2>
                    <Link
                      className={buttonVariants({
                        variant: "outline",
                        size: "sm",
                        className: "z-10 ml-auto",
                      })}
                      to="/chat"
                    >
                      {t("createOverlay")}{" "}
                      <Icons.chevronRight aria-hidden="true" data-icon="inline-end" />
                    </Link>
                    <CosmicArt
                      className="pointer-events-none absolute -right-4 -bottom-9 w-40 text-white/30 opacity-35"
                      variant="orbit"
                    />
                  </article>
                </div>
              </section>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

import type { DonationSource } from "@streambrew/packages/schemas.js";
import { cn } from "@web/lib/utils";
import type { ReactNode } from "react";

import { createTranslations, useI18n } from "../lib/i18n";
import { DonationSourceIcons, Icons } from "./icons";

const translations = createTranslations({
  connected: {
    en: "Connected",
    ru: "Подключено",
  },
  notConnected: {
    en: "Not connected",
    ru: "Не подключено",
  },
  openDonationSource: {
    en: ({ source }: { source: string }) => `Open ${source}`,
    ru: ({ source }: { source: string }) => `Открыть ${source}`,
  },
});

const sources = {
  donationalerts: {
    iconClassName: "bg-[#1f1f1f]",
    iconImageClassName: "h-[68%] w-auto",
    name: "DonationAlerts",
    url: "https://www.donationalerts.com/dashboard/activity-feed/donations",
  },
  donate_stream: {
    iconClassName: "bg-[#1f1f1f]",
    iconImageClassName: "size-[64%]",
    name: "donate.stream",
    url: "https://lk.donate.stream/donate-alerts",
  },
  streamlabs: {
    iconClassName: "bg-[#80f5d2]",
    iconImageClassName: "size-full",
    name: "Streamlabs",
    url: "https://streamlabs.com/dashboard",
  },
  tourniquet: {
    iconClassName: "bg-[#ffff00]",
    iconImageClassName: "size-full",
    name: "Tourniquet",
    url: "https://tourniquet.app/profile/widgets",
  },
  streamelements: {
    iconClassName: "bg-[#0b6e78]",
    iconImageClassName: "size-[72%]",
    name: "StreamElements",
    url: "https://streamelements.com/dashboard/revenue/tips",
  },
} satisfies Record<
  DonationSource,
  { iconClassName: string; iconImageClassName: string; name: string; url: string }
>;

export function donationSourceDetails(source: DonationSource) {
  return sources[source];
}

function DonationSourceLink({
  children,
  className,
  source,
}: {
  children: ReactNode;
  className?: string;
  source: DonationSource;
}) {
  const { t } = useI18n(translations);
  const details = sources[source];

  return (
    <a
      aria-label={t("openDonationSource", { source: details.name })}
      className={className}
      href={details.url}
      rel="noopener noreferrer"
      target="_blank"
    >
      {children}
    </a>
  );
}

type MarkProps = {
  className?: string;
  size?: "sm" | "lg";
  source: DonationSource;
};

export function DonationSourceIcon({
  className,
  size = "sm",
  source,
}: {
  className?: string;
  size?: "xs" | "sm" | "lg";
  source: DonationSource;
}) {
  const details = sources[source];
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid shrink-0 place-items-center overflow-hidden",
        details.iconClassName,
        size === "xs" ? "rounded-xs" : size === "sm" ? "rounded-lg" : "rounded-xl shadow-sm",
        className,
      )}
    >
      <img
        alt=""
        className={cn("block object-contain", details.iconImageClassName)}
        src={DonationSourceIcons[source]}
      />
    </span>
  );
}

export function DonationSourceMark({ className, size = "sm", source }: MarkProps) {
  return (
    <DonationSourceLink
      className={cn(
        "shrink-0 rounded-lg transition-transform outline-none hover:-rotate-2 hover:scale-105 focus-visible:ring-3 focus-visible:ring-ring/50",
        size === "lg" && "rounded-xl",
        className,
      )}
      source={source}
    >
      <DonationSourceIcon
        className={size === "lg" ? "size-12" : "size-9"}
        size={size}
        source={source}
      />
    </DonationSourceLink>
  );
}

export function DonationSourceNameLink({
  className,
  source,
}: {
  className?: string;
  source: DonationSource;
}) {
  const details = sources[source];

  return (
    <DonationSourceLink
      className={cn(
        "rounded-sm underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50",
        className,
      )}
      source={source}
    >
      {details.name}
    </DonationSourceLink>
  );
}

export function DonationSourceConnectionStatus({ connected }: { connected: boolean }) {
  const { t } = useI18n(translations);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-micro font-bold",
        connected
          ? "bg-status-success-surface text-status-success-text dark:bg-status-success-dark-surface/10 dark:text-status-success-dark-text"
          : "bg-status-warning-surface text-status-warning-text dark:bg-status-warning-dark-surface/10 dark:text-status-warning-dark-text",
      )}
    >
      <i aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      {t(connected ? "connected" : "notConnected")}
    </span>
  );
}

export function DonationSourceBadge({
  className,
  source,
}: {
  className?: string;
  source: DonationSource;
}) {
  const details = sources[source];

  return (
    <DonationSourceLink
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-border bg-background/70 px-2 py-0.5 text-micro font-semibold text-muted-foreground transition-colors outline-none hover:border-primary/30 hover:bg-secondary hover:text-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
        className,
      )}
      source={source}
    >
      <DonationSourceIcon className="size-3.5" size="xs" source={source} />
      {details.name}
      <Icons.externalLink aria-hidden="true" size={10} />
    </DonationSourceLink>
  );
}

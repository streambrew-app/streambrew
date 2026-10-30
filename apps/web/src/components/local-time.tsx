import { useHydrated } from "@tanstack/react-router";
import { fmtDate, fmtListDate } from "@web/lib/fmt";
import type { Locale } from "@web/lib/i18n";
import type { ComponentProps, ReactNode } from "react";

const pendingValue = "—";

type LocalTimeProps = Omit<ComponentProps<"time">, "children" | "dateTime" | "title"> & {
  /** Places the formatted value in surrounding copy, such as a localized sentence. */
  children?: (formatted: string) => ReactNode;
  /** `list` shows only the time for today and yesterday; `date` always includes the date. */
  format?: "date" | "list";
  locale: Locale;
  /** Adds the full date and time as the element title. */
  showFullDate?: boolean;
  value: Date;
};

/**
 * Formats a moment in the browser's time zone and clock. The server knows neither, so the server
 * HTML and the hydrating render show a placeholder; the value appears right after hydration.
 */
export function LocalTime({
  children,
  format = "list",
  locale,
  showFullDate = false,
  value,
  ...props
}: LocalTimeProps) {
  const hydrated = useHydrated();
  const formatted = hydrated
    ? format === "date"
      ? fmtDate(value, locale)
      : fmtListDate(value, locale)
    : pendingValue;

  return (
    <time
      {...props}
      dateTime={value.toISOString()}
      title={hydrated && showFullDate ? fmtDate(value, locale) : undefined}
    >
      {children ? children(formatted) : formatted}
    </time>
  );
}

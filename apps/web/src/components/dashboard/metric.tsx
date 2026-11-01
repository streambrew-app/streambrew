import { cn } from "@web/lib/utils";

import type { IconComponent } from "../icons";

type MetricProps = {
  className?: string;
  title: string;
  value: string;
  note: string;
  subnote?: string;
  icon: IconComponent;
  iconClass: string;
  /** Optical correction for glyphs whose visual weight is off-centre. */
  iconOffsetClass?: string;
};

function Metric({
  className,
  title,
  value,
  note,
  subnote,
  icon: MetricIcon,
  iconClass,
  iconOffsetClass,
}: MetricProps) {
  return (
    <article
      className={cn(
        "cosmic-panel flex min-w-0 items-start justify-between gap-4 px-6 py-4",
        className,
      )}
    >
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-sm font-medium text-muted-foreground">{title}</span>
        <strong className="block font-heading text-3xl leading-tight font-medium tracking-tight wrap-anywhere text-card-foreground tabular-nums">
          {value}
        </strong>
        <p
          className={`text-sm ${subnote ? "text-status-success-text dark:text-status-success-dark-surface" : "text-muted-foreground"}`}
        >
          {note}
          {subnote && <span className="text-muted-foreground"> {subnote}</span>}
        </p>
      </div>
      <span className={cn("grid size-9 shrink-0 place-items-center rounded-full", iconClass)}>
        <MetricIcon aria-hidden="true" className={cn("size-4.5", iconOffsetClass)} />
      </span>
    </article>
  );
}

export { Metric };

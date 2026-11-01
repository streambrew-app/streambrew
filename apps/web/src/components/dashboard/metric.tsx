import type { IconComponent } from "../icons";

const panel = "cosmic-panel";

type MetricProps = {
  title: string;
  value: string;
  note: string;
  subnote?: string;
  icon: IconComponent;
  iconClass: string;
};

function Metric({ title, value, note, subnote, icon: MetricIcon, iconClass }: MetricProps) {
  return (
    <article className={`${panel} relative flex flex-col gap-4 overflow-hidden p-6`}>
      <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
        <span>{title}</span>
        <span className={`grid size-8 place-items-center rounded-full ${iconClass}`}>
          <MetricIcon aria-hidden="true" />
        </span>
      </div>
      <strong className="block font-heading text-3xl leading-tight font-medium tracking-tight wrap-anywhere text-card-foreground tabular-nums">
        {value}
      </strong>
      <p
        className={`text-xs ${subnote ? "text-status-success-text dark:text-status-success-dark-surface" : "text-muted-foreground"}`}
      >
        {note}
        {subnote && <span className="text-muted-foreground"> {subnote}</span>}
      </p>
    </article>
  );
}

export { Metric };

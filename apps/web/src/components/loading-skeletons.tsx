import { cn } from "@web/lib/utils";
import type { ComponentProps } from "react";

import { Skeleton } from "./ui/skeleton";

type Props = ComponentProps<"div">;

export function DonationListSkeleton({ className, ...props }: Props) {
  return (
    <div className={cn("divide-y divide-border", className)} {...props}>
      {[0, 1, 2].map((index) => (
        <div className="flex gap-3 px-4 py-4 sm:items-center sm:px-6" key={index}>
          <Skeleton className="size-9 shrink-0" shape="panel" />
          <div className="flex min-w-0 grow flex-col gap-2">
            <div className="flex items-center gap-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-4 w-20" />
            </div>
            <Skeleton className="h-3 w-3/4 max-w-sm" />
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            <Skeleton className="h-3 w-14" />
            <Skeleton className="h-2.5 w-10" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function VideoListSkeleton({
  className,
  withActions = false,
  ...props
}: Props & { withActions?: boolean }) {
  return (
    <div className={cn("divide-y divide-border", className)} {...props}>
      {[0, 1, 2].map((index) => (
        <article className="@container px-4 py-4 sm:px-6" key={index}>
          {withActions ? (
            <div className="grid min-w-0 items-start gap-6 @3xl:grid-cols-[clamp(19rem,33%,25rem)_minmax(0,1fr)]">
              <div className="flex min-w-0 flex-col gap-2">
                <Skeleton className="aspect-video w-full" shape="panel" />
                <div className="flex gap-2">
                  <Skeleton className="h-8 w-24" />
                  <Skeleton className="h-8 w-24" />
                </div>
              </div>
              <div className="flex min-w-0 flex-col gap-3 @3xl:min-h-full">
                <div className="flex min-w-0 items-start justify-between gap-4">
                  <div className="flex min-w-0 items-center gap-2">
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="size-6" />
                  </div>
                </div>
                <Skeleton className="h-5 w-3/4 max-w-sm" />
                <div className="flex items-center gap-2">
                  <Skeleton className="h-4 w-14" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <div className="flex flex-col gap-2">
                  <Skeleton className="h-3 w-full max-w-xl" />
                  <Skeleton className="h-3 w-2/3 max-w-md" />
                </div>
                <Skeleton className="h-3 w-36" />
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-stretch gap-4 sm:flex-row sm:items-start">
              <Skeleton className="aspect-video w-full sm:w-60 sm:shrink-0" shape="panel" />
              <div className="flex min-w-0 grow flex-col gap-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="h-4 w-16" shape="pill" />
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <Skeleton className="h-3 w-14" />
                    <Skeleton className="h-3 w-10" />
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <Skeleton className="h-3 w-full max-w-xl" />
                  <Skeleton className="h-3 w-2/3 max-w-md" />
                </div>
              </div>
            </div>
          )}
        </article>
      ))}
    </div>
  );
}

export function VideoPrioritiesSkeleton({ className, ...props }: Props) {
  return (
    <div className={cn("flex flex-col gap-2", className)} {...props}>
      {[0, 1].map((index) => (
        <div className="flex items-center gap-2 rounded-lg border border-border p-2" key={index}>
          <Skeleton className="size-6 shrink-0" />
          <Skeleton className="h-3 min-w-0 grow" />
          <Skeleton className="h-3 w-16 shrink-0" />
          <Skeleton className="h-3 w-4 shrink-0" />
        </div>
      ))}
    </div>
  );
}

export function DashboardSkeleton({ className, ...props }: Props) {
  return (
    <div className={cn("flex flex-col gap-8", className)} {...props}>
      <section className="grid divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card md:grid-cols-3 md:divide-x md:divide-y-0">
        {[0, 1, 2].map((index) => (
          <article className="flex items-start justify-between gap-4 px-6 py-4" key={index}>
            <div className="flex flex-col gap-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-24" />
              <Skeleton className="h-4 w-32" />
            </div>
            <Skeleton className="size-9" shape="panel" />
          </article>
        ))}
      </section>
      <section className="grid items-start gap-4 xl:grid-cols-2">
        <article className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="flex items-center justify-between p-6">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-7 w-28" />
          </div>
          <DonationListSkeleton />
        </article>
        <div className="flex flex-col gap-4">
          <Skeleton className="h-64" shape="card" />
          <Skeleton className="h-24" shape="card" />
        </div>
      </section>
    </div>
  );
}

import { cn } from "@web/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";

const skeletonVariants = cva("animate-pulse bg-secondary", {
  variants: {
    shape: {
      default: "rounded-md",
      panel: "rounded-lg",
      card: "rounded-xl",
      square: "rounded-none",
      pill: "rounded-full",
    },
  },
  defaultVariants: { shape: "default" },
});

function Skeleton({
  className,
  shape,
  ...props
}: ComponentProps<"div"> & VariantProps<typeof skeletonVariants>) {
  return <div className={cn(skeletonVariants({ shape }), className)} {...props} />;
}

export { Skeleton, skeletonVariants };

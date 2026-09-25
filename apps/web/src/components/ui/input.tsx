import { Input as InputPrimitive } from "@base-ui/react/input";
import { cn } from "@web/lib/utils";
import * as React from "react";

type InputProps = React.ComponentProps<"input"> & {
  appearance?: "default" | "bare";
  density?: "default" | "compact";
};

function Input({
  appearance = "default",
  className,
  density = "default",
  type,
  ...props
}: InputProps) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        // The standard control height belongs to the input primitive.
        // oxlint-disable-next-line tw-no-self-positioning/no-dimensions
        "h-8 min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        appearance === "bare" &&
          "rounded-none border-0 bg-transparent focus-visible:ring-0 dark:bg-transparent",
        density === "compact" && "rounded-md px-2 text-xs md:text-xs",
        className,
      )}
      {...props}
    />
  );
}

export { Input };

import type { ReactNode } from "react";

import { cn } from "../src/lib/utils";

import "../styles.css";
import "./ladle.css";

export const Provider = ({
  children,
  globalState,
}: {
  children: ReactNode;
  globalState: { theme: string };
}) => (
  <div
    className={cn(
      // The Ladle provider fills the preview canvas and sizes each story root.
      // oxlint-disable-next-line tw-no-self-positioning/no-dimensions
      "h-full min-h-0 [&>*]:h-full",
      globalState.theme === "dark" && "dark",
    )}
  >
    {children}
  </div>
);

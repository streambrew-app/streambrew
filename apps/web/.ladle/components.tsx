import { createRootRoute, createRouter, RouterContextProvider } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { I18nProvider } from "../src/lib/i18n";
import { cn } from "../src/lib/utils";

import "../styles.css";
import "./ladle.css";

const router = createRouter({ routeTree: createRootRoute() });

export const Provider = ({
  children,
  globalState,
}: {
  children: ReactNode;
  globalState: { theme: string };
}) => (
  <RouterContextProvider router={router}>
    <I18nProvider initialLocale="ru">
      <div className={cn("h-full min-h-0 [&>*]:h-full", globalState.theme === "dark" && "dark")}>
        {children}
      </div>
    </I18nProvider>
  </RouterContextProvider>
);

import { createFileRoute, Outlet } from "@tanstack/react-router";
import { createTranslations, createTranslator } from "@web/lib/i18n";

const i18n = createTranslations({
  adminPanel: {
    en: "Admin panel",
    ru: "Админская панель",
  },
});

export const Route = createFileRoute("/_authenticated/_admin/admin")({
  component: Outlet,
  head: ({ match }) => ({
    meta: [{ title: `${createTranslator(match.context.locale, i18n)("adminPanel")} · StreamBrew` }],
  }),
});

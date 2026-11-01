import { createFileRoute } from "@tanstack/react-router";
import { PublicQueueSettingsEditor } from "@web/components/public-queue-settings-editor";
import { QueueCurrencyEditor } from "@web/components/queue-currency-editor";
import { CosmicPageHeader } from "@web/components/ui/cosmic-page-header";

import { createTranslations, createTranslator, useI18n } from "../../lib/i18n";

const translations = createTranslations({
  settings: {
    en: "Settings",
    ru: "Настройки",
  },
});

export const Route = createFileRoute("/_authenticated/settings")({
  component: Settings,
  head: ({ match }) => ({
    meta: [
      { title: `${createTranslator(match.context.locale, translations)("settings")} · StreamBrew` },
    ],
  }),
});

function Settings() {
  const { t } = useI18n(translations);

  return (
    <section className="cosmic-panel flex min-h-0 min-w-0 flex-col overflow-hidden">
      <CosmicPageHeader title={t("settings")} variant="beans" />
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6">
        <div className="flex flex-col gap-4">
          <PublicQueueSettingsEditor />
          <QueueCurrencyEditor />
        </div>
      </div>
    </section>
  );
}

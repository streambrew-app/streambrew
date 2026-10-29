import { Menu } from "@base-ui/react/menu";
import { createTranslations, useI18n } from "@web/lib/i18n";

import { Button } from "./ui/button";

const translations = createTranslations({
  language: { en: "Language", ru: "Язык" },
  english: { en: "English", ru: "Английский" },
  russian: { en: "Russian", ru: "Русский" },
});

export function LanguageMenu() {
  const { locale, setLocale, t } = useI18n(translations);
  const otherLocale = locale === "en" ? "ru" : "en";

  return (
    <Menu.Root>
      <Menu.Trigger render={<Button aria-label={t("language")} size="icon" variant="sidebar" />}>
        <span aria-hidden="true">{locale.toUpperCase()}</span>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner align="end" className="z-50" side="top" sideOffset={8}>
          <Menu.Popup
            aria-label={t("language")}
            className="min-w-36 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg outline-none"
          >
            <Menu.Group>
              <Menu.Item
                className="flex cursor-pointer items-center rounded-md px-3 py-2 text-sm outline-none data-highlighted:bg-secondary data-highlighted:text-secondary-foreground"
                onClick={() => setLocale(otherLocale)}
              >
                {t(otherLocale === "en" ? "english" : "russian")}
              </Menu.Item>
            </Menu.Group>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

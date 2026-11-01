import type { ChatProvider, ChatProviderConnectionStatus } from "@streambrew/packages/chat.js";
import { ChatProviderMeta, Icons } from "@web/components/icons";
import { Button } from "@web/components/ui/button";
import { createTranslations, useI18n } from "@web/lib/i18n";

const translations = createTranslations({
  refreshRequired: {
    en: ({ provider }: { provider: string }) =>
      `${provider} access has expired. Reconnect the account to resume chat.`,
    ru: ({ provider }: { provider: string }) =>
      `Доступ к ${provider} истёк. Подключите аккаунт заново, чтобы возобновить чат.`,
  },
  connectionError: {
    en: ({ provider }: { provider: string }) =>
      `The ${provider} connection has failed. Reconnect the account to resume chat.`,
    ru: ({ provider }: { provider: string }) =>
      `Не удалось подключиться к ${provider}. Подключите аккаунт заново, чтобы возобновить чат.`,
  },
  reconnect: {
    en: "Reconnect",
    ru: "Подключить заново",
  },
});

const statusMessages = {
  refresh_required: "refreshRequired",
  error: "connectionError",
} as const;

/** Explains why a chat provider connection stopped collecting and offers to reconnect it. */
export function ChatReconnectNotice({
  disabled,
  onReconnect,
  pending,
  provider,
  status,
}: {
  disabled: boolean;
  onReconnect: () => void;
  pending: boolean;
  provider: ChatProvider;
  status: ChatProviderConnectionStatus;
}) {
  const { t } = useI18n(translations);
  if (status === "connected") return null;
  return (
    <div
      className="flex flex-wrap items-center gap-2 rounded-lg border border-status-warning-border bg-status-warning-surface px-3 py-2 text-xs text-status-warning-deep dark:border-status-warning-dark-surface/25 dark:bg-status-warning-dark-surface/10 dark:text-status-warning-on-deep"
      role="status"
    >
      <p className="flex min-w-0 grow basis-48 items-center gap-2">
        <Icons.warn
          aria-hidden="true"
          className="size-4 shrink-0 text-status-warning-text dark:text-status-warning-dark-text"
        />
        {t(statusMessages[status], { provider: ChatProviderMeta[provider].label })}
      </p>
      <Button
        disabled={disabled || pending}
        onClick={onReconnect}
        size="xs"
        type="button"
        variant="outline"
      >
        {pending ? (
          <Icons.loader aria-hidden="true" className="animate-spin" />
        ) : (
          <Icons.reconnectSource aria-hidden="true" />
        )}
        {t("reconnect")}
      </Button>
    </div>
  );
}

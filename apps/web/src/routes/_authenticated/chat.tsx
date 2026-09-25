import type {
  ChatBroadcastResult,
  ChatConfig,
  ChatProvider,
  ChatProviderAvailability,
  ChatProviderConnection,
  ChatSourceId,
} from "@streambrew/packages/chat.js";
import { MAX_CHAT_MESSAGE_LENGTH } from "@streambrew/packages/chat.js";
import { createFileRoute } from "@tanstack/react-router";
import { BoostyConnectionForm } from "@web/components/boosty-connection-form";
import { ChatFeed } from "@web/components/chat-feed";
import { CosmicPageHeader } from "@web/components/cosmic-page-header";
import { Icons, PlatformIcons } from "@web/components/icons";
import { Button } from "@web/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@web/components/ui/dialog";
import { Input } from "@web/components/ui/input";
import { Switch } from "@web/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@web/components/ui/tooltip";
import { useChatServiceMutations, useChatServiceQueries } from "@web/hooks/chat-service";
import { useChatServiceStream } from "@web/hooks/use-chat-service-stream";
import { withChatOverlayBackground, type ChatOverlayBackground } from "@web/lib/chat-overlay";
import { createTranslations, createTranslator, useI18n, type TranslationKey } from "@web/lib/i18n";
import { cn } from "@web/lib/utils";
import { useState, type FormEvent } from "react";
import { z } from "zod";

const translations = createTranslations({
  chat: {
    en: "Multichat",
    ru: "Мультичат",
  },
  dismissChatOauthNotification: {
    en: "Dismiss connection notification",
    ru: "Скрыть уведомление о подключении",
  },
  chatOauthSuccess: {
    en: "Chat account connected.",
    ru: "Аккаунт чата подключён.",
  },
  chatOauthInvalidCallback: {
    en: "The authorization response was incomplete. Try connecting again.",
    ru: "Ответ авторизации неполный. Попробуйте подключить аккаунт снова.",
  },
  chatOauthExpired: {
    en: "Authorization expired. Try connecting again.",
    ru: "Время авторизации истекло. Попробуйте подключить аккаунт снова.",
  },
  chatOauthProviderUnavailable: {
    en: "This chat provider is not configured.",
    ru: "Этот сервис чата не настроен.",
  },
  chatOauthTokenExchangeFailed: {
    en: "The provider rejected the authorization request.",
    ru: "Сервис отклонил запрос авторизации.",
  },
  chatOauthProfileFailed: {
    en: "Couldn't load or subscribe to the provider channel.",
    ru: "Не удалось получить канал или подписаться на его события.",
  },
  chatOauthSourceLimitReached: {
    en: "The connected chat channel limit has been reached.",
    ru: "Достигнут лимит подключённых каналов чата.",
  },
  chatOauthUnknownError: {
    en: "Couldn't connect the chat account. Try again.",
    ru: "Не удалось подключить аккаунт чата. Попробуйте снова.",
  },
  chatDisconnectTitle: {
    en: "Disconnect channel?",
    ru: "Отключить канал?",
  },
  chatDisconnectDescription: {
    en: ({ name, provider }: { name: string; provider: string }) =>
      `Messages from ${name} on ${provider} will no longer appear in the chat. You can reconnect the channel later.`,
    ru: ({ name, provider }: { name: string; provider: string }) =>
      `Сообщения канала «${name}» в ${provider} больше не будут появляться в чате. Канал можно подключить снова.`,
  },
  cancel: {
    en: "Cancel",
    ru: "Отменить",
  },
});

const chatOauthErrorSchema = z.enum([
  "invalid oauth callback",
  "expired oauth attempt",
  "oauth provider unavailable",
  "oauth token exchange failed",
  "oauth profile failed",
  "chat source limit reached",
  "unknown",
]);

const chatOauthErrorMessages = {
  "invalid oauth callback": "chatOauthInvalidCallback",
  "expired oauth attempt": "chatOauthExpired",
  "oauth provider unavailable": "chatOauthProviderUnavailable",
  "oauth token exchange failed": "chatOauthTokenExchangeFailed",
  "oauth profile failed": "chatOauthProfileFailed",
  "chat source limit reached": "chatOauthSourceLimitReached",
  unknown: "chatOauthUnknownError",
} as const satisfies Record<
  z.infer<typeof chatOauthErrorSchema>,
  TranslationKey<typeof translations>
>;

export const Route = createFileRoute("/_authenticated/chat")({
  component: ChatPage,
  validateSearch: z.object({
    chat_oauth: z.enum(["success", "error"]).optional().catch(undefined),
    chat_oauth_error: chatOauthErrorSchema.optional().catch(undefined),
  }),
  head: ({ match }) => ({
    meta: [
      { title: `${createTranslator(match.context.locale, translations)("chat")} · StreamBrew` },
    ],
  }),
});

const providerMeta = {
  youtube: { label: "YouTube", logo: PlatformIcons.youtube },
  twitch: { label: "Twitch", logo: PlatformIcons.twitch },
  kick: { label: "Kick", logo: PlatformIcons.kick },
  boosty: { label: "Boosty", logo: PlatformIcons.boosty },
  vk_video: { label: "VK Video", logo: PlatformIcons.vk_video },
} as const;

const chatTranslations = createTranslations({
  connections: {
    en: "Channels",
    ru: "Каналы",
  },
  feed: {
    en: "Chat",
    ru: "Чат",
  },
  empty: {
    en: "Messages will appear when a connected channel goes live.",
    ru: "Сообщения появятся здесь, когда подключённый канал выйдет в эфир.",
  },
  placeholder: {
    en: "Send to all chats…",
    ru: "Сообщение",
  },
  send: {
    en: "Send to all",
    ru: "Отправить всем",
  },
  noConnections: {
    en: "No connected channels yet",
    ru: "Пока нет подключённых каналов",
  },
  disconnect: {
    en: "Disconnect",
    ru: "Отключить",
  },
  disconnectAccount: {
    en: "Disconnect account",
    ru: "Отключить аккаунт",
  },
  enableSource: {
    en: "Enable source",
    ru: "Включить источник",
  },
  disableSource: {
    en: "Disable source",
    ru: "Выключить источник",
  },
  unavailable: {
    en: "Unavailable",
    ru: "Недоступно",
  },
  readOnly: {
    en: "Read only",
    ru: "Только чтение",
  },
  live: {
    en: "live",
    ru: "в эфире",
  },
  offline: {
    en: "offline",
    ru: "не в эфире",
  },
  connecting: {
    en: "connecting",
    ru: "подключение",
  },
  error: {
    en: "error",
    ru: "ошибка",
  },
  checkStream: {
    en: "Check stream",
    ru: "Проверить эфир",
  },
  checkingStream: {
    en: "Checking",
    ru: "Проверяем",
  },
  overlay: {
    en: "OBS link",
    ru: "Ссылка для OBS",
  },
  overlayBackground: {
    en: "Overlay background",
    ru: "Фон оверлея",
  },
  overlayBackgroundTransparent: {
    en: "Transparent",
    ru: "Прозрачный",
  },
  overlayBackgroundBlack: {
    en: "Black",
    ru: "Чёрный",
  },
  overlayBackgroundWhite: {
    en: "White",
    ru: "Белый",
  },
  rotateOverlay: {
    en: "Rotate",
    ru: "Обновить",
  },
  createOverlay: {
    en: "Create",
    ru: "Создать",
  },
  copied: {
    en: "Copied",
    ru: "Скопировано",
  },
  copy: {
    en: "Copy",
    ru: "Копировать",
  },
  loading: {
    en: "Loading chat…",
    ru: "Загружаем чат…",
  },
});

function ProviderMark({ className, provider }: { className?: string; provider: ChatProvider }) {
  const meta = providerMeta[provider];
  return (
    <span
      aria-hidden="true"
      className={cn("grid shrink-0 place-items-center rounded-lg bg-background", className)}
    >
      <img alt="" className="size-5" src={meta.logo} />
    </span>
  );
}

function SourceState({
  state,
  locale,
}: {
  state?: "connecting" | "error" | "live" | "offline";
  locale: "ru" | "en";
}) {
  const t = createTranslator(locale, chatTranslations);
  const normalized = state ?? "offline";
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button aria-label={t(normalized)} className="shrink-0" size="icon-xs" variant="ghost" />
        }
      >
        <span aria-hidden="true" className="flex size-3 shrink-0 items-center justify-center">
          <span
            className={cn(
              "size-1.5 rounded-full",
              normalized === "live"
                ? "bg-status-success-solid"
                : normalized === "error"
                  ? "bg-destructive"
                  : normalized === "connecting"
                    ? "animate-pulse bg-status-warning-solid"
                    : "bg-muted-foreground/40",
            )}
          />
        </span>
      </TooltipTrigger>
      <TooltipContent>{t(normalized)}</TooltipContent>
    </Tooltip>
  );
}

function useChatPageState() {
  const [boostyFormOpen, setBoostyFormOpen] = useState(false);
  const [connectionToDisconnect, setConnectionToDisconnect] =
    useState<ChatProviderConnection | null>(null);
  const [message, setMessage] = useState("");
  const [broadcastResult, setBroadcastResult] = useState<ChatBroadcastResult | null>(null);
  const [overlayUrl, setOverlayUrl] = useState<string | null>(null);
  const [overlayBackground, setOverlayBackground] = useState<ChatOverlayBackground>("transparent");
  const [overlayCopied, setOverlayCopied] = useState(false);

  return {
    boostyFormOpen,
    broadcastResult,
    connectionToDisconnect,
    message,
    overlayBackground,
    overlayCopied,
    overlayUrl,
    setBoostyFormOpen,
    setBroadcastResult,
    setConnectionToDisconnect,
    setMessage,
    setOverlayBackground,
    setOverlayCopied,
    setOverlayUrl,
  };
}

function chatConfigIndexes(config: ChatConfig | undefined) {
  return {
    connectionsById: new Map(
      config?.connections.map((connection) => [connection.connectionId, connection]),
    ),
    sourceByConnection: new Map(config?.sources.map((source) => [source.connectionId, source])),
    sourceById: new Map(config?.sources.map((source) => [source.sourceId, source])),
  };
}

function useChatPageModel() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const { availabilityQuery, configQuery } = useChatServiceQueries();
  const stream = useChatServiceStream();
  const state = useChatPageState();
  const mutations = useChatServiceMutations({
    onBroadcastSuccess: (result) => {
      state.setBroadcastResult(result);
      if (result.results.some(({ status }) => status === "succeeded")) {
        state.setMessage("");
      }
    },
    onMessageDeleted: (sourceId, messageId) => stream.removeMessage(sourceId, messageId),
    onOverlayUrlChanged: (nextOverlayUrl) => {
      state.setOverlayUrl(nextOverlayUrl);
      state.setOverlayCopied(false);
    },
  });
  const config = configQuery.data;
  const indexes = chatConfigIndexes(config);
  const capabilitiesForSource = (sourceId: ChatSourceId) => {
    const source = indexes.sourceById.get(sourceId);
    return source?.enabled
      ? (indexes.connectionsById.get(source.connectionId)?.capabilities ?? [])
      : [];
  };
  const writableConnectionCount =
    config?.sources.filter((source) => {
      const connection = indexes.connectionsById.get(source.connectionId);
      return (
        source.enabled &&
        connection?.status === "connected" &&
        connection.capabilities.includes("send_message")
      );
    }).length ?? 0;
  const configuredOverlayUrl =
    state.overlayUrl === null
      ? null
      : withChatOverlayBackground(state.overlayUrl, state.overlayBackground);

  return {
    availability: (availabilityQuery.data ?? []) as ChatProviderAvailability[],
    capabilitiesForSource,
    config,
    configQuery,
    configuredOverlayUrl,
    indexes,
    mutations,
    navigate,
    search,
    state,
    stream,
    writableConnectionCount,
  };
}

type ChatPageModel = ReturnType<typeof useChatPageModel>;
type ChatSource = ChatConfig["sources"][number];

function ChatLoadingState({ page }: { page: ChatPageModel }) {
  const { t } = useI18n(chatTranslations);
  return (
    <section className="cosmic-panel grid min-h-0 place-items-center overflow-hidden p-6 text-center">
      {page.configQuery.isError ? (
        <div className="flex flex-col items-center gap-3">
          <p className="text-sm text-destructive">{page.configQuery.error?.message}</p>
          <Button onClick={() => void page.configQuery.refetch()} variant="outline">
            <Icons.retry aria-hidden="true" />
            Retry
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Icons.loader className="animate-spin text-primary" />
          {t("loading")}
        </div>
      )}
    </section>
  );
}

function ChatOauthNotice({ page }: { page: ChatPageModel }) {
  const { t } = useI18n(translations);
  const { chat_oauth: chatOauth, chat_oauth_error: chatOauthError } = page.search;
  if (!chatOauth) return null;
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-xl border px-3.5 py-2 text-compact",
        chatOauth === "success"
          ? "border-status-success-border/50 bg-status-success-surface text-status-success-text dark:bg-status-success-dark-surface/10 dark:text-status-success-dark-text"
          : "border-status-error-border/50 bg-status-error-surface text-status-error-text dark:bg-status-error-dark-surface/10 dark:text-status-error-dark-text",
      )}
      role={chatOauth === "error" ? "alert" : "status"}
    >
      <p className="min-w-0 grow">
        {chatOauth === "success"
          ? t("chatOauthSuccess")
          : t(chatOauthErrorMessages[chatOauthError ?? "unknown"])}
      </p>
      <Button
        aria-label={t("dismissChatOauthNotification")}
        onClick={() =>
          void page.navigate({
            replace: true,
            search: (previous) => ({
              ...previous,
              chat_oauth: undefined,
              chat_oauth_error: undefined,
            }),
          })
        }
        size="icon-sm"
        type="button"
        variant="ghost"
      >
        <Icons.cancel aria-hidden="true" />
      </Button>
    </div>
  );
}

function BroadcastResults({ page }: { page: ChatPageModel }) {
  const result = page.state.broadcastResult;
  if (!result) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {result.results.map((item) => {
        const source = page.indexes.sourceById.get(item.sourceId);
        return (
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-micro",
              item.status === "succeeded"
                ? "bg-status-success-solid/10 text-status-success-text dark:text-status-success-dark-text"
                : item.status === "unsupported"
                  ? "bg-muted text-muted-foreground"
                  : "bg-destructive/10 text-destructive",
            )}
            key={item.sourceId}
            title={item.detail}
          >
            {source?.displayName ?? item.sourceId}: {item.status}
          </span>
        );
      })}
    </div>
  );
}

function ChatComposer({ page }: { page: ChatPageModel }) {
  const { t } = useI18n(chatTranslations);
  const { broadcast, moderate, startOauth } = page.mutations;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!page.state.message.trim() || broadcast.isPending) return;
    page.state.setBroadcastResult(null);
    broadcast.mutate({ text: page.state.message });
  };
  const error = broadcast.error ?? moderate.error ?? startOauth.error;
  return (
    <form
      className="flex shrink-0 flex-col gap-2 border-t border-border bg-card p-3"
      onSubmit={submit}
    >
      <div className="flex gap-2">
        <Input
          className="w-full"
          maxLength={MAX_CHAT_MESSAGE_LENGTH}
          onChange={(event) => page.state.setMessage(event.target.value)}
          placeholder={t("placeholder")}
          value={page.state.message}
        />
        <Button
          aria-label={t("send")}
          disabled={
            !page.state.message.trim() || broadcast.isPending || page.writableConnectionCount === 0
          }
          type="submit"
        >
          {broadcast.isPending ? (
            <Icons.loader aria-hidden="true" className="animate-spin" />
          ) : (
            <Icons.send aria-hidden="true" />
          )}
          <span className="hidden sm:inline">{t("send")}</span>
        </Button>
      </div>
      <BroadcastResults page={page} />
      {error && <p className="text-xs text-destructive">{error.message}</p>}
    </form>
  );
}

function ChatFeedPanel({ className, page }: { className?: string; page: ChatPageModel }) {
  const { t } = useI18n(chatTranslations);
  return (
    <article
      className={cn(
        "cosmic-panel isolate flex min-h-0 min-w-0 shrink-0 flex-col overflow-hidden",
        className,
      )}
    >
      <CosmicPageHeader
        actions={
          <a
            className="rounded-lg border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-semibold text-milky-paper transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-milky-paper xl:hidden"
            href="#chat-connections"
          >
            {t("connections")}
          </a>
        }
        headingLevel={2}
        title={t("feed")}
        variant="signal"
      />
      <ChatFeed
        capabilitiesForSource={page.capabilitiesForSource}
        emptyLabel={page.stream.connectionError?.detail ?? t("empty")}
        messages={page.stream.messages}
        onModerate={(command) => page.mutations.moderate.mutate(command)}
      />
      <ChatComposer page={page} />
    </article>
  );
}

function ConnectionIdentity({
  className,
  connection,
  locale,
  source,
  sourceState,
}: {
  className?: string;
  connection: ChatProviderConnection;
  locale: "ru" | "en";
  source?: ChatSource;
  sourceState?: "connecting" | "error" | "live" | "offline";
}) {
  const provider = providerMeta[connection.provider];
  return (
    <div className={cn("flex min-w-0 items-center gap-2", className)}>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button aria-label={provider.label} className="shrink-0" size="icon" variant="ghost" />
          }
        >
          <ProviderMark className="size-8" provider={connection.provider} />
        </TooltipTrigger>
        <TooltipContent>{provider.label}</TooltipContent>
      </Tooltip>
      <div className="flex min-w-0 items-center">
        {source ? (
          <a
            className="min-w-0 rounded-sm break-words text-sm font-semibold underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            href={source.sourceUrl}
            rel="noopener noreferrer"
            target="_blank"
          >
            {connection.displayName}
          </a>
        ) : (
          <p className="min-w-0 break-words text-sm font-semibold">{connection.displayName}</p>
        )}
        {source?.enabled !== false && (
          <SourceState
            {...(source ? (sourceState ? { state: sourceState } : {}) : { state: "error" })}
            locale={locale}
          />
        )}
      </div>
    </div>
  );
}

function ConnectionActions({
  connection,
  page,
  source,
  sourceState,
}: {
  connection: ChatProviderConnection;
  page: ChatPageModel;
  source?: ChatSource;
  sourceState?: "connecting" | "error" | "live" | "offline";
}) {
  const { t } = useI18n(chatTranslations);
  const { disconnect, refreshSource, setSourceEnabled } = page.mutations;
  const refreshable = connection.provider === "youtube" || connection.provider === "vk_video";
  const isRefreshing =
    source !== undefined &&
    refreshSource.isPending &&
    refreshSource.variables?.sourceId === source.sourceId;
  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <div className="flex items-center gap-1">
        {refreshable && source?.enabled && (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  aria-label={isRefreshing ? t("checkingStream") : t("checkStream")}
                  disabled={
                    refreshSource.isPending ||
                    sourceState === "live" ||
                    sourceState === "connecting"
                  }
                  onClick={() => refreshSource.mutate({ sourceId: source.sourceId })}
                  size="icon-xs"
                  variant="ghost"
                />
              }
            >
              {isRefreshing ? (
                <Icons.loader aria-hidden="true" className="animate-spin" />
              ) : (
                <Icons.retry aria-hidden="true" />
              )}
            </TooltipTrigger>
            <TooltipContent>{isRefreshing ? t("checkingStream") : t("checkStream")}</TooltipContent>
          </Tooltip>
        )}
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                aria-label={t("disconnectAccount")}
                disabled={disconnect.isPending}
                onClick={() => {
                  disconnect.reset();
                  page.state.setConnectionToDisconnect(connection);
                }}
                size="icon-xs"
                variant="ghost"
              />
            }
          >
            <Icons.removeSource aria-hidden="true" />
          </TooltipTrigger>
          <TooltipContent>{t("disconnectAccount")}</TooltipContent>
        </Tooltip>
      </div>
      {source && (
        <Switch
          aria-label={`${source.enabled ? t("disableSource") : t("enableSource")}: ${connection.displayName}`}
          checked={source.enabled}
          disabled={setSourceEnabled.isPending}
          onCheckedChange={(enabled) =>
            setSourceEnabled.mutate({ enabled, sourceId: source.sourceId })
          }
          size="sm"
        />
      )}
    </div>
  );
}

function ConnectionErrors({ page, source }: { page: ChatPageModel; source?: ChatSource }) {
  if (!source) return null;
  const { refreshSource, setSourceEnabled } = page.mutations;
  return (
    <>
      {refreshSource.isError && refreshSource.variables?.sourceId === source.sourceId && (
        <p className="text-caption text-destructive">{refreshSource.error.message}</p>
      )}
      {setSourceEnabled.isError && setSourceEnabled.variables?.sourceId === source.sourceId && (
        <p role="alert" className="text-caption text-destructive">
          {setSourceEnabled.error.message}
        </p>
      )}
    </>
  );
}

function ConnectionCard({
  connection,
  page,
}: {
  connection: ChatProviderConnection;
  page: ChatPageModel;
}) {
  const { locale } = useI18n(translations);
  const source = page.indexes.sourceByConnection.get(connection.connectionId);
  const sourceState = source ? page.stream.statuses[source.sourceId] : undefined;
  return (
    <article
      className={cn(
        "relative flex shrink-0 flex-col gap-2 overflow-hidden rounded-xl border border-border p-3 transition-colors",
        source?.enabled === false ? "bg-muted/55" : "bg-muted/30",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <ConnectionIdentity
          className="flex-1"
          connection={connection}
          locale={locale}
          source={source}
          sourceState={sourceState}
        />
        <ConnectionActions
          connection={connection}
          page={page}
          source={source}
          sourceState={sourceState}
        />
      </div>
      <ConnectionErrors page={page} source={source} />
    </article>
  );
}

function AvailableProviderButton({
  className,
  page,
  provider,
}: {
  className?: string;
  page: ChatPageModel;
  provider: ChatProviderAvailability;
}) {
  const { t } = useI18n(chatTranslations);
  const meta = providerMeta[provider.provider];
  const oauthProvider =
    provider.provider === "youtube" ||
    provider.provider === "twitch" ||
    provider.provider === "kick" ||
    provider.provider === "vk_video";
  const connectable =
    provider.access !== "unavailable" && (oauthProvider || provider.provider === "boosty");
  const connect = () => {
    if (provider.provider === "boosty") {
      page.state.setBoostyFormOpen(true);
    } else if (oauthProvider) {
      page.mutations.startOauth.mutate({ provider: provider.provider });
    }
  };
  return (
    <Button
      className={cn("justify-start", className)}
      disabled={!connectable || page.mutations.startOauth.isPending}
      onClick={connect}
      title={provider.detail}
      variant="outline"
    >
      <ProviderMark provider={provider.provider} />
      <span className="flex min-w-0 grow flex-col items-start">
        <span>{meta.label}</span>
        {provider.access !== "full" && (
          <span className="max-w-full truncate text-micro font-normal text-muted-foreground">
            {t(provider.access === "read_only" ? "readOnly" : "unavailable")}
          </span>
        )}
      </span>
      <Icons.addSource aria-hidden="true" />
    </Button>
  );
}

function AvailableProviders({ page }: { page: ChatPageModel }) {
  return (
    <div className="flex flex-col gap-2 pt-1">
      {page.state.boostyFormOpen && (
        <BoostyConnectionForm onClose={() => page.state.setBoostyFormOpen(false)} />
      )}
      {page.availability.map((provider) => (
        <AvailableProviderButton
          className="h-auto"
          key={provider.provider}
          page={page}
          provider={provider}
        />
      ))}
    </div>
  );
}

function OverlayBackgroundPicker({ page }: { page: ChatPageModel }) {
  const { t } = useI18n(chatTranslations);
  const options = [
    ["transparent", t("overlayBackgroundTransparent")],
    ["black", t("overlayBackgroundBlack")],
    ["white", t("overlayBackgroundWhite")],
  ] as const;
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="text-xs text-muted-foreground">{t("overlayBackground")}</legend>
      <div className="grid grid-cols-3 gap-1 rounded-lg border border-border bg-muted/40 p-1">
        {options.map(([value, label]) => (
          <Button
            aria-pressed={page.state.overlayBackground === value}
            className="min-w-0"
            key={value}
            onClick={() => {
              page.state.setOverlayBackground(value);
              page.state.setOverlayCopied(false);
            }}
            size="xs"
            type="button"
            variant={page.state.overlayBackground === value ? "secondary" : "ghost"}
          >
            {label}
          </Button>
        ))}
      </div>
    </fieldset>
  );
}

function OverlayFooter({ page }: { page: ChatPageModel }) {
  const { t } = useI18n(chatTranslations);
  if (!page.config) return null;
  return (
    <footer className="flex flex-col gap-2 border-t border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">{t("overlay")}</span>
        <Button
          disabled={page.mutations.rotateOverlay.isPending}
          onClick={() => page.mutations.rotateOverlay.mutate()}
          size="xs"
          variant="ghost"
        >
          <Icons.rotateToken aria-hidden="true" />
          {page.config.hasOverlayToken ? t("rotateOverlay") : t("createOverlay")}
        </Button>
      </div>
      <OverlayBackgroundPicker page={page} />
      {page.configuredOverlayUrl !== null && (
        <Button
          onClick={() => {
            void navigator.clipboard.writeText(page.configuredOverlayUrl ?? "");
            page.state.setOverlayCopied(true);
          }}
          size="xs"
          variant="outline"
        >
          <Icons.copy aria-hidden="true" />
          {page.state.overlayCopied ? t("copied") : t("copy")}
        </Button>
      )}
    </footer>
  );
}

function ConnectionsPanel({ page }: { page: ChatPageModel }) {
  const { t } = useI18n(chatTranslations);
  if (!page.config) return null;
  return (
    <aside
      className="cosmic-panel flex min-h-0 shrink-0 scroll-mt-4 flex-col overflow-hidden xl:order-first"
      id="chat-connections"
    >
      <CosmicPageHeader headingLevel={2} title={t("connections")} variant="beans" />
      <div className="flex min-h-0 grow flex-col gap-2 overflow-y-auto p-3">
        {page.config.connections.length === 0 && (
          <div className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
            {t("noConnections")}
          </div>
        )}
        {page.config.connections.map((connection) => (
          <ConnectionCard connection={connection} key={connection.connectionId} page={page} />
        ))}
        <AvailableProviders page={page} />
      </div>
      <OverlayFooter page={page} />
    </aside>
  );
}

function DisconnectDialog({ page }: { page: ChatPageModel }) {
  const { t } = useI18n(translations);
  const { t: copyT } = useI18n(chatTranslations);
  const connection = page.state.connectionToDisconnect;
  const disconnect = page.mutations.disconnect;
  return (
    <Dialog
      open={connection !== null}
      onOpenChange={(open) => {
        if (!open && !disconnect.isPending) page.state.setConnectionToDisconnect(null);
      }}
    >
      <DialogContent>
        <DialogTitle>{t("chatDisconnectTitle")}</DialogTitle>
        {connection && (
          <DialogDescription>
            {t("chatDisconnectDescription", {
              name: connection.displayName,
              provider: providerMeta[connection.provider].label,
            })}
          </DialogDescription>
        )}
        {disconnect.error && (
          <p role="alert" className="text-sm text-destructive">
            {disconnect.error.message}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button
            disabled={disconnect.isPending}
            onClick={() => page.state.setConnectionToDisconnect(null)}
            variant="outline"
          >
            {t("cancel")}
          </Button>
          <Button
            disabled={disconnect.isPending}
            onClick={() => {
              if (!connection || disconnect.isPending) return;
              disconnect.mutate(
                { connectionId: connection.connectionId },
                { onSuccess: () => page.state.setConnectionToDisconnect(null) },
              );
            }}
            variant="destructive"
          >
            {disconnect.isPending && <Icons.loader aria-hidden="true" className="animate-spin" />}
            {copyT("disconnect")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ChatPage() {
  const page = useChatPageModel();

  if (!page.config) return <ChatLoadingState page={page} />;

  return (
    <section className="flex min-h-0 min-w-0 flex-col gap-3">
      <ChatOauthNotice page={page} />
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain xl:grid xl:grid-cols-[330px_minmax(0,1fr)] xl:grid-rows-[minmax(0,1fr)] xl:overflow-hidden">
        <ChatFeedPanel className="h-[max(24rem,55dvh)] xl:h-auto" page={page} />
        <ConnectionsPanel page={page} />
      </div>
      <DisconnectDialog page={page} />
    </section>
  );
}

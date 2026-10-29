import {
  chatMessageKey,
  type ChatCapability,
  type ChatMessage,
  type ChatModerationCommand,
} from "@streambrew/packages/chat.js";
import { cn } from "@web/lib/utils";
import { useCallback, useLayoutEffect, useRef, useState, type UIEvent } from "react";

import { useTextWithLinks } from "../hooks/use-text-with-links";
import { createTranslations, useI18n } from "../lib/i18n";
import { CosmicArt } from "./cosmic-art";
import { Icons, PlatformIcons } from "./icons";
import { Button } from "./ui/button";

const translations = createTranslations({
  deleteMessage: { en: "Delete message", ru: "Удалить сообщение" },
  timeoutUser: { en: "Time out for 10 minutes", ru: "Тайм-аут на 10 минут" },
  banUser: { en: "Ban author", ru: "Заблокировать автора" },
  unbanUser: { en: "Unban author", ru: "Разблокировать автора" },
  jumpToLatest: {
    en: ({ count }: { count: number }) => `Jump to latest messages (${count} unread)`,
    ru: ({ count }: { count: number }) => `К новым сообщениям (непрочитанных: ${count})`,
  },
});

const providerBorderClass = {
  youtube: "border-l-provider-youtube",
  twitch: "border-l-provider-twitch",
  kick: "border-l-provider-kick",
  boosty: "border-l-provider-boosty",
  vk_video: "border-l-provider-vk-video",
} as const;

const moderationActions = [
  {
    capability: "delete_message",
    label: "deleteMessage",
    Icon: Icons.removeSource,
    command: (message: ChatMessage): ChatModerationCommand => ({
      type: "delete_message",
      sourceId: message.sourceId,
      messageId: message.id,
    }),
  },
  {
    capability: "timeout_user",
    label: "timeoutUser",
    Icon: Icons.timeout,
    command: (message: ChatMessage): ChatModerationCommand => ({
      type: "timeout_user",
      sourceId: message.sourceId,
      providerUserId: message.author.id,
      durationSeconds: 600,
    }),
  },
  {
    capability: "ban_user",
    label: "banUser",
    Icon: Icons.ban,
    command: (message: ChatMessage): ChatModerationCommand => ({
      type: "ban_user",
      sourceId: message.sourceId,
      providerUserId: message.author.id,
    }),
  },
  {
    capability: "unban_user",
    label: "unbanUser",
    Icon: Icons.unban,
    command: (message: ChatMessage): ChatModerationCommand => ({
      type: "unban_user",
      sourceId: message.sourceId,
      providerUserId: message.author.id,
    }),
  },
] as const;

function ModerationActions({
  className,
  message,
  capabilities,
  onModerate,
}: {
  className?: string;
  message: ChatMessage;
  capabilities: readonly ChatCapability[];
  onModerate: (command: ChatModerationCommand) => void;
}) {
  const { t } = useI18n(translations);
  return (
    <div
      className={cn(
        "flex shrink-0 flex-wrap justify-end gap-1 opacity-100 transition-opacity [@media(hover:hover)_and_(pointer:fine)]:opacity-0 group-focus-within/message:opacity-100 group-hover/message:opacity-100",
        className,
      )}
    >
      {moderationActions
        .filter(({ capability }) => capabilities.includes(capability))
        .map(({ capability, label, Icon, command }) => (
          <Button
            aria-label={t(label)}
            key={capability}
            onClick={() => onModerate(command(message))}
            size="icon-touch"
            title={t(label)}
            variant={capability === "ban_user" ? "destructive" : "ghost"}
          >
            <Icon aria-hidden="true" />
          </Button>
        ))}
    </div>
  );
}

function Message({
  className,
  message,
  overlay,
  overlayMessageSurface,
  capabilities,
  onModerate,
}: {
  className?: string;
  message: ChatMessage;
  overlay: boolean;
  overlayMessageSurface: "card" | "transparent";
  capabilities: readonly ChatCapability[];
  onModerate?: (command: ChatModerationCommand) => void;
}) {
  const text = useTextWithLinks(message.text);
  return (
    <article
      className={cn(
        "group/message flex flex-wrap gap-3 border-l-2 py-2 pl-3",
        !overlay && providerBorderClass[message.provider],
        overlay &&
          "max-w-[min(46rem,calc(100vw-2rem))] border-l-0 rounded-xl px-3.5 py-2.5 text-white motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:duration-300",
        overlay &&
          overlayMessageSurface === "card" &&
          "bg-chat-overlay/88 shadow-chat-overlay backdrop-blur-md",
        className,
      )}
    >
      <img
        alt=""
        className={cn("mt-0.5 shrink-0", overlay ? "size-[18px]" : "size-3.5")}
        src={PlatformIcons[message.provider]}
      />
      <p
        className={cn(
          "min-w-0 flex-1 leading-relaxed wrap-anywhere",
          overlay ? "text-overlay-message text-shadow-overlay" : "text-sm",
        )}
      >
        <strong className={cn("pr-2 font-semibold", overlay && "text-white")}>
          {message.author.displayName}
        </strong>
        <span className={overlay ? "text-white/90" : "text-muted-foreground"}>
          {text.map((part, index) =>
            part.type === "url" ? (
              <a
                className="break-all underline decoration-current/40 underline-offset-2"
                href={part.href}
                key={`${part.href}-${index}`}
                rel="noreferrer noopener"
                target="_blank"
              >
                {part.text}
              </a>
            ) : (
              <span key={index}>{part.value}</span>
            ),
          )}
        </span>
      </p>
      {!overlay && onModerate && (
        <ModerationActions
          className="w-full pointer-fine:w-auto"
          message={message}
          capabilities={capabilities}
          onModerate={onModerate}
        />
      )}
    </article>
  );
}

function useChatFeedScroll(messages: ChatMessage[], overlay: boolean) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const previousKeysRef = useRef<ReadonlySet<string>>(new Set());
  const nearBottomRef = useRef(true);
  const [unread, setUnread] = useState(0);

  const scrollToBottom = useCallback(() => {
    nearBottomRef.current = true;
    viewportRef.current?.scrollTo({
      top: viewportRef.current.scrollHeight,
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
    });
    setUnread(0);
  }, []);

  useLayoutEffect(() => {
    const previousKeys = previousKeysRef.current;
    const keys = new Set(messages.map(chatMessageKey));
    previousKeysRef.current = keys;

    if (keys.size === 0) {
      nearBottomRef.current = true;
      setUnread(0);
      return;
    }

    if (previousKeys.size === 0) {
      viewportRef.current?.scrollTo({
        top: viewportRef.current.scrollHeight,
        behavior: "instant",
      });
      setUnread(0);
      return;
    }

    const arrivals = [...keys].filter((key) => !previousKeys.has(key)).length;
    if (arrivals === 0) return;

    if (nearBottomRef.current || overlay) {
      scrollToBottom();
    } else {
      setUnread((count) => count + arrivals);
    }
  }, [messages, overlay, scrollToBottom]);

  const onScroll = (event: UIEvent<HTMLDivElement>) => {
    const target = event.currentTarget;
    nearBottomRef.current = target.scrollHeight - target.scrollTop - target.clientHeight < 80;
    if (nearBottomRef.current) setUnread(0);
  };
  return { viewportRef, scrollToBottom, onScroll, unread };
}

export function ChatFeed({
  messages,
  overlay = false,
  overlayMessageSurface = "card",
  emptyLabel,
  capabilitiesForSource = () => [],
  onModerate,
}: {
  messages: ChatMessage[];
  overlay?: boolean;
  overlayMessageSurface?: "card" | "transparent";
  emptyLabel: string;
  capabilitiesForSource?: (sourceId: ChatMessage["sourceId"]) => readonly ChatCapability[];
  onModerate?: (command: ChatModerationCommand) => void;
}) {
  const { t } = useI18n(translations);
  const { viewportRef, scrollToBottom, onScroll, unread } = useChatFeedScroll(messages, overlay);

  return (
    <div className="relative flex min-h-0 grow flex-col">
      <div
        aria-live={overlay ? "polite" : undefined}
        className={cn(
          "flex min-h-0 grow flex-col gap-1 overflow-y-auto",
          overlay
            ? "pointer-events-none p-[clamp(1rem,2.5vw,2rem)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            : "p-4",
        )}
        onScroll={onScroll}
        ref={viewportRef}
      >
        {messages.length === 0 && !overlay ? (
          <div className="grid grow place-items-center text-sm text-muted-foreground">
            <div className="flex max-w-sm flex-col items-center gap-3 text-center">
              <CosmicArt variant="orbit" className="w-36 text-primary/40 opacity-65" />
              <p className="leading-relaxed">{emptyLabel}</p>
            </div>
          </div>
        ) : messages.length > 0 ? (
          <div
            className={cn(overlay ? "mt-auto flex w-full flex-col items-start gap-2" : "contents")}
          >
            {messages.map((message) => (
              <Message
                className={overlay ? "w-fit" : undefined}
                key={chatMessageKey(message)}
                message={message}
                overlay={overlay}
                overlayMessageSurface={overlayMessageSurface}
                capabilities={capabilitiesForSource(message.sourceId)}
                onModerate={onModerate}
              />
            ))}
          </div>
        ) : null}
      </div>
      {!overlay && unread > 0 && (
        <Button
          aria-label={t("jumpToLatest", { count: unread })}
          className="absolute right-4 bottom-4"
          onClick={scrollToBottom}
          size="sm"
        >
          <Icons.unread aria-hidden="true" />
          {unread}
        </Button>
      )}
    </div>
  );
}

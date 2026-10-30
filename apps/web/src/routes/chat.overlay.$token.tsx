import { createFileRoute } from "@tanstack/react-router";
import { ChatFeed } from "@web/components/chat-feed";
import { useChatServiceStream } from "@web/hooks/use-chat-service-stream";
import { ChatOverlaySearchSchema } from "@web/lib/chat-overlay";
import { createTranslations, createTranslator, useI18n } from "@web/lib/i18n";
import { cn } from "@web/lib/utils";

const translations = createTranslations({
  chatOverlay: {
    en: "Chat overlay",
    ru: "Оверлей чата",
  },
  waitingForChat: {
    en: "Waiting for chat…",
    ru: "Ждём сообщений чата…",
  },
});

export const Route = createFileRoute("/chat/overlay/$token")({
  component: () => (
    <div className="fixed -inset-px [&>*]:h-full">
      <ChatOverlay />
    </div>
  ),
  validateSearch: ChatOverlaySearchSchema,
  // The overlay token is a credential in the path: keep it out of caches, indexes, and referrers.
  headers: () => ({
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
    "X-Robots-Tag": "noindex, nofollow",
  }),
  head: ({ match }) => ({
    meta: [
      {
        title: `${createTranslator(match.context.locale, translations)("chatOverlay")} · StreamBrew`,
      },
      { content: "no-referrer", name: "referrer" },
      { content: "noindex, nofollow", name: "robots" },
    ],
    styles: [
      {
        children:
          "html,body{width:100%;height:100%;margin:0;overflow:hidden;background:transparent!important;background-image:none!important}",
      },
    ],
  }),
});

function ChatOverlay() {
  const { token } = Route.useParams();
  const { background } = Route.useSearch();
  const { t } = useI18n(translations);
  // Connection problems are not drawn: the overlay is composited onto the broadcast.
  const { messages } = useChatServiceStream("overlay", token);

  return (
    <main
      className={cn(
        "flex min-w-0 overflow-hidden font-sans text-white",
        background === "black"
          ? "bg-black"
          : background === "white"
            ? "bg-white"
            : "bg-transparent",
      )}
    >
      <ChatFeed
        emptyLabel={t("waitingForChat")}
        messages={messages}
        overlay
        overlayMessageSurface={background === "black" ? "transparent" : "card"}
      />
    </main>
  );
}

import { ChatFeed } from "./chat-feed";
import { chatFeedMessages } from "./chat-feed.fixtures";

function OverlayPreview({
  className,
  messageSurface = "card",
}: {
  className: string;
  messageSurface?: "card" | "transparent";
}) {
  return (
    <div className={`flex min-h-0 overflow-hidden ${className}`}>
      <ChatFeed
        emptyLabel="Ожидаем сообщения…"
        messages={chatFeedMessages}
        overlay
        overlayMessageSurface={messageSurface}
      />
    </div>
  );
}

export default {
  title: "Оверлей",
};

export function LightBackground() {
  return <OverlayPreview className="bg-white" />;
}
LightBackground.meta = { width: "xsmall" };

export function TransparentBackground() {
  return (
    <div
      className="min-h-0 overflow-hidden [&>*]:h-full"
      style={{
        backgroundColor: "var(--input)",
        backgroundImage:
          "linear-gradient(45deg,var(--muted) 25%,transparent 25%),linear-gradient(-45deg,var(--muted) 25%,transparent 25%),linear-gradient(45deg,transparent 75%,var(--muted) 75%),linear-gradient(-45deg,transparent 75%,var(--muted) 75%)",
        backgroundPosition: "0 0,0 12px,12px -12px,-12px 0",
        backgroundSize: "24px 24px",
      }}
    >
      <OverlayPreview className="bg-transparent" />
    </div>
  );
}
TransparentBackground.meta = { width: "xsmall" };

export function DarkBackground() {
  return <OverlayPreview className="bg-black" messageSurface="transparent" />;
}
DarkBackground.meta = { width: "xsmall" };

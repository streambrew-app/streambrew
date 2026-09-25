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
    <div className="overlay-preview-checkerboard min-h-0 overflow-hidden [&>*]:h-full">
      <OverlayPreview className="bg-transparent" />
    </div>
  );
}
TransparentBackground.meta = { width: "xsmall" };

export function DarkBackground() {
  return <OverlayPreview className="bg-black" messageSurface="transparent" />;
}
DarkBackground.meta = { width: "xsmall" };

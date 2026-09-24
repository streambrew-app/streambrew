import { ChatFeed } from "./chat-feed";
import { chatFeedMessages } from "./chat-feed.fixtures";

export default {
  title: "Мультичат",
};

export function EditorFeed() {
  return (
    <div className="flex h-full min-h-0 bg-background p-4 text-foreground">
      <section className="cosmic-panel flex h-full min-h-0 w-full max-w-3xl flex-col overflow-hidden">
        <ChatFeed
          capabilitiesForSource={() => ["delete_message", "timeout_user", "ban_user"]}
          emptyLabel="Сообщения появятся здесь, когда подключённый канал выйдет в эфир."
          messages={chatFeedMessages}
          onModerate={() => undefined}
        />
      </section>
    </div>
  );
}
EditorFeed.meta = { width: "large" };

export function EmptyEditorFeed() {
  return (
    <div className="flex h-full min-h-0 bg-background p-4 text-foreground">
      <section className="cosmic-panel flex h-full min-h-0 w-full max-w-3xl flex-col overflow-hidden">
        <ChatFeed
          emptyLabel="Сообщения появятся здесь, когда подключённый канал выйдет в эфир."
          messages={[]}
        />
      </section>
    </div>
  );
}
EmptyEditorFeed.meta = { width: "large" };

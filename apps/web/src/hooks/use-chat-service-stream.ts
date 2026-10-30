import {
  chatMessageKey,
  type ChatConnectionErrorCode,
  type ChatMessage,
  type ChatSourceState,
  type ChatStreamEvent,
} from "@streambrew/packages/chat.js";
import { useApi } from "@web/lib/trpc";
import { useEffect, useReducer } from "react";

const reconnectInitialDelayMs = 1_000;
const reconnectMaxDelayMs = 30_000;
/** A subscription that lived this long was healthy, so its end restarts the backoff. */
const reconnectStableAfterMs = 30_000;

type StreamState = Readonly<{
  messages: ChatMessage[];
  statuses: Record<string, ChatSourceState>;
  /** Presentation layers translate the code; the stream never carries display text. */
  connectionError: ChatConnectionErrorCode | null;
}>;

type StreamAction =
  | Readonly<{ type: "reset" }>
  | Readonly<{ type: "connected" }>
  | Readonly<{ type: "transport failed"; code: ChatConnectionErrorCode }>
  | Readonly<{ type: "message removed"; sourceId: string; messageId: string }>
  | Readonly<{ type: "event"; event: ChatStreamEvent }>;

type SubscriptionFailure = Readonly<{ data?: Readonly<{ code?: string }> | null }>;

type StreamObserver = Readonly<{
  onStarted: () => void;
  onData: (event: ChatStreamEvent) => void;
  onConnectionStateChange: (connection: Readonly<{ state: string; error: unknown }>) => void;
  onError: (error: SubscriptionFailure) => void;
  onComplete: () => void;
}>;

const initialState: StreamState = { messages: [], statuses: {}, connectionError: null };

function reducer(state: StreamState, action: StreamAction): StreamState {
  if (action.type === "reset") {
    return initialState;
  }
  if (action.type === "connected") {
    return state.connectionError === null ? state : { ...state, connectionError: null };
  }
  if (action.type === "transport failed") {
    return { ...state, connectionError: action.code };
  }
  if (action.type === "message removed") {
    return {
      ...state,
      messages: state.messages.filter(
        (message) => !(message.sourceId === action.sourceId && message.id === action.messageId),
      ),
    };
  }
  const event = action.event;
  if (event.type === "connection_error") {
    return { ...state, connectionError: event.error.code };
  }
  if (event.type === "state") {
    return { ...state, statuses: { ...state.statuses, [event.sourceId]: event.state } };
  }
  if (event.type === "message_deleted") {
    return {
      ...state,
      messages: state.messages.filter(
        (message) => !(message.sourceId === event.sourceId && message.id === event.messageId),
      ),
    };
  }

  const key = chatMessageKey(event.message);
  const messages = state.messages.filter((message) => chatMessageKey(message) !== key);
  const insertion = messages.findIndex(
    (message) => message.occurredAt.getTime() > event.message.occurredAt.getTime(),
  );
  const sorted =
    insertion === -1
      ? [...messages, event.message]
      : [...messages.slice(0, insertion), event.message, ...messages.slice(insertion)];
  return {
    ...state,
    messages: sorted.slice(-500),
    statuses: { ...state.statuses, [event.message.sourceId]: "live" },
  };
}

function failureCode(
  error: SubscriptionFailure | undefined,
  mode: "editor" | "overlay",
): ChatConnectionErrorCode {
  const code = error?.data?.code;
  if (code === "UNAUTHORIZED") return "unauthorized";
  if (code === "NOT_FOUND" && mode === "overlay") return "overlay_not_found";
  return "transport_unavailable";
}

/**
 * Follows the streamer's live chat. When the subscription stops while the consumer is still
 * mounted, for example because the chat service restarted, it reports a connection error and
 * resubscribes with bounded exponential backoff, except for a revoked overlay link. Received
 * messages are kept across reconnects.
 */
export function useChatServiceStream(mode: "editor" | "overlay" = "editor", overlayToken?: string) {
  const { trpcClient } = useApi();
  const [state, dispatch] = useReducer(reducer, initialState);

  useEffect(() => {
    dispatch({ type: "reset" });
    const open =
      mode === "editor"
        ? (observer: StreamObserver) => trpcClient.chat.stream.subscribe(undefined, observer)
        : overlayToken === undefined
          ? null
          : (observer: StreamObserver) =>
              trpcClient.chat.overlayStream.subscribe({ token: overlayToken }, observer);
    if (open === null) {
      return;
    }
    let disposed = false;
    let attempt = 0;
    let retryTimer: ReturnType<typeof globalThis.setTimeout> | undefined;
    let subscription: Readonly<{ unsubscribe: () => void }> | undefined;

    const subscribe = () => {
      const startedAt = Date.now();
      let ended = false;
      const end = (error?: SubscriptionFailure) => {
        // Unsubscribing during cleanup also completes the observer; that is not a failure.
        if (disposed || ended) return;
        ended = true;
        const code = failureCode(error, mode);
        dispatch({ type: "transport failed", code });
        // A rotated overlay token never becomes valid again; OBS must load the new link.
        if (code === "overlay_not_found") return;
        if (Date.now() - startedAt >= reconnectStableAfterMs) attempt = 0;
        const delay = Math.min(reconnectInitialDelayMs * 2 ** attempt, reconnectMaxDelayMs);
        attempt += 1;
        retryTimer = globalThis.setTimeout(subscribe, delay);
      };
      subscription = open({
        onStarted: () => dispatch({ type: "connected" }),
        onData: (event) => dispatch({ type: "event", event }),
        onConnectionStateChange: ({ state, error }) => {
          // The transport retries interrupted connections itself; surface the gap meanwhile.
          if (state === "connecting" && error !== null) {
            dispatch({ type: "transport failed", code: "transport_unavailable" });
          }
        },
        onError: (error) => end(error),
        onComplete: () => end(),
      });
    };

    subscribe();
    return () => {
      disposed = true;
      globalThis.clearTimeout(retryTimer);
      subscription?.unsubscribe();
    };
  }, [mode, overlayToken, trpcClient]);

  return {
    ...state,
    removeMessage(sourceId: string, messageId: string) {
      dispatch({ type: "message removed", sourceId, messageId });
    },
  };
}

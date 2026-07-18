import { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "../types";

export interface ChatBubble {
  id: number;
  kind: "user" | "assistant" | "error";
  text: string;
  /** Set on a user turn whose response failed — kept visible, but left out of
   * the context sent for future turns (and of any role-alternation Claude
   * requires) since it was never actually answered. */
  excludeFromHistory?: boolean;
}

/** Rebuilds the API-facing history from whatever bubbles are still visible,
 * so deleting a message or clearing history automatically keeps future
 * requests in sync with what the user sees. */
function toHistory(bubbles: ChatBubble[]): ChatMessage[] {
  const history: ChatMessage[] = [];
  for (const b of bubbles) {
    if (b.kind === "error" || b.excludeFromHistory) continue;
    history.push({ role: b.kind, content: b.text });
  }
  return history;
}

/** Chat state and streaming wiring for the assistant panel. Registers the
 * IPC listeners exactly once (they're process-wide event subscriptions). */
export function useChat() {
  const [bubbles, setBubbles] = useState<ChatBubble[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);

  const bubblesRef = useRef<ChatBubble[]>([]);
  useEffect(() => {
    bubblesRef.current = bubbles;
  }, [bubbles]);

  const streamingIdRef = useRef<number | null>(null);
  const streamingTextRef = useRef("");
  const nextId = useRef(0);

  function setStreaming(id: number | null): void {
    streamingIdRef.current = id;
    setIsStreaming(id != null);
  }

  useEffect(() => {
    window.api.chat.onDelta((text) => {
      const id = streamingIdRef.current;
      if (id == null) return;
      streamingTextRef.current += text;
      const full = streamingTextRef.current;
      setBubbles((prev) => prev.map((b) => (b.id === id ? { ...b, text: full } : b)));
    });

    window.api.chat.onDone((full) => {
      const id = streamingIdRef.current;
      if (id == null) return;
      const finalText = full || streamingTextRef.current;
      setBubbles((prev) => prev.map((b) => (b.id === id ? { ...b, text: finalText } : b)));
      streamingTextRef.current = "";
      setStreaming(null);
    });

    window.api.chat.onError((message) => {
      const id = streamingIdRef.current;
      if (id != null) {
        setBubbles((prev) => {
          const idx = prev.findIndex((b) => b.id === id);
          const updated = prev.map((b) =>
            b.id === id ? { ...b, kind: "error" as const, text: message } : b
          );
          const prior = updated[idx - 1];
          if (prior && prior.kind === "user") {
            updated[idx - 1] = { ...prior, excludeFromHistory: true };
          }
          return updated;
        });
        streamingTextRef.current = "";
        setStreaming(null);
      } else {
        setBubbles((prev) => [...prev, { id: nextId.current++, kind: "error", text: message }]);
      }
    });
  }, []);

  function send(text: string): void {
    if (!text.trim() || isStreaming) return;

    const userBubble: ChatBubble = { id: nextId.current++, kind: "user", text };
    const historyToSend = toHistory([...bubblesRef.current, userBubble]);

    const streamId = nextId.current++;
    streamingTextRef.current = "";
    setBubbles((prev) => [...prev, userBubble, { id: streamId, kind: "assistant", text: "…" }]);
    setStreaming(streamId);

    window.api.chat.send(historyToSend);
  }

  function deleteMessage(id: number): void {
    if (streamingIdRef.current === id) return;
    setBubbles((prev) => prev.filter((b) => b.id !== id));
  }

  function clearHistory(): void {
    if (isStreaming) return;
    setBubbles([]);
  }

  return { bubbles, isStreaming, send, deleteMessage, clearHistory };
}

import { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "../types";

export interface ChatBubble {
  id: number;
  kind: "user" | "assistant" | "error";
  text: string;
}

/** Chat state and streaming wiring for the assistant panel. Registers the
 * IPC listeners exactly once (they're process-wide event subscriptions). */
export function useChat() {
  const [bubbles, setBubbles] = useState<ChatBubble[]>([]);
  const historyRef = useRef<ChatMessage[]>([]);
  const streamingIdRef = useRef<number | null>(null);
  const streamingTextRef = useRef("");
  const nextId = useRef(0);

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
      historyRef.current = [...historyRef.current, { role: "assistant", content: finalText }];
      streamingIdRef.current = null;
      streamingTextRef.current = "";
    });

    window.api.chat.onError((message) => {
      const id = streamingIdRef.current;
      if (id != null) {
        setBubbles((prev) =>
          prev.map((b) => (b.id === id ? { ...b, kind: "error", text: message } : b))
        );
        streamingIdRef.current = null;
        streamingTextRef.current = "";
        const last = historyRef.current[historyRef.current.length - 1];
        if (last?.role === "user") historyRef.current = historyRef.current.slice(0, -1);
      } else {
        setBubbles((prev) => [...prev, { id: nextId.current++, kind: "error", text: message }]);
      }
    });
  }, []);

  function send(text: string): void {
    if (!text.trim() || streamingIdRef.current != null) return;

    setBubbles((prev) => [...prev, { id: nextId.current++, kind: "user", text }]);
    historyRef.current = [...historyRef.current, { role: "user", content: text }];

    const streamId = nextId.current++;
    streamingIdRef.current = streamId;
    streamingTextRef.current = "";
    setBubbles((prev) => [...prev, { id: streamId, kind: "assistant", text: "…" }]);

    window.api.chat.send(historyRef.current);
  }

  return { bubbles, send };
}

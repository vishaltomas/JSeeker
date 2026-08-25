import { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "../types";

/** One thing the assistant did while answering — read a page, wrote a
 * document. Kept on the bubble after the turn finishes rather than cleared:
 * "where did that resume go?" is a question the user asks later, and the
 * answer is right here. */
export interface ChatToolNote {
  name: string;
  detail: string;
  status: "start" | "done" | "error";
  message?: string;
  /** Where a tool that wrote a document put it — see agents/toolDefs.ts. */
  path?: string;
}

export interface ChatBubble {
  id: number;
  kind: "user" | "assistant" | "error";
  text: string;
  /** Set on a user turn whose response failed — kept visible, but left out of
   * the context sent for future turns (and of any role-alternation Claude
   * requires) since it was never actually answered. */
  excludeFromHistory?: boolean;
  /** Tool calls made while producing this reply, in order. */
  tools?: ChatToolNote[];
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
 * IPC listeners exactly once (they're process-wide event subscriptions).
 *
 * `onTool` is called for every tool the assistant reports, so a host that
 * cares what it did — the editor's dock, which has to re-read the workspace
 * once a document has been written into it — can react without reaching into
 * the bubbles. Read from a ref so the listeners keep working after a re-render
 * hands us a new closure. */
export function useChat(onTool?: (activity: ChatToolNote) => void) {
  const [bubbles, setBubbles] = useState<ChatBubble[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);

  const onToolRef = useRef(onTool);
  onToolRef.current = onTool;

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

    // A `start` adds a line; the matching `done`/`error` updates it in place,
    // so a tool that is still running and one that finished are the same row
    // in the list rather than two.
    window.api.chat.onTool((activity) => {
      onToolRef.current?.(activity);
      const id = streamingIdRef.current;
      if (id == null) return;
      setBubbles((prev) =>
        prev.map((b) => {
          if (b.id !== id) return b;
          const tools = b.tools ?? [];
          if (activity.status === "start") return { ...b, tools: [...tools, activity] };

          let last = -1;
          for (let i = tools.length - 1; i >= 0; i--) {
            if (tools[i].name === activity.name && tools[i].status === "start") {
              last = i;
              break;
            }
          }
          if (last < 0) return { ...b, tools: [...tools, activity] };

          const updated = [...tools];
          updated[last] = { ...updated[last], ...activity };
          return { ...b, tools: updated };
        })
      );
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

  /** `context` is what the reply should be grounded in — the document open in
   * the editor. Passed per-send rather than held here because it changes with
   * every keystroke in the editor, and only the turn being sent needs it. */
  function send(text: string, context?: string): void {
    if (!text.trim() || isStreaming) return;

    const userBubble: ChatBubble = { id: nextId.current++, kind: "user", text };
    const historyToSend = toHistory([...bubblesRef.current, userBubble]);

    const streamId = nextId.current++;
    streamingTextRef.current = "";
    setBubbles((prev) => [...prev, userBubble, { id: streamId, kind: "assistant", text: "…" }]);
    setStreaming(streamId);

    window.api.chat.send(historyToSend, context);
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

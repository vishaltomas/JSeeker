import { useEffect, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { Send, Trash2, X } from "lucide-react";
import { useChat } from "../hooks/useChat";
import type { ChatBubble } from "../hooks/useChat";
import { btnPrimary, cx, iconBtn } from "../ui";

interface ChatPanelProps {
  open: boolean;
}

function rowClass(kind: ChatBubble["kind"]): string {
  if (kind === "user") return "group flex max-w-[85%] flex-row-reverse items-end gap-1 self-end";
  if (kind === "error") return "group flex max-w-full items-end gap-1 self-stretch";
  return "group flex max-w-[85%] items-end gap-1 self-start";
}

function bubbleClass(kind: ChatBubble["kind"]): string {
  const base =
    "min-w-0 whitespace-pre-wrap break-words rounded-xl px-[11px] py-2 text-[13px] leading-[1.45]";
  if (kind === "user") return cx(base, "rounded-br-[4px] bg-accent text-white");
  if (kind === "error")
    return cx(base, "border border-danger-border bg-danger-bg text-danger-text");
  return cx(base, "rounded-bl-[4px] bg-surface-3 text-ink");
}

export function ChatPanel({ open }: ChatPanelProps) {
  const { bubbles, isStreaming, send, deleteMessage, clearHistory } = useChat();
  const [input, setInput] = useState("");
  const messagesRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = messagesRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [bubbles]);

  function submit(e: FormEvent): void {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    send(text);
    setInput("");
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>): void {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      e.currentTarget.form?.requestSubmit();
    }
  }

  return (
    <aside
      className={cx(
        "flex min-h-0 w-[340px] flex-shrink-0 flex-col border-l border-line bg-surface-2",
        !open && "hidden"
      )}
    >
      <div className="flex items-center justify-between border-b border-line px-3.5 py-3 text-sm font-semibold text-ink">
        <span>Assistant</span>
        <button
          type="button"
          className={iconBtn}
          title="Clear chat history"
          aria-label="Clear chat history"
          disabled={isStreaming || bubbles.length === 0}
          onClick={clearHistory}
        >
          <Trash2 size={16} />
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto p-3.5" ref={messagesRef}>
        {bubbles.map((b) => (
          <div key={b.id} className={rowClass(b.kind)}>
            <div className={bubbleClass(b.kind)}>{b.text}</div>
            <button
              type="button"
              className="flex flex-shrink-0 cursor-pointer items-center justify-center rounded-md p-1 text-ink-faint opacity-0 transition-opacity duration-150 group-hover:opacity-100 hover:bg-surface-3 hover:text-danger-text"
              title="Delete message"
              aria-label="Delete message"
              onClick={() => deleteMessage(b.id)}
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>

      <form className="flex items-end gap-2 border-t border-line p-3" onSubmit={submit}>
        <textarea
          className="flex-1 resize-none rounded-lg border border-line-input bg-surface-0 px-2.5 py-2 font-sans text-[13px] text-ink focus:border-accent focus:outline-none"
          rows={2}
          placeholder="Ask for help with this application…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <button
          type="submit"
          className={cx(btnPrimary, "flex flex-shrink-0 items-center justify-center px-3 py-2")}
          disabled={isStreaming}
          aria-label="Send message"
          title="Send"
        >
          <Send size={16} />
        </button>
      </form>
    </aside>
  );
}

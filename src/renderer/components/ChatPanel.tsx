import { useEffect, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { AlertCircle, Check, Globe, Loader2, Mic, Plus, Trash2, X } from "lucide-react";
import { useChat } from "../hooks/useChat";
import type { ChatBubble, ChatToolNote } from "../hooks/useChat";
import { Markdown } from "./Markdown";
import { cx } from "../ui";

interface ChatPanelProps {
  open: boolean;
}

function rowClass(kind: ChatBubble["kind"]): string {
  if (kind === "user") return "group flex max-w-[85%] flex-row-reverse items-end gap-1 self-end";
  if (kind === "error") return "group flex max-w-full items-end gap-1 self-stretch";
  return "group flex max-w-[85%] items-end gap-1 self-start";
}

/**
 * Both roles sit on muted surfaces a step or two above the panel
 * (`bg-surface-1`) rather than on saturated gradients — long markdown answers
 * are much easier to read on a near-neutral ground. The two are told apart by
 * one step of lightness plus their side of the column, not by hue.
 */
function bubbleClass(kind: ChatBubble["kind"]): string {
  const base =
    "min-w-0 break-words rounded-[22px] border px-4 py-2.5 text-[13px] leading-[1.45] text-ink shadow-sm";
  if (kind === "user")
    return cx(base, "whitespace-pre-wrap border-line bg-surface-3");
  if (kind === "error")
    return cx(
      "min-w-0 whitespace-pre-wrap break-words rounded-xl px-[11px] py-2 text-[13px] leading-[1.45]",
      "border border-danger-border bg-danger-bg text-danger-text"
    );
  // assistant — rendered as markdown, which brings its own block layout, so no
  // whitespace-pre-wrap here (it would double up with paragraphs and lists)
  return cx(base, "border-line-subtle bg-surface-2");
}

/**
 * What the assistant did while answering — one line per tool call.
 *
 * Shown above the reply and kept there after the turn: reading a posting takes
 * seconds with nothing to show for it, and "wrote resume-2.resb" is the answer
 * to a question the user asks later. A spinner while it runs, a tick when it
 * lands, and a muted warning if the tool failed — the model is told about the
 * failure and carries on, so it isn't the turn that broke.
 */
function ToolNotes({ notes }: { notes: ChatToolNote[] }) {
  return (
    <div className="flex flex-col gap-1 px-1 pb-1">
      {notes.map((note, i) => (
        <div
          key={`${note.name}-${i}`}
          className={cx(
            "flex items-center gap-1.5 text-[11.5px] leading-tight",
            note.status === "error" ? "text-danger-text" : "text-ink-faint"
          )}
          title={note.message}
        >
          {note.status === "start" ? (
            <Loader2 size={11} className="flex-shrink-0 animate-spin" />
          ) : note.status === "error" ? (
            <AlertCircle size={11} className="flex-shrink-0" />
          ) : (
            <Check size={11} className="flex-shrink-0" />
          )}
          <span className="truncate">{note.detail}</span>
        </div>
      ))}
    </div>
  );
}

function TypingDots() {
  return (
    <div className="flex items-center gap-1 rounded-full border border-line-subtle bg-surface-2 px-3.5 py-2.5 shadow-sm">
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-faint [animation-delay:-0.3s]" />
      <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-ink-muted [animation-delay:-0.15s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-faint" />
    </div>
  );
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

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>): void {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      e.currentTarget.form?.requestSubmit();
    }
  }

  const lastBubble = bubbles[bubbles.length - 1];
  const showTypingDots = isStreaming && lastBubble?.kind === "assistant" && lastBubble.text === "…";

  return (
    <div className={cx("flex min-h-0 flex-1 flex-col bg-surface-1", !open && "hidden")}>
      <div className="flex flex-shrink-0 items-center justify-between border-b border-line px-3.5 py-3 text-sm font-semibold text-ink">
        <span>Assistant</span>
        <button
          type="button"
          className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full text-ink-faint hover:bg-surface-3 hover:text-danger-text disabled:cursor-not-allowed disabled:opacity-40"
          title="Clear chat history"
          aria-label="Clear chat history"
          disabled={isStreaming || bubbles.length === 0}
          onClick={clearHistory}
        >
          <Trash2 size={15} />
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto p-3.5" ref={messagesRef}>
        {bubbles.length === 0 && (
          <div className={rowClass("assistant")}>
            <div className={bubbleClass("assistant")}>Hi, I am your assistant — how can I help you today?</div>
          </div>
        )}
        {bubbles.map((b, i) => {
          const isLast = i === bubbles.length - 1;
          const showDots = showTypingDots && isLast;
          return (
            <div key={b.id} className={rowClass(b.kind)}>
              {/* Column so tool notes can sit above the bubble while the
                  delete button stays beside the pair. */}
              <div className="flex min-w-0 flex-col items-stretch">
                {b.tools?.length ? <ToolNotes notes={b.tools} /> : null}
                {showDots ? (
                  <TypingDots />
                ) : (
                  <div className={bubbleClass(b.kind)}>
                    {b.kind === "assistant" ? <Markdown text={b.text} /> : b.text}
                  </div>
                )}
              </div>
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
          );
        })}
      </div>

      <form className="flex items-center gap-2 border-t border-line p-3" onSubmit={submit}>
        <div className="flex flex-1 items-center gap-1.5 rounded-full bg-[#e9e9ec] px-3 py-2">
          <button
            type="button"
            disabled
            title="Attachments (coming soon)"
            className="flex h-6 w-6 flex-shrink-0 cursor-not-allowed items-center justify-center rounded-full text-purple-800/60"
          >
            <Plus size={18} />
          </button>
          <input
            className="min-w-0 flex-1 bg-transparent text-[13px] text-[#1f2328] placeholder:text-[#8a8f98] focus:outline-none"
            placeholder="Message"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
          />
          <button
            type="button"
            disabled
            title="Web search (coming soon)"
            className="flex h-6 w-6 flex-shrink-0 cursor-not-allowed items-center justify-center rounded-full text-purple-800/60"
          >
            <Globe size={16} />
          </button>
          <button
            type="button"
            disabled
            title="Voice input (coming soon)"
            className="flex h-6 w-6 flex-shrink-0 cursor-not-allowed items-center justify-center rounded-full text-purple-800/60"
          >
            <Mic size={16} />
          </button>
        </div>
      </form>
    </div>
  );
}

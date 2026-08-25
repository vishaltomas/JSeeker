import { useEffect, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { AlertCircle, Check, Loader2, PanelRightClose, SendHorizontal, Trash2, X } from "lucide-react";
import { useChat } from "../../hooks/useChat";
import type { ChatBubble, ChatToolNote } from "../../hooks/useChat";
import { Markdown } from "../Markdown";
import { cx } from "../../ui";

interface ChatDockProps {
  /** Name of the document open in the editor, for the header and the prompts. */
  documentName: string;
  /** Its source, sent as context so "this resume" means the one on screen. */
  source: string;
  /** The assistant wrote a document into the workspace — the file list and the
   * editor are both out of date until the caller re-reads them. */
  onDocumentsChanged: (writtenPath?: string) => void;
  onClose: () => void;
}

/** The two things this dock exists for, one click away. Deliberately phrased
 * as a person would ask rather than as commands — the model reads them as
 * ordinary turns, and the user can edit one before sending it. */
const STARTERS = [
  "Tailor this resume to a posting I'll paste in",
  "Write a cover letter to go with this",
  "Tighten the bullets — same facts, fewer words",
];

function rowClass(kind: ChatBubble["kind"]): string {
  if (kind === "user") return "group flex max-w-[92%] flex-row-reverse items-end gap-1 self-end";
  if (kind === "error") return "group flex max-w-full items-end gap-1 self-stretch";
  return "group flex max-w-[92%] items-end gap-1 self-start";
}

/**
 * Both roles sit on muted surfaces a step or two above the dock
 * (`bg-surface-1`) rather than on saturated gradients — long markdown answers
 * are much easier to read on a near-neutral ground. The two are told apart by
 * one step of lightness plus their side of the column, not by hue.
 */
function bubbleClass(kind: ChatBubble["kind"]): string {
  const base =
    "min-w-0 break-words rounded-2xl border px-3 py-2 text-[12.5px] leading-[1.45] text-ink shadow-sm";
  if (kind === "user") return cx(base, "whitespace-pre-wrap border-line bg-surface-3");
  if (kind === "error")
    return cx(
      "min-w-0 whitespace-pre-wrap break-words rounded-lg px-2.5 py-2 text-[12px] leading-[1.45]",
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
            "flex items-center gap-1.5 text-[11px] leading-tight",
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
    <div className="flex items-center gap-1 rounded-full border border-line-subtle bg-surface-2 px-3 py-2 shadow-sm">
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-faint [animation-delay:-0.3s]" />
      <span className="h-2 w-2 animate-bounce rounded-full bg-ink-muted [animation-delay:-0.15s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-faint" />
    </div>
  );
}

/**
 * The assistant, docked beside the editor.
 *
 * It is the same conversation the extension has on a job posting — same
 * provider, same tools — with one difference that is the point of putting it
 * here: the open document rides along as context, so "shorten the summary"
 * refers to the resume on screen, and `write_resume` / `write_cover_letter`
 * land in the workspace two panes to the left rather than in the chat.
 */
export function ChatDock({ documentName, source, onDocumentsChanged, onClose }: ChatDockProps) {
  const { bubbles, isStreaming, send, deleteMessage, clearHistory } = useChat(
    // A written document is only real once the editor can see it, and the
    // workspace listing is the editor's view of the folder.
    (activity) => {
      if (activity.status !== "done") return;
      if (activity.name === "write_resume" || activity.name === "write_cover_letter") {
        onDocumentsChanged(activity.path);
      }
    }
  );
  const [input, setInput] = useState("");
  const messagesRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = messagesRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [bubbles]);

  /** The open document, labelled, so the model knows what it is being shown.
   * Empty when nothing is open — a chat with no document is still a useful
   * chat, it just has nothing to point at. */
  function context(): string | undefined {
    if (!documentName || !source.trim()) return undefined;
    return [
      `The document open in the user's resume editor is \`${documentName}\`.`,
      "It is written in .resb, this application's resume language:",
      "",
      source.trim(),
    ].join("\n");
  }

  function ask(text: string): void {
    const trimmed = text.trim();
    if (!trimmed) return;
    send(trimmed, context());
    setInput("");
  }

  function submit(e: FormEvent): void {
    e.preventDefault();
    ask(input);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>): void {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      ask(input);
    }
  }

  const lastBubble = bubbles[bubbles.length - 1];
  const showTypingDots = isStreaming && lastBubble?.kind === "assistant" && lastBubble.text === "…";

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-surface-1">
      <div className="flex h-[30px] flex-shrink-0 items-center gap-1 border-b border-line-subtle bg-surface-1 px-2 text-[11px] uppercase tracking-wide text-ink-muted">
        <span className="px-1">Assistant</span>
        <span className="flex-1" />
        <button
          type="button"
          className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-md text-ink-faint hover:bg-surface-3 hover:text-danger-text disabled:cursor-not-allowed disabled:opacity-40"
          title="Clear this conversation"
          aria-label="Clear this conversation"
          disabled={isStreaming || bubbles.length === 0}
          onClick={clearHistory}
        >
          <Trash2 size={13} />
        </button>
        <button
          type="button"
          className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-md text-ink-faint hover:bg-surface-3 hover:text-white"
          title="Hide the assistant"
          aria-label="Hide the assistant"
          onClick={onClose}
        >
          <PanelRightClose size={13} />
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-2.5" ref={messagesRef}>
        {bubbles.length === 0 ? (
          <>
            <div className={rowClass("assistant")}>
              <div className={bubbleClass("assistant")}>
                {documentName
                  ? `I can see ${documentName}. Ask me to write, tailor or reword it — or to draft a cover letter to go with it.`
                  : "Open a document and I can rewrite it, or ask me to write you a new resume or cover letter from your profile."}
              </div>
            </div>
            <div className="flex flex-col gap-1.5 px-1 pt-1">
              {STARTERS.map((starter) => (
                <button
                  key={starter}
                  type="button"
                  className="cursor-pointer rounded-lg border border-line-subtle bg-surface-2 px-2.5 py-1.5 text-left text-[12px] leading-snug text-ink-soft hover:border-accent hover:text-ink"
                  onClick={() => setInput(starter)}
                >
                  {starter}
                </button>
              ))}
            </div>
          </>
        ) : (
          bubbles.map((b, i) => {
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
                  <X size={13} />
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* What the assistant is being shown, said out loud: it is about to read
          the document, and that is worth knowing before you type. */}
      {documentName && (
        <p
          className="flex-shrink-0 truncate border-t border-line-subtle px-3 py-1 text-[10.5px] text-ink-faint"
          title={`${documentName} is sent with each message so the assistant can see what you're editing`}
        >
          Reading {documentName}
        </p>
      )}

      <form className="flex items-end gap-1.5 border-t border-line p-2" onSubmit={submit}>
        <textarea
          rows={2}
          className="min-w-0 flex-1 resize-none rounded-lg border border-line-input bg-surface-0 px-2.5 py-1.5 text-[12.5px] leading-snug text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
          placeholder="Ask about this document…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <button
          type="submit"
          disabled={isStreaming || !input.trim()}
          title="Send (Enter)"
          aria-label="Send"
          className="flex h-8 w-8 flex-shrink-0 cursor-pointer items-center justify-center rounded-lg bg-accent text-white enabled:hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
        >
          <SendHorizontal size={15} />
        </button>
      </form>
    </div>
  );
}

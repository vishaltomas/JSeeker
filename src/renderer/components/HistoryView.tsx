import { useState } from "react";
import { ChevronRight, Download, Trash2 } from "lucide-react";
import { useSessions } from "../hooks/useSessions";
import type { ApplicationSession, SessionArtifact, Store } from "../types";
import { btn, btnPrimary, cx, viewSection } from "../ui";

interface HistoryViewProps {
  visible: boolean;
  store: Store;
  persist: (next: Store) => void;
}

const ARTIFACT_LABEL: Record<SessionArtifact["kind"], string> = {
  "cover-letter": "Cover letter",
  resume: "Tailored resume",
};

function when(at: number): string {
  const date = new Date(at);
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  return sameDay
    ? date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : date.toLocaleDateString([], { month: "short", day: "numeric" });
}

/** Saves an artifact to disk. The document is already in memory, so this is
 * the browser's own download path rather than a round trip through the main
 * process — the same mechanism the extension panel uses. */
function downloadArtifact(session: ApplicationSession, artifact: SessionArtifact): void {
  const slug = session.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  const blob = new Blob([artifact.content], { type: "text/markdown;charset=utf-8" });
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = `${artifact.kind}${slug ? "-" + slug : ""}.md`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(href), 10000);
}

/** The answers this application produced, offered for the profile. Nothing is
 * written until the user accepts it — the profile is theirs, and a local
 * model's reading of a conversation is a suggestion, not a fact. */
function Answers({
  session,
  store,
  persist,
  onSaved,
}: {
  session: ApplicationSession;
  store: Store;
  persist: (next: Store) => void;
  onSaved: (keys: string[]) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const unsaved = session.answers.filter((a) => !a.saved);

  async function findAnswers(): Promise<void> {
    setBusy(true);
    setStatus("Reading the conversation…");
    const { answers, error } = await window.api.sessions.extractAnswers(session.id);
    setBusy(false);
    if (error) {
      setStatus(error);
      return;
    }
    setStatus(answers.length ? "" : "Nothing here worth keeping yet.");
    onSaved([]); // refresh the list so the new answers show
  }

  function save(key: string, value: string): void {
    persist({ ...store, data: { ...store.data, [key]: value } });
    onSaved([key]);
  }

  function saveAll(): void {
    const additions = Object.fromEntries(unsaved.map((a) => [a.key, a.value]));
    persist({ ...store, data: { ...store.data, ...additions } });
    onSaved(unsaved.map((a) => a.key));
  }

  return (
    <div className="mt-3 rounded-lg border border-line-subtle bg-surface-1 p-3">
      <div className="mb-2 flex items-center gap-2">
        <h4 className="text-[13px] font-semibold">Answers worth keeping</h4>
        <span className="flex-1" />
        {unsaved.length > 1 && (
          <button className={btn} onClick={saveAll}>
            Add all to profile
          </button>
        )}
        <button className={btn} disabled={busy} onClick={findAnswers}>
          {session.answers.length ? "Look again" : "Find answers"}
        </button>
      </div>

      {status && <p className="text-xs text-ink-faint">{status}</p>}

      {session.answers.length === 0 && !status && (
        <p className="text-xs text-ink-faint">
          Pull the reusable facts out of this conversation — a notice period, a work-authorization
          answer, how you described a project — so the next application can use them.
        </p>
      )}

      <ul className="mt-1">
        {session.answers.map((answer) => (
          <li
            className="flex items-baseline gap-3 border-b border-line-subtle py-2 last:border-b-0"
            key={answer.key}
          >
            <div className="min-w-0 flex-1">
              <p className="text-xs text-ink-muted">{answer.key}</p>
              <p className="text-[13px] text-ink">{answer.value}</p>
            </div>
            {answer.saved ? (
              <span className="flex-shrink-0 text-[11px] text-status-ok">in profile</span>
            ) : (
              <button
                className={cx(btn, "flex-shrink-0")}
                onClick={() => save(answer.key, answer.value)}
              >
                Add to profile
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function SessionRow({
  session,
  store,
  persist,
  onRemove,
  onAnswersSaved,
}: {
  session: ApplicationSession;
  store: Store;
  persist: (next: Store) => void;
  onRemove: (id: string) => void;
  onAnswersSaved: (id: string, keys: string[]) => void;
}) {
  const [open, setOpen] = useState(false);

  // The processes this session went through, in the order a person would
  // describe them: what was drafted, then how much was discussed.
  const steps: string[] = [];
  for (const kind of ["cover-letter", "resume"] as const) {
    const count = session.artifacts.filter((a) => a.kind === kind).length;
    if (count) steps.push(`${ARTIFACT_LABEL[kind]}${count > 1 ? ` ×${count}` : ""}`);
  }
  const turns = session.messages.filter((m) => m.role === "user").length;
  if (turns) steps.push(`${turns} question${turns === 1 ? "" : "s"}`);
  const pending = session.answers.filter((a) => !a.saved).length;

  return (
    <li className="border-b border-line-subtle last:border-b-0">
      <div
        className="-mx-2 flex cursor-pointer items-baseline gap-3 rounded-md px-2 py-3 hover:bg-surface-3"
        onClick={() => setOpen(!open)}
      >
        <ChevronRight
          className={cx("relative top-[3px] flex-shrink-0 transition-transform", open && "rotate-90")}
          size={14}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] text-ink">{session.title}</p>
          <p className="mt-0.5 truncate text-xs text-ink-faint">
            <button
              className="cursor-pointer hover:text-accent-light hover:underline"
              onClick={(e) => {
                e.stopPropagation(); // opening the posting isn't expanding the row
                void window.api.openExternal(session.url);
              }}
              title={session.url}
            >
              {session.host}
            </button>
            {steps.length > 0 && ` · ${steps.join(" · ")}`}
          </p>
        </div>
        {pending > 0 && (
          <span className="flex-shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-[11px] text-white">
            {pending} to save
          </span>
        )}
        <span className="flex-shrink-0 text-[11px] text-ink-faint">{when(session.updatedAt)}</span>
      </div>

      {open && (
        <div className="pb-3 pl-6">
          {session.artifacts.length > 0 && (
            <ul className="mb-1">
              {session.artifacts.map((artifact) => (
                <li className="flex items-center gap-2 py-1" key={artifact.id}>
                  <span className="text-[13px] text-ink">{ARTIFACT_LABEL[artifact.kind]}</span>
                  <span className="text-[11px] text-ink-faint">{when(artifact.createdAt)}</span>
                  <button
                    className={cx(btn, "flex items-center gap-1.5")}
                    onClick={() => downloadArtifact(session, artifact)}
                  >
                    <Download size={13} />
                    Download
                  </button>
                </li>
              ))}
            </ul>
          )}

          <Answers
            onSaved={(keys) => onAnswersSaved(session.id, keys)}
            persist={persist}
            session={session}
            store={store}
          />

          {session.messages.length > 0 && (
            <details className="mt-3">
              <summary className="cursor-pointer text-[11px] text-ink-faint hover:text-accent-light">
                Show the conversation ({session.messages.length} messages)
              </summary>
              <div className="mt-2 max-h-72 overflow-y-auto rounded-md bg-surface-0 p-2.5">
                {session.messages.map((message, index) => (
                  <p
                    className={cx(
                      "mb-2 whitespace-pre-wrap text-xs last:mb-0",
                      message.role === "user" ? "text-ink" : "text-ink-soft"
                    )}
                    key={index}
                  >
                    <span className="text-ink-faint">
                      {message.role === "user" ? "You: " : "JSeeker: "}
                    </span>
                    {message.content}
                  </p>
                ))}
              </div>
            </details>
          )}

          <button
            className={cx(btn, "mt-3 flex items-center gap-1.5")}
            onClick={() => onRemove(session.id)}
          >
            <Trash2 size={13} />
            Delete this session
          </button>
        </div>
      )}
    </li>
  );
}

/** Every job applied for through the extension: what was drafted, what was
 * asked, and the answers worth carrying into the next application. */
export function HistoryView({ visible, store, persist }: HistoryViewProps) {
  const { sessions, loaded, refresh, remove, markAnswersSaved } = useSessions(visible);

  async function handleAnswersSaved(id: string, keys: string[]): Promise<void> {
    if (keys.length) await markAnswersSaved(id, keys);
    else await refresh();
  }

  return (
    <section className={viewSection(visible)}>
      <div className="flex items-center gap-3 border-b border-line-subtle px-6 py-4">
        <div>
          <h1 className="text-xl font-bold">History</h1>
          <p className="mt-0.5 text-xs text-ink-faint">
            Jobs you've worked on through the extension, and what each one produced.
          </p>
        </div>
        <span className="flex-1" />
        <button className={btnPrimary} onClick={() => void refresh()}>
          Refresh
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-7 py-4">
        {loaded && sessions.length === 0 ? (
          <p className="max-w-lg text-[13px] text-ink-faint">
            Nothing yet. Open the extension panel on a job posting and ask it something, or draft a
            cover letter — each posting you work on becomes a session here, with its documents and
            the answers worth adding to your profile.
          </p>
        ) : (
          <ul className="max-w-3xl">
            {sessions.map((session) => (
              <SessionRow
                key={session.id}
                onAnswersSaved={handleAnswersSaved}
                onRemove={(id) => void remove(id)}
                persist={persist}
                session={session}
                store={store}
              />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

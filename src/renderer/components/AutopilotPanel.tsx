import { useEffect, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { Check, Loader2, Play, Square, X } from "lucide-react";
import type { AutopilotStage, AutopilotTask } from "../hooks/useAutopilot";
import { btn, btnPrimary, cx } from "../ui";

interface AutopilotPanelProps {
  active: boolean;
  stage: AutopilotStage;
  tasks: AutopilotTask[];
  canStart: boolean;
  onStart: () => void;
  onStop: () => void;
  onApprove: () => void;
  onSkip: () => void;
  onSubmitAnswer: (text: string) => void;
  onSkipAnswer: () => void;
}

const STAGE_LABEL: Record<AutopilotStage, string> = {
  idle: "Idle — click Start to begin",
  running: "Working…",
  "awaiting-approval": "Waiting for your OK",
  "awaiting-answer": "Waiting for your answer",
  blocked: "Blocked",
  done: "Done",
  error: "Error",
  stopped: "Stopped",
};

const STAGE_DOT: Record<AutopilotStage, string> = {
  idle: "bg-ink-faint",
  running: "bg-status-ok",
  "awaiting-approval": "bg-status-warn",
  "awaiting-answer": "bg-status-warn",
  blocked: "bg-status-error",
  done: "bg-status-ok",
  error: "bg-status-error",
  stopped: "bg-ink-faint",
};

const TASK_DOT: Record<AutopilotTask["kind"], string> = {
  fill: "bg-ink-faint",
  click: "bg-accent-light",
  confirm: "bg-status-warn",
  question: "bg-status-warn",
  blocked: "bg-status-error",
  done: "bg-status-ok",
  error: "bg-status-error",
  info: "bg-ink-faint",
};

const RUNNING_STAGES: AutopilotStage[] = ["running", "awaiting-approval", "awaiting-answer"];

/** Small inline text-input form for answering a "question" task — owns its
 * own draft text so typing doesn't re-render the whole task list. */
function AnswerForm({ onSubmit, onSkip }: { onSubmit: (text: string) => void; onSkip: () => void }) {
  const [value, setValue] = useState("");

  function submit(e: FormEvent): void {
    e.preventDefault();
    const text = value.trim();
    if (!text) return;
    onSubmit(text);
    setValue("");
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>): void {
    if (e.key === "Enter") submit(e);
  }

  return (
    <form className="mt-1.5 flex gap-1.5" onSubmit={submit}>
      <input
        autoFocus
        className="min-w-0 flex-1 rounded-md border border-line-input bg-surface-0 px-2 py-1 text-[12.5px] text-ink focus:border-accent focus:outline-none"
        placeholder="Your answer…"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
      />
      <button type="submit" className={cx(btnPrimary, "flex-shrink-0 px-2 py-1 text-[12px]")}>
        <Check size={12} className="mr-1 inline-block" />
        Save
      </button>
      <button type="button" className={cx(btn, "flex-shrink-0 px-2 py-1 text-[12px]")} onClick={onSkip}>
        <X size={12} className="mr-1 inline-block" />
        Skip
      </button>
    </form>
  );
}

export function AutopilotPanel({
  active,
  stage,
  tasks,
  canStart,
  onStart,
  onStop,
  onApprove,
  onSkip,
  onSubmitAnswer,
  onSkipAnswer,
}: AutopilotPanelProps) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const isRunning = RUNNING_STAGES.includes(stage);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [tasks]);

  return (
    <div className={cx("flex min-h-0 flex-1 flex-col", !active && "hidden")}>
      <div className="flex items-center gap-2 border-b border-line px-3.5 py-3 text-[13px]">
        <span className={cx("h-2 w-2 flex-shrink-0 rounded-full", STAGE_DOT[stage])} />
        <span className="flex-1 truncate text-ink">{STAGE_LABEL[stage]}</span>
        {stage === "running" && <Loader2 size={14} className="flex-shrink-0 animate-spin text-ink-muted" />}
        {isRunning ? (
          <button type="button" className={btn} onClick={onStop}>
            <Square size={13} className="mr-1 inline-block" />
            Stop
          </button>
        ) : (
          <button type="button" className={btnPrimary} disabled={!canStart} onClick={onStart}>
            <Play size={13} className="mr-1 inline-block" />
            Start
          </button>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-3.5" ref={listRef}>
        {tasks.length === 0 && (
          <p className="text-xs text-ink-faint">
            Auto-pilot fills the page, then decides what to click next — it will always
            stop and ask before submitting anything, and before answering a question it
            can't find in your profile.
          </p>
        )}
        {tasks.map((t) => (
          <div key={t.id} className="flex items-start gap-2 text-[12.5px] leading-[1.45] text-ink-soft">
            <span className={cx("mt-[5px] h-1.5 w-1.5 flex-shrink-0 rounded-full", TASK_DOT[t.kind])} />
            <div className="min-w-0 flex-1">
              <span>{t.text}</span>
              {t.pendingApproval && (
                <div className="mt-1.5 flex gap-1.5">
                  <button
                    type="button"
                    className={cx(btnPrimary, "px-2 py-1 text-[12px]")}
                    onClick={onApprove}
                  >
                    <Check size={12} className="mr-1 inline-block" />
                    Approve
                  </button>
                  <button type="button" className={cx(btn, "px-2 py-1 text-[12px]")} onClick={onSkip}>
                    <X size={12} className="mr-1 inline-block" />
                    Skip
                  </button>
                </div>
              )}
              {t.pendingQuestion && <AnswerForm onSubmit={onSubmitAnswer} onSkip={onSkipAnswer} />}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

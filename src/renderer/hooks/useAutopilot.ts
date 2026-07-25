import { useRef, useState } from "react";
import type { RefObject } from "react";
import type { AgentAction, AutopilotSnapshot, FieldDescriptor, WebviewElement } from "../types";
import {
  buildClickableSnapshotScript,
  buildClickScript,
  buildCollectUnfilledScript,
  buildPageTextScript,
} from "../autofill/agentScript";
import { buildApplyMappingScript } from "../autofill/script";

export type AutopilotStage =
  | "idle"
  | "running"
  | "awaiting-approval"
  | "awaiting-answer"
  | "blocked"
  | "done"
  | "error"
  | "stopped";

export interface AutopilotTask {
  id: number;
  kind: "fill" | "click" | "confirm" | "question" | "blocked" | "done" | "error" | "info";
  text: string;
  pendingApproval?: boolean;
  pendingQuestion?: boolean;
  timestamp: number;
}

const MAX_STEPS = 15;
const MAX_QUESTIONS_PER_STEP = 5;
const SETTLE_TIMEOUT_MS = 4000;
const SETTLE_DEBOUNCE_MS = 500;
const RECENT_STEPS_LIMIT = 8;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Orchestrates the autopilot loop: fill the current page (reusing the
 * existing autofill() from useWebviewAutofill), snapshot its clickable
 * elements, ask the configured model what to do next, and act on it.
 *
 * Safety boundary: a click is only ever auto-executed when neither the
 * model said "confirm_submit" NOR the candidate's code-computed
 * `isSubmitLike` flag is true. Either one routes to an approval gate
 * instead — the DOM-level flag matters because it doesn't depend on the
 * model correctly following the prompt.
 */
export function useAutopilot(
  viewRef: RefObject<WebviewElement | null>,
  autofill: () => Promise<{ filled: number; llmFilled: number }>,
  onSaveAnswer: (question: string, answer: string) => void
) {
  const [stage, setStage] = useState<AutopilotStage>("idle");
  const [tasks, setTasks] = useState<AutopilotTask[]>([]);

  const stageRef = useRef<AutopilotStage>("idle");
  const cancelledRef = useRef(false);
  const nextId = useRef(0);
  const recentRef = useRef<string[]>([]);
  const jobContextRef = useRef("");
  const approvalResolverRef = useRef<((approved: boolean) => void) | null>(null);
  const answerResolverRef = useRef<((answer: string | null) => void) | null>(null);

  function setStageBoth(s: AutopilotStage): void {
    stageRef.current = s;
    setStage(s);
  }

  function log(
    kind: AutopilotTask["kind"],
    text: string,
    opts?: { pendingApproval?: boolean; pendingQuestion?: boolean }
  ): number {
    const id = nextId.current++;
    setTasks((prev) => [
      ...prev,
      {
        id,
        kind,
        text,
        pendingApproval: opts?.pendingApproval,
        pendingQuestion: opts?.pendingQuestion,
        timestamp: Date.now(),
      },
    ]);
    if (kind !== "info" && kind !== "error") {
      recentRef.current = [...recentRef.current, text].slice(-RECENT_STEPS_LIMIT);
    }
    return id;
  }

  function resolvePending(id: number, approved: boolean): void {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === id
          ? { ...t, pendingApproval: false, text: t.text + (approved ? " — approved." : " — skipped.") }
          : t
      )
    );
  }

  function resolveQuestion(id: number, answer: string | null): void {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === id
          ? { ...t, pendingQuestion: false, text: t.text + (answer ? ` → "${answer}"` : " — skipped.") }
          : t
      )
    );
  }

  function waitForApproval(): Promise<boolean> {
    return new Promise((resolve) => {
      approvalResolverRef.current = resolve;
    });
  }

  function waitForAnswer(): Promise<string | null> {
    return new Promise((resolve) => {
      answerResolverRef.current = resolve;
    });
  }

  async function snapshot(): Promise<AutopilotSnapshot | null> {
    const view = viewRef.current;
    if (!view) return null;
    return (await view.executeJavaScript(buildClickableSnapshotScript(), true)) as AutopilotSnapshot;
  }

  async function collectUnfilled(): Promise<FieldDescriptor[]> {
    const view = viewRef.current;
    if (!view) return [];
    return (await view.executeJavaScript(buildCollectUnfilledScript(), true)) as FieldDescriptor[];
  }

  async function applyAnswer(index: number, value: string): Promise<boolean> {
    const view = viewRef.current;
    if (!view) return false;
    const applied = (await view.executeJavaScript(
      buildApplyMappingScript([{ index, value }]),
      true
    )) as number;
    return applied > 0;
  }

  /** Clicks a tagged element (falling back to a text match if the tag went
   * stale — see buildClickScript), then waits for a navigation event (or a
   * timeout, for client-side transitions that don't fire one) plus a fixed
   * debounce so dynamic content has a moment to render before the next
   * snapshot. Returns whether an element was actually found and clicked —
   * callers must check this rather than assume the click landed. */
  async function clickCandidate(index: number, fallbackText?: string): Promise<boolean> {
    const view = viewRef.current;
    if (!view) return false;

    const settled = new Promise<void>((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        view.removeEventListener("did-navigate-in-page", finish);
        view.removeEventListener("did-finish-load", finish);
        resolve();
      };
      view.addEventListener("did-navigate-in-page", finish);
      view.addEventListener("did-finish-load", finish);
      setTimeout(finish, SETTLE_TIMEOUT_MS);
    });

    const clicked = (await view.executeJavaScript(
      buildClickScript(index, fallbackText),
      true
    )) as boolean;
    await settled;
    await wait(SETTLE_DEBOUNCE_MS);
    return clicked;
  }

  async function start(): Promise<void> {
    if (stageRef.current === "running" || stageRef.current === "awaiting-approval" || stageRef.current === "awaiting-answer") {
      return;
    }
    cancelledRef.current = false;
    recentRef.current = [];
    nextId.current = 0;
    setTasks([]);
    setStageBoth("running");
    log("info", "Starting auto-pilot…");

    const firstView = viewRef.current;
    jobContextRef.current = firstView
      ? ((await firstView.executeJavaScript(buildPageTextScript(), true)) as string)
      : "";

    for (let step = 0; step < MAX_STEPS; step++) {
      if (cancelledRef.current) {
        log("info", "Stopped.");
        setStageBoth("stopped");
        return;
      }

      const view = viewRef.current;
      if (!view) {
        log("error", "No page is open.");
        setStageBoth("error");
        return;
      }

      const { filled, llmFilled } = await autofill();
      const total = filled + llmFilled;
      log("fill", `Filled ${total} field${total === 1 ? "" : "s"} on this page.`);

      const needsAnswer = (await collectUnfilled())
        .filter((f) => f.required)
        .slice(0, MAX_QUESTIONS_PER_STEP);

      for (const field of needsAnswer) {
        if (cancelledRef.current) {
          log("info", "Stopped.");
          setStageBoth("stopped");
          return;
        }

        const question = (field.label || field.placeholder || field.ariaLabel || field.name || "this field").trim();
        const id = log("question", `Needs your answer: "${question}"`, { pendingQuestion: true });
        setStageBoth("awaiting-answer");

        const answer = await waitForAnswer();
        resolveQuestion(id, answer);
        setStageBoth("running");

        if (answer && answer.trim()) {
          const applied = await applyAnswer(field.index, answer.trim());
          onSaveAnswer(question, answer.trim());
          log(
            "fill",
            applied
              ? `Saved your answer for "${question}".`
              : `Saved your answer for "${question}", but couldn't find that field on the page anymore.`
          );
        } else {
          log("info", `Skipped "${question}".`);
        }
      }

      const snap = await snapshot();
      if (!snap) {
        log("error", "Lost the page.");
        setStageBoth("error");
        return;
      }

      let action: AgentAction;
      try {
        action = await window.api.planNextAction(snap, recentRef.current, jobContextRef.current);
      } catch (err) {
        log("error", "Assistant error: " + (err instanceof Error ? err.message : String(err)));
        setStageBoth("error");
        return;
      }

      if (cancelledRef.current) {
        log("info", "Stopped.");
        setStageBoth("stopped");
        return;
      }

      if (action.action === "done") {
        log("done", action.note);
        setStageBoth("done");
        return;
      }
      if (action.action === "blocked") {
        log("blocked", action.note);
        setStageBoth("blocked");
        return;
      }

      const candidate = snap.candidates.find((c) => c.index === action.index);
      const submitLike = action.action === "confirm_submit" || candidate?.isSubmitLike === true;
      const label = candidate?.text ? `"${candidate.text}"` : "this element";

      if (submitLike) {
        const id = log("confirm", `Needs your OK to click ${label}. ${action.note}`, { pendingApproval: true });
        setStageBoth("awaiting-approval");

        const approved = await waitForApproval();
        resolvePending(id, approved);

        if (!approved) {
          setStageBoth("stopped");
          return;
        }
        if (!candidate) {
          log("error", "Couldn't find that element anymore.");
          setStageBoth("error");
          return;
        }
        setStageBoth("running");
        const submitClicked = await clickCandidate(candidate.index, candidate.text);
        if (!submitClicked) {
          log("error", `Couldn't click ${label} — the page may have changed. Try it manually.`);
          setStageBoth("error");
          return;
        }
        log("click", `Clicked ${label}.`);
        continue;
      }

      if (!candidate) {
        log("error", "The model referenced an element that no longer exists on the page.");
        setStageBoth("error");
        return;
      }

      const clicked = await clickCandidate(candidate.index, candidate.text);
      if (!clicked) {
        log("error", `Couldn't click ${label} — the page may have changed before the click landed.`);
        setStageBoth("error");
        return;
      }
      log("click", `Clicked ${label}. ${action.note}`);
    }

    log("info", `Stopped after ${MAX_STEPS} steps to avoid an endless loop.`);
    setStageBoth("stopped");
  }

  function stop(): void {
    cancelledRef.current = true;
    if (approvalResolverRef.current) {
      approvalResolverRef.current(false);
      approvalResolverRef.current = null;
    }
    if (answerResolverRef.current) {
      answerResolverRef.current(null);
      answerResolverRef.current = null;
    }
  }

  function approveSubmit(): void {
    approvalResolverRef.current?.(true);
    approvalResolverRef.current = null;
  }

  function skipSubmit(): void {
    approvalResolverRef.current?.(false);
    approvalResolverRef.current = null;
  }

  function submitAnswer(text: string): void {
    answerResolverRef.current?.(text);
    answerResolverRef.current = null;
  }

  function skipAnswer(): void {
    answerResolverRef.current?.(null);
    answerResolverRef.current = null;
  }

  return { stage, tasks, start, stop, approveSubmit, skipSubmit, submitAnswer, skipAnswer };
}

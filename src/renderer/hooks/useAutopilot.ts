import { useRef, useState } from "react";
import type { RefObject } from "react";
import type { AgentAction, AutopilotSnapshot, WebviewElement } from "../types";
import { buildClickableSnapshotScript, buildClickScript } from "../autofill/agentScript";

export type AutopilotStage =
  | "idle"
  | "running"
  | "awaiting-approval"
  | "blocked"
  | "done"
  | "error"
  | "stopped";

export interface AutopilotTask {
  id: number;
  kind: "fill" | "click" | "confirm" | "blocked" | "done" | "error" | "info";
  text: string;
  pendingApproval?: boolean;
  timestamp: number;
}

const MAX_STEPS = 15;
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
  autofill: () => Promise<{ filled: number; llmFilled: number }>
) {
  const [stage, setStage] = useState<AutopilotStage>("idle");
  const [tasks, setTasks] = useState<AutopilotTask[]>([]);

  const stageRef = useRef<AutopilotStage>("idle");
  const cancelledRef = useRef(false);
  const nextId = useRef(0);
  const recentRef = useRef<string[]>([]);
  const approvalResolverRef = useRef<((approved: boolean) => void) | null>(null);

  function setStageBoth(s: AutopilotStage): void {
    stageRef.current = s;
    setStage(s);
  }

  function log(kind: AutopilotTask["kind"], text: string, pendingApproval?: boolean): number {
    const id = nextId.current++;
    setTasks((prev) => [...prev, { id, kind, text, pendingApproval, timestamp: Date.now() }]);
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

  function waitForApproval(): Promise<boolean> {
    return new Promise((resolve) => {
      approvalResolverRef.current = resolve;
    });
  }

  async function snapshot(): Promise<AutopilotSnapshot | null> {
    const view = viewRef.current;
    if (!view) return null;
    return (await view.executeJavaScript(buildClickableSnapshotScript(), true)) as AutopilotSnapshot;
  }

  /** Clicks a tagged element, then waits for a navigation event (or a
   * timeout, for client-side transitions that don't fire one) plus a fixed
   * debounce so dynamic content has a moment to render before the next
   * snapshot. */
  async function clickCandidate(index: number): Promise<void> {
    const view = viewRef.current;
    if (!view) return;

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

    await view.executeJavaScript(buildClickScript(index), true);
    await settled;
    await wait(SETTLE_DEBOUNCE_MS);
  }

  async function start(): Promise<void> {
    if (stageRef.current === "running" || stageRef.current === "awaiting-approval") return;
    cancelledRef.current = false;
    recentRef.current = [];
    nextId.current = 0;
    setTasks([]);
    setStageBoth("running");
    log("info", "Starting auto-pilot…");

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

      const snap = await snapshot();
      if (!snap) {
        log("error", "Lost the page.");
        setStageBoth("error");
        return;
      }

      let action: AgentAction;
      try {
        action = await window.api.planNextAction(snap, recentRef.current);
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
        const id = log("confirm", `Needs your OK to click ${label}. ${action.note}`, true);
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
        log("click", `Clicked ${label}.`);
        await clickCandidate(candidate.index);
        continue;
      }

      if (!candidate) {
        log("error", "The model referenced an element that no longer exists on the page.");
        setStageBoth("error");
        return;
      }

      log("click", `Clicked ${label}. ${action.note}`);
      await clickCandidate(candidate.index);
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
  }

  function approveSubmit(): void {
    approvalResolverRef.current?.(true);
    approvalResolverRef.current = null;
  }

  function skipSubmit(): void {
    approvalResolverRef.current?.(false);
    approvalResolverRef.current = null;
  }

  return { stage, tasks, start, stop, approveSubmit, skipSubmit };
}

import { useState } from "react";
import type { KeyboardEvent } from "react";
import { useWebviewAutofill } from "../hooks/useWebviewAutofill";
import { useAutopilot } from "../hooks/useAutopilot";
import { SidePanel } from "./SidePanel";
import type { SidebarTab } from "./SidePanel";
import type { Store } from "../types";
import { btn, btnPrimary, cx, urlInput, viewSection } from "../ui";

interface MainViewProps {
  visible: boolean;
  store: Store;
  onActiveIdChange: (id: string) => void;
  onSaveProfileAnswer: (question: string, answer: string) => void;
  pendingUrl: string | null;
  onPendingUrlHandled: () => void;
}

export function MainView({
  visible,
  store,
  onActiveIdChange,
  onSaveProfileAnswer,
  pendingUrl,
  onPendingUrlHandled,
}: MainViewProps) {
  const activeProfile = store.profiles.find((p) => p.id === store.activeId) ?? store.profiles[0];

  const {
    viewRef,
    urlInput: url,
    setUrlInput,
    autoFill,
    setAutoFill,
    pageReady,
    hasOpened,
    status,
    openUrl,
    autofill,
  } = useWebviewAutofill(activeProfile, pendingUrl, onPendingUrlHandled);

  const {
    stage: autopilotStage,
    tasks: autopilotTasks,
    start: startAutopilot,
    stop: stopAutopilot,
    approveSubmit,
    skipSubmit,
    submitAnswer,
    skipAnswer,
  } = useAutopilot(viewRef, autofill, onSaveProfileAnswer);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("chat");
  const autopilotRunning =
    autopilotStage === "running" ||
    autopilotStage === "awaiting-approval" ||
    autopilotStage === "awaiting-answer";

  function toggleSidebar(tab: SidebarTab): void {
    if (sidebarOpen && sidebarTab === tab) {
      setSidebarOpen(false);
    } else {
      setSidebarTab(tab);
      setSidebarOpen(true);
    }
  }

  function onUrlKeyDown(e: KeyboardEvent<HTMLInputElement>): void {
    if (e.key === "Enter") openUrl();
  }

  return (
    <section className={viewSection(visible)}>
      <div className="flex items-center gap-2 border-b border-line bg-surface-4 px-3.5 py-2.5">
        <select
          className={cx(urlInput, "max-w-[170px] flex-shrink-0")}
          title="Active profile"
          value={store.activeId}
          onChange={(e) => onActiveIdChange(e.target.value)}
        >
          {store.profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name || "(unnamed)"}
            </option>
          ))}
        </select>
        <input
          className={cx(urlInput, "flex-1")}
          placeholder="Paste a job application link and press Enter…"
          autoComplete="off"
          value={url}
          onChange={(e) => setUrlInput(e.target.value)}
          onKeyDown={onUrlKeyDown}
        />
        <button className={btn} onClick={() => openUrl()}>
          Open
        </button>
        <label
          className="flex cursor-pointer items-center gap-[5px] whitespace-nowrap text-[13px] text-ink-soft"
          title={
            autopilotRunning
              ? "Managed by Auto-pilot while it's running"
              : "Re-fill automatically as the form changes or navigates"
          }
        >
          <input
            type="checkbox"
            checked={autoFill}
            disabled={autopilotRunning}
            onChange={(e) => setAutoFill(e.target.checked)}
          />{" "}
          Auto-refill
        </label>
        <button className={btnPrimary} disabled={!pageReady} onClick={autofill}>
          Autofill
        </button>
        <button className={btn} onClick={() => toggleSidebar("chat")}>
          Chat
        </button>
        <button className={btn} onClick={() => toggleSidebar("autopilot")}>
          Auto-pilot
        </button>
      </div>

      <div className="flex min-h-0 flex-1">
        <main className="relative min-w-0 flex-1 bg-white">
          {!hasOpened && (
            <div className="absolute inset-0 z-[2] flex items-center justify-center bg-surface-0 text-[15px] text-ink-faint">
              Paste an application link above to begin.
            </div>
          )}
          <webview
            ref={viewRef}
            className="h-full w-full border-none"
            src="about:blank"
            allowpopups
            useragent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
          />
        </main>

        <SidePanel
          open={sidebarOpen}
          tab={sidebarTab}
          onTabChange={setSidebarTab}
          autopilotStage={autopilotStage}
          autopilotTasks={autopilotTasks}
          canStartAutopilot={pageReady && !autopilotRunning}
          onStartAutopilot={startAutopilot}
          onStopAutopilot={stopAutopilot}
          onApproveAutopilot={approveSubmit}
          onSkipAutopilot={skipSubmit}
          onSubmitAutopilotAnswer={submitAnswer}
          onSkipAutopilotAnswer={skipAnswer}
        />
      </div>

      <div className="min-h-[26px] border-t border-line bg-surface-2 px-3.5 py-1.5 text-xs text-ink-muted">
        {status}
      </div>
    </section>
  );
}

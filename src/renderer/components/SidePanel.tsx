import type { Dispatch, SetStateAction } from "react";
import { ChatPanel } from "./ChatPanel";
import { AutopilotPanel } from "./AutopilotPanel";
import type { AutopilotStage, AutopilotTask } from "../hooks/useAutopilot";
import { cx } from "../ui";

export type SidebarTab = "chat" | "autopilot";

interface SidePanelProps {
  open: boolean;
  tab: SidebarTab;
  onTabChange: Dispatch<SetStateAction<SidebarTab>>;
  autopilotStage: AutopilotStage;
  autopilotTasks: AutopilotTask[];
  canStartAutopilot: boolean;
  onStartAutopilot: () => void;
  onStopAutopilot: () => void;
  onApproveAutopilot: () => void;
  onSkipAutopilot: () => void;
}

const TAB_LABEL: Record<SidebarTab, string> = { chat: "Chat", autopilot: "Auto-pilot" };

/** Owns the right-hand sidebar shell: a tab strip switching between Chat and
 * Auto-pilot. Both panels stay mounted and are toggled via CSS (like the
 * app's top-level views) so switching tabs doesn't lose chat history or the
 * running task log. */
export function SidePanel({
  open,
  tab,
  onTabChange,
  autopilotStage,
  autopilotTasks,
  canStartAutopilot,
  onStartAutopilot,
  onStopAutopilot,
  onApproveAutopilot,
  onSkipAutopilot,
}: SidePanelProps) {
  return (
    <aside
      className={cx(
        "flex min-h-0 w-[340px] flex-shrink-0 flex-col border-l border-line bg-surface-2",
        !open && "hidden"
      )}
    >
      <div className="flex flex-shrink-0 border-b border-line">
        {(Object.keys(TAB_LABEL) as SidebarTab[]).map((t) => (
          <button
            key={t}
            type="button"
            className={cx(
              "flex-1 cursor-pointer border-b-2 px-3 py-2.5 text-[12.5px] font-medium",
              tab === t ? "border-accent text-ink" : "border-transparent text-ink-muted hover:text-ink"
            )}
            onClick={() => onTabChange(t)}
          >
            {TAB_LABEL[t]}
          </button>
        ))}
      </div>

      <ChatPanel open={tab === "chat"} />
      <AutopilotPanel
        active={tab === "autopilot"}
        stage={autopilotStage}
        tasks={autopilotTasks}
        canStart={canStartAutopilot}
        onStart={onStartAutopilot}
        onStop={onStopAutopilot}
        onApprove={onApproveAutopilot}
        onSkip={onSkipAutopilot}
      />
    </aside>
  );
}

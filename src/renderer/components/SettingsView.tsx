import { useState } from "react";
import type { Store } from "../types";
import { ProfilesPanel } from "./settings/ProfilesPanel";
import { JobSearchPanel } from "./settings/JobSearchPanel";
import { AssistantPanel } from "./settings/AssistantPanel";
import { btn, cx, viewSection } from "../ui";

type Section = "profiles" | "jobsearch" | "assistant";

interface SettingsViewProps {
  visible: boolean;
  store: Store;
  persist: (next: Store) => void;
  onBack: () => void;
}

function navItemClass(active: boolean): string {
  return cx(
    "cursor-pointer rounded-lg px-3 py-2.5 text-left text-[13px]",
    active ? "bg-accent-soft font-semibold text-white" : "text-ink-soft hover:bg-surface-3"
  );
}

export function SettingsView({ visible, store, persist, onBack }: SettingsViewProps) {
  const [section, setSection] = useState<Section>("profiles");

  return (
    <section className={viewSection(visible)}>
      <div className="flex items-center gap-3.5 border-b border-line-subtle px-6 py-4">
        <button className={btn} onClick={onBack}>
          ← Back
        </button>
        <h1 className="text-xl font-bold">Settings</h1>
      </div>

      <div className="flex min-h-0 flex-1">
        <nav className="flex w-[200px] flex-shrink-0 flex-col gap-1 border-r border-line-subtle bg-surface-5 px-2.5 py-3.5">
          <button className={navItemClass(section === "profiles")} onClick={() => setSection("profiles")}>
            Profiles
          </button>
          <button
            className={navItemClass(section === "jobsearch")}
            onClick={() => setSection("jobsearch")}
          >
            Job Search
          </button>
          <button
            className={navItemClass(section === "assistant")}
            onClick={() => setSection("assistant")}
          >
            Assistant
          </button>
        </nav>

        <div className="min-w-0 flex-1 overflow-y-auto px-7 py-6">
          {/* Panels stay mounted and are only hidden via CSS (not conditionally
              rendered) so unsaved edits in one tab survive switching to another. */}
          <div className={cx(section !== "profiles" && "hidden")}>
            <ProfilesPanel store={store} persist={persist} />
          </div>
          <div className={cx(section !== "jobsearch" && "hidden")}>
            <JobSearchPanel store={store} persist={persist} />
          </div>
          <div className={cx(section !== "assistant" && "hidden")}>
            <AssistantPanel store={store} persist={persist} />
          </div>
        </div>
      </div>
    </section>
  );
}

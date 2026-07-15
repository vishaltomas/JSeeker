import { useState } from "react";
import type { Store } from "../types";
import { ProfilesPanel } from "./settings/ProfilesPanel";
import { JobSearchPanel } from "./settings/JobSearchPanel";
import { AssistantPanel } from "./settings/AssistantPanel";

type Section = "profiles" | "jobsearch" | "assistant";

interface SettingsViewProps {
  visible: boolean;
  store: Store;
  persist: (next: Store) => void;
  onBack: () => void;
}

export function SettingsView({ visible, store, persist, onBack }: SettingsViewProps) {
  const [section, setSection] = useState<Section>("profiles");

  return (
    <section className={visible ? "view" : "view hidden"}>
      <div className="settings-head">
        <button className="btn" onClick={onBack}>
          ← Back
        </button>
        <h1>Settings</h1>
      </div>

      <div className="settings-layout">
        <nav className="settings-nav">
          <button
            className={"settings-nav-item" + (section === "profiles" ? " active" : "")}
            onClick={() => setSection("profiles")}
          >
            Profiles
          </button>
          <button
            className={"settings-nav-item" + (section === "jobsearch" ? " active" : "")}
            onClick={() => setSection("jobsearch")}
          >
            Job Search
          </button>
          <button
            className={"settings-nav-item" + (section === "assistant" ? " active" : "")}
            onClick={() => setSection("assistant")}
          >
            Assistant
          </button>
        </nav>

        <div className="settings-content">
          {/* Panels stay mounted and are only hidden via CSS (not conditionally
              rendered) so unsaved edits in one tab survive switching to another. */}
          <div className={section === "profiles" ? "settings-panel" : "settings-panel hidden"}>
            <ProfilesPanel store={store} persist={persist} />
          </div>
          <div className={section === "jobsearch" ? "settings-panel" : "settings-panel hidden"}>
            <JobSearchPanel store={store} persist={persist} />
          </div>
          <div className={section === "assistant" ? "settings-panel" : "settings-panel hidden"}>
            <AssistantPanel store={store} persist={persist} />
          </div>
        </div>
      </div>
    </section>
  );
}

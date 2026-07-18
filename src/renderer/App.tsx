import { useState } from "react";
import { useAppStore } from "./hooks/useAppStore";
import { Header } from "./components/Header";
import { MainView } from "./components/MainView";
import { JobsView } from "./components/JobsView";
import { SettingsView } from "./components/SettingsView";
import { FooterBar } from "./components/FooterBar";

type View = "main" | "jobs" | "settings";

export default function App() {
  const { store, persist, loaded } = useAppStore();
  const [view, setView] = useState<View>("main");
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);

  if (!loaded) return null;

  function openJob(url: string): void {
    setPendingUrl(url);
    setView("main");
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-surface-0 font-sans text-ink">
      <Header onFindJobs={() => setView("jobs")} onOpenSettings={() => setView("settings")} />

      {/* Every view stays mounted and is only hidden via CSS: the <webview> in
          MainView must never unmount, or switching views would reload the page. */}
      <MainView
        visible={view === "main"}
        store={store}
        onActiveIdChange={(id) => persist({ ...store, activeId: id })}
        pendingUrl={pendingUrl}
        onPendingUrlHandled={() => setPendingUrl(null)}
      />
      <JobsView visible={view === "jobs"} onBack={() => setView("main")} onOpenJob={openJob} />
      <SettingsView
        visible={view === "settings"}
        store={store}
        persist={persist}
        onBack={() => setView("main")}
      />

      <FooterBar store={store} />
    </div>
  );
}

import { useState } from "react";
import { useAppStore } from "./hooks/useAppStore";
import { Header } from "./components/Header";
import { MainView } from "./components/MainView";
import { JobsView } from "./components/JobsView";
import { SettingsView } from "./components/SettingsView";
import { FooterBar } from "./components/FooterBar";
import { CreateAccountScreen } from "./components/onboarding/CreateAccountScreen";
import { LoginScreen } from "./components/onboarding/LoginScreen";
import { ResumeOnboarding } from "./components/onboarding/ResumeOnboarding";

type View = "main" | "jobs" | "settings";

export default function App() {
  const { store, persist, loaded } = useAppStore();
  const [view, setView] = useState<View>("main");
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);
  // Not persisted — every launch starts locked again until the password is
  // entered (or, right after creating an account, we already know it's you).
  const [unlocked, setUnlocked] = useState(false);

  if (!loaded) return null;

  if (!store.account) {
    return <CreateAccountScreen onCreated={() => setUnlocked(true)} />;
  }
  if (!unlocked) {
    return <LoginScreen username={store.account.username} onUnlocked={() => setUnlocked(true)} />;
  }
  if (!store.account.onboarded) {
    return <ResumeOnboarding store={store} persist={persist} />;
  }

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
        onSaveProfileAnswer={(question, answer) =>
          persist({
            ...store,
            profiles: store.profiles.map((p) =>
              p.id === store.activeId ? { ...p, data: { ...p.data, [question]: answer } } : p
            ),
          })
        }
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

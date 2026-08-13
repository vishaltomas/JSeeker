import { useState } from "react";
import { useAppStore } from "./hooks/useAppStore";
import { Header } from "./components/Header";
import { ProfileView } from "./components/ProfileView";
import { ChatView } from "./components/ChatView";
import { BuilderView } from "./components/BuilderView";
import { HistoryView } from "./components/HistoryView";
import { SettingsView } from "./components/SettingsView";
import { FooterBar } from "./components/FooterBar";
import { LandingView } from "./components/landing/LandingView";
import { ResumeOnboarding } from "./components/onboarding/ResumeOnboarding";

type View = "home" | "profile" | "chat" | "builder" | "history" | "settings";

export default function App() {
  const { store, persist, loaded } = useAppStore();
  const [view, setView] = useState<View>("home");

  if (!loaded) return null;

  // First run goes straight into onboarding, which opens on its own welcome
  // screen; the landing page takes over once that's done.
  if (!store.onboarded) {
    return <ResumeOnboarding store={store} persist={persist} />;
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-surface-0 font-sans text-ink">
      <Header view={view} onNavigate={setView} onOpenSettings={() => setView("settings")} />

      {/* Every view stays mounted and is only hidden via CSS, so draft edits
          (Profile) and chat history survive switching views. */}
      <LandingView
        visible={view === "home"}
        firstName={store.data.firstName}
        onNavigate={setView}
      />
      <ProfileView visible={view === "profile"} store={store} persist={persist} />
      <ChatView visible={view === "chat"} />
      <BuilderView visible={view === "builder"} store={store} persist={persist} />
      <HistoryView visible={view === "history"} store={store} persist={persist} />
      <SettingsView
        visible={view === "settings"}
        store={store}
        persist={persist}
        onBack={() => setView("profile")}
      />

      <FooterBar store={store} />
    </div>
  );
}

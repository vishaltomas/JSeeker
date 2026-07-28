import { useState } from "react";
import { useAppStore } from "./hooks/useAppStore";
import { Header } from "./components/Header";
import { ResumeView } from "./components/ResumeView";
import { ChatView } from "./components/ChatView";
import { SettingsView } from "./components/SettingsView";
import { FooterBar } from "./components/FooterBar";
import { CreateAccountScreen } from "./components/onboarding/CreateAccountScreen";
import { LoginScreen } from "./components/onboarding/LoginScreen";
import { ResumeOnboarding } from "./components/onboarding/ResumeOnboarding";

type View = "resume" | "chat" | "settings";

export default function App() {
  const { store, persist, loaded, reload } = useAppStore();
  const [view, setView] = useState<View>("resume");
  // Not persisted — every launch starts locked again until the password is
  // entered (or, right after creating an account, we already know it's you).
  const [unlocked, setUnlocked] = useState(false);

  if (!loaded) return null;

  if (!store.account) {
    return (
      <CreateAccountScreen
        onCreated={async () => {
          await reload();
          setUnlocked(true);
        }}
      />
    );
  }
  if (!unlocked) {
    return <LoginScreen username={store.account.username} onUnlocked={() => setUnlocked(true)} />;
  }
  if (!store.account.onboarded) {
    return <ResumeOnboarding store={store} persist={persist} />;
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-surface-0 font-sans text-ink">
      <Header view={view} onNavigate={setView} onOpenSettings={() => setView("settings")} />

      {/* Every view stays mounted and is only hidden via CSS, so draft edits
          (Resume) and chat history survive switching views. */}
      <ResumeView visible={view === "resume"} store={store} persist={persist} />
      <ChatView visible={view === "chat"} />
      <SettingsView
        visible={view === "settings"}
        store={store}
        persist={persist}
        onBack={() => setView("resume")}
      />

      <FooterBar store={store} />
    </div>
  );
}

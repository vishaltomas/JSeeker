import { useState } from "react";
import { useAppStore } from "./hooks/useAppStore";
import { Header } from "./components/Header";
import { ProfileView } from "./components/ProfileView";
import { ChatView } from "./components/ChatView";
import { SettingsView } from "./components/SettingsView";
import { FooterBar } from "./components/FooterBar";
import { ResumeOnboarding } from "./components/onboarding/ResumeOnboarding";
import { WelcomeSplash } from "./components/welcome/WelcomeSplash";

type View = "profile" | "chat" | "settings";

export default function App() {
  const { store, persist, loaded } = useAppStore();
  const [view, setView] = useState<View>("profile");
  const [splashDone, setSplashDone] = useState(false);

  if (!loaded) return null;

  // First run goes straight into onboarding, which opens on its own version
  // of the welcome screen — no point showing two in a row.
  if (!store.onboarded) {
    return <ResumeOnboarding store={store} persist={persist} />;
  }

  if (!splashDone) {
    return (
      <WelcomeSplash
        firstName={store.data.firstName}
        onDone={() => setSplashDone(true)}
      />
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-surface-0 font-sans text-ink">
      <Header view={view} onNavigate={setView} onOpenSettings={() => setView("settings")} />

      {/* Every view stays mounted and is only hidden via CSS, so draft edits
          (Profile) and chat history survive switching views. */}
      <ProfileView visible={view === "profile"} store={store} persist={persist} />
      <ChatView visible={view === "chat"} />
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

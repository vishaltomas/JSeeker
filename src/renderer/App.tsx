import { useState } from "react";
import { useAppStore } from "./hooks/useAppStore";
import { Header } from "./components/Header";
import { ProfileView } from "./components/ProfileView";
import { ChatView } from "./components/ChatView";
import { SettingsView } from "./components/SettingsView";
import { FooterBar } from "./components/FooterBar";
import { ResumeOnboarding } from "./components/onboarding/ResumeOnboarding";

type View = "profile" | "chat" | "settings";

export default function App() {
  const { store, persist, loaded } = useAppStore();
  const [view, setView] = useState<View>("profile");

  if (!loaded) return null;

  if (!store.onboarded) {
    return <ResumeOnboarding store={store} persist={persist} />;
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

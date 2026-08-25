import { useState } from "react";
import { useAppStore } from "./hooks/useAppStore";
import { Header, type View } from "./components/Header";
import { ProfileView } from "./components/ProfileView";
import { BuilderView } from "./components/BuilderView";
import { SettingsView } from "./components/SettingsView";
import { FooterBar } from "./components/FooterBar";
import { ResumeOnboarding } from "./components/onboarding/ResumeOnboarding";

export default function App() {
  const { store, persist, loaded } = useAppStore();
  // The editor is the app: it opens on the document you had open last, with
  // the assistant beside it. Profile is where its content comes from, and is
  // a visit rather than a home.
  const [view, setView] = useState<View>("builder");

  if (!loaded) return null;

  // First run goes straight into onboarding, which opens on its own welcome
  // screen; the editor takes over once that's done.
  if (!store.onboarded) {
    return <ResumeOnboarding store={store} persist={persist} />;
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-surface-0 font-sans text-ink">
      <Header view={view} onNavigate={setView} onOpenSettings={() => setView("settings")} />

      {/* Every view stays mounted and is only hidden via CSS, so draft edits
          (Profile) and the document in the editor survive switching views. */}
      <BuilderView visible={view === "builder"} store={store} persist={persist} />
      <ProfileView visible={view === "profile"} store={store} persist={persist} />
      <SettingsView
        visible={view === "settings"}
        store={store}
        persist={persist}
        onBack={() => setView("builder")}
      />

      <FooterBar store={store} />
    </div>
  );
}

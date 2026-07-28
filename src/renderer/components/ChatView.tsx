import { ChatPanel } from "./ChatPanel";
import { viewSection } from "../ui";

interface ChatViewProps {
  visible: boolean;
}

// Thin top-level host for ChatPanel, which used to live inside MainView's
// sidebar (SidePanel.tsx, removed along with the embedded browser) — it's
// fully independent of that (only talks to window.api.chat.*), so it just
// needed a new home as a peer view instead of a sidebar tab.
export function ChatView({ visible }: ChatViewProps) {
  return (
    <section className={viewSection(visible)}>
      <ChatPanel open={visible} />
    </section>
  );
}

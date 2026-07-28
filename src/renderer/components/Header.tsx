interface HeaderProps {
  view: "resume" | "chat" | "settings";
  onNavigate: (view: "resume" | "chat") => void;
  onOpenSettings: () => void;
}

function navButtonClass(active: boolean): string {
  return (
    "ml-1 rounded-md px-2.5 py-1 text-[13px] [-webkit-app-region:no-drag] " +
    (active ? "bg-surface-3 text-white" : "text-ink-soft hover:bg-surface-3 hover:text-white")
  );
}

export function Header({ view, onNavigate, onOpenSettings }: HeaderProps) {
  return (
    <header className="flex h-10 items-center border-b border-line-subtle bg-surface-1 px-3 [-webkit-app-region:drag]">
      <span className="text-[15px] font-bold text-accent-light">JSeeker</span>
      <button className={navButtonClass(view === "resume")} onClick={() => onNavigate("resume")}>
        Resume
      </button>
      <button className={navButtonClass(view === "chat")} onClick={() => onNavigate("chat")}>
        Chat
      </button>
      <span className="flex-1" />
      <button
        className="flex h-[30px] w-[30px] items-center justify-center rounded-md text-[17px] leading-none text-ink-soft hover:bg-surface-3 hover:text-white [-webkit-app-region:no-drag]"
        title="Settings"
        aria-label="Settings"
        onClick={onOpenSettings}
      >
        ⚙
      </button>
    </header>
  );
}

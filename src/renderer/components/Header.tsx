interface HeaderProps {
  onFindJobs: () => void;
  onOpenSettings: () => void;
}

export function Header({ onFindJobs, onOpenSettings }: HeaderProps) {
  return (
    <header className="menubar">
      <span className="brand">JSeeker</span>
      <button className="menubar-link" onClick={onFindJobs}>
        Find Jobs
      </button>
      <span className="menubar-spacer" />
      <button
        className="icon-btn"
        title="Settings"
        aria-label="Settings"
        onClick={onOpenSettings}
      >
        ⚙
      </button>
    </header>
  );
}

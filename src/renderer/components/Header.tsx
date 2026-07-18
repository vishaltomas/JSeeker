interface HeaderProps {
  onFindJobs: () => void;
  onOpenSettings: () => void;
}

export function Header({ onFindJobs, onOpenSettings }: HeaderProps) {
  return (
    <header className="flex h-10 items-center border-b border-line-subtle bg-surface-1 px-3 [-webkit-app-region:drag]">
      <span className="text-[15px] font-bold text-accent-light">JSeeker</span>
      <button
        className="ml-3.5 rounded-md px-2.5 py-1 text-[13px] text-ink-soft hover:bg-surface-3 hover:text-white [-webkit-app-region:no-drag]"
        onClick={onFindJobs}
      >
        Find Jobs
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

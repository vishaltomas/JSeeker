import { FileText, Settings as SettingsIcon, User } from "lucide-react";
import { cx } from "../ui";

export type View = "builder" | "profile" | "settings";

interface HeaderProps {
  view: View;
  onNavigate: (view: "builder" | "profile") => void;
  onOpenSettings: () => void;
}

/** Right-hand icon button (Settings) — no label, so it stays out of the way
 * of the named sections on the left. */
function iconButtonClass(active: boolean): string {
  return cx(
    "flex h-7 w-7 flex-shrink-0 cursor-pointer items-center justify-center rounded-full [-webkit-app-region:no-drag]",
    active ? "bg-white/20 text-white" : "text-white/75 hover:bg-white/10 hover:text-white"
  );
}

function navButtonClass(active: boolean): string {
  return cx(
    "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium [-webkit-app-region:no-drag]",
    active ? "bg-white/20 text-white" : "text-white/75 hover:bg-white/10 hover:text-white"
  );
}

/** Two destinations: the documents you're writing, and the background they're
 * written from. Everything else the app used to carry has gone — this is a
 * resume and cover letter editor, and Settings is the only other screen. */
export function Header({ view, onNavigate, onOpenSettings }: HeaderProps) {
  return (
    <header className="flex-shrink-0 [-webkit-app-region:drag]">
      <div
        // pr leaves room for the native minimize/maximize/close overlay
        // buttons (~138px on Windows) the OS draws on top of this region —
        // see the titleBarOverlay config in main.ts. pt is kept small so the
        // interactive row sits inside that same top band as the overlay.
        className="flex items-center gap-1.5 pb-7 pl-4 pr-[150px] pt-2 text-white"
        style={{
          background: "linear-gradient(90deg, #2e1065, #6d28d9, #a855f7)",
          clipPath: "polygon(0 0, 100% 0, 100% 100%, 0 65%)",
        }}
      >
        <span className="mr-3 text-[15px] font-bold tracking-wide">JSeeker</span>
        <button
          className={navButtonClass(view === "builder")}
          onClick={() => onNavigate("builder")}
        >
          <FileText size={15} />
          Editor
        </button>
        <button className={navButtonClass(view === "profile")} onClick={() => onNavigate("profile")}>
          <User size={15} />
          Profile
        </button>
        <span className="flex-1" />
        <button
          className={iconButtonClass(view === "settings")}
          title="Settings"
          aria-label="Settings"
          onClick={onOpenSettings}
        >
          <SettingsIcon size={16} />
        </button>
      </div>
    </header>
  );
}

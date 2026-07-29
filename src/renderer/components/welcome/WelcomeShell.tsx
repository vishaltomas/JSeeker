/** Full-window frame for the launch splash and every onboarding stage: the
 * same slanted gradient band as the main Header (minus the nav — there's
 * nothing to navigate to yet), which also gives the frameless window a drag
 * region on these screens, plus a centered content area. */
export function WelcomeShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-surface-0 font-sans text-ink">
      <header className="flex-shrink-0 [-webkit-app-region:drag]">
        <div
          // Title is centered across the full width, well clear of the native
          // window buttons the OS draws over the right ~150px.
          className="flex items-center justify-center pb-7 pt-2 text-white"
          style={{
            background: "linear-gradient(90deg, #2e1065, #6d28d9, #a855f7)",
            clipPath: "polygon(0 0, 100% 0, 100% 100%, 0 65%)",
          }}
        >
          <span className="text-[15px] font-bold tracking-wide">JSeeker</span>
        </div>
      </header>

      {/* `m-auto` rather than `items-center` so a tall review card scrolls
          from its top instead of being clipped. */}
      <main className="flex min-h-0 flex-1 overflow-y-auto p-6">
        <div className="m-auto">{children}</div>
      </main>
    </div>
  );
}

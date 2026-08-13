import { Puzzle, ScanLine, WandSparkles } from "lucide-react";
import type { ReactNode } from "react";

/** "What I can do", shown as three working mock-ups rather than a list of
 * features: a document turning into profile fields, a job posting with the
 * extension's panel open on it, and source compiling into a resume page.
 * Each one loops on the same 6s cycle so the row animates together.
 *
 * Everything here is decorative — the panels carry a short label and the
 * picture does the explaining, so the illustrations are hidden from screen
 * readers behind the text each panel already states. */

/** Shared frame: heading strip, then a fixed-height stage for the graphic so
 * the three panels line up whatever their contents. */
function Panel({
  icon,
  title,
  caption,
  delay,
  children,
}: {
  icon: ReactNode;
  title: string;
  caption: string;
  delay: string;
  children: ReactNode;
}) {
  return (
    <article
      className="land-rise overflow-hidden rounded-2xl border border-line-subtle bg-surface-2"
      style={{ animationDelay: delay }}
    >
      <header className="flex items-center gap-2.5 px-4 pb-3 pt-4">
        <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[#6d28d9] to-[#a855f7] text-white">
          {icon}
        </span>
        <span>
          <span className="block text-[13px] font-semibold text-ink">{title}</span>
          <span className="block text-[11px] text-ink-faint">{caption}</span>
        </span>
      </header>

      <div
        className="relative h-[188px] overflow-hidden border-t border-line-subtle bg-surface-0 px-4 py-4"
        aria-hidden="true"
      >
        {children}
      </div>
    </article>
  );
}

/** Skeleton line of body copy inside a mock-up. */
function Line({ w, className = "" }: { w: string; className?: string }) {
  return <span className={`block h-[5px] rounded-full bg-white/12 ${className}`} style={{ width: w }} />;
}

/** The connector between a "before" and "after" mock-up, with three dots
 * travelling along it. */
function Flow() {
  return (
    <div className="relative flex h-full w-[38px] flex-shrink-0 items-center justify-center">
      <span className="absolute h-px w-full bg-gradient-to-r from-transparent via-[#a855f7]/45 to-transparent" />
      {["0s", "0.5s", "1s"].map((delay) => (
        <span
          key={delay}
          className="cap-flow absolute left-1 h-1.5 w-1.5 rounded-full bg-[#c084fc] shadow-[0_0_8px_rgba(192,132,252,0.9)]"
          style={{ animationDelay: delay }}
        />
      ))}
    </div>
  );
}

/** Resume PDF in, filled-in profile out. */
function ProfileExtraction() {
  const fields = [
    { label: "Name", value: "w-[46px]", delay: "1.2s" },
    { label: "Email", value: "w-[52px]", delay: "1.55s" },
    { label: "Role", value: "w-[38px]", delay: "1.9s" },
  ];

  return (
    <div className="flex h-full items-center">
      {/* The uploaded document, with a reader sweeping down it. */}
      <div className="relative h-[132px] flex-1 overflow-hidden rounded-lg border border-line bg-surface-2 p-2.5">
        <span className="mb-2 inline-block rounded bg-danger-border/40 px-1.5 py-[1px] text-[8px] font-bold tracking-wide text-danger-text">
          PDF
        </span>
        <div className="flex flex-col gap-[7px]">
          <Line w="70%" className="!bg-white/25" />
          <Line w="48%" />
          <Line w="88%" />
          <Line w="80%" />
          <Line w="62%" />
          <Line w="84%" />
        </div>
        <span className="cap-scan absolute inset-x-0 top-0 h-8 bg-gradient-to-b from-transparent via-[#a855f7]/25 to-transparent" />
      </div>

      <Flow />

      {/* The profile it lands in, filling a field at a time. */}
      <div className="h-[132px] flex-1 rounded-lg border border-line bg-surface-2 p-2.5">
        <div className="mb-2.5 flex items-center gap-1.5">
          <span
            className="cap-pop h-5 w-5 rounded-full bg-gradient-to-br from-[#6d28d9] to-[#a855f7]"
            style={{ animationDelay: "0.9s" }}
          />
          <span className="cap-pop" style={{ animationDelay: "0.9s" }}>
            <Line w="42px" className="!bg-white/30" />
          </span>
        </div>

        <div className="flex flex-col gap-1.5">
          {fields.map((field) => (
            <span
              key={field.label}
              className="cap-pop flex items-center justify-between rounded border border-line-subtle bg-surface-0 px-1.5 py-1"
              style={{ animationDelay: field.delay }}
            >
              <span className="text-[8px] text-ink-faint">{field.label}</span>
              <span className={`h-[5px] rounded-full bg-accent-light/70 ${field.value}`} />
            </span>
          ))}
        </div>

        <div className="mt-2 flex gap-1">
          {["2.25s", "2.4s", "2.55s"].map((delay, i) => (
            <span
              key={delay}
              className="cap-pop h-[11px] rounded-full bg-[#a855f7]/25 ring-1 ring-inset ring-[#a855f7]/40"
              style={{ animationDelay: delay, width: [26, 20, 30][i] }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/** A job posting in the browser with the extension's chat panel over it. */
function BrowserExtension() {
  return (
    <div className="relative h-full">
      <div className="flex h-full flex-col overflow-hidden rounded-lg border border-line bg-surface-2">
        {/* Chrome: traffic lights and a URL pill. */}
        <div className="flex flex-shrink-0 items-center gap-1.5 border-b border-line-subtle bg-surface-1 px-2 py-1.5">
          {["#ef4444", "#eab308", "#22c55e"].map((color) => (
            <span key={color} className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
          ))}
          <span className="ml-1 flex h-3.5 flex-1 items-center rounded-full bg-surface-0 px-2 text-[7px] text-ink-faint">
            careers.example.com/apply
          </span>
          <span className="flex h-3.5 w-3.5 items-center justify-center rounded bg-gradient-to-br from-[#6d28d9] to-[#a855f7] text-[7px] font-bold text-white">
            J
          </span>
        </div>

        {/* The posting itself. */}
        <div className="flex flex-1 flex-col gap-[7px] p-2.5">
          <Line w="55%" className="!h-2 !bg-white/25" />
          <Line w="32%" />
          <span className="mt-1 block" />
          <Line w="92%" />
          <Line w="86%" />
          <Line w="94%" />
          <Line w="60%" />
        </div>
      </div>

      {/* The floating panel, sliding up over the page. */}
      <div
        className="cap-slide absolute bottom-2 right-2 w-[124px] overflow-hidden rounded-lg border border-[#a855f7]/40 bg-surface-2 shadow-[0_10px_30px_-8px_rgba(0,0,0,0.7)]"
        style={{ animationDelay: "0.6s" }}
      >
        <div className="bg-gradient-to-r from-[#6d28d9] to-[#a855f7] px-2 py-1 text-[8px] font-semibold text-white">
          JSeeker
        </div>
        <div className="flex flex-col gap-1 p-1.5">
          <span
            className="cap-pop ml-auto rounded-md rounded-br-sm bg-accent px-1.5 py-1"
            style={{ animationDelay: "1.3s" }}
          >
            <Line w="34px" className="!bg-white/70" />
          </span>
          <span
            className="cap-pop mr-auto flex flex-col gap-1 rounded-md rounded-bl-sm bg-surface-3 px-1.5 py-1"
            style={{ animationDelay: "1.9s" }}
          >
            <Line w="52px" className="!bg-white/35" />
            <Line w="40px" className="!bg-white/25" />
          </span>
        </div>
      </div>

      {/* The shortcut that opens it. */}
      <span className="cap-press absolute bottom-2 left-2 rounded border border-[#a855f7]/50 bg-surface-3 px-1.5 py-[3px] text-[8px] font-semibold text-ink-soft">
        Alt + J
      </span>
    </div>
  );
}

/** Source on the left compiling to a laid-out page on the right. */
function ResumeBuilder() {
  const source = [
    { text: "\\section{Experience}", color: "text-accent-light", delay: "0.2s" },
    { text: "\\role{Engineer}{2024}", color: "text-ink-soft", delay: "0.7s" },
    { text: "  \\item Shipped …", color: "text-ink-muted", delay: "1.2s" },
    { text: "\\section{Skills}", color: "text-accent-light", delay: "1.7s" },
  ];

  return (
    <div className="flex h-full items-center">
      {/* Editor pane. Each line reveals by widening its clip, so it reads as
          being typed rather than fading in. */}
      <div className="h-[132px] flex-1 overflow-hidden rounded-lg border border-line bg-[#101114] p-2.5 font-mono">
        <div className="flex flex-col gap-[7px]">
          {source.map((line) => (
            <span key={line.text} className="flex items-center gap-1.5">
              <span className="w-2 flex-shrink-0 text-[7px] text-ink-faint/60">›</span>
              <span
                className={`cap-type overflow-hidden whitespace-nowrap text-[7.5px] leading-none ${line.color}`}
                style={{ animationDelay: line.delay }}
              >
                {line.text}
              </span>
            </span>
          ))}
        </div>
      </div>

      <Flow />

      {/* Rendered page: a bordered sheet whose blocks land in order. */}
      <div className="h-[132px] flex-1 rounded-lg border border-line bg-white/95 p-2.5 shadow-[0_6px_18px_-8px_rgba(0,0,0,0.8)]">
        <span className="cap-pop block" style={{ animationDelay: "1.5s" }}>
          <span className="mx-auto block h-[7px] w-[56px] rounded-full bg-slate-800" />
          <span className="mx-auto mt-1 block h-[4px] w-[74px] rounded-full bg-slate-400" />
        </span>

        {[
          { delay: "2s", rows: ["94%", "78%"] },
          { delay: "2.5s", rows: ["88%", "62%"] },
        ].map((block) => (
          <span
            key={block.delay}
            className="cap-pop mt-2.5 block"
            style={{ animationDelay: block.delay }}
          >
            <span className="block h-[5px] w-[38px] rounded-full bg-[#6d28d9]" />
            <span className="mt-1 block h-px w-full bg-slate-300" />
            {block.rows.map((w) => (
              <span
                key={w}
                className="mt-1 block h-[4px] rounded-full bg-slate-300"
                style={{ width: w }}
              />
            ))}
          </span>
        ))}
      </div>
    </div>
  );
}

export function CapabilityShowcase() {
  return (
    <div className="land-unfold grid gap-4 lg:grid-cols-3">
      <Panel
        icon={<ScanLine size={16} />}
        title="Profile extraction"
        caption="Resume in, profile out"
        delay="0.05s"
      >
        <ProfileExtraction />
      </Panel>

      <Panel
        icon={<Puzzle size={16} />}
        title="Browser extension"
        caption="Alt + J on any posting"
        delay="0.15s"
      >
        <BrowserExtension />
      </Panel>

      <Panel
        icon={<WandSparkles size={16} />}
        title="Resume builder"
        caption="Source to a printed page"
        delay="0.25s"
      >
        <ResumeBuilder />
      </Panel>
    </div>
  );
}

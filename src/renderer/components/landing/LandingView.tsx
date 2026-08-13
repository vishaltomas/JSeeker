import { ArrowRight, ChevronDown, FileText, MessageCircle, Sparkles, User } from "lucide-react";
import { useState, type ReactNode } from "react";
import { cx, viewSection } from "../../ui";
import { CapabilityShowcase } from "./CapabilityShowcase";

type Destination = "profile" | "chat" | "builder";

interface LandingViewProps {
  visible: boolean;
  /** Profile first name, if known — greets by name under the headline. */
  firstName?: string;
  onNavigate: (view: Destination) => void;
}

const GREETING_LEAD = "Hey, I am ";
const GREETING_NAME = "Seeker";
const GREETING = GREETING_LEAD + GREETING_NAME;

/** Per-letter entrance delay. Small enough that the whole line lands in well
 * under a second, so it never feels like waiting for a title card. */
const LETTER_STEP_S = 0.045;

/** How long the first letter waits, so the orb above it lands first. */
const LETTER_START_S = 0.15;

/** When the greeting has finished writing itself — everything below staggers
 * from here so the page assembles top to bottom. */
const AFTER_GREETING_S = LETTER_START_S + GREETING.length * LETTER_STEP_S + 0.2;

/** The name's colour ramp, purple through to the accent blue. Each letter
 * gets a solid colour off this ramp rather than the word carrying one
 * `bg-clip-text` gradient: the letters are transformed inline-blocks during
 * their entrance, which a clipped background on the wrapper doesn't paint
 * behind — the word comes out invisible. */
const RAMP_FROM = [168, 85, 247];
const RAMP_TO = [96, 165, 250];

function rampColor(i: number, total: number): string {
  const t = total > 1 ? i / (total - 1) : 0;
  const [r, g, b] = RAMP_FROM.map((from, c) => Math.round(from + (RAMP_TO[c] - from) * t));
  return `rgb(${r}, ${g}, ${b})`;
}

/** One run of the headline, animated a letter at a time. `from` is the index
 * the run starts at in the full greeting, so the stagger stays continuous
 * across the two runs it is split into; `tint` colours the run along the
 * ramp above. */
function Letters({ text, from, tint }: { text: string; from: number; tint?: boolean }) {
  const chars = text.split("");
  return (
    <>
      {chars.map((char, i) => (
        <span
          key={`${char}-${i}`}
          className="land-letter inline-block whitespace-pre"
          style={{
            animationDelay: `${LETTER_START_S + (from + i) * LETTER_STEP_S}s`,
            color: tint ? rampColor(i, chars.length) : undefined,
          }}
        >
          {char}
        </span>
      ))}
    </>
  );
}

const actions: Array<{
  to: Destination;
  label: string;
  hint: string;
  icon: ReactNode;
}> = [
  {
    to: "profile",
    label: "Let's add profile",
    hint: "Drop in a resume, or fill it in by hand",
    icon: <User size={18} />,
  },
  {
    to: "chat",
    label: "Let's chat",
    hint: "Ask about a posting, draft a cover letter",
    icon: <MessageCircle size={18} />,
  },
  {
    to: "builder",
    label: "Let's build",
    hint: "Write a resume and export it as a PDF",
    icon: <FileText size={18} />,
  },
];

/** The screen the app opens on: an animated greeting, the three things worth
 * doing next, and — on request — an illustrated tour of what the app can do. */
export function LandingView({ visible, firstName, onNavigate }: LandingViewProps) {
  const [showCapabilities, setShowCapabilities] = useState(false);

  return (
    <section className={cx(viewSection(visible), "overflow-y-auto")}>
      <div className="mx-auto w-full max-w-[980px] px-6 pb-10 pt-2">
        {/* --- greeting ------------------------------------------------- */}
        <div className="relative flex flex-col items-center py-8 text-center">
          {/* Colour behind the headline. Sits under everything and takes no
              pointer events, so it can overflow the text freely. */}
          <span
            className="land-drift pointer-events-none absolute -top-6 h-40 w-40 rounded-full bg-[#6d28d9]/25 blur-3xl"
            aria-hidden="true"
          />
          <span
            className="land-drift pointer-events-none absolute right-1/4 top-4 h-32 w-32 rounded-full bg-[#a855f7]/20 blur-3xl"
            style={{ animationDelay: "3s" }}
            aria-hidden="true"
          />

          {/* Two layers: the entrance owns the outer element's animation, the
              looping glow the inner one — a single element can only run one
              `animation` shorthand, and the later class would win. */}
          <span className="land-rise relative mb-5" aria-hidden="true">
            <span className="intro-glow flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#6d28d9] via-[#9333ea] to-[#a21caf] text-white">
              <Sparkles size={24} />
            </span>
          </span>

          {/* The headline is split per letter for the entrance, so it needs to
              be announced as one string rather than sixteen. */}
          <h1 className="relative text-[34px] font-bold leading-tight tracking-tight">
            <span className="sr-only">{GREETING}</span>
            <span aria-hidden="true">
              <Letters text={GREETING_LEAD} from={0} />
              <Letters text={GREETING_NAME} from={GREETING_LEAD.length} tint />
              <span
                className="land-caret ml-1 inline-block h-[30px] w-[3px] translate-y-[3px] rounded-full bg-[#a855f7] align-middle"
                style={{ animationDelay: `${AFTER_GREETING_S}s` }}
              />
            </span>
          </h1>

          <p
            className="land-rise relative mt-3 max-w-[520px] text-[13.5px] text-ink-muted"
            style={{ animationDelay: `${AFTER_GREETING_S}s` }}
          >
            {firstName ? `Good to see you, ${firstName}. ` : ""}
            Your job hunt in one place — profile, conversation, and the resume itself.
          </p>
        </div>

        {/* --- what to do next ------------------------------------------ */}
        <div className="grid gap-3 sm:grid-cols-3">
          {actions.map((action, i) => (
            <button
              key={action.to}
              type="button"
              onClick={() => onNavigate(action.to)}
              className="land-rise group flex cursor-pointer flex-col items-start gap-2.5 rounded-2xl border border-line-subtle bg-surface-2 p-4 text-left transition-all duration-200 hover:-translate-y-1 hover:border-[#a855f7]/60 hover:bg-surface-3 hover:shadow-[0_14px_34px_-16px_rgba(168,85,247,0.85)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c084fc]"
              style={{ animationDelay: `${AFTER_GREETING_S + 0.1 + i * 0.09}s` }}
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#6d28d9] to-[#a855f7] text-white transition-transform duration-200 group-hover:scale-110">
                {action.icon}
              </span>
              <span className="flex w-full items-center gap-1.5 text-[14px] font-semibold text-ink">
                {action.label}
                <ArrowRight
                  size={14}
                  className="text-ink-faint transition-transform duration-200 group-hover:translate-x-1 group-hover:text-[#c084fc]"
                />
              </span>
              <span className="text-[11.5px] leading-snug text-ink-faint">{action.hint}</span>
            </button>
          ))}
        </div>

        {/* --- what I can do -------------------------------------------- */}
        <button
          type="button"
          onClick={() => setShowCapabilities((open) => !open)}
          aria-expanded={showCapabilities}
          className="land-rise mt-3 flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-line-input bg-transparent px-4 py-3 text-[13px] font-medium text-ink-soft transition-colors duration-200 hover:border-[#a855f7]/60 hover:bg-surface-2 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c084fc]"
          style={{ animationDelay: `${AFTER_GREETING_S + 0.4}s` }}
        >
          <Sparkles size={15} className="text-[#c084fc]" />
          What I can do
          <ChevronDown
            size={15}
            className={cx("transition-transform duration-300", showCapabilities && "rotate-180")}
          />
        </button>

        {showCapabilities && (
          <div className="mt-4">
            <CapabilityShowcase />
          </div>
        )}
      </div>
    </section>
  );
}

interface WelcomeIntroProps {
  /** Text of the small chat bubble, e.g. "Hi Welcome". */
  greeting: string;
  /** Text inside the orb — also the label for what clicking it does. */
  message: string;
  onPrimary: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
}

/** Small trailing dots that lead the eye from the greeting down into the
 * orb, sized/positioned to match the design. */
const dots = [
  { size: 30, left: 107, top: 96, delay: "0.15s" },
  { size: 44, left: 140, top: 139, delay: "0.3s" },
  { size: 48, left: 204, top: 178, delay: "0.45s" },
];

/** The animated launch/first-run screen: gradient dots trail from a greeting
 * bubble down into a large orb that acts as the single call to action. */
export function WelcomeIntro({
  greeting,
  message,
  onPrimary,
  secondaryLabel,
  onSecondary,
}: WelcomeIntroProps) {
  return (
    <div className="flex flex-col items-center gap-3">
      {/* Fixed-size stage so the composition keeps the proportions of the
          design regardless of window size. */}
      <div className="relative h-[400px] w-[640px]">
        {dots.map((dot) => (
          <span
            key={dot.top}
            className="intro-pop absolute rounded-full bg-gradient-to-br from-[#6d28d9] to-[#a855f7]"
            style={{
              width: dot.size,
              height: dot.size,
              left: dot.left,
              top: dot.top,
              animationDelay: dot.delay,
            }}
          />
        ))}

        <div
          className="intro-rise absolute rounded-2xl bg-gradient-to-r from-[#6d28d9] to-[#a855f7] px-5 py-3.5 text-[15px] font-bold text-white shadow-[0_8px_24px_-6px_rgba(109,40,217,0.6)]"
          style={{ left: 279, top: 91, animationDelay: "0.6s" }}
        >
          {greeting}
        </div>

        {/* Three nested layers so the one-shot entrance (pop), the looping
            drift (float) and the hover scale each own their own transform
            instead of overwriting one another. */}
        <div className="intro-pop absolute" style={{ left: 252, top: 167, animationDelay: "0.9s" }}>
          <div className="intro-float" style={{ animationDelay: "1.4s" }}>
            <button
              type="button"
              onClick={onPrimary}
              className="intro-glow flex h-[200px] w-[200px] cursor-pointer items-center rounded-full bg-gradient-to-br from-[#6d28d9] via-[#9333ea] to-[#a21caf] px-9 text-left text-[13px] font-bold leading-snug text-white transition-transform duration-200 hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c084fc] focus-visible:ring-offset-2 focus-visible:ring-offset-surface-0"
            >
              {message}
            </button>
          </div>
        </div>
      </div>

      {secondaryLabel && onSecondary && (
        <button
          type="button"
          onClick={onSecondary}
          className="intro-rise cursor-pointer text-xs text-ink-faint hover:text-ink-soft"
          style={{ animationDelay: "1.6s" }}
        >
          {secondaryLabel}
        </button>
      )}
    </div>
  );
}

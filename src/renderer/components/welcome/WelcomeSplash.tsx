import { useCallback, useEffect, useRef, useState } from "react";
import { cx } from "../../ui";
import { WelcomeShell } from "./WelcomeShell";
import { WelcomeIntro } from "./WelcomeIntro";

interface WelcomeSplashProps {
  /** Profile first name, if known — greets by name instead of generically. */
  firstName?: string;
  onDone: () => void;
}

/** How long the splash holds after its entrance animation settles (~2.1s)
 * before moving on by itself. */
const AUTO_ADVANCE_MS = 2800;
const FADE_MS = 250;

/** The launch splash shown on every open once onboarding is done. It bows out
 * on its own, or immediately on the orb, the skip link, or any keypress —
 * nobody should have to click through a splash to use the app. */
export function WelcomeSplash({ firstName, onDone }: WelcomeSplashProps) {
  const [leaving, setLeaving] = useState(false);

  // Held in a ref so an inline arrow from the parent doesn't restart the
  // timers on every render.
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  const dismiss = useCallback(() => setLeaving(true), []);

  useEffect(() => {
    if (leaving) return;
    const timer = setTimeout(dismiss, AUTO_ADVANCE_MS);
    window.addEventListener("keydown", dismiss);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("keydown", dismiss);
    };
  }, [leaving, dismiss]);

  useEffect(() => {
    if (!leaving) return;
    const timer = setTimeout(() => onDoneRef.current(), FADE_MS);
    return () => clearTimeout(timer);
  }, [leaving]);

  return (
    <div
      className={cx("transition-opacity ease-out", leaving && "opacity-0")}
      style={{ transitionDuration: `${FADE_MS}ms` }}
    >
      <WelcomeShell>
        <WelcomeIntro
          greeting={firstName ? `Hi ${firstName}` : "Hi Welcome"}
          message="Welcome back — pick up where you left off"
          onPrimary={dismiss}
          secondaryLabel="Skip"
          onSecondary={dismiss}
        />
      </WelcomeShell>
    </div>
  );
}

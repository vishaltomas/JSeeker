import { useExtensionActivity } from "../hooks/useExtensionActivity";
import { useOllamaStatus } from "../hooks/useOllamaStatus";
import type { Store } from "../types";
import { cx } from "../ui";

interface FooterBarProps {
  store: Store;
}

type Level = "ok" | "warn" | "error";

const DOT_COLOR: Record<Level, string> = {
  ok: "bg-status-ok",
  warn: "bg-status-warn",
  error: "bg-status-error",
};

/** Always-visible status of whichever LLM provider is configured — the
 * background Ollama bootstrap's state, or a local-only check that a Claude
 * API key is present (we don't ping Claude just to show a status, since that
 * would cost real API usage).
 *
 * While the browser extension has a fill in flight, that takes the line
 * instead: it's the one thing the app is actively doing, and the user
 * shouldn't have to open Settings to find out it's working. */
export function FooterBar({ store }: FooterBarProps) {
  const ollamaStatus = useOllamaStatus();
  const activity = useExtensionActivity();
  const { provider, anthropicApiKey, anthropicModel, ollamaModel } = store.settings;

  // An attempt only leaves "reading" when the provider answers, so a hung
  // request would otherwise pin this line forever. A local model can genuinely
  // take minutes on a long form, so the cutoff is generous rather than tight.
  const filling = activity.find(
    (entry) => entry.state === "reading" && Date.now() - entry.at < 10 * 60_000
  );
  if (filling) {
    const where = filling.title || "the page";
    return (
      <footer className="flex flex-shrink-0 items-center gap-2 border-t border-line-subtle bg-surface-1 px-3.5 py-1.5 text-[11.5px] text-ink-muted">
        <span className="h-2 w-2 flex-shrink-0 animate-pulse rounded-full bg-accent" />
        <span className="truncate">
          Filling {filling.fields ?? 0} fields on {where}…
        </span>
      </footer>
    );
  }

  let level: Level = "warn";
  let text = "";

  if (provider === "claude") {
    if (anthropicApiKey) {
      level = "ok";
      text = `Claude API — ${anthropicModel || "claude-opus-4-8"}`;
    } else {
      level = "error";
      text = "Claude API — no API key set (Settings → Assistant)";
    }
  } else {
    const configuredModel = ollamaModel || "qwen2.5:3b";
    if (!ollamaStatus) {
      text = `Connecting to Ollama (${configuredModel})…`;
    } else if (ollamaStatus.state === "starting") {
      text = "Starting Ollama…";
    } else if (ollamaStatus.state === "pulling") {
      text = `Downloading ${ollamaStatus.model} — ${ollamaStatus.percent}%`;
    } else if (ollamaStatus.state === "ready") {
      level = "ok";
      text = `Ollama connected — ${ollamaStatus.model}`;
    } else {
      level = "error";
      text = ollamaStatus.message;
    }
  }

  return (
    <footer className="flex flex-shrink-0 items-center gap-2 border-t border-line-subtle bg-surface-1 px-3.5 py-1.5 text-[11.5px] text-ink-muted">
      <span className={cx("h-2 w-2 flex-shrink-0 rounded-full", DOT_COLOR[level])} />
      <span className="truncate">{text}</span>
    </footer>
  );
}

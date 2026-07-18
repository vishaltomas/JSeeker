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
 * would cost real API usage). */
export function FooterBar({ store }: FooterBarProps) {
  const ollamaStatus = useOllamaStatus();
  const { provider, anthropicApiKey, anthropicModel, ollamaModel } = store.settings;

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

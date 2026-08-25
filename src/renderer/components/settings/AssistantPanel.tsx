import { useState } from "react";
import { useOllamaStatus } from "../../hooks/useOllamaStatus";
import type { Store } from "../../types";
import {
  btn,
  btnPrimary,
  cx,
  fieldGroup,
  fieldInput,
  fieldLabel,
  panelH2,
  sectionHint,
  statusText,
} from "../../ui";

interface AssistantPanelProps {
  store: Store;
  persist: (next: Store) => void;
}

export function AssistantPanel({ store, persist }: AssistantPanelProps) {
  const [provider, setProvider] = useState(
    store.settings.provider === "claude" ? "claude" : "ollama"
  );
  const [ollamaModel, setOllamaModel] = useState(store.settings.ollamaModel);
  const [ollamaHost, setOllamaHost] = useState(store.settings.ollamaHost);
  const [claudeKey, setClaudeKey] = useState(store.settings.anthropicApiKey);
  const [claudeModel, setClaudeModel] = useState(store.settings.anthropicModel);
  const [status, setStatus] = useState("");

  const ollamaStatus = useOllamaStatus();
  const [starting, setStarting] = useState(false);

  const busy = starting || ollamaStatus?.state === "starting" || ollamaStatus?.state === "pulling";

  let ollamaStatusText = "Not started yet.";
  if (ollamaStatus?.state === "starting") {
    ollamaStatusText = "Starting Ollama…";
  } else if (ollamaStatus?.state === "pulling") {
    ollamaStatusText = `Downloading ${ollamaStatus.model} — ${ollamaStatus.percent}%`;
  } else if (ollamaStatus?.state === "ready") {
    ollamaStatusText = `Running — ${ollamaStatus.model}`;
  } else if (ollamaStatus?.state === "error") {
    ollamaStatusText = ollamaStatus.message;
  }

  function buildSettings(): Store {
    return {
      ...store,
      settings: {
        ...store.settings,
        provider: provider === "claude" ? "claude" : "ollama",
        ollamaModel: ollamaModel.trim(),
        ollamaHost: ollamaHost.trim(),
        anthropicApiKey: claudeKey.trim(),
        anthropicModel: claudeModel.trim(),
      },
    };
  }

  function save(): void {
    persist(buildSettings());
    setStatus("Settings saved.");
  }

  // Persist first, so the main process starts whatever model/host is
  // currently shown here even if "Save settings" hasn't been clicked yet.
  async function startOllama(): Promise<void> {
    persist(buildSettings());
    setStarting(true);
    try {
      await window.api.startOllama();
    } finally {
      setStarting(false);
    }
  }

  return (
    <section>
      <h2 className={panelH2}>Assistant</h2>
      <p className={sectionHint}>
        Powers the assistant — both the one docked beside the editor and the browser
        extension's in-page panel — and the first-run extraction of your profile from
        uploaded documents.
      </p>
      <div className={fieldGroup}>
        <label className={fieldLabel} htmlFor="set-provider">
          Provider
        </label>
        <select
          className={fieldInput}
          id="set-provider"
          value={provider}
          onChange={(e) => setProvider(e.target.value)}
        >
          <option value="ollama">Local (Ollama)</option>
          <option value="claude">Claude API</option>
        </select>
      </div>

      <h2 className={cx(panelH2, "mt-[22px]")}>Local model (Ollama)</h2>
      <div className={fieldGroup}>
        <label className={fieldLabel} htmlFor="set-model">
          Model
        </label>
        <input
          className={fieldInput}
          id="set-model"
          placeholder="qwen2.5:3b"
          value={ollamaModel}
          onChange={(e) => setOllamaModel(e.target.value)}
        />
      </div>
      <div className={fieldGroup}>
        <label className={fieldLabel} htmlFor="set-host">
          Host
        </label>
        <input
          className={fieldInput}
          id="set-host"
          placeholder="http://127.0.0.1:11434"
          value={ollamaHost}
          onChange={(e) => setOllamaHost(e.target.value)}
        />
      </div>
      <button className={btn} onClick={startOllama} disabled={busy}>
        {busy ? "Starting…" : "Start Ollama"}
      </button>
      <p className={statusText}>{ollamaStatusText}</p>

      <h2 className={cx(panelH2, "mt-[22px]")}>Claude API</h2>
      <p className={sectionHint}>Get a key at platform.claude.com.</p>
      <div className={fieldGroup}>
        <label className={fieldLabel} htmlFor="set-claude-key">
          API key
        </label>
        <input
          className={fieldInput}
          id="set-claude-key"
          autoComplete="off"
          value={claudeKey}
          onChange={(e) => setClaudeKey(e.target.value)}
        />
      </div>
      <div className={fieldGroup}>
        <label className={fieldLabel} htmlFor="set-claude-model">
          Model
        </label>
        <input
          className={fieldInput}
          id="set-claude-model"
          placeholder="claude-opus-4-8"
          value={claudeModel}
          onChange={(e) => setClaudeModel(e.target.value)}
        />
      </div>

      <button className={btnPrimary} onClick={save}>
        Save settings
      </button>
      <p className={statusText}>{status}</p>
    </section>
  );
}

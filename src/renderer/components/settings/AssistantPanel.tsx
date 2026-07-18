import { useState } from "react";
import type { Store } from "../../types";
import {
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

  function save(): void {
    persist({
      ...store,
      settings: {
        ...store.settings,
        provider: provider === "claude" ? "claude" : "ollama",
        ollamaModel: ollamaModel.trim(),
        ollamaHost: ollamaHost.trim(),
        anthropicApiKey: claudeKey.trim(),
        anthropicModel: claudeModel.trim(),
      },
    });
    setStatus("Settings saved.");
  }

  return (
    <section>
      <h2 className={panelH2}>Assistant</h2>
      <p className={sectionHint}>
        Powers the chat assistant and AI-assisted autofill (for form fields the rule-based
        matcher can't confidently label).
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

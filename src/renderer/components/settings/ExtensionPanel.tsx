import { useEffect, useState } from "react";
import type { Store } from "../../types";
import {
  btn,
  btnPrimary,
  fieldGroup,
  fieldInput,
  fieldLabel,
  panelH2,
  sectionHint,
  statusText,
} from "../../ui";

interface ExtensionPanelProps {
  store: Store;
  persist: (next: Store) => void;
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

type ServerInfo = { port: number; listening: boolean; error?: string };

export function ExtensionPanel({ store, persist }: ExtensionPanelProps) {
  const [server, setServer] = useState<ServerInfo | null>(null);
  const [status, setStatus] = useState("");

  useEffect(() => {
    window.api.extensionInfo().then(setServer);
  }, []);

  function copyToken(): void {
    navigator.clipboard.writeText(store.settings.extensionSyncToken);
    setStatus("Token copied.");
  }

  function regenerateToken(): void {
    persist({ ...store, settings: { ...store.settings, extensionSyncToken: randomToken() } });
    setStatus("New token generated — update the extension's options page with it.");
  }

  return (
    <section>
      <h2 className={panelH2}>Browser extension</h2>
      <p className={sectionHint}>
        Install the extension from the <code>extension/</code> folder in this project (Chrome/Edge
        → <code>chrome://extensions</code> → enable Developer mode → Load unpacked), then paste the
        token below into its options page. With JSeeker running, click the extension's icon on any
        job application page: it sends the page here, your configured model works out what each
        field is asking for and answers it from your profile and resume, and the extension fills
        the form in. It never submits anything — that stays yours.
      </p>

      <div className={fieldGroup}>
        <label className={fieldLabel} htmlFor="ext-token">
          Sync token
        </label>
        <input className={fieldInput} id="ext-token" readOnly value={store.settings.extensionSyncToken} />
      </div>

      <div className={fieldGroup}>
        <label className={fieldLabel}>Local server</label>
        {!server ? (
          <p className="text-[13px] text-ink">Starting…</p>
        ) : server.listening ? (
          <p className="text-[13px] text-ink">http://127.0.0.1:{server.port} — running</p>
        ) : (
          <p className="text-[13px] text-status-error">
            Not listening on port {server.port}
            {server.error ? ` — ${server.error}` : ". Another copy of JSeeker may be running."}
          </p>
        )}
      </div>

      <button className={btn} onClick={copyToken}>
        Copy token
      </button>{" "}
      <button className={btnPrimary} onClick={regenerateToken}>
        Regenerate token
      </button>
      <p className={statusText}>{status}</p>

      <p className="mt-2 text-xs text-ink-faint">
        Fills you run from the browser show up under <strong>Auto Tracker</strong> in the
        top bar, as they happen. Press <code>Alt+J</code> on any page (or right-click →
        Ask JSeeker about this page) for a chat panel that can read the posting you're
        looking at.
      </p>
    </section>
  );
}

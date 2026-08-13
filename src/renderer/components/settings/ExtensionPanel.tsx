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
        token below into its options page. With JSeeker running, press <code>Alt+J</code> on any
        page — or click the extension's icon, or right-click → Ask JSeeker about this page — for a
        floating chat panel: the same assistant as the Chat view, able to read the posting in front
        of you. It only reads the page; it never fills or submits anything.
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
        A checkbox in the panel controls whether the assistant reads the page at all. Your
        profile never enters the browser — the page's text comes here, and only the reply
        goes back.
      </p>
    </section>
  );
}

import { useEffect, useState } from "react";
import type { Store } from "../../types";
import { btn, btnPrimary, fieldGroup, fieldInput, fieldLabel, panelH2, sectionHint, statusText } from "../../ui";

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

export function ExtensionPanel({ store, persist }: ExtensionPanelProps) {
  const [port, setPort] = useState<number | null>(null);
  const [status, setStatus] = useState("");

  useEffect(() => {
    window.api.extensionInfo().then(({ port }) => setPort(port));
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
        job application page to fill in the form directly in your browser, using your saved profile
        and resume.
      </p>

      <div className={fieldGroup}>
        <label className={fieldLabel} htmlFor="ext-token">
          Sync token
        </label>
        <input className={fieldInput} id="ext-token" readOnly value={store.settings.extensionSyncToken} />
      </div>

      <div className={fieldGroup}>
        <label className={fieldLabel}>Local server</label>
        <p className="text-[13px] text-ink">
          {port ? `http://127.0.0.1:${port}` : "Starting…"}
        </p>
      </div>

      <button className={btn} onClick={copyToken}>
        Copy token
      </button>{" "}
      <button className={btnPrimary} onClick={regenerateToken}>
        Regenerate token
      </button>
      <p className={statusText}>{status}</p>
    </section>
  );
}

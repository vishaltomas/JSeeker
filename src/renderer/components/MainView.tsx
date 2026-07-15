import { useState } from "react";
import type { KeyboardEvent } from "react";
import { useWebviewAutofill } from "../hooks/useWebviewAutofill";
import { ChatPanel } from "./ChatPanel";
import type { Store } from "../types";

interface MainViewProps {
  visible: boolean;
  store: Store;
  onActiveIdChange: (id: string) => void;
  pendingUrl: string | null;
  onPendingUrlHandled: () => void;
}

export function MainView({
  visible,
  store,
  onActiveIdChange,
  pendingUrl,
  onPendingUrlHandled,
}: MainViewProps) {
  const activeProfile = store.profiles.find((p) => p.id === store.activeId) ?? store.profiles[0];

  const {
    viewRef,
    urlInput,
    setUrlInput,
    autoFill,
    setAutoFill,
    pageReady,
    hasOpened,
    status,
    openUrl,
    autofill,
  } = useWebviewAutofill(activeProfile, pendingUrl, onPendingUrlHandled);

  const [chatOpen, setChatOpen] = useState(false);

  function onUrlKeyDown(e: KeyboardEvent<HTMLInputElement>): void {
    if (e.key === "Enter") openUrl();
  }

  return (
    <section className={visible ? "view" : "view hidden"}>
      <div className="toolbar">
        <select
          className="profile-select"
          title="Active profile"
          value={store.activeId}
          onChange={(e) => onActiveIdChange(e.target.value)}
        >
          {store.profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name || "(unnamed)"}
            </option>
          ))}
        </select>
        <input
          className="url-input"
          placeholder="Paste a job application link and press Enter…"
          autoComplete="off"
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          onKeyDown={onUrlKeyDown}
        />
        <button className="btn" onClick={() => openUrl()}>
          Open
        </button>
        <label className="auto-toggle" title="Re-fill automatically as the form changes or navigates">
          <input
            type="checkbox"
            checked={autoFill}
            onChange={(e) => setAutoFill(e.target.checked)}
          />{" "}
          Auto
        </label>
        <button className="btn btn-primary" disabled={!pageReady} onClick={autofill}>
          Autofill
        </button>
        <button className="btn" onClick={() => setChatOpen((v) => !v)}>
          Chat
        </button>
      </div>

      <div className="body">
        <main className="viewer">
          {!hasOpened && (
            <div className="placeholder">Paste an application link above to begin.</div>
          )}
          <webview
            ref={viewRef}
            className="webview"
            src="about:blank"
            allowpopups
            useragent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
          />
        </main>

        <ChatPanel open={chatOpen} />
      </div>

      <div className="statusbar">{status}</div>
    </section>
  );
}

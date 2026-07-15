import { useEffect, useRef, useState } from "react";
import type { FieldDescriptor, ProfileRecord, WebviewElement } from "../types";
import { buildApplyMappingScript, buildAutofillScript } from "../autofill/script";

function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

/**
 * Owns the <webview> ref, its native Electron event wiring, and the autofill
 * flow (heuristic pass, then an LLM fallback for leftover fields, then resume
 * attachment). The webview element persists for the app's lifetime — MainView
 * is only ever hidden via CSS, never unmounted — so the native listeners are
 * attached exactly once and read live values through refs.
 *
 * `pendingUrl`/`onPendingUrlHandled` let another view (the jobs list) open a
 * link here without needing direct access to this hook's internal state.
 */
export function useWebviewAutofill(
  activeProfile: ProfileRecord,
  pendingUrl: string | null,
  onPendingUrlHandled: () => void
) {
  const viewRef = useRef<WebviewElement | null>(null);
  const [urlInput, setUrlInput] = useState("");
  const [autoFill, setAutoFill] = useState(false);
  const [pageReady, setPageReady] = useState(false);
  const [hasOpened, setHasOpened] = useState(false);
  const [status, setStatus] = useState("");

  const profileRef = useRef(activeProfile);
  useEffect(() => {
    profileRef.current = activeProfile;
  }, [activeProfile]);

  const autoFillRef = useRef(autoFill);
  useEffect(() => {
    autoFillRef.current = autoFill;
  }, [autoFill]);

  const pageReadyRef = useRef(false);
  function setReady(ready: boolean): void {
    pageReadyRef.current = ready;
    setPageReady(ready);
  }

  async function runFill(): Promise<{ filled: number; unfilled: FieldDescriptor[] }> {
    const view = viewRef.current;
    if (!view) return { filled: 0, unfilled: [] };
    const result = await view.executeJavaScript(
      buildAutofillScript(profileRef.current.data, autoFillRef.current),
      true
    );
    return result as { filled: number; unfilled: FieldDescriptor[] };
  }

  async function autofill(): Promise<void> {
    const view = viewRef.current;
    if (!view || !pageReadyRef.current) return;
    setStatus("Filling fields…");
    try {
      const { filled, unfilled } = await runFill();
      let llmFilled = 0;

      if (unfilled.length) {
        setStatus(
          `Filled ${filled} field${filled === 1 ? "" : "s"}. Asking assistant about ${unfilled.length} more…`
        );
        try {
          const mapping = await window.api.planAutofillLLM(unfilled);
          if (mapping.length) {
            llmFilled = (await view.executeJavaScript(
              buildApplyMappingScript(mapping),
              true
            )) as number;
          }
        } catch (err) {
          // Best-effort: the local model may be unavailable or misconfigured.
          // The heuristic pass above already ran, so don't fail autofill over it.
          console.error("LLM autofill step failed:", err);
        }
      }

      const total = filled + llmFilled;
      let msg =
        `Filled ${total} field${total === 1 ? "" : "s"}` +
        (llmFilled ? ` (${llmFilled} via assistant)` : "") +
        ".";
      const resumePath = profileRef.current.data.resumePath;
      if (resumePath) {
        const attached = await window.api.attachResume(view.getWebContentsId(), resumePath);
        msg += ` Attached resume to ${attached} upload${attached === 1 ? "" : "s"}.`;
      }
      setStatus(msg);
    } catch (err) {
      setStatus("Autofill failed: " + (err as Error).message);
    }
  }

  // `rawUrl` lets a caller (e.g. the jobs list) navigate without relying on
  // `urlInput` state having already committed on this render.
  function openUrl(rawUrl?: string): void {
    const view = viewRef.current;
    const source = rawUrl !== undefined ? rawUrl : urlInput;
    const url = normalizeUrl(source);
    if (!url || !view) return;
    if (rawUrl !== undefined) setUrlInput(rawUrl);
    setHasOpened(true);
    setReady(false);
    view.src = url;
    setStatus("Loading page…");
  }

  useEffect(() => {
    if (pendingUrl != null) {
      openUrl(pendingUrl);
      onPendingUrlHandled();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingUrl]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    const onStartLoading = () => setStatus("Loading page…");

    const onFinishLoad = () => {
      setReady(true);
      if (autoFillRef.current) {
        autofill();
      } else {
        setStatus("Page loaded. Click Autofill.");
      }
    };

    const onNavigateInPage = () => {
      if (autoFillRef.current && pageReadyRef.current) autofill();
    };

    const onFailLoad = (event: Event) => {
      const e = event as unknown as {
        errorCode: number;
        errorDescription: string;
        isMainFrame: boolean;
      };
      if (!e.isMainFrame || e.errorCode === -3) return;
      setStatus(`Load failed (${e.errorCode}): ${e.errorDescription}`);
    };

    const onCrashed = () => setStatus("The page's process crashed. Try reloading.");

    view.addEventListener("did-start-loading", onStartLoading);
    view.addEventListener("did-finish-load", onFinishLoad);
    view.addEventListener("did-navigate-in-page", onNavigateInPage);
    view.addEventListener("did-fail-load", onFailLoad);
    view.addEventListener("render-process-gone", onCrashed);

    return () => {
      view.removeEventListener("did-start-loading", onStartLoading);
      view.removeEventListener("did-finish-load", onFinishLoad);
      view.removeEventListener("did-navigate-in-page", onNavigateInPage);
      view.removeEventListener("did-fail-load", onFailLoad);
      view.removeEventListener("render-process-gone", onCrashed);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
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
  };
}

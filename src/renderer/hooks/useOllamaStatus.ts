import { useEffect, useRef, useState } from "react";
import type { OllamaStatus } from "../types";

/** Tracks the background bootstrap that starts/pulls/warms the configured
 * Ollama model shortly after the app launches (see main.ts `bootstrapOllama`).
 *
 * The bootstrap can finish (or fail) before this component mounts and
 * subscribes, and Electron doesn't buffer IPC events sent before a listener
 * attaches — so on mount we also fetch whatever the main process's current
 * status already is, applying it only if a live event hasn't already arrived. */
export function useOllamaStatus(): OllamaStatus | null {
  const [status, setStatus] = useState<OllamaStatus | null>(null);
  const receivedLive = useRef(false);

  useEffect(() => {
    window.api.onOllamaStatus((s) => {
      receivedLive.current = true;
      setStatus(s);
    });
    window.api.getOllamaStatus().then((s) => {
      if (!receivedLive.current && s) setStatus(s);
    });
  }, []);

  return status;
}

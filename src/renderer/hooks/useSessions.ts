import { useCallback, useEffect, useState } from "react";
import type { ApplicationSession } from "../types";

/** The applications recorded by the browser extension (see main/sessions.ts).
 *
 * Loaded on demand rather than pushed: sessions are written by the extension
 * while the user is over in their browser, so the list is refreshed whenever
 * the History view becomes visible instead of being kept live. */
export function useSessions(active: boolean) {
  const [sessions, setSessions] = useState<ApplicationSession[]>([]);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    const list = await window.api.sessions.list();
    setSessions(list);
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (active) void refresh();
  }, [active, refresh]);

  const remove = useCallback(async (id: string) => {
    setSessions(await window.api.sessions.remove(id));
  }, []);

  const markAnswersSaved = useCallback(async (id: string, keys: string[]) => {
    setSessions(await window.api.sessions.markAnswersSaved(id, keys));
  }, []);

  return { sessions, loaded, refresh, remove, markAnswersSaved };
}

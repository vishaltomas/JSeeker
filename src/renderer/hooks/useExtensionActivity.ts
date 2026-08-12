import { useEffect, useState } from "react";
import type { ExtensionActivity } from "../types";

/** Autofill attempts from the browser extension, newest first (see
 * main/extensionServer.ts).
 *
 * The interesting part happens while the user is in their browser, not in
 * this window, so on mount we fetch the attempts the main process already
 * has and then merge live updates into them. A single attempt is reported
 * several times as it progresses, so entries are merged by id rather than
 * appended — which also makes a duplicate subscription harmless. */
export function useExtensionActivity(): ExtensionActivity[] {
  const [entries, setEntries] = useState<ExtensionActivity[]>([]);

  useEffect(() => {
    function merge(incoming: ExtensionActivity[]): void {
      setEntries((current) => {
        const byId = new Map(current.map((e) => [e.id, e]));
        for (const entry of incoming) byId.set(entry.id, entry);
        return Array.from(byId.values()).sort((a, b) => b.at - a.at);
      });
    }

    window.api.onExtensionActivity((entry) => merge([entry]));
    window.api.getExtensionActivity().then(merge);
  }, []);

  return entries;
}

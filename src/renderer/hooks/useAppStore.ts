import { useCallback, useEffect, useState } from "react";
import type { Store, StructuredResume } from "../types";

export function emptyResume(): StructuredResume {
  return { summary: "", experience: [], education: [], skills: [] };
}

function emptyStore(): Store {
  return {
    activeId: "default",
    profiles: [{ id: "default", name: "Default", data: {}, resume: emptyResume() }],
    settings: {
      provider: "ollama",
      ollamaModel: "",
      ollamaHost: "",
      anthropicApiKey: "",
      anthropicModel: "",
      extensionSyncToken: "",
    },
    account: null,
  };
}

/** Loads the persisted store once on mount, and exposes `persist` to both
 * update local state and write the change back to disk. */
export function useAppStore() {
  const [store, setStore] = useState<Store>(emptyStore());
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    window.api.loadStore().then((loadedStore) => {
      setStore(loadedStore);
      setLoaded(true);
    });
  }, []);

  const persist = useCallback((next: Store) => {
    setStore(next);
    window.api.saveStore(next);
  }, []);

  // Some writes (account:create) happen entirely in the main process — via
  // their own IPC handler, not `persist` — so local state has no way to
  // know about them on its own. Re-reading the store picks up whatever the
  // main process just wrote.
  const reload = useCallback(async () => {
    const fresh = await window.api.loadStore();
    setStore(fresh);
  }, []);

  return { store, persist, loaded, reload };
}

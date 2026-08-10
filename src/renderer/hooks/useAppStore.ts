import { useCallback, useEffect, useState } from "react";
import type { Store, StructuredResume } from "../types";

export function emptyResume(): StructuredResume {
  return { summary: "", experience: [], education: [], skills: [], languages: [] };
}

function emptyStore(): Store {
  return {
    data: {},
    resume: emptyResume(),
    resumeFiles: [],
    settings: {
      provider: "ollama",
      ollamaModel: "",
      ollamaHost: "",
      anthropicApiKey: "",
      anthropicModel: "",
      extensionSyncToken: "",
    },
    onboarded: false,
    builderSource: "",
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

  return { store, persist, loaded };
}

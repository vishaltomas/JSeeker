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
    builderFilePath: "",
    builderAutosave: true,
    builderAutoCompile: false,
    builderChatOpen: true,
    builderFont: "georgia",
    builderAccent: "ink",
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

  // Resolves once the write lands, so a caller that shows save state (the
  // builder's autosave indicator) can wait for it. Callers that don't care
  // can keep ignoring the result.
  const persist = useCallback((next: Store): Promise<boolean> => {
    setStore(next);
    return window.api.saveStore(next);
  }, []);

  return { store, persist, loaded };
}

import { contextBridge, ipcRenderer } from "electron";

type ChatMessage = { role: "user" | "assistant"; content: string };

/** A form field the renderer's heuristic matcher couldn't confidently label. */
interface FieldDescriptor {
  index: number;
  tag: string;
  type?: string;
  name?: string;
  id?: string;
  placeholder?: string;
  ariaLabel?: string;
  autocomplete?: string;
  label?: string;
  context?: string;
  options?: string[];
  required?: boolean;
}

interface FieldMapping {
  index: number;
  value: string;
}

interface ClickableCandidate {
  index: number;
  tag: string;
  text?: string;
  ariaLabel?: string;
  type?: string;
  isSubmitLike: boolean;
}

interface AutopilotSnapshot {
  pageTitle: string;
  candidates: ClickableCandidate[];
  remainingRequired: string[];
}

interface AgentAction {
  action: "click" | "confirm_submit" | "done" | "blocked";
  index: number;
  note: string;
}

type OllamaStatus =
  | { state: "starting" }
  | { state: "pulling"; model: string; percent: number; detail: string }
  | { state: "ready"; model: string }
  | { state: "error"; message: string };

contextBridge.exposeInMainWorld("api", {
  versions: {
    node: process.versions.node,
    chrome: process.versions.chrome,
    electron: process.versions.electron,
  },
  loadStore: (): Promise<unknown> => ipcRenderer.invoke("store:load"),
  saveStore: (store: unknown): Promise<boolean> =>
    ipcRenderer.invoke("store:save", store),
  searchJobs: (query: string, location: string): Promise<unknown> =>
    ipcRenderer.invoke("jobs:search", { query, location }),
  pickResume: (): Promise<string | null> =>
    ipcRenderer.invoke("dialog:pickResume"),
  attachResume: (webContentsId: number, filePath: string): Promise<number> =>
    ipcRenderer.invoke("resume:attach", { webContentsId, filePath }),
  planAutofillLLM: (fields: FieldDescriptor[]): Promise<FieldMapping[]> =>
    ipcRenderer.invoke("autofill:llm", { fields }),
  planNextAction: (snapshot: AutopilotSnapshot, recentSteps: string[]): Promise<AgentAction> =>
    ipcRenderer.invoke("autopilot:next-action", { snapshot, recentSteps }),
  onOllamaStatus: (cb: (status: OllamaStatus) => void): void => {
    ipcRenderer.on("ollama:status", (_event, status: OllamaStatus) => cb(status));
  },
  getOllamaStatus: (): Promise<OllamaStatus | null> =>
    ipcRenderer.invoke("ollama:status:get"),
  startOllama: (): Promise<void> => ipcRenderer.invoke("ollama:start"),
  chat: {
    send: (history: ChatMessage[]): void =>
      ipcRenderer.send("chat:send", history),
    onDelta: (cb: (text: string) => void): void => {
      ipcRenderer.on("chat:delta", (_event, text: string) => cb(text));
    },
    onDone: (cb: (full: string) => void): void => {
      ipcRenderer.on("chat:done", (_event, full: string) => cb(full));
    },
    onError: (cb: (message: string) => void): void => {
      ipcRenderer.on("chat:error", (_event, message: string) => cb(message));
    },
  },
});

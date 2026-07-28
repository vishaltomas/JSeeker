import { contextBridge, ipcRenderer } from "electron";

type ChatMessage = { role: "user" | "assistant"; content: string };

interface AccountCreateResult {
  ok: boolean;
  error?: string;
}

interface ResumeExperience {
  id: string;
  title: string;
  company: string;
  startDate: string;
  endDate: string;
  bullets: string[];
}

interface ResumeEducation {
  id: string;
  school: string;
  degree: string;
  field: string;
  startDate: string;
  endDate: string;
}

interface StructuredResume {
  summary: string;
  experience: ResumeExperience[];
  education: ResumeEducation[];
  skills: string[];
}

interface ResumeParseResult {
  fields: Record<string, string>;
  resume: StructuredResume;
  unsupported?: boolean;
  error?: string;
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
  pickResume: (): Promise<string | null> =>
    ipcRenderer.invoke("dialog:pickResume"),
  account: {
    create: (username: string, password: string): Promise<AccountCreateResult> =>
      ipcRenderer.invoke("account:create", { username, password }),
    login: (username: string, password: string): Promise<boolean> =>
      ipcRenderer.invoke("account:login", { username, password }),
  },
  parseResume: (filePath: string): Promise<ResumeParseResult> =>
    ipcRenderer.invoke("resume:parse", { filePath }),
  extensionInfo: (): Promise<{ port: number }> => ipcRenderer.invoke("extension:info"),
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

import { contextBridge, ipcRenderer } from "electron";

type ChatMessage = { role: "user" | "assistant"; content: string };

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

interface LanguageEntry {
  id: string;
  name: string;
  proficiency: string;
}

interface StructuredResume {
  summary: string;
  experience: ResumeExperience[];
  education: ResumeEducation[];
  skills: string[];
  languages: LanguageEntry[];
}

interface ResumeParseResult {
  fields: Record<string, string>;
  resume: StructuredResume;
  unsupportedFiles: string[];
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
  pickResumeFiles: (): Promise<string[]> =>
    ipcRenderer.invoke("dialog:pickResumeFiles"),
  parseResume: (filePaths: string[]): Promise<ResumeParseResult> =>
    ipcRenderer.invoke("resume:parse", { filePaths }),
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

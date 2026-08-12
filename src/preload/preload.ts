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

interface BuilderFile {
  name: string;
  path: string;
  modified: number;
}

interface PdfExportResult {
  ok: boolean;
  canceled?: boolean;
  filePath?: string;
  error?: string;
}

interface ExtensionActivity {
  id: string;
  at: number;
  state: "reading" | "filled" | "error";
  url?: string;
  title?: string;
  fields?: number;
  planned?: number;
  applied?: number;
  message?: string;
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
  /** The builder's workspace of `.resb` documents — see main/builderWorkspace.ts. */
  builder: {
    list: (): Promise<{ dir: string; files: BuilderFile[] }> =>
      ipcRenderer.invoke("builder:list"),
    read: (filePath: string): Promise<{ content?: string; error?: string }> =>
      ipcRenderer.invoke("builder:read", filePath),
    write: (filePath: string, content: string): Promise<{ ok?: boolean; error?: string }> =>
      ipcRenderer.invoke("builder:write", { path: filePath, content }),
    create: (name?: string, content?: string): Promise<{ file?: BuilderFile; error?: string }> =>
      ipcRenderer.invoke("builder:create", { name, content }),
    rename: (filePath: string, name: string): Promise<{ file?: BuilderFile; error?: string }> =>
      ipcRenderer.invoke("builder:rename", { path: filePath, name }),
    /** Moves the document to the OS bin. */
    remove: (filePath: string): Promise<{ ok?: boolean; error?: string }> =>
      ipcRenderer.invoke("builder:delete", filePath),
    /** Reads a `.resb` file from anywhere on disk, without importing it. */
    pick: (): Promise<{ canceled?: boolean; name?: string; content?: string; error?: string }> =>
      ipcRenderer.invoke("builder:pick"),
  },
  /** Renders a compiled resume document to PDF, prompting for a save
   * location. `name` seeds the suggested file name. */
  exportPdf: (html: string, name?: string): Promise<PdfExportResult> =>
    ipcRenderer.invoke("pdf:export", { html, name }),
  extensionInfo: (): Promise<{ port: number; listening: boolean; error?: string }> =>
    ipcRenderer.invoke("extension:info"),
  /** Live autofill attempts from the browser extension — see
   * main/extensionServer.ts. */
  onExtensionActivity: (cb: (entry: ExtensionActivity) => void): void => {
    ipcRenderer.on("extension:activity", (_event, entry: ExtensionActivity) => cb(entry));
  },
  getExtensionActivity: (): Promise<ExtensionActivity[]> =>
    ipcRenderer.invoke("extension:activity:get"),
  /** Opens an http(s) URL in the user's browser. Resolves false if the main
   * process rejected the scheme. */
  openExternal: (url: string): Promise<boolean> =>
    ipcRenderer.invoke("shell:openExternal", url),
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

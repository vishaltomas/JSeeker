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

interface ProfileMergeResult {
  fields: Record<string, string>;
  resume: StructuredResume;
  report: unknown;
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


interface SessionArtifact {
  id: string;
  kind: "cover-letter" | "resume";
  content: string;
  createdAt: number;
}

interface ApplicationSession {
  id: string;
  url: string;
  host: string;
  title: string;
  startedAt: number;
  updatedAt: number;
  messages: { role: "user" | "assistant"; content: string; at: number }[];
  artifacts: SessionArtifact[];
  answers: { key: string; value: string; saved: boolean }[];
}

interface ToolActivity {
  name: string;
  detail: string;
  status: "start" | "done" | "error";
  message?: string;
}

type OllamaStatus =
  | { state: "starting" }
  | { state: "pulling"; model: string; percent: number; detail: string }
  | { state: "ready"; model: string }
  | { state: "error"; message: string };

// Progress narration for the document read/merge. Registered once here and
// dispatched to whatever the renderer last subscribed with, so repeatedly
// mounting the Profile view can't stack up listeners.
let resumeProgressCb: ((progress: unknown) => void) | null = null;
ipcRenderer.on("resume:progress", (_event, progress: unknown) => resumeProgressCb?.(progress));

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
  /** Folds an extraction into the profile as it stands, comparing entries by
   * meaning so nothing already there is overwritten or duplicated. Returns
   * the merged profile plus a report of what changed; saving is up to the
   * caller. */
  mergeProfile: (
    current: { fields: Record<string, string>; resume: StructuredResume },
    incoming: { fields: Record<string, string>; resume: StructuredResume }
  ): Promise<ProfileMergeResult> => ipcRenderer.invoke("resume:merge", { current, incoming }),
  /** Step-by-step progress for `parseResume`/`mergeProfile`. Pass null to
   * stop listening. */
  onResumeProgress: (cb: ((progress: unknown) => void) | null): void => {
    resumeProgressCb = cb;
  },
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
  /** Application sessions recorded by the extension — see main/sessions.ts. */
  sessions: {
    list: (): Promise<ApplicationSession[]> => ipcRenderer.invoke("sessions:list"),
    remove: (id: string): Promise<ApplicationSession[]> => ipcRenderer.invoke("sessions:delete", id),
    extractAnswers: (
      id: string
    ): Promise<{ answers: { key: string; value: string }[]; error?: string }> =>
      ipcRenderer.invoke("sessions:extractAnswers", id),
    markAnswersSaved: (id: string, keys: string[]): Promise<ApplicationSession[]> =>
      ipcRenderer.invoke("sessions:markAnswersSaved", { id, keys }),
  },
  /** Renders a compiled resume document to PDF, prompting for a save
   * location. `name` seeds the suggested file name. */
  exportPdf: (html: string, name?: string): Promise<PdfExportResult> =>
    ipcRenderer.invoke("pdf:export", { html, name }),
  /** Whether the local server the browser extension's chat panel talks to is
   * up — see main/extensionServer.ts. */
  extensionInfo: (): Promise<{ port: number; listening: boolean; error?: string }> =>
    ipcRenderer.invoke("extension:info"),
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
    /** Tool calls the assistant makes mid-reply — reading a page, writing a
     * document. See agents/toolDefs.ts for the list. */
    onTool: (cb: (activity: ToolActivity) => void): void => {
      ipcRenderer.on("chat:tool", (_event, activity: ToolActivity) => cb(activity));
    },
  },
});

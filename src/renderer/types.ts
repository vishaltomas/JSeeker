export type ProfileData = Record<string, string>;

export interface ResumeExperience {
  id: string;
  title: string;
  company: string;
  startDate: string;
  endDate: string;
  bullets: string[];
}

export interface ResumeEducation {
  id: string;
  school: string;
  degree: string;
  field: string;
  startDate: string;
  endDate: string;
}

export interface LanguageEntry {
  id: string;
  name: string;
  proficiency: string;
}

/** The structured parts of a resume that don't fit the flat `ProfileData`
 * bag — edited in ProfileView.tsx. */
export interface StructuredResume {
  summary: string;
  experience: ResumeExperience[];
  education: ResumeEducation[];
  skills: string[];
  languages: LanguageEntry[];
}

export interface Settings {
  provider: string;
  ollamaModel: string;
  ollamaHost: string;
  anthropicApiKey: string;
  anthropicModel: string;
  extensionSyncToken: string;
}

/** A single source of truth — no more named/switchable profiles. */
export interface Store {
  data: ProfileData;
  resume: StructuredResume;
  /** Paths of resume/CV/supporting documents uploaded so far. */
  resumeFiles: string[];
  settings: Settings;
  /** Whether the user has been through the first-run document-upload flow. */
  onboarded: boolean;
  /** Which `.resb` document the builder had open, as a path inside the
   * workspace folder. The document lives in that file; this is a bookmark. */
  builderFilePath: string;
  /** Whether the builder writes edits back on its own; off means Save/Ctrl+S. */
  builderAutosave: boolean;
  /** Whether the preview recompiles as you type; off means Compile/Ctrl+Enter. */
  builderAutoCompile: boolean;
  /** Which typeface the resume is set in — an id from FONTS. */
  builderFont: string;
  /** The document's accent colour — an id from ACCENTS. */
  builderAccent: string;
}

export type ChatMessage = { role: "user" | "assistant"; content: string };

export interface ResumeParseResult {
  fields: ProfileData;
  resume: StructuredResume;
  unsupportedFiles: string[];
  error?: string;
}

/** A `.resb` document in the builder's workspace — see main/builderWorkspace.ts. */
export interface BuilderFile {
  name: string;
  path: string;
  /** Epoch ms; the explorer lists most recently edited first. */
  modified: number;
}

/** Outcome of a resume PDF export — see src/main/pdf.ts. */
export interface PdfExportResult {
  ok: boolean;
  /** The save dialog was dismissed; nothing was written and nothing failed. */
  canceled?: boolean;
  filePath?: string;
  error?: string;
}

/** Progress of the background bootstrap that gets the configured Ollama
 * model running (and warmed) shortly after the app launches. */
export type OllamaStatus =
  | { state: "starting" }
  | { state: "pulling"; model: string; percent: number; detail: string }
  | { state: "ready"; model: string }
  | { state: "error"; message: string };

/** One autofill attempt by the browser extension, as the app sees it — see
 * main/extensionServer.ts. Updated in place as the attempt progresses, so
 * entries are merged by `id`. */
export interface ExtensionActivity {
  id: string;
  at: number;
  state: "reading" | "filled" | "error";
  url?: string;
  title?: string;
  /** Fillable controls the extension found on the page. */
  fields?: number;
  /** Values the model returned. */
  planned?: number;
  /** Values that actually landed — absent until the extension reports back. */
  applied?: number;
  message?: string;
}

export interface Api {
  versions: { node: string; chrome: string; electron: string };
  loadStore: () => Promise<Store>;
  saveStore: (store: Store) => Promise<boolean>;
  pickResumeFiles: () => Promise<string[]>;
  parseResume: (filePaths: string[]) => Promise<ResumeParseResult>;
  /** The builder's workspace of `.resb` documents. */
  builder: {
    list: () => Promise<{ dir: string; files: BuilderFile[] }>;
    read: (filePath: string) => Promise<{ content?: string; error?: string }>;
    write: (filePath: string, content: string) => Promise<{ ok?: boolean; error?: string }>;
    create: (name?: string, content?: string) => Promise<{ file?: BuilderFile; error?: string }>;
    rename: (filePath: string, name: string) => Promise<{ file?: BuilderFile; error?: string }>;
    /** Moves the document to the OS bin. */
    remove: (filePath: string) => Promise<{ ok?: boolean; error?: string }>;
    /** Reads a `.resb` file from anywhere on disk, without importing it. */
    pick: () => Promise<{ canceled?: boolean; name?: string; content?: string; error?: string }>;
  };
  /** Renders a compiled resume document to PDF, prompting for a location. */
  exportPdf: (html: string, name?: string) => Promise<PdfExportResult>;
  extensionInfo: () => Promise<{ port: number; listening: boolean; error?: string }>;
  onExtensionActivity: (cb: (entry: ExtensionActivity) => void) => void;
  getExtensionActivity: () => Promise<ExtensionActivity[]>;
  /** Opens an http(s) URL in the user's browser; false if the scheme was refused. */
  openExternal: (url: string) => Promise<boolean>;
  onOllamaStatus: (cb: (status: OllamaStatus) => void) => void;
  getOllamaStatus: () => Promise<OllamaStatus | null>;
  startOllama: () => Promise<void>;
  chat: {
    send: (history: ChatMessage[]) => void;
    onDelta: (cb: (text: string) => void) => void;
    onDone: (cb: (full: string) => void) => void;
    onError: (cb: (message: string) => void) => void;
  };
}

declare global {
  interface Window {
    api: Api;
  }
}

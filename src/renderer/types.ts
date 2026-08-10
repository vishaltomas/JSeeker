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
  /** `.resb` source for the resume builder — see src/resume_builder/. */
  builderSource: string;
}

export type ChatMessage = { role: "user" | "assistant"; content: string };

export interface ResumeParseResult {
  fields: ProfileData;
  resume: StructuredResume;
  unsupportedFiles: string[];
  error?: string;
}

/** Progress of the background bootstrap that gets the configured Ollama
 * model running (and warmed) shortly after the app launches. */
export type OllamaStatus =
  | { state: "starting" }
  | { state: "pulling"; model: string; percent: number; detail: string }
  | { state: "ready"; model: string }
  | { state: "error"; message: string };

export interface Api {
  versions: { node: string; chrome: string; electron: string };
  loadStore: () => Promise<Store>;
  saveStore: (store: Store) => Promise<boolean>;
  pickResumeFiles: () => Promise<string[]>;
  parseResume: (filePaths: string[]) => Promise<ResumeParseResult>;
  extensionInfo: () => Promise<{ port: number }>;
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

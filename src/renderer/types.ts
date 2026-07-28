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

/** The structured parts of a resume that don't fit the flat `ProfileData`
 * bag — edited in ResumeView.tsx. */
export interface StructuredResume {
  summary: string;
  experience: ResumeExperience[];
  education: ResumeEducation[];
  skills: string[];
}

export interface ProfileRecord {
  id: string;
  name: string;
  data: ProfileData;
  resume: StructuredResume;
}

export interface Settings {
  provider: string;
  ollamaModel: string;
  ollamaHost: string;
  anthropicApiKey: string;
  anthropicModel: string;
  extensionSyncToken: string;
}

/** Local account gate — see the matching doc comment in src/main/store.ts
 * for the security scope (a UI-level gate, not filesystem-level protection). */
export interface Account {
  username: string;
  passwordHash: string;
  passwordSalt: string;
  onboarded: boolean;
}

export interface Store {
  activeId: string;
  profiles: ProfileRecord[];
  settings: Settings;
  account: Account | null;
}

export type ChatMessage = { role: "user" | "assistant"; content: string };

export interface AccountCreateResult {
  ok: boolean;
  error?: string;
}

export interface ResumeParseResult {
  fields: ProfileData;
  resume: StructuredResume;
  unsupported?: boolean;
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
  pickResume: () => Promise<string | null>;
  account: {
    create: (username: string, password: string) => Promise<AccountCreateResult>;
    login: (username: string, password: string) => Promise<boolean>;
  };
  parseResume: (filePath: string) => Promise<ResumeParseResult>;
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

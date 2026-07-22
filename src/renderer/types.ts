export type ProfileData = Record<string, string>;

export interface ProfileRecord {
  id: string;
  name: string;
  data: ProfileData;
}

export interface Settings {
  provider: string;
  ollamaModel: string;
  ollamaHost: string;
  anthropicApiKey: string;
  anthropicModel: string;
  adzunaAppId: string;
  adzunaAppKey: string;
  adzunaCountry: string;
  serpApiKey: string;
}

export interface Store {
  activeId: string;
  profiles: ProfileRecord[];
  settings: Settings;
}

export interface Job {
  title: string;
  company: string;
  location: string;
  url: string;
  tags: string[];
  source: string;
  date: string;
  description: string;
}

export type ChatMessage = { role: "user" | "assistant"; content: string };

/** A form field the heuristic autofill matcher couldn't confidently label,
 * described for the local model as a fallback. */
export interface FieldDescriptor {
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

export interface FieldMapping {
  index: number;
  value: string;
}

/** A clickable element the autopilot loop could act on next. `isSubmitLike`
 * is computed in the injected page script, not by the model — it's the
 * deterministic check that gates auto-clicking a final submit action. */
export interface ClickableCandidate {
  index: number;
  tag: string;
  text?: string;
  ariaLabel?: string;
  type?: string;
  isSubmitLike: boolean;
}

export interface AutopilotSnapshot {
  pageTitle: string;
  candidates: ClickableCandidate[];
  remainingRequired: string[];
}

/** One decision from the model for what the autopilot loop should do next. */
export interface AgentAction {
  action: "click" | "confirm_submit" | "done" | "blocked";
  index: number;
  note: string;
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
  searchJobs: (query: string, location: string) => Promise<Job[]>;
  pickResume: () => Promise<string | null>;
  attachResume: (webContentsId: number, filePath: string) => Promise<number>;
  planAutofillLLM: (fields: FieldDescriptor[]) => Promise<FieldMapping[]>;
  planNextAction: (snapshot: AutopilotSnapshot, recentSteps: string[]) => Promise<AgentAction>;
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

  // @types/react declares `HTMLWebViewElement` as an intentionally-empty
  // interface (and already types the <webview> JSX tag's attributes) for
  // apps to extend with the methods Electron actually adds to the element.
  interface HTMLWebViewElement {
    src: string;
    loadURL(url: string): Promise<void>;
    getWebContentsId(): number;
    executeJavaScript(code: string, userGesture?: boolean): Promise<unknown>;
  }
}

export type WebviewElement = HTMLWebViewElement;

export type ChatMessage = { role: "user" | "assistant" | "system"; content: string };

/** A tool call, as the user watching the chat sees it. Reaching for a tool is
 * the one thing an assistant does that takes real time and isn't visible in
 * the reply — reading a job posting can take several seconds, and a bare
 * cursor for that long reads as a hang. */
export interface ToolActivity {
  /** The tool's name, e.g. `read_web_page`. */
  name: string;
  /** One line for a person: "Reading jobs.example.com". */
  detail: string;
  status: "start" | "done" | "error";
  /** Set when `status` is `"error"`. The turn continues — the model is told
   * what went wrong and gets to react — so this is narration, not a failure. */
  message?: string;
  /** Where a tool that wrote a document put it. The editor's assistant dock
   * uses this to open what was just written, instead of leaving the user to
   * find it in the file list themselves. */
  path?: string;
}

/** Where a streamed chat reply goes. The app's own chat sends it over IPC to
 * the renderer; the browser extension's in-page panel sends it out as SSE
 * (see main/extensionServer.ts) — the providers don't need to know which. */
export interface ChatSink {
  delta(text: string): void;
  done(full: string): void;
  error(message: string): void;
  /** Optional: a caller that doesn't show tool activity simply omits it. */
  tool?(activity: ToolActivity): void;
}

/** Per-turn switches for a chat request. */
export interface ChatOptions {
  /**
   * Whether the model may call tools (see agents/toolDefs.ts). On by default
   * for conversation; off for the drafting buttons, whose output is written
   * straight to a file — a tool call mid-document would land in the middle of
   * a cover letter.
   */
  tools?: boolean;
}

/** Coarse progress for the document read, which is slow enough (PDF text
 * extraction, then a full LLM pass over every document at once) that a bare
 * spinner leaves the user guessing whether anything is happening. Reported
 * from the main process and relayed to the renderer over IPC. */
export type ParseProgress =
  /** Pulling text out of one PDF; `index` is 1-based. */
  | { stage: "reading"; file: string; index: number; total: number }
  /** The model is generating the extraction — `chars` grows as it streams. */
  | { stage: "extracting"; model: string; documents: number; chars: number }
  /** Turning entries into vectors before the same/new comparison. */
  | { stage: "embedding"; model: string; entries: number }
  /** Walking the extraction against the existing profile. */
  | { stage: "comparing"; mode: "embedding" | "lexical" };

/** Optional progress callback threaded through the slow paths. */
export type ProgressSink = (progress: ParseProgress) => void;

/** Well-known profile keys — resume extraction is guided (not restricted) to
 * use these when the info is present, but can add any other key it finds
 * useful via `extraFields` below. Not a schema, just a naming convention
 * that keeps the most-used fields predictably named in the Profile UI and in
 * the profile block the chat system prompt builds. */
export const RESUME_ANCHOR_KEYS = [
  "firstName",
  "lastName",
  "email",
  "phone",
  "address",
  "city",
  "state",
  "zip",
  "country",
  "linkedin",
  "github",
  "website",
  "currentTitle",
  "currentCompany",
] as const;

/** Open key-value bag — the merged result of the anchor fields plus
 * whatever `extraFields` the model found (see `ResumeExtraction`). */
export type ResumeFields = Record<string, string>;

/** One freeform key-value pair the model chose to extract beyond the anchor
 * fields (e.g. "Visa status" -> "H1B", "Notice period" -> "2 weeks"). An
 * array of {key,value} objects rather than an open JSON-schema dictionary
 * because structured-output "strict" JSON schema (both Ollama's and
 * Claude's) doesn't reliably support truly open `additionalProperties` —
 * an array of well-typed objects sidesteps that entirely. */
export interface ExtraField {
  key: string;
  value: string;
}

/** Structured resume entries as extracted from the LLM, *before* the main
 * process assigns each one a stable `id` (see main/store.ts's
 * `ResumeExperience`/`ResumeEducation`/`LanguageEntry`, which add `id`) —
 * the model isn't asked to invent ids, that's not a meaningful thing for it
 * to do. */
export interface ExtractedResumeExperience {
  title: string;
  company: string;
  startDate: string;
  endDate: string;
  bullets: string[];
}

export interface ExtractedResumeEducation {
  school: string;
  degree: string;
  field: string;
  startDate: string;
  endDate: string;
}

export interface ExtractedLanguage {
  name: string;
  proficiency: string;
}

/** The full result of one resume-extraction LLM call across however many
 * documents were uploaded: the merged flat fields (anchors + extras) plus
 * the structured sections, all in a single round-trip. */
export interface ResumeExtraction {
  fields: ResumeFields;
  summary: string;
  experience: ExtractedResumeExperience[];
  education: ExtractedResumeEducation[];
  skills: string[];
  languages: ExtractedLanguage[];
}

/** The JSON-schema fragment for the structured sections, shared between
 * ollama.ts's `format` and claude.ts's `output_config.format.json_schema`
 * so the nested shapes have one source of truth instead of hand-kept
 * copies. */
export const RESUME_STRUCTURE_SCHEMA_PROPERTIES = {
  summary: { type: "string" },
  experience: {
    type: "array",
    items: {
      type: "object",
      properties: {
        title: { type: "string" },
        company: { type: "string" },
        startDate: { type: "string" },
        endDate: { type: "string" },
        bullets: { type: "array", items: { type: "string" } },
      },
      required: ["title", "company", "startDate", "endDate", "bullets"],
      additionalProperties: false,
    },
  },
  education: {
    type: "array",
    items: {
      type: "object",
      properties: {
        school: { type: "string" },
        degree: { type: "string" },
        field: { type: "string" },
        startDate: { type: "string" },
        endDate: { type: "string" },
      },
      required: ["school", "degree", "field", "startDate", "endDate"],
      additionalProperties: false,
    },
  },
  skills: { type: "array", items: { type: "string" } },
  languages: {
    type: "array",
    items: {
      type: "object",
      properties: {
        name: { type: "string" },
        proficiency: { type: "string" },
      },
      required: ["name", "proficiency"],
      additionalProperties: false,
    },
  },
  extraFields: {
    type: "array",
    items: {
      type: "object",
      properties: {
        key: { type: "string" },
        value: { type: "string" },
      },
      required: ["key", "value"],
      additionalProperties: false,
    },
  },
} as const;

export const RESUME_STRUCTURE_KEYS = [
  "summary",
  "experience",
  "education",
  "skills",
  "languages",
  "extraFields",
] as const;

export type ChatMessage = { role: "user" | "assistant" | "system"; content: string };

/** Where a streamed chat reply goes. The app's own chat sends it over IPC to
 * the renderer; the browser extension's in-page panel sends it out as SSE
 * (see main/extensionServer.ts) — the providers don't need to know which. */
export interface ChatSink {
  delta(text: string): void;
  done(full: string): void;
  error(message: string): void;
}

/** A snapshot of the page the browser extension is filling: the visible page
 * text with every fillable control rendered as a tagged one-line element
 * (see extension/content.js `__jseekerSerialize`). The model reads the ids
 * out of this text itself — nothing on this side pre-labels the fields. */
export interface PageSnapshot {
  url?: string;
  title?: string;
  page: string;
}

/** One control the model decided to fill. `id` is the `jid="…"` it read from
 * the snapshot; `value` is the text to type, the option to pick for a
 * `<select>`, or "true" for the radio/checkbox that should be selected —
 * extension/content.js knows each element's real type and interprets the
 * string accordingly. */
export interface FieldFill {
  id: string;
  value: string;
}

/** Well-known profile keys — resume extraction is guided (not restricted) to
 * use these when the info is present, but can add any other key it finds
 * useful via `extraFields` below. Not a schema, just a naming convention
 * that keeps the most-used fields predictably named, both in the Profile UI
 * and in the profile block the autofill prompt builds. */
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
 * an array of well-typed objects sidesteps that entirely, the same way
 * `FieldFill[]` already does for autofill. */
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

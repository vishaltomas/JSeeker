export type ChatMessage = { role: "user" | "assistant" | "system"; content: string };

/** A form field the browser extension's heuristic matcher couldn't
 * confidently label, sent to the local model as a fallback (see
 * src/main/extensionServer.ts POST /autofill). */
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

/** Profile field keys the onboarding resume extractor fills in — matches
 * ProfilesPanel.tsx's editable field list (everything but `resumePath`,
 * which is set by the file picker itself, not extracted text). */
export const RESUME_FIELD_KEYS = [
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

/** Flat, fully-required (empty string when unknown) so it maps directly onto
 * a JSON schema for structured output — same convention as the structured
 * resume fields below. */
export type ResumeFields = Record<(typeof RESUME_FIELD_KEYS)[number], string>;

/** Structured resume entries as extracted from the LLM, *before* the main
 * process assigns each one a stable `id` (see main/store.ts's
 * `ResumeExperience`/`ResumeEducation`, which add `id`) — the model isn't
 * asked to invent ids, that's not a meaningful thing for it to do. */
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

/** The full result of one resume-extraction LLM call: the flat contact
 * fields plus the structured sections, all in a single round-trip. */
export interface ResumeExtraction {
  fields: ResumeFields;
  summary: string;
  experience: ExtractedResumeExperience[];
  education: ExtractedResumeEducation[];
  skills: string[];
}

/** The JSON-schema fragment for the structured sections, shared between
 * ollama.ts's `format` and claude.ts's `output_config.format.json_schema`
 * so the nested experience/education shape has one source of truth instead
 * of two hand-kept copies. */
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
} as const;

export const RESUME_STRUCTURE_KEYS = ["summary", "experience", "education", "skills"] as const;

export type ChatMessage = { role: "user" | "assistant" | "system"; content: string };

/** A form field the renderer's heuristic matcher couldn't confidently label,
 * sent to the local model as a fallback. */
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

/** A clickable element (button, submit input, or nav-style link) the
 * autopilot loop could act on next. `isSubmitLike` is computed in the
 * injected page script — not by the model — since it's the deterministic
 * safety check that gates auto-clicking. */
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
  /** Labels of required fields still empty after the autofill pass. */
  remainingRequired: string[];
}

/** One decision from the model: what the autopilot loop should do next.
 * `index` is -1 when not applicable (done/blocked). Flat and fully-required
 * so it maps directly onto a simple JSON schema for structured output. */
export interface AgentAction {
  action: "click" | "confirm_submit" | "done" | "blocked";
  index: number;
  note: string;
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
 * a JSON schema for structured output — same convention as `AgentAction`. */
export type ResumeFields = Record<(typeof RESUME_FIELD_KEYS)[number], string>;

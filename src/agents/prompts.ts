import type { Store } from "../main/store";
import { activeProfileData } from "../main/store";
import type { AgentAction, AutopilotSnapshot, FieldDescriptor, FieldMapping, ResumeFields } from "./types";
import { RESUME_FIELD_KEYS } from "./types";

/** System prompt seeded with the active profile so the model can help fill applications. */
export function buildSystemPrompt(store: Store): string {
  const record = store.profiles.find((p) => p.id === store.activeId) ?? store.profiles[0];
  const data = activeProfileData(store);
  const lines = Object.entries(data)
    .filter(([key, value]) => value && key !== "resumePath")
    .map(([key, value]) => `- ${key}: ${value}`);
  const profileText = lines.length ? lines.join("\n") : "(no info saved yet)";
  return [
    "You are JSeeker's assistant, helping the user complete job applications.",
    "Be concise and practical. Help draft and tailor answers to application questions,",
    "and use the user's saved info below when it is relevant.",
    "",
    `Active profile: ${record ? record.name : "Default"}`,
    "The user's saved info:",
    profileText,
  ].join("\n");
}

/** Builds the shared prompt asking a model to map leftover fields to profile values. */
export function buildAutofillPrompt(store: Store, fields: FieldDescriptor[]): string {
  const data = activeProfileData(store);
  const profileLines = Object.entries(data)
    .filter(([key, value]) => value && key !== "resumePath")
    .map(([key, value]) => `- ${key}: ${value}`);
  const profileText = profileLines.length ? profileLines.join("\n") : "(no info saved)";

  return [
    "You are filling out a job application form for the applicant described below.",
    "Here is a JSON list of form fields a rule-based matcher could not label with confidence.",
    "",
    "Applicant profile:",
    profileText,
    "",
    "Form fields:",
    JSON.stringify(fields),
    "",
    "Only include a field when the profile clearly supports the value.",
    "For a field with an `options` list, the value must be one of those option strings verbatim.",
    "Never invent information (employer names, dates, numbers, etc.) that isn't in the profile.",
    "Omit any field you're unsure about.",
  ].join("\n");
}

/** Builds the prompt asking the model what the autopilot loop should do next
 * on the current page, after the existing autofill pass has already run.
 * `recentSteps` is a short trailing log (plain text) of what the loop has
 * already done, so the model doesn't repeat itself and can recognize a
 * stalled page as done/blocked instead of clicking the same thing forever. */
export function buildNextActionPrompt(
  store: Store,
  snapshot: AutopilotSnapshot,
  recentSteps: string[],
  jobContext: string
): string {
  const data = activeProfileData(store);
  const profileLines = Object.entries(data)
    .filter(([key, value]) => value && key !== "resumePath")
    .map(([key, value]) => `- ${key}: ${value}`);
  const profileText = profileLines.length ? profileLines.join("\n") : "(no info saved)";

  return [
    "You are driving a job application form, one step at a time, for the applicant below.",
    "The current page's fields have already been filled as best as possible by a separate step.",
    "Your only job here is to decide what to do next on this page.",
    "",
    "Job posting excerpt, captured at the start of this application (context only — use it to judge",
    "fit/requirements, never to fabricate a field value that isn't in the applicant profile):",
    jobContext || "(not available)",
    "",
    "Applicant profile:",
    profileText,
    "",
    `Page title: ${snapshot.pageTitle}`,
    "",
    "Required fields still empty (already attempted and unresolved — do not expect these to fill themselves):",
    snapshot.remainingRequired.length ? snapshot.remainingRequired.join(", ") : "(none)",
    "",
    "Clickable elements on this page, as JSON (`isSubmitLike` flags elements that look like a final,",
    "irreversible submission of the application):",
    JSON.stringify(snapshot.candidates),
    "",
    "Steps already taken on this application, most recent last:",
    recentSteps.length ? recentSteps.join("\n") : "(none yet)",
    "",
    'Reply with one action: "click" to advance the form (e.g. a "Next"/"Continue" control),',
    '"confirm_submit" if the right move is an element flagged isSubmitLike: true (never reply "click" for one of those),',
    '"blocked" if remaining required fields can\'t be resolved and no candidate would help, or nothing useful can be done,',
    '"done" if the application is already complete and there is nothing left to do.',
    'For "click" or "confirm_submit", `index` must be one of the candidate indexes above. Otherwise use -1.',
    "`note` should be a short (one sentence) explanation of the choice.",
  ].join("\n");
}

/** Parse a model's JSON-mode response into field mappings, tolerating either a
 * bare array or an object wrapping one. */
export function parseFieldMappings(content: string): FieldMapping[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return [];
  }
  const list = Array.isArray(parsed)
    ? parsed
    : Object.values(parsed as Record<string, unknown>).find(Array.isArray) ?? [];
  if (!Array.isArray(list)) return [];
  return list.filter(
    (x): x is FieldMapping =>
      !!x &&
      typeof x === "object" &&
      typeof (x as FieldMapping).index === "number" &&
      typeof (x as FieldMapping).value === "string" &&
      (x as FieldMapping).value.trim() !== ""
  );
}

const AGENT_ACTIONS = new Set(["click", "confirm_submit", "done", "blocked"]);

/** Parse a model's JSON-mode response into a single next action, tolerating
 * either a bare object or one wrapping it. Falls back to "blocked" — never
 * "click" — on anything unparsable, since silently doing nothing is safer
 * than guessing. */
export function parseAgentAction(content: string): AgentAction {
  const fallback: AgentAction = {
    action: "blocked",
    index: -1,
    note: "Could not read the model's response.",
  };

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return fallback;
  }

  let obj = parsed as Record<string, unknown>;
  if (!obj || typeof obj !== "object") return fallback;
  if (typeof obj.action !== "string") {
    const nested = Object.values(obj).find(
      (v) => v && typeof v === "object" && typeof (v as Record<string, unknown>).action === "string"
    );
    if (nested) obj = nested as Record<string, unknown>;
  }

  if (typeof obj.action !== "string" || !AGENT_ACTIONS.has(obj.action)) return fallback;
  return {
    action: obj.action as AgentAction["action"],
    index: typeof obj.index === "number" ? obj.index : -1,
    note: typeof obj.note === "string" && obj.note.trim() ? obj.note : "(no explanation given)",
  };
}

/** Builds the onboarding prompt asking a model to extract profile fields
 * from resume text. */
export function buildResumeExtractionPrompt(resumeText: string): string {
  return [
    "Extract the applicant's profile info from the resume text below.",
    "",
    "Resume text:",
    resumeText,
    "",
    `Fields to extract: ${RESUME_FIELD_KEYS.join(", ")}.`,
    "Use an empty string for any field the resume doesn't clearly state.",
    "Never invent information that isn't in the resume text.",
    "`linkedin`/`github`/`website` should be the URL as written, if present.",
    "`currentTitle`/`currentCompany` should reflect the most recent position.",
  ].join("\n");
}

/** Parse a model's JSON-mode response into ResumeFields, tolerating either a
 * bare object or one wrapping it, and filling in "" for any missing key. */
export function parseResumeFields(content: string): ResumeFields {
  const empty = Object.fromEntries(RESUME_FIELD_KEYS.map((k) => [k, ""])) as ResumeFields;

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return empty;
  }

  let obj = parsed as Record<string, unknown>;
  if (!obj || typeof obj !== "object") return empty;
  if (!RESUME_FIELD_KEYS.some((k) => k in obj)) {
    const nested = Object.values(obj).find(
      (v) => v && typeof v === "object" && RESUME_FIELD_KEYS.some((k) => k in (v as object))
    );
    if (nested) obj = nested as Record<string, unknown>;
  }

  const result = { ...empty };
  for (const key of RESUME_FIELD_KEYS) {
    const value = obj[key];
    if (typeof value === "string") result[key] = value.trim();
  }
  return result;
}

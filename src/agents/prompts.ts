import type { Store } from "../main/store";
import { activeProfileData, activeProfileRecord } from "../main/store";
import type { FieldDescriptor, FieldMapping, ResumeExtraction } from "./types";
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

/** Builds the shared prompt asking a model to map leftover fields to profile
 * values — used by the browser extension's LLM-fallback matching (see
 * src/main/extensionServer.ts POST /autofill). */
export function buildAutofillPrompt(store: Store, fields: FieldDescriptor[]): string {
  const data = activeProfileData(store);
  const resume = activeProfileRecord(store).resume;
  const profileLines = Object.entries(data)
    .filter(([key, value]) => value && key !== "resumePath")
    .map(([key, value]) => `- ${key}: ${value}`);
  if (resume.summary) profileLines.push(`- summary: ${resume.summary}`);
  if (resume.skills.length) profileLines.push(`- skills: ${resume.skills.join(", ")}`);
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

/** Builds the onboarding prompt asking a model to extract both the flat
 * contact fields and the structured resume sections (summary, experience,
 * education, skills) from resume text, in one call. */
export function buildResumeExtractionPrompt(resumeText: string): string {
  return [
    "Extract the applicant's info from the resume text below.",
    "",
    "Resume text:",
    resumeText,
    "",
    `Contact fields to extract: ${RESUME_FIELD_KEYS.join(", ")}.`,
    "Use an empty string for any contact field the resume doesn't clearly state.",
    "`linkedin`/`github`/`website` should be the URL as written, if present.",
    "`currentTitle`/`currentCompany` should reflect the most recent position.",
    "",
    "Also extract:",
    "- `summary`: a short professional summary, in the applicant's own words if the resume has one, otherwise \"\".",
    "- `experience`: each work history entry with title, company, startDate, endDate (\"Present\" if current), and bullets (the resume's own bullet points, as separate strings).",
    "- `education`: each entry with school, degree, field, startDate, endDate.",
    "- `skills`: a flat list of skill strings.",
    "",
    "Never invent information that isn't in the resume text. Use empty strings/arrays for anything not present.",
  ].join("\n");
}

/** Parse a model's JSON-mode response into a ResumeExtraction, tolerating
 * either a bare object or one wrapping it, and dropping malformed array
 * entries rather than failing the whole parse — extraction is best-effort;
 * the user always gets a chance to fix it by hand in the resume editor. */
export function parseResumeExtraction(content: string): ResumeExtraction {
  const emptyFields = Object.fromEntries(RESUME_FIELD_KEYS.map((k) => [k, ""])) as ResumeExtraction["fields"];
  const empty: ResumeExtraction = { fields: emptyFields, summary: "", experience: [], education: [], skills: [] };

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return empty;
  }

  let obj = parsed as Record<string, unknown>;
  if (!obj || typeof obj !== "object") return empty;
  if (!RESUME_FIELD_KEYS.some((k) => k in obj) && !("experience" in obj)) {
    const nested = Object.values(obj).find(
      (v) =>
        v &&
        typeof v === "object" &&
        (RESUME_FIELD_KEYS.some((k) => k in (v as object)) || "experience" in (v as object))
    );
    if (nested) obj = nested as Record<string, unknown>;
  }

  const fields = { ...emptyFields };
  for (const key of RESUME_FIELD_KEYS) {
    const value = obj[key];
    if (typeof value === "string") fields[key] = value.trim();
  }

  const summary = typeof obj.summary === "string" ? obj.summary.trim() : "";

  const experience = Array.isArray(obj.experience)
    ? obj.experience
        .filter((e): e is Record<string, unknown> => !!e && typeof e === "object")
        .map((e) => ({
          title: typeof e.title === "string" ? e.title.trim() : "",
          company: typeof e.company === "string" ? e.company.trim() : "",
          startDate: typeof e.startDate === "string" ? e.startDate.trim() : "",
          endDate: typeof e.endDate === "string" ? e.endDate.trim() : "",
          bullets: Array.isArray(e.bullets)
            ? e.bullets.filter((b): b is string => typeof b === "string" && b.trim() !== "").map((b) => b.trim())
            : [],
        }))
        .filter((e) => e.title || e.company)
    : [];

  const education = Array.isArray(obj.education)
    ? obj.education
        .filter((e): e is Record<string, unknown> => !!e && typeof e === "object")
        .map((e) => ({
          school: typeof e.school === "string" ? e.school.trim() : "",
          degree: typeof e.degree === "string" ? e.degree.trim() : "",
          field: typeof e.field === "string" ? e.field.trim() : "",
          startDate: typeof e.startDate === "string" ? e.startDate.trim() : "",
          endDate: typeof e.endDate === "string" ? e.endDate.trim() : "",
        }))
        .filter((e) => e.school)
    : [];

  const skills = Array.isArray(obj.skills)
    ? obj.skills.filter((s): s is string => typeof s === "string" && s.trim() !== "").map((s) => s.trim())
    : [];

  return { fields, summary, experience, education, skills };
}

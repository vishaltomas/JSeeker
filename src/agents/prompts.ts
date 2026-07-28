import type { Store } from "../main/store";
import type { ExtraField, FieldDescriptor, FieldMapping, ResumeExtraction } from "./types";
import { RESUME_ANCHOR_KEYS } from "./types";

/** System prompt seeded with the profile so the model can help fill applications. */
export function buildSystemPrompt(store: Store): string {
  const lines = Object.entries(store.data)
    .filter(([, value]) => value)
    .map(([key, value]) => `- ${key}: ${value}`);
  const profileText = lines.length ? lines.join("\n") : "(no info saved yet)";
  return [
    "You are JSeeker's assistant, helping the user complete job applications.",
    "Be concise and practical. Help draft and tailor answers to application questions,",
    "and use the user's saved info below when it is relevant.",
    "",
    "The user's saved info:",
    profileText,
  ].join("\n");
}

/** Builds the shared prompt asking a model to map leftover fields to profile
 * values — used by the browser extension's LLM-fallback matching (see
 * src/main/extensionServer.ts POST /autofill). */
export function buildAutofillPrompt(store: Store, fields: FieldDescriptor[]): string {
  const profileLines = Object.entries(store.data)
    .filter(([, value]) => value)
    .map(([key, value]) => `- ${key}: ${value}`);
  if (store.resume.summary) profileLines.push(`- summary: ${store.resume.summary}`);
  if (store.resume.skills.length) profileLines.push(`- skills: ${store.resume.skills.join(", ")}`);
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

/** Builds the onboarding prompt asking a model to extract a profile from one
 * or more uploaded documents at once — deliberately open-ended rather than
 * hunting for a fixed list of fields: the well-known anchor keys are a
 * guide (so the browser extension's heuristic matcher, which looks them up
 * by exact name, keeps working), not a restriction — anything else useful
 * goes in `extraFields` with whatever key name fits. */
export function buildResumeExtractionPrompt(documents: { filename: string; text: string }[]): string {
  const docBlocks = documents.map((d) => `--- ${d.filename} ---\n${d.text}`).join("\n\n");

  return [
    "You are extracting a job applicant's profile from the document(s) below — resumes, cover",
    "letters, LinkedIn exports, or anything similar. There may be more than one; treat them as",
    "describing the same person and combine what you learn from all of them.",
    "",
    docBlocks,
    "",
    `Well-known fields — use these exact keys when the document(s) clearly state them: ${RESUME_ANCHOR_KEYS.join(", ")}.`,
    "Use an empty string for any of those not stated. `linkedin`/`github`/`website` should be the URL",
    "as written. `currentTitle`/`currentCompany` should reflect the most recent position.",
    "",
    "For anything else useful — visa/work authorization status, notice period, salary expectations,",
    "certifications, availability, portfolio links, or anything else clearly stated — add it to",
    "`extraFields` as {key, value} pairs with a clear, human-readable key. Don't force unrelated",
    "information into the well-known fields above, and don't duplicate a well-known field in extraFields.",
    "",
    "Also extract:",
    "- `summary`: a short professional summary, in the applicant's own words if the documents have one, otherwise \"\".",
    "- `experience`: each work history entry with title, company, startDate, endDate (\"Present\" if current), and bullets (the document's own bullet points, as separate strings).",
    "- `education`: each entry with school, degree, field, startDate, endDate.",
    "- `skills`: a flat list of skill strings.",
    "- `languages`: each spoken/written language with name and proficiency (e.g. \"Native\", \"Fluent\", \"Conversational\") — only if the documents actually mention languages.",
    "",
    "Never invent information that isn't in the document(s). Use empty strings/arrays for anything not present.",
  ].join("\n");
}

/** Parse a model's JSON-mode response into a ResumeExtraction, tolerating
 * either a bare object or one wrapping it, and dropping malformed array
 * entries rather than failing the whole parse — extraction is best-effort;
 * the user always gets a chance to fix it by hand afterward. `fields` in the
 * result is the anchor keys merged with `extraFields`, so downstream code
 * just sees one flat open key-value bag. */
export function parseResumeExtraction(content: string): ResumeExtraction {
  const emptyAnchors = Object.fromEntries(RESUME_ANCHOR_KEYS.map((k) => [k, ""]));
  const empty: ResumeExtraction = {
    fields: emptyAnchors,
    summary: "",
    experience: [],
    education: [],
    skills: [],
    languages: [],
  };

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return empty;
  }

  let obj = parsed as Record<string, unknown>;
  if (!obj || typeof obj !== "object") return empty;
  if (!RESUME_ANCHOR_KEYS.some((k) => k in obj) && !("experience" in obj)) {
    const nested = Object.values(obj).find(
      (v) =>
        v &&
        typeof v === "object" &&
        (RESUME_ANCHOR_KEYS.some((k) => k in (v as object)) || "experience" in (v as object))
    );
    if (nested) obj = nested as Record<string, unknown>;
  }

  const fields: Record<string, string> = { ...emptyAnchors };
  for (const key of RESUME_ANCHOR_KEYS) {
    const value = obj[key];
    if (typeof value === "string") fields[key] = value.trim();
  }

  const extraFields: ExtraField[] = Array.isArray(obj.extraFields)
    ? obj.extraFields.filter(
        (e): e is ExtraField =>
          !!e &&
          typeof e === "object" &&
          typeof (e as ExtraField).key === "string" &&
          (e as ExtraField).key.trim() !== "" &&
          typeof (e as ExtraField).value === "string" &&
          (e as ExtraField).value.trim() !== ""
      )
    : [];
  for (const { key, value } of extraFields) fields[key.trim()] = value.trim();

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

  const languages = Array.isArray(obj.languages)
    ? obj.languages
        .filter((l): l is Record<string, unknown> => !!l && typeof l === "object")
        .map((l) => ({
          name: typeof l.name === "string" ? l.name.trim() : "",
          proficiency: typeof l.proficiency === "string" ? l.proficiency.trim() : "",
        }))
        .filter((l) => l.name)
    : [];

  return { fields, summary, experience, education, skills, languages };
}

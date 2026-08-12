import type { Store } from "../main/store";
import type { ExtraField, FieldFill, PageSnapshot, ResumeExtraction } from "./types";
import { RESUME_ANCHOR_KEYS } from "./types";

/** System prompt seeded with the profile so the model can help fill
 * applications. `pageContext` is the text of the page the user is looking at,
 * passed by the extension's in-page chat panel — with it the assistant can
 * answer about *this* posting ("does my background fit?", "draft an answer to
 * question 3") instead of being told about it second-hand. */
export function buildSystemPrompt(store: Store, pageContext?: string): string {
  const lines = Object.entries(store.data)
    .filter(([, value]) => value)
    .map(([key, value]) => `- ${key}: ${value}`);
  const profileText = lines.length ? lines.join("\n") : "(no info saved yet)";
  const prompt = [
    "You are JSeeker's assistant, helping the user complete job applications.",
    "Be concise and practical. Help draft and tailor answers to application questions,",
    "and use the user's saved info below when it is relevant.",
    "",
    "The user's saved info:",
    profileText,
  ];

  if (pageContext?.trim()) {
    prompt.push(
      "",
      "The user is currently on this page — usually the posting they're applying to.",
      "Ground your answers in it, and say so if they ask about something it doesn't cover.",
      "",
      "--- page ---",
      pageContext.trim(),
      "--- end page ---"
    );
  }

  return prompt.join("\n");
}

/** Everything the model should know about the applicant when filling a form:
 * the flat profile bag plus the structured resume, flattened to text. Richer
 * than the chat system prompt's profile block on purpose — application forms
 * ask for employers, dates and schools, not just contact details. */
function buildApplicantBlock(store: Store): string {
  const lines = Object.entries(store.data)
    .filter(([, value]) => value)
    .map(([key, value]) => `- ${key}: ${value}`);

  const { summary, skills, experience, education, languages } = store.resume;
  if (summary) lines.push(`- summary: ${summary}`);
  if (skills.length) lines.push(`- skills: ${skills.join(", ")}`);
  if (languages.length) {
    lines.push(`- languages: ${languages.map((l) => `${l.name} (${l.proficiency})`).join(", ")}`);
  }
  for (const e of experience) {
    lines.push(`- experience: ${e.title} at ${e.company} (${e.startDate} – ${e.endDate})`);
    for (const b of e.bullets) lines.push(`    · ${b}`);
  }
  for (const e of education) {
    lines.push(`- education: ${e.degree} ${e.field} at ${e.school} (${e.startDate} – ${e.endDate})`);
  }

  return lines.length ? lines.join("\n") : "(no info saved)";
}

/** Builds the shared prompt for whole-page autofill: the applicant's profile
 * plus a snapshot of the page the extension is looking at, asking the model
 * to find the fillable controls itself and answer with the `jid` of each one
 * it can fill (see src/main/extensionServer.ts POST /autofill, and
 * extension/content.js for how the snapshot is produced and applied). */
export function buildPageAutofillPrompt(store: Store, snapshot: PageSnapshot): string {
  return [
    "You are filling out a job application form on behalf of the applicant described below.",
    "",
    "Applicant profile:",
    buildApplicantBlock(store),
    "",
    `Page: ${snapshot.title || "(untitled)"} — ${snapshot.url || "(unknown url)"}`,
    "",
    "The page's visible content follows. Every field the user can fill appears on its own line",
    'as a tag carrying jid="…" — that id is how you refer to the field, so copy it exactly.',
    "Lines without a tag are the page's own text: headings, questions and instructions that tell",
    "you what the fields near them are asking for.",
    "",
    "--- page ---",
    snapshot.page,
    "--- end page ---",
    "",
    "Return one entry per field you can fill, each with the field's exact jid and a value:",
    '- text inputs and <textarea>: `value` is the text to type. For open questions ("why do you',
    '  want this role?", "describe your experience with X"), write a short, specific answer',
    "  grounded in the profile above — a few sentences, first person, no placeholders.",
    "- <select>: `value` must be one of that field's listed options, copied verbatim.",
    '- radio buttons and checkboxes: `value` is "true" for the option that should be selected.',
    "  Radios sharing a `name` are one question — select at most one of them.",
    "",
    'Skip any field that already shows current="…" — the user filled that one already.',
    "Skip fields the profile can't answer, and anything asking for a password, a payment detail,",
    "or a file upload. Never invent employers, dates, degrees, salary figures, or work",
    "authorization / visa / demographic answers that the profile doesn't state — leaving a",
    "field for the user to complete is always better than guessing at one.",
  ].join("\n");
}

/** Parse a model's JSON-mode response into field fills, tolerating either a
 * bare array or an object wrapping one, and coercing the id to a string (a
 * model that sees jid="12" will sometimes answer with the number 12). */
export function parseFieldFills(content: string): FieldFill[] {
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

  const fills: FieldFill[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const { id, value } = item as { id?: unknown; value?: unknown };
    const key = typeof id === "string" ? id.trim() : typeof id === "number" ? String(id) : "";
    if (!key || seen.has(key)) continue;
    if (typeof value !== "string" || value.trim() === "") continue;
    seen.add(key);
    fills.push({ id: key, value });
  }
  return fills;
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

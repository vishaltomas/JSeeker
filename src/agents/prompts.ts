import type { Store } from "../main/store";
import type { ExtraField, ResumeExtraction } from "./types";
import { RESUME_ANCHOR_KEYS } from "./types";

/** System prompt seeded with the profile so the model can write the user's
 * resumes and cover letters. `context` is whatever the user is looking at
 * while they ask — the job posting, passed by the extension's in-page panel,
 * or the `.resb` document open in the editor, passed by its assistant dock.
 * Either way it lets the assistant answer about *this* one ("does my
 * background fit?", "tighten the second bullet") rather than being told about
 * it second-hand. */
export function buildSystemPrompt(
  store: Store,
  context?: string,
  options: { tools?: boolean } = {}
): string {
  const lines = Object.entries(store.data)
    .filter(([, value]) => value)
    .map(([key, value]) => `- ${key}: ${value}`);
  const profileText = lines.length ? lines.join("\n") : "(no info saved yet)";
  const prompt = [
    "You are JSeeker's assistant. The app does one thing — resumes and cover letters — and",
    "so do you: write them, tailor them to a posting, and rework the wording of one the user",
    "already has. Be concise and practical, and use the user's saved info below when it is",
    "relevant.",
    "",
    "The user's saved info:",
    profileText,
  ];

  if (options.tools) {
    prompt.push(
      "",
      // The block above is the flat key-value bag only — the user's actual
      // work history lives in the structured resume, which `read_profile`
      // returns and nothing else here does. Without this the model answers
      // "write my resume" from a name and a job title, and fills the rest in
      // from imagination.
      "The list above is only the user's saved fields. Their work history, education,",
      "skills and summary are not in it — call `read_profile` to read those. Do that",
      "before writing a resume, a cover letter, or any answer about their background,",
      "and never state experience you haven't read.",
      "Use `read_web_page` whenever the user gives you a link, rather than guessing at",
      "what the posting says.",
      "Documents are written in `.resb`, this app's own resume language, which you do not",
      "know until you have read it — call `load_skill` before writing or editing one, every",
      "time. `write_resume` and `write_cover_letter` put the result straight into the user's",
      "editor, where they can see it compile; that is where a drafted document belongs, not",
      "pasted into the chat. Tools that write — those two and `update_profile` — change the",
      "user's own files and profile, so use them when asked to, not speculatively."
    );
  }

  if (context?.trim()) {
    prompt.push(
      "",
      "What the user is looking at right now — the posting they're applying to, or the",
      "document open in their editor. Ground your answers in it, and say so if they ask",
      "about something it doesn't cover.",
      "",
      "--- context ---",
      context.trim(),
      "--- end context ---"
    );
  }

  return prompt.join("\n");
}

/** The applicant in full — the flat profile bag plus the structured resume.
 * Richer than the chat system prompt's profile block on purpose: writing a
 * cover letter needs employers, dates and bullet points, not just contact
 * details. */
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

/** What the panel's document buttons ask for. The posting itself rides in as
 * the page context, so this only has to say what to write and in what shape
 * — the output is downloaded as a file, so it must be the document itself
 * with no surrounding chat. */
export function buildDocumentPrompt(store: Store, kind: "cover-letter" | "resume"): string {
  const shared = [
    "Applicant:",
    buildApplicantBlock(store),
    "",
    "Write from the applicant's own experience and nothing else — never invent employers,",
    "dates, degrees, or numbers they haven't stated.",
    "Output only the document itself: no preamble, no commentary, no code fences.",
  ];

  if (kind === "cover-letter") {
    return [
      "Write a cover letter for the job posting on this page, for the applicant below.",
      "",
      ...shared,
      "",
      "Three or four short paragraphs, first person, addressed to the hiring team. Open with the",
      "specific role, connect two or three things from their background to what the posting asks",
      "for, and close briefly. No greeting placeholders like [Hiring Manager Name] — if you don't",
      "know a name, address the team.",
    ].join("\n");
  }

  return [
    "Write a resume for the applicant below, tailored to the job posting on this page.",
    "",
    ...shared,
    "",
    "Plain Markdown: name and contact details at the top, then a short summary, then experience",
    "(most recent first, with bullets), education, and skills. Reorder and reword their real",
    "bullets to lead with what this posting cares about — selection and emphasis only.",
  ].join("\n");
}

/** Builds the onboarding prompt asking a model to extract a profile from one
 * or more uploaded documents at once — deliberately open-ended rather than
 * hunting for a fixed list of fields: the well-known anchor keys are a guide
 * (so the most-used fields land under predictable names in the Profile UI),
 * not a restriction — anything else useful goes in `extraFields` with
 * whatever key name fits. */
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

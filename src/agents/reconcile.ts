// Folds a freshly read document into the profile the user already has,
// without losing either side.
//
// The rule everywhere below is the same: never overwrite something the user
// already has, add whatever the document knows that the profile doesn't, and
// report anything the two disagree about so the user can settle it. Deciding
// "does the profile already say this?" is what agents/embeddings.ts is for —
// a document rarely repeats an entry word for word.

import { randomUUID } from "crypto";
import type {
  LanguageEntry,
  ProfileData,
  ResumeEducation,
  ResumeExperience,
  StructuredResume,
} from "../main/store";
import { createSimilarity, type Similarity, type SimilarityKind, type SimilarityMode } from "./embeddings";
import type { ProgressSink } from "./types";

export interface SectionReport {
  /** Entries the document had that the profile didn't. */
  added: number;
  /** Entries recognised as ones the profile already had. */
  matched: number;
  /** Matched entries that gained detail (a blank field or a new bullet). */
  enriched: number;
}

export interface FieldConflict {
  key: string;
  kept: string;
  incoming: string;
}

export interface MergeReport {
  /** How entries were compared — "lexical" means the embedding model wasn't
   * available, so matching was by word overlap only. */
  mode: SimilarityMode;
  fieldsAdded: string[];
  fieldConflicts: FieldConflict[];
  summary: "kept" | "added" | "extended";
  experience: SectionReport;
  bulletsAdded: number;
  education: SectionReport;
  skills: SectionReport;
  languages: SectionReport;
}

export interface MergeResult {
  fields: ProfileData;
  resume: StructuredResume;
  report: MergeReport;
}

function emptySection(): SectionReport {
  return { added: 0, matched: 0, enriched: 0 };
}

/** Identity text for an entry — what actually gets embedded and compared.
 * Dates are deliberately left out: the same job written down twice often
 * carries different date formats, and a role is identified by what it was
 * and where. */
function experienceText(e: { title: string; company: string }): string {
  return [e.title, e.company].filter((s) => s.trim()).join(" at ");
}

function educationText(e: { school: string; degree: string; field: string }): string {
  const qualification = [e.degree, e.field].filter((s) => s.trim()).join(" ");
  return [qualification, e.school].filter((s) => s.trim()).join(" at ");
}

/** Values like phone numbers and postcodes are short, atomic, and embed
 * confusingly close to each other, so profile fields are compared by
 * normalised equality rather than by meaning. */
function sameFieldValue(a: string, b: string): boolean {
  const clean = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  return clean(a) === clean(b);
}

/** Greedy best-match: pairs each incoming entry with the closest unclaimed
 * entry already in the profile, if any clears the threshold. */
function findMatch<A, B>(
  incoming: A,
  candidates: B[],
  claimed: Set<number>,
  textOf: (item: A | B) => string,
  similarity: Similarity,
  kind: SimilarityKind
): number {
  const needle = textOf(incoming);
  if (!needle.trim()) return -1;

  let bestIndex = -1;
  let bestScore = 0;
  candidates.forEach((candidate, index) => {
    if (claimed.has(index)) return;
    const score = similarity.score(needle, textOf(candidate));
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });

  return bestIndex >= 0 && similarity.matches(needle, textOf(candidates[bestIndex]), kind)
    ? bestIndex
    : -1;
}

/** Copies over only the fields the existing entry left blank. */
function fillBlanks<T extends object>(current: T, incoming: T, keys: (keyof T)[]): { next: T; changed: boolean } {
  const next = { ...current };
  let changed = false;
  for (const key of keys) {
    const existing = String(current[key] ?? "").trim();
    const candidate = String(incoming[key] ?? "").trim();
    if (!existing && candidate) {
      next[key] = incoming[key];
      changed = true;
    }
  }
  return { next, changed };
}

function mergeBullets(current: string[], incoming: string[], similarity: Similarity): string[] {
  const kept = current.filter((b) => b.trim());
  for (const bullet of incoming) {
    if (!bullet.trim()) continue;
    if (kept.some((existing) => similarity.matches(existing, bullet, "bullet"))) continue;
    kept.push(bullet);
  }
  return kept;
}

function mergeExperience(
  current: ResumeExperience[],
  incoming: ResumeExperience[],
  similarity: Similarity,
  report: MergeReport
): ResumeExperience[] {
  const merged = [...current];
  const claimed = new Set<number>();

  for (const entry of incoming) {
    if (!entry.title.trim() && !entry.company.trim()) continue;
    const index = findMatch(entry, merged, claimed, experienceText, similarity, "entry");

    if (index < 0) {
      merged.push({ ...entry, id: entry.id || randomUUID() });
      report.experience.added++;
      continue;
    }

    claimed.add(index);
    report.experience.matched++;
    const { next, changed } = fillBlanks(merged[index], entry, ["title", "company", "startDate", "endDate"]);
    const bullets = mergeBullets(next.bullets, entry.bullets, similarity);
    const bulletsAdded = bullets.length - next.bullets.filter((b) => b.trim()).length;
    report.bulletsAdded += bulletsAdded;
    if (changed || bulletsAdded > 0) report.experience.enriched++;
    merged[index] = { ...next, bullets };
  }

  return merged;
}

function mergeEducation(
  current: ResumeEducation[],
  incoming: ResumeEducation[],
  similarity: Similarity,
  report: MergeReport
): ResumeEducation[] {
  const merged = [...current];
  const claimed = new Set<number>();

  for (const entry of incoming) {
    if (!entry.school.trim() && !entry.degree.trim()) continue;
    const index = findMatch(entry, merged, claimed, educationText, similarity, "education");

    if (index < 0) {
      merged.push({ ...entry, id: entry.id || randomUUID() });
      report.education.added++;
      continue;
    }

    claimed.add(index);
    report.education.matched++;
    const { next, changed } = fillBlanks(merged[index], entry, [
      "school",
      "degree",
      "field",
      "startDate",
      "endDate",
    ]);
    if (changed) report.education.enriched++;
    merged[index] = next;
  }

  return merged;
}

function mergeSkills(
  current: string[],
  incoming: string[],
  similarity: Similarity,
  report: MergeReport
): string[] {
  const merged = [...current];
  for (const skill of incoming) {
    if (!skill.trim()) continue;
    if (merged.some((existing) => similarity.matches(existing, skill, "term"))) {
      report.skills.matched++;
      continue;
    }
    merged.push(skill);
    report.skills.added++;
  }
  return merged;
}

function mergeLanguages(
  current: LanguageEntry[],
  incoming: LanguageEntry[],
  similarity: Similarity,
  report: MergeReport
): LanguageEntry[] {
  const merged = [...current];
  const claimed = new Set<number>();

  for (const entry of incoming) {
    if (!entry.name.trim()) continue;
    const index = findMatch(entry, merged, claimed, (l) => l.name, similarity, "term");

    if (index < 0) {
      merged.push({ ...entry, id: entry.id || randomUUID() });
      report.languages.added++;
      continue;
    }

    claimed.add(index);
    report.languages.matched++;
    const { next, changed } = fillBlanks(merged[index], entry, ["name", "proficiency"]);
    if (changed) report.languages.enriched++;
    merged[index] = next;
  }

  return merged;
}

/** Every string that will take part in a comparison, gathered up front so the
 * embedding model is called once for the whole merge. */
function corpusFor(current: StructuredResume, incoming: StructuredResume): string[] {
  const texts: string[] = [current.summary, incoming.summary];
  for (const resume of [current, incoming]) {
    for (const e of resume.experience) {
      texts.push(experienceText(e), ...e.bullets);
    }
    for (const e of resume.education) texts.push(educationText(e));
    for (const l of resume.languages) texts.push(l.name);
    texts.push(...resume.skills);
  }
  return texts.filter((t) => t.trim());
}

/** Merges an extraction into the profile. `host`/`embedModel` point at the
 * Ollama instance used for the similarity check; if it can't be reached the
 * merge still happens, on lexical comparison (see `report.mode`). */
export async function reconcileProfile(
  host: string,
  embedModel: string,
  current: { fields: ProfileData; resume: StructuredResume },
  incoming: { fields: ProfileData; resume: StructuredResume },
  onProgress?: ProgressSink
): Promise<MergeResult> {
  const similarity = await createSimilarity(
    host,
    embedModel,
    corpusFor(current.resume, incoming.resume),
    onProgress
  );
  onProgress?.({ stage: "comparing", mode: similarity.mode });

  const report: MergeReport = {
    mode: similarity.mode,
    fieldsAdded: [],
    fieldConflicts: [],
    summary: "kept",
    experience: emptySection(),
    bulletsAdded: 0,
    education: emptySection(),
    skills: emptySection(),
    languages: emptySection(),
  };

  const fields: ProfileData = { ...current.fields };
  for (const [key, value] of Object.entries(incoming.fields)) {
    if (!value.trim()) continue;
    const existing = fields[key]?.trim();
    if (!existing) {
      fields[key] = value;
      report.fieldsAdded.push(key);
    } else if (!sameFieldValue(existing, value)) {
      // The user's value stands; the document's is surfaced for them to pick.
      report.fieldConflicts.push({ key, kept: existing, incoming: value });
    }
  }

  const currentSummary = current.resume.summary.trim();
  const incomingSummary = incoming.resume.summary.trim();
  let summary = current.resume.summary;
  if (incomingSummary && !currentSummary) {
    summary = incoming.resume.summary;
    report.summary = "added";
  } else if (incomingSummary && !similarity.matches(currentSummary, incomingSummary, "summary")) {
    // Says something the existing summary doesn't — appended rather than
    // swapped in, so the user can cut whichever half they don't want.
    summary = `${currentSummary}\n\n${incomingSummary}`;
    report.summary = "extended";
  }

  const resume: StructuredResume = {
    summary,
    experience: mergeExperience(current.resume.experience, incoming.resume.experience, similarity, report),
    education: mergeEducation(current.resume.education, incoming.resume.education, similarity, report),
    skills: mergeSkills(current.resume.skills, incoming.resume.skills, similarity, report),
    languages: mergeLanguages(current.resume.languages, incoming.resume.languages, similarity, report),
  };

  return { fields, resume, report };
}

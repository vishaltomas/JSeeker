import { useEffect, useState } from "react";
import { Loader2, Plus, Sparkles, Trash2, X } from "lucide-react";
import type {
  LanguageEntry,
  MergeReport,
  ParseProgress,
  ProfileData,
  ResumeEducation,
  ResumeExperience,
  ResumeParseResult,
  SectionReport,
  Store,
  StructuredResume,
} from "../types";
import { KeyValueEditor } from "./KeyValueEditor";
import { ProfileTimeline } from "./ProfileTimeline";
import { formatElapsed, progressLabel } from "./parseProgress";
import {
  cx,
  fieldInput,
  fieldLabel,
  gradientBtn,
  gradientBtnPrimary,
  gradientIconBtn,
  panelH2,
  sectionHint,
  statusText,
  viewSection,
} from "../ui";

interface ProfileViewProps {
  visible: boolean;
  store: Store;
  persist: (next: Store) => void;
}

type Section =
  | "personal"
  | "professional"
  | "additional"
  | "summary"
  | "experience"
  | "education"
  | "timeline"
  | "languages"
  | "skills"
  | "documents";

const SECTION_ORDER: Section[] = [
  "personal",
  "professional",
  "additional",
  "summary",
  "experience",
  "education",
  "timeline",
  "languages",
  "skills",
  "documents",
];

const SECTION_LABELS: Record<Section, string> = {
  personal: "Personal info",
  professional: "Professional",
  additional: "Additional info",
  summary: "Summary",
  experience: "Work experience",
  education: "Education",
  timeline: "Timeline",
  languages: "Languages",
  skills: "Skills",
  documents: "Documents",
};

/** Mirrors agents/types.ts RESUME_ANCHOR_KEYS — the well-known fields the
 * browser extension's heuristic matcher looks up by exact name. Shown here
 * as labeled fields (grouped into categories) instead of freeform rows;
 * anything else in `data` is open-ended and lives in "Additional info". */
const PERSONAL_KEYS = ["firstName", "lastName", "email", "phone", "address", "city", "state", "zip", "country"] as const;
const PROFESSIONAL_KEYS = ["linkedin", "github", "website", "currentTitle", "currentCompany"] as const;
const ANCHOR_KEYS: readonly string[] = [...PERSONAL_KEYS, ...PROFESSIONAL_KEYS];

const PERSONAL_LABELS: Record<(typeof PERSONAL_KEYS)[number], string> = {
  firstName: "First name",
  lastName: "Last name",
  email: "Email",
  phone: "Phone",
  address: "Address",
  city: "City",
  state: "State",
  zip: "ZIP / postal code",
  country: "Country",
};

const PROFESSIONAL_LABELS: Record<(typeof PROFESSIONAL_KEYS)[number], string> = {
  linkedin: "LinkedIn",
  github: "GitHub",
  website: "Website",
  currentTitle: "Current title",
  currentCompany: "Current company",
};

function basename(p: string): string {
  return p.split(/[\\/]/).pop() ?? p;
}

function newId(): string {
  return crypto.randomUUID();
}

function blankExperience(): ResumeExperience {
  return { id: newId(), title: "", company: "", startDate: "", endDate: "", bullets: [] };
}

function blankEducation(): ResumeEducation {
  return { id: newId(), school: "", degree: "", field: "", startDate: "", endDate: "" };
}

function blankLanguage(): LanguageEntry {
  return { id: newId(), name: "", proficiency: "" };
}

function extraFieldsOf(data: ProfileData): ProfileData {
  const out: ProfileData = {};
  for (const [k, v] of Object.entries(data)) if (!ANCHOR_KEYS.includes(k)) out[k] = v;
  return out;
}

/** One line per section of a merge report — only sections that actually
 * changed or matched something are worth showing. */
function reportLines(report: MergeReport): string[] {
  const lines: string[] = [];
  const section = (label: string, r: SectionReport, extra?: string): void => {
    if (!r.added && !r.matched) return;
    const parts = [
      r.added ? `${r.added} new` : null,
      r.matched ? `${r.matched} already there` : null,
      r.enriched ? `${r.enriched} filled out further` : null,
      extra,
    ].filter(Boolean);
    lines.push(`${label}: ${parts.join(", ")}`);
  };

  if (report.fieldsAdded.length) lines.push(`Fields added: ${report.fieldsAdded.join(", ")}`);
  if (report.summary === "added") lines.push("Summary: taken from the document");
  if (report.summary === "extended") lines.push("Summary: the document's version appended below yours");
  section("Experience", report.experience, report.bulletsAdded ? `${report.bulletsAdded} new bullet points` : undefined);
  section("Education", report.education);
  section("Skills", report.skills);
  section("Languages", report.languages);
  return lines;
}

/** Human-readable tally of what an extraction pass turned up. */
function extractionCounts(result: ResumeParseResult): string[] {
  const fieldCount = Object.values(result.fields).filter((v) => v.trim()).length;
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  return [
    fieldCount ? plural(fieldCount, "profile field", "profile fields") : null,
    result.resume.summary.trim() ? "a summary" : null,
    result.resume.experience.length ? plural(result.resume.experience.length, "work experience", "work experiences") : null,
    result.resume.education.length ? plural(result.resume.education.length, "education entry", "education entries") : null,
    result.resume.skills.length ? plural(result.resume.skills.length, "skill", "skills") : null,
    result.resume.languages.length ? plural(result.resume.languages.length, "language", "languages") : null,
  ].filter((s): s is string => s !== null);
}

function navItemClass(active: boolean): string {
  return cx(
    "cursor-pointer rounded-lg px-3 py-2.5 text-left text-[13px]",
    active ? "bg-accent-soft font-semibold text-white" : "text-ink-soft hover:bg-surface-3"
  );
}

const cardClass = "mb-3 rounded-lg border border-line bg-surface-2 p-3.5";
const rowClass = "grid grid-cols-2 gap-2.5";

export function ProfileView({ visible, store, persist }: ProfileViewProps) {
  const [section, setSection] = useState<Section>("personal");
  const [data, setData] = useState(store.data);
  const [resume, setResume] = useState<StructuredResume>(store.resume);
  const [resumeFiles, setResumeFiles] = useState(store.resumeFiles);
  const [skillDraft, setSkillDraft] = useState("");
  const [status, setStatus] = useState("");
  // Documents tab: the pending extraction awaiting the user's decision on how
  // to fold it into the profile. Null when nothing has been processed yet.
  const [extracted, setExtracted] = useState<ResumeParseResult | null>(null);
  const [processing, setProcessing] = useState(false);
  const [merging, setMerging] = useState(false);
  const [progress, setProgress] = useState<ParseProgress | null>(null);
  // Seconds since the current step started, so a long silent stretch still
  // visibly ticks over.
  const [elapsed, setElapsed] = useState(0);
  // What the last merge changed, shown until the next processing run.
  const [report, setReport] = useState<MergeReport | null>(null);
  // Bumped on Save so <KeyValueEditor> (which owns its own row state)
  // remounts with fresh rows instead of keeping whatever it had staged.
  const [editorVersion, setEditorVersion] = useState(0);

  const busy = processing || merging;

  useEffect(() => {
    window.api.onResumeProgress(setProgress);
    return () => window.api.onResumeProgress(null);
  }, []);

  useEffect(() => {
    if (!busy) return;
    const startedAt = Date.now();
    setElapsed(0);
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [busy]);

  function setField(key: string, value: string): void {
    setData((d) => ({ ...d, [key]: value }));
  }

  function setExtraFields(next: ProfileData): void {
    setData((d) => {
      const anchorPart: ProfileData = {};
      for (const k of ANCHOR_KEYS) if (k in d) anchorPart[k] = d[k];
      return { ...anchorPart, ...next };
    });
  }

  function updateExperience(id: string, patch: Partial<ResumeExperience>): void {
    setResume((r) => ({ ...r, experience: r.experience.map((e) => (e.id === id ? { ...e, ...patch } : e)) }));
  }

  function updateEducation(id: string, patch: Partial<ResumeEducation>): void {
    setResume((r) => ({ ...r, education: r.education.map((e) => (e.id === id ? { ...e, ...patch } : e)) }));
  }

  function updateLanguage(id: string, patch: Partial<LanguageEntry>): void {
    setResume((r) => ({ ...r, languages: r.languages.map((l) => (l.id === id ? { ...l, ...patch } : l)) }));
  }

  function addSkill(): void {
    const skill = skillDraft.trim();
    if (!skill || resume.skills.includes(skill)) return;
    setResume((r) => ({ ...r, skills: [...r.skills, skill] }));
    setSkillDraft("");
  }

  async function addFiles(): Promise<void> {
    const picked = await window.api.pickResumeFiles();
    if (!picked.length) return;
    setResumeFiles((prev) => Array.from(new Set([...prev, ...picked])));
  }

  function removeFile(path: string): void {
    setResumeFiles((prev) => prev.filter((p) => p !== path));
  }

  /** Reads every uploaded document in one pass and stages the result for
   * review — nothing touches the profile until the user picks an apply mode. */
  async function processDocuments(): Promise<void> {
    if (!resumeFiles.length || processing) return;
    setStatus("");
    setExtracted(null);
    setReport(null);
    setProgress(null);
    setProcessing(true);
    try {
      setExtracted(await window.api.parseResume(resumeFiles));
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Could not read the documents.");
    } finally {
      setProcessing(false);
      setProgress(null);
    }
  }

  /** Hands the extraction and the profile as it stands to the main process,
   * which compares entry by entry (by meaning, not by exact text) and returns
   * a profile with the document's new content folded in and nothing existing
   * overwritten. */
  async function applyExtraction(): Promise<void> {
    if (!extracted || merging) return;
    setMerging(true);
    setStatus("");
    setProgress(null);
    try {
      const result = await window.api.mergeProfile(
        { fields: data, resume },
        { fields: extracted.fields, resume: extracted.resume }
      );
      if (result.error) {
        setStatus(result.error);
        return;
      }
      setData(result.fields);
      setResume(result.resume);
      setReport(result.report);
      setExtracted(null);
      // KeyValueEditor owns its rows, so it needs a remount to show new extras.
      setEditorVersion((v) => v + 1);
      setStatus("Merged into your profile — review the sections, then Save profile.");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Could not merge the documents.");
    } finally {
      setMerging(false);
      setProgress(null);
    }
  }

  function save(): void {
    const trimmedResume: StructuredResume = {
      summary: resume.summary.trim(),
      experience: resume.experience
        .filter((e) => e.title.trim() || e.company.trim())
        .map((e) => ({ ...e, title: e.title.trim(), company: e.company.trim() })),
      education: resume.education.filter((e) => e.school.trim()).map((e) => ({ ...e, school: e.school.trim() })),
      skills: resume.skills,
      languages: resume.languages.filter((l) => l.name.trim()).map((l) => ({ ...l, name: l.name.trim() })),
    };
    persist({ ...store, data, resume: trimmedResume, resumeFiles });
    setResume(trimmedResume);
    setEditorVersion((v) => v + 1);
    setStatus("Profile saved.");
  }

  return (
    <section className={viewSection(visible)}>
      <div className="flex items-center gap-3.5 border-b border-line-subtle px-6 py-4">
        <h1 className="text-xl font-bold">Profile</h1>
      </div>

      <div className="flex min-h-0 flex-1">
        <nav className="flex w-[200px] flex-shrink-0 flex-col gap-1 overflow-y-auto border-r border-line-subtle bg-surface-5 px-2.5 py-3.5">
          {SECTION_ORDER.map((s) => (
            <button key={s} className={navItemClass(section === s)} onClick={() => setSection(s)}>
              {SECTION_LABELS[s]}
            </button>
          ))}
        </nav>

        <div className="min-w-0 flex-1 overflow-y-auto px-7 py-6">
          {/* Sections stay mounted and are only hidden via CSS (not
              conditionally rendered) so unsaved edits in one tab survive
              switching to another. */}
          <div className={cx(section !== "personal" && "hidden")}>
            <h2 className={panelH2}>Personal info</h2>
            <div className={rowClass}>
              {PERSONAL_KEYS.map((key) => (
                <div key={key}>
                  <label className={fieldLabel}>{PERSONAL_LABELS[key]}</label>
                  <input className={fieldInput} value={data[key] ?? ""} onChange={(e) => setField(key, e.target.value)} />
                </div>
              ))}
            </div>
          </div>

          <div className={cx(section !== "professional" && "hidden")}>
            <h2 className={panelH2}>Professional</h2>
            <div className={rowClass}>
              {PROFESSIONAL_KEYS.map((key) => (
                <div key={key}>
                  <label className={fieldLabel}>{PROFESSIONAL_LABELS[key]}</label>
                  <input className={fieldInput} value={data[key] ?? ""} onChange={(e) => setField(key, e.target.value)} />
                </div>
              ))}
            </div>
          </div>

          <div className={cx(section !== "additional" && "hidden")}>
            <h2 className={panelH2}>Additional info</h2>
            <p className={sectionHint}>
              Anything else worth keeping — visa status, notice period, portfolio links. Extracted
              automatically from documents you upload, or add/edit fields by hand.
            </p>
            <KeyValueEditor
              key={editorVersion}
              initialValue={extraFieldsOf(data)}
              onChange={setExtraFields}
              addLabel="Add field"
              keyPlaceholder="e.g. Visa status"
              valuePlaceholder="Value"
              gradient
            />
          </div>

          <div className={cx(section !== "summary" && "hidden")}>
            <h2 className={panelH2}>Summary</h2>
            <p className={sectionHint}>A short professional summary.</p>
            <textarea
              className={cx(fieldInput, "min-h-[80px] resize-y")}
              value={resume.summary}
              onChange={(e) => setResume((r) => ({ ...r, summary: e.target.value }))}
            />
          </div>

          <div className={cx(section !== "experience" && "hidden")}>
            <h2 className={panelH2}>Work experience</h2>
            <p className={sectionHint}>One card per role, most recent first.</p>
            {resume.experience.map((exp) => (
              <div key={exp.id} className={cardClass}>
                <div className={rowClass}>
                  <div>
                    <label className={fieldLabel}>Title</label>
                    <input
                      className={fieldInput}
                      value={exp.title}
                      onChange={(e) => updateExperience(exp.id, { title: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className={fieldLabel}>Company</label>
                    <input
                      className={fieldInput}
                      value={exp.company}
                      onChange={(e) => updateExperience(exp.id, { company: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className={fieldLabel}>Start date</label>
                    <input
                      className={fieldInput}
                      placeholder="e.g. Jan 2022"
                      value={exp.startDate}
                      onChange={(e) => updateExperience(exp.id, { startDate: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className={fieldLabel}>End date</label>
                    <input
                      className={fieldInput}
                      placeholder="Present"
                      value={exp.endDate}
                      onChange={(e) => updateExperience(exp.id, { endDate: e.target.value })}
                    />
                  </div>
                </div>
                <div className="mt-2.5">
                  <label className={fieldLabel}>Bullet points (one per line)</label>
                  <textarea
                    className={cx(fieldInput, "min-h-[70px] resize-y")}
                    value={exp.bullets.join("\n")}
                    onChange={(e) => updateExperience(exp.id, { bullets: e.target.value.split("\n") })}
                  />
                </div>
                <button
                  type="button"
                  className={cx(gradientBtn, "mt-2.5")}
                  onClick={() => setResume((r) => ({ ...r, experience: r.experience.filter((e) => e.id !== exp.id) }))}
                >
                  <Trash2 size={13} className="mr-1 inline-block" />
                  Remove
                </button>
              </div>
            ))}
            <button
              type="button"
              className={gradientBtn}
              onClick={() => setResume((r) => ({ ...r, experience: [...r.experience, blankExperience()] }))}
            >
              <Plus size={13} className="mr-1 inline-block" />
              Add experience
            </button>
          </div>

          <div className={cx(section !== "education" && "hidden")}>
            <h2 className={panelH2}>Education</h2>
            {resume.education.map((edu) => (
              <div key={edu.id} className={cardClass}>
                <div className={rowClass}>
                  <div>
                    <label className={fieldLabel}>School</label>
                    <input
                      className={fieldInput}
                      value={edu.school}
                      onChange={(e) => updateEducation(edu.id, { school: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className={fieldLabel}>Degree</label>
                    <input
                      className={fieldInput}
                      value={edu.degree}
                      onChange={(e) => updateEducation(edu.id, { degree: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className={fieldLabel}>Field of study</label>
                    <input
                      className={fieldInput}
                      value={edu.field}
                      onChange={(e) => updateEducation(edu.id, { field: e.target.value })}
                    />
                  </div>
                  <div className={rowClass}>
                    <div>
                      <label className={fieldLabel}>Start date</label>
                      <input
                        className={fieldInput}
                        value={edu.startDate}
                        onChange={(e) => updateEducation(edu.id, { startDate: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className={fieldLabel}>End date</label>
                      <input
                        className={fieldInput}
                        value={edu.endDate}
                        onChange={(e) => updateEducation(edu.id, { endDate: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  className={cx(gradientBtn, "mt-2.5")}
                  onClick={() => setResume((r) => ({ ...r, education: r.education.filter((e) => e.id !== edu.id) }))}
                >
                  <Trash2 size={13} className="mr-1 inline-block" />
                  Remove
                </button>
              </div>
            ))}
            <button
              type="button"
              className={gradientBtn}
              onClick={() => setResume((r) => ({ ...r, education: [...r.education, blankEducation()] }))}
            >
              <Plus size={13} className="mr-1 inline-block" />
              Add education
            </button>
          </div>

          <div className={cx(section !== "timeline" && "hidden")}>
            <h2 className={panelH2}>Timeline</h2>
            <p className={sectionHint}>
              Your roles and studies in order, newest first — a quick check for gaps or dates that
              landed wrong. Built from Work experience and Education; edit them there.
            </p>
            <ProfileTimeline resume={resume} />
          </div>

          <div className={cx(section !== "languages" && "hidden")}>
            <h2 className={panelH2}>Languages</h2>
            {resume.languages.map((lang) => (
              <div key={lang.id} className="mb-2 flex min-w-0 items-center gap-2">
                <div className="min-w-0 flex-1">
                  <input
                    className={fieldInput}
                    placeholder="Language"
                    value={lang.name}
                    onChange={(e) => updateLanguage(lang.id, { name: e.target.value })}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <input
                    className={fieldInput}
                    placeholder="Proficiency — e.g. Native, Fluent, Conversational"
                    value={lang.proficiency}
                    onChange={(e) => updateLanguage(lang.id, { proficiency: e.target.value })}
                  />
                </div>
                <button
                  type="button"
                  className={gradientIconBtn}
                  title="Remove"
                  aria-label="Remove language"
                  onClick={() => setResume((r) => ({ ...r, languages: r.languages.filter((l) => l.id !== lang.id) }))}
                >
                  <X size={15} />
                </button>
              </div>
            ))}
            <button
              type="button"
              className={gradientBtn}
              onClick={() => setResume((r) => ({ ...r, languages: [...r.languages, blankLanguage()] }))}
            >
              <Plus size={13} className="mr-1 inline-block" />
              Add language
            </button>
          </div>

          <div className={cx(section !== "skills" && "hidden")}>
            <h2 className={panelH2}>Skills</h2>
            <div className="mb-2.5 flex flex-wrap gap-1.5">
              {resume.skills.map((skill) => (
                <span
                  key={skill}
                  className="flex items-center gap-1 rounded-full bg-surface-3 py-1 pl-2.5 pr-1.5 text-[12px] text-ink-soft"
                >
                  {skill}
                  <button
                    type="button"
                    className="flex h-4 w-4 cursor-pointer items-center justify-center rounded-full text-ink-faint transition-colors duration-150 hover:bg-gradient-to-r hover:from-[#6d28d9] hover:to-[#a855f7] hover:text-white active:from-[#4c1d95] active:to-[#7e22ce]"
                    aria-label={`Remove ${skill}`}
                    onClick={() => setResume((r) => ({ ...r, skills: r.skills.filter((s) => s !== skill) }))}
                  >
                    <X size={11} />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex min-w-0 gap-2">
              <div className="min-w-0 flex-1">
                <input
                  className={fieldInput}
                  placeholder="Add a skill…"
                  value={skillDraft}
                  onChange={(e) => setSkillDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addSkill();
                    }
                  }}
                />
              </div>
              <button type="button" className={gradientBtn} onClick={addSkill}>
                Add
              </button>
            </div>
          </div>

          <div className={cx(section !== "documents" && "hidden")}>
            <h2 className={panelH2}>Documents</h2>
            <p className={sectionHint}>
              Resume, cover letters, or anything else worth extracting info from — upload several
              at once and they're combined into one read. Process them to pull the details into the
              rest of your profile.
            </p>
            {resumeFiles.length === 0 && (
              <p className="mb-2.5 text-xs text-ink-faint">No documents uploaded yet.</p>
            )}
            {resumeFiles.map((path) => (
              <div key={path} className="mb-2 flex items-center gap-2 rounded-md border border-line bg-surface-2 px-3 py-2">
                <span className="min-w-0 flex-1 truncate text-[13px] text-ink-soft">{basename(path)}</span>
                <button
                  type="button"
                  className={cx(gradientIconBtn, "h-7 w-7")}
                  title="Remove"
                  aria-label="Remove document"
                  onClick={() => removeFile(path)}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            <div className="mt-1 flex flex-wrap gap-2">
              <button type="button" className={gradientBtn} disabled={processing} onClick={addFiles}>
                <Plus size={13} className="mr-1 inline-block" />
                Add files…
              </button>
              <button
                type="button"
                className={gradientBtnPrimary}
                disabled={processing || resumeFiles.length === 0}
                onClick={processDocuments}
              >
                {processing ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Loader2 size={13} className="animate-spin" />
                    Working…
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5">
                    <Sparkles size={13} />
                    Process documents
                  </span>
                )}
              </button>
            </div>

            {/* Live narration of the slow steps. The elapsed counter keeps
                ticking even while one step runs long, so a quiet minute
                doesn't look like a hang. */}
            {busy && (
              <div className="mt-2.5 flex min-w-0 items-center gap-2 rounded-md border border-line bg-surface-2 px-3 py-2">
                <Loader2 size={13} className="flex-shrink-0 animate-spin text-accent-light" />
                <span className="min-w-0 flex-1 truncate text-xs text-ink-soft">
                  {progress ? progressLabel(progress) : "Starting…"}
                </span>
                <span className="flex-shrink-0 text-[11px] tabular-nums text-ink-faint">
                  {formatElapsed(elapsed)}
                </span>
              </div>
            )}

            {extracted && (
              <div className="mt-3.5 rounded-lg border border-line bg-surface-2 p-3.5">
                <h3 className="mb-1 text-[13px] font-semibold">Extraction results</h3>
                {extracted.error && <p className="mb-2 text-xs text-status-warn">{extracted.error}</p>}
                {extracted.unsupportedFiles.length > 0 && (
                  <p className="mb-2 text-xs text-status-warn">
                    Only PDFs can be read automatically — {extracted.unsupportedFiles.map(basename).join(", ")}{" "}
                    stayed attached but {extracted.unsupportedFiles.length === 1 ? "wasn't" : "weren't"} read.
                  </p>
                )}
                {extractionCounts(extracted).length === 0 ? (
                  <p className="text-xs text-ink-faint">
                    Nothing usable came back from these documents. Try a different file, or fill the
                    sections in by hand.
                  </p>
                ) : (
                  <>
                    <p className="mb-3 text-xs text-ink-soft">Found {extractionCounts(extracted).join(", ")}.</p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className={gradientBtnPrimary}
                        disabled={merging}
                        onClick={applyExtraction}
                      >
                        {merging ? (
                          <span className="inline-flex items-center gap-1.5">
                            <Loader2 size={13} className="animate-spin" />
                            Working…
                          </span>
                        ) : (
                          "Add to profile"
                        )}
                      </button>
                      <button
                        type="button"
                        className={gradientBtn}
                        disabled={merging}
                        onClick={() => setExtracted(null)}
                      >
                        Discard
                      </button>
                    </div>
                    <p className="mt-2 text-[11px] text-ink-faint">
                      Each entry is compared against what's already in your profile, so a role you
                      already have gains only the details it was missing instead of being duplicated
                      or overwritten. Nothing is written to disk until you hit Save profile.
                    </p>
                  </>
                )}
              </div>
            )}

            {report && (
              <div className="mt-3.5 rounded-lg border border-line bg-surface-2 p-3.5">
                <h3 className="mb-1 text-[13px] font-semibold">What changed</h3>
                {reportLines(report).length === 0 && report.fieldConflicts.length === 0 ? (
                  <p className="text-xs text-ink-faint">
                    Everything in those documents was already in your profile — nothing to add.
                  </p>
                ) : (
                  <ul className="mb-1 list-disc pl-4 text-xs text-ink-soft">
                    {reportLines(report).map((line) => (
                      <li key={line} className="mb-0.5">
                        {line}
                      </li>
                    ))}
                  </ul>
                )}

                {report.fieldConflicts.length > 0 && (
                  <div className="mt-3">
                    <p className="mb-2 text-xs text-status-warn">
                      Your profile and the document disagree here. Yours was kept — swap it if the
                      document is more current.
                    </p>
                    {report.fieldConflicts.map((conflict) => (
                      <div key={conflict.key} className="mb-2 rounded-md border border-line bg-surface-0 px-3 py-2">
                        <div className="mb-1 text-[11px] text-ink-muted">{conflict.key}</div>
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{conflict.kept}</span>
                          <span className="text-[11px] text-ink-faint">vs</span>
                          <span className="min-w-0 flex-1 truncate text-[13px] text-ink-soft">
                            {conflict.incoming}
                          </span>
                          <button
                            type="button"
                            className={gradientBtn}
                            onClick={() => {
                              setField(conflict.key, conflict.incoming);
                              setReport((r) =>
                                r
                                  ? { ...r, fieldConflicts: r.fieldConflicts.filter((c) => c.key !== conflict.key) }
                                  : r
                              );
                              setEditorVersion((v) => v + 1);
                            }}
                          >
                            Use document's
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <p className="mt-2 text-[11px] text-ink-faint">
                  {report.mode === "embedding"
                    ? "Entries were compared by meaning using the local embedding model."
                    : `Entries were compared by text overlap — the local embedding model wasn't available, so close rewordings may have been added twice.`}
                </p>
              </div>
            )}
          </div>

          <button type="button" className={cx(gradientBtnPrimary, "mt-6")} onClick={save}>
            Save profile
          </button>
          <p className={statusText}>{status}</p>
        </div>
      </div>
    </section>
  );
}

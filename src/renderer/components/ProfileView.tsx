import { useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import type { LanguageEntry, ProfileData, ResumeEducation, ResumeExperience, Store, StructuredResume } from "../types";
import { KeyValueEditor } from "./KeyValueEditor";
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
  // Bumped on Save so <KeyValueEditor> (which owns its own row state)
  // remounts with fresh rows instead of keeping whatever it had staged.
  const [editorVersion, setEditorVersion] = useState(0);

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
              at once and they're combined into one read.
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
            <button type="button" className={cx(gradientBtn, "mt-1")} onClick={addFiles}>
              <Plus size={13} className="mr-1 inline-block" />
              Add files…
            </button>
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

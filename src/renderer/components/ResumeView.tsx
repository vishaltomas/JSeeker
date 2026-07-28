import { useEffect, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import type { ResumeEducation, ResumeExperience, Store, StructuredResume } from "../types";
import {
  btn,
  btnPrimary,
  cx,
  fieldInput,
  fieldLabel,
  panelH2,
  sectionHint,
  statusText,
  viewSection,
} from "../ui";

interface ResumeViewProps {
  visible: boolean;
  store: Store;
  persist: (next: Store) => void;
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

const cardClass = "mb-3 rounded-lg border border-line bg-surface-2 p-3.5";
const rowClass = "grid grid-cols-2 gap-2.5";

export function ResumeView({ visible, store, persist }: ResumeViewProps) {
  const activeProfile = store.profiles.find((p) => p.id === store.activeId) ?? store.profiles[0];

  const [resume, setResume] = useState<StructuredResume>(activeProfile.resume);
  const [skillDraft, setSkillDraft] = useState("");
  const [status, setStatus] = useState("");

  // Reset the draft editor whenever the active profile changes, same
  // convention ProfilesPanel.tsx uses for its own staged edits.
  useEffect(() => {
    setResume(activeProfile.resume);
    setStatus("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.activeId]);

  function updateExperience(id: string, patch: Partial<ResumeExperience>): void {
    setResume((r) => ({ ...r, experience: r.experience.map((e) => (e.id === id ? { ...e, ...patch } : e)) }));
  }

  function updateEducation(id: string, patch: Partial<ResumeEducation>): void {
    setResume((r) => ({ ...r, education: r.education.map((e) => (e.id === id ? { ...e, ...patch } : e)) }));
  }

  function addSkill(): void {
    const skill = skillDraft.trim();
    if (!skill || resume.skills.includes(skill)) return;
    setResume((r) => ({ ...r, skills: [...r.skills, skill] }));
    setSkillDraft("");
  }

  function save(): void {
    const trimmed: StructuredResume = {
      summary: resume.summary.trim(),
      experience: resume.experience
        .filter((e) => e.title.trim() || e.company.trim())
        .map((e) => ({ ...e, title: e.title.trim(), company: e.company.trim() })),
      education: resume.education.filter((e) => e.school.trim()).map((e) => ({ ...e, school: e.school.trim() })),
      skills: resume.skills,
    };
    const profiles = store.profiles.map((p) => (p.id === activeProfile.id ? { ...p, resume: trimmed } : p));
    persist({ ...store, profiles });
    setResume(trimmed);
    setStatus("Resume saved.");
  }

  return (
    <section className={viewSection(visible)}>
      <div className="flex items-center gap-3.5 border-b border-line-subtle px-6 py-4">
        <h1 className="text-xl font-bold">Resume</h1>
        <span className="text-xs text-ink-muted">{activeProfile.name}</span>
      </div>

      <div className="min-w-0 flex-1 overflow-y-auto px-7 py-6">
        <section className="mb-6">
          <h2 className={panelH2}>Summary</h2>
          <p className={sectionHint}>A short professional summary.</p>
          <textarea
            className={cx(fieldInput, "min-h-[80px] resize-y")}
            value={resume.summary}
            onChange={(e) => setResume((r) => ({ ...r, summary: e.target.value }))}
          />
        </section>

        <section className="mb-6">
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
                  onChange={(e) =>
                    updateExperience(exp.id, { bullets: e.target.value.split("\n") })
                  }
                />
              </div>
              <button
                type="button"
                className={cx(btn, "mt-2.5")}
                onClick={() => setResume((r) => ({ ...r, experience: r.experience.filter((e) => e.id !== exp.id) }))}
              >
                <Trash2 size={13} className="mr-1 inline-block" />
                Remove
              </button>
            </div>
          ))}
          <button
            type="button"
            className={btn}
            onClick={() => setResume((r) => ({ ...r, experience: [...r.experience, blankExperience()] }))}
          >
            <Plus size={13} className="mr-1 inline-block" />
            Add experience
          </button>
        </section>

        <section className="mb-6">
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
                className={cx(btn, "mt-2.5")}
                onClick={() => setResume((r) => ({ ...r, education: r.education.filter((e) => e.id !== edu.id) }))}
              >
                <Trash2 size={13} className="mr-1 inline-block" />
                Remove
              </button>
            </div>
          ))}
          <button
            type="button"
            className={btn}
            onClick={() => setResume((r) => ({ ...r, education: [...r.education, blankEducation()] }))}
          >
            <Plus size={13} className="mr-1 inline-block" />
            Add education
          </button>
        </section>

        <section className="mb-6">
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
                  className="flex h-4 w-4 cursor-pointer items-center justify-center rounded-full text-ink-faint hover:bg-surface-2 hover:text-danger-text"
                  aria-label={`Remove ${skill}`}
                  onClick={() => setResume((r) => ({ ...r, skills: r.skills.filter((s) => s !== skill) }))}
                >
                  <X size={11} />
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              className={cx(fieldInput, "flex-1")}
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
            <button type="button" className={btn} onClick={addSkill}>
              Add
            </button>
          </div>
        </section>

        <button type="button" className={btnPrimary} onClick={save}>
          Save resume
        </button>
        <p className={statusText}>{status}</p>
      </div>
    </section>
  );
}

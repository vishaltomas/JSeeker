import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { ProfileData, ProfileRecord, Store } from "../../types";
import {
  btn,
  btnBlock,
  btnPrimary,
  cx,
  fieldInput,
  fieldLabel,
  panelH2,
  sectionHint,
  statusText,
} from "../../ui";

const FIELDS: { key: string; label: string }[] = [
  { key: "firstName", label: "First name" },
  { key: "lastName", label: "Last name" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "address", label: "Street address" },
  { key: "city", label: "City" },
  { key: "state", label: "State / Province" },
  { key: "zip", label: "ZIP / Postal code" },
  { key: "country", label: "Country" },
  { key: "linkedin", label: "LinkedIn URL" },
  { key: "github", label: "GitHub URL" },
  { key: "website", label: "Website / Portfolio" },
  { key: "currentTitle", label: "Current title" },
  { key: "currentCompany", label: "Current company" },
];

function newId(): string {
  return "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function basename(p: string): string {
  return p.split(/[\\/]/).pop() ?? p;
}

/** Only the editable text fields — deliberately excludes resumePath, which is
 * set immediately by the resume picker rather than staged until Save. */
function pickFields(data: ProfileData): ProfileData {
  const out: ProfileData = {};
  for (const { key } of FIELDS) out[key] = data[key] ?? "";
  return out;
}

function profileItemClass(active: boolean): string {
  return cx(
    "cursor-pointer rounded-lg border px-[11px] py-2.5 text-[13px]",
    active
      ? "border-accent bg-accent-soft text-white"
      : "border-line bg-surface-2 text-ink-soft hover:border-[#3b3d42]"
  );
}

interface ProfilesPanelProps {
  store: Store;
  persist: (next: Store) => void;
}

export function ProfilesPanel({ store, persist }: ProfilesPanelProps) {
  const activeProfile = store.profiles.find((p) => p.id === store.activeId) ?? store.profiles[0];

  const [name, setName] = useState(activeProfile.name);
  const [fields, setFields] = useState<ProfileData>(() => pickFields(activeProfile.data));
  const [status, setStatus] = useState("");
  const nameInputRef = useRef<HTMLInputElement | null>(null);

  // Reset the draft editor whenever the selected profile changes — mirrors
  // the original re-rendering the form fresh from the store on every switch.
  useEffect(() => {
    setName(activeProfile.name);
    setFields(pickFields(activeProfile.data));
    setStatus("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.activeId]);

  function selectProfile(id: string): void {
    persist({ ...store, activeId: id });
  }

  function addProfile(): void {
    const record: ProfileRecord = { id: newId(), name: "New profile", data: {} };
    persist({ ...store, profiles: [...store.profiles, record], activeId: record.id });
    requestAnimationFrame(() => {
      nameInputRef.current?.focus();
      nameInputRef.current?.select();
    });
  }

  function deleteProfile(): void {
    if (store.profiles.length <= 1) {
      persist({
        ...store,
        profiles: [{ id: "default", name: "Default", data: {} }],
        activeId: "default",
      });
      return;
    }
    const remaining = store.profiles.filter((p) => p.id !== store.activeId);
    persist({ ...store, profiles: remaining, activeId: remaining[0].id });
  }

  function pickResume(): void {
    window.api.pickResume().then((picked) => {
      if (!picked) return;
      const profiles = store.profiles.map((p) =>
        p.id === activeProfile.id ? { ...p, data: { ...p.data, resumePath: picked } } : p
      );
      persist({ ...store, profiles });
      setStatus("Resume selected.");
    });
  }

  function saveProfile(): void {
    const trimmed: ProfileData = {};
    for (const key of Object.keys(fields)) trimmed[key] = fields[key].trim();

    const profiles = store.profiles.map((p) =>
      p.id === activeProfile.id
        ? { ...p, name: name.trim() || "Untitled", data: { ...p.data, ...trimmed } }
        : p
    );
    persist({ ...store, profiles });
    setStatus("Profile saved.");
  }

  const resumePath = activeProfile.data.resumePath ?? "";

  return (
    <section>
      <h2 className={panelH2}>Profiles</h2>
      <p className={sectionHint}>Keep a separate profile for each kind of role you apply to.</p>
      <div className="flex items-start gap-5">
        <div className="w-[220px] flex-shrink-0">
          <ul className="mb-2.5 flex list-none flex-col gap-1.5 p-0">
            {store.profiles.map((p) => (
              <li
                key={p.id}
                className={profileItemClass(p.id === store.activeId)}
                onClick={() => selectProfile(p.id)}
              >
                {p.name || "(unnamed)"}
              </li>
            ))}
          </ul>
          <button className={cx(btn, btnBlock)} onClick={addProfile}>
            + New profile
          </button>
        </div>

        <div className="min-w-0 flex-1">
          <div className="mb-3 flex gap-2">
            <input
              ref={nameInputRef}
              className="flex-1 rounded-lg border border-line-input bg-surface-0 px-[11px] py-2 text-sm font-semibold text-ink focus:border-accent focus:outline-none"
              placeholder="Profile name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <button className={btn} title="Delete this profile" onClick={deleteProfile}>
              Delete
            </button>
          </div>

          <form className="grid grid-cols-2 gap-2.5" onSubmit={(e: FormEvent) => e.preventDefault()}>
            {FIELDS.map(({ key, label }) => (
              <div key={key}>
                <label className={fieldLabel} htmlFor={`f-${key}`}>
                  {label}
                </label>
                <input
                  className={fieldInput}
                  id={`f-${key}`}
                  value={fields[key] ?? ""}
                  onChange={(e) => setFields({ ...fields, [key]: e.target.value })}
                />
              </div>
            ))}
          </form>

          <div className="mt-4 border-t border-line pt-3.5">
            <label className="mb-1.5 block text-[11px] text-ink-muted">Resume</label>
            <div className="flex items-center gap-2">
              <span className="flex-1 truncate text-xs text-ink-soft">
                {resumePath ? basename(resumePath) : "No file selected"}
              </span>
              <button className={btn} type="button" onClick={pickResume}>
                Choose…
              </button>
            </div>
          </div>

          <button className={cx(btnPrimary, btnBlock)} onClick={saveProfile}>
            Save profile
          </button>
          <p className={statusText}>{status}</p>
        </div>
      </div>
    </section>
  );
}

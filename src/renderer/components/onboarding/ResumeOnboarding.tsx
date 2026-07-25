import { useState } from "react";
import type { ProfileData, Store } from "../../types";
import { btn, btnBlock, btnPrimary, cx, fieldInput, fieldLabel, statusText } from "../../ui";
import { FIELDS } from "../settings/profileFields";

interface ResumeOnboardingProps {
  store: Store;
  persist: (next: Store) => void;
}

function basename(p: string): string {
  return p.split(/[\\/]/).pop() ?? p;
}

export function ResumeOnboarding({ store, persist }: ResumeOnboardingProps) {
  const [stage, setStage] = useState<"upload" | "review">("upload");
  const [filePath, setFilePath] = useState<string | null>(null);
  const [fields, setFields] = useState<ProfileData>({});
  const [unsupported, setUnsupported] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  const activeProfile = store.profiles.find((p) => p.id === store.activeId) ?? store.profiles[0];

  function finishOnboarding(extraData?: ProfileData): void {
    const profiles = store.profiles.map((p) =>
      p.id === activeProfile.id ? { ...p, data: { ...p.data, ...(extraData ?? {}) } } : p
    );
    persist({
      ...store,
      profiles,
      account: store.account ? { ...store.account, onboarded: true } : store.account,
    });
  }

  async function pickAndParse(): Promise<void> {
    const picked = await window.api.pickResume();
    if (!picked) return;
    setFilePath(picked);
    setUnsupported(false);
    setStatus("");
    setBusy(true);
    try {
      const result = await window.api.parseResume(picked);
      if (result.unsupported) {
        setUnsupported(true);
        setFields({});
      } else if (result.error) {
        setStatus(result.error);
        setFields(result.fields);
      } else {
        setFields(result.fields);
      }
    } finally {
      setBusy(false);
      setStage("review");
    }
  }

  function saveAndContinue(): void {
    const trimmed: ProfileData = {};
    for (const key of Object.keys(fields)) trimmed[key] = fields[key].trim();
    if (filePath) trimmed.resumePath = filePath;
    finishOnboarding(trimmed);
  }

  return (
    <div className="flex h-screen items-center justify-center bg-surface-0 font-sans text-ink">
      <div className="w-[460px] rounded-xl border border-line bg-surface-2 p-6">
        {stage === "upload" && (
          <>
            <h1 className="mb-1 text-lg font-bold">Add your resume</h1>
            <p className="mb-4 text-xs text-ink-faint">
              Upload a PDF resume and we'll read it to pre-fill your profile — you'll get a
              chance to review everything before it's saved.
            </p>
            <button
              type="button"
              className={cx(btnPrimary, "w-full")}
              disabled={busy}
              onClick={pickAndParse}
            >
              {busy ? "Reading your resume…" : "Choose resume file…"}
            </button>
            <button
              type="button"
              className={cx(btn, btnBlock)}
              disabled={busy}
              onClick={() => finishOnboarding()}
            >
              Skip for now
            </button>
          </>
        )}

        {stage === "review" && (
          <>
            <h1 className="mb-1 text-lg font-bold">Review your info</h1>
            <p className="mb-3 text-xs text-ink-faint">
              {unsupported
                ? "We can only auto-read PDF resumes right now — this file will still be attached to applications, but you'll need to fill in your details below by hand."
                : "Fix anything that doesn't look right — this becomes the info used to fill out applications."}
            </p>
            {filePath && (
              <p className="mb-3 truncate text-xs text-ink-soft">Resume: {basename(filePath)}</p>
            )}
            <div className="grid grid-cols-2 gap-2.5">
              {FIELDS.map(({ key, label }) => (
                <div key={key}>
                  <label className={fieldLabel} htmlFor={`ro-${key}`}>
                    {label}
                  </label>
                  <input
                    id={`ro-${key}`}
                    className={fieldInput}
                    value={fields[key] ?? ""}
                    onChange={(e) => setFields({ ...fields, [key]: e.target.value })}
                  />
                </div>
              ))}
            </div>
            <button type="button" className={cx(btnPrimary, btnBlock)} onClick={saveAndContinue}>
              Save & Continue
            </button>
            <button
              type="button"
              className={cx(btn, btnBlock)}
              onClick={() => {
                setStage("upload");
                setStatus("");
              }}
            >
              Upload a different file
            </button>
            <p className={statusText}>{status}</p>
          </>
        )}
      </div>
    </div>
  );
}

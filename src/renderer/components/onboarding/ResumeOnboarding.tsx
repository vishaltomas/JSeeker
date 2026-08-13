import { useEffect, useState } from "react";
import type { ParseProgress, ProfileData, Store, StructuredResume } from "../../types";
import { emptyResume } from "../../hooks/useAppStore";
import { KeyValueEditor } from "../KeyValueEditor";
import { formatElapsed, progressLabel } from "../parseProgress";
import { btn, btnBlock, btnPrimary, cx, statusText } from "../../ui";
import { Loader2, Trash2 } from "lucide-react";
import { WelcomeIntro } from "../welcome/WelcomeIntro";
import { WelcomeShell } from "../welcome/WelcomeShell";

interface ResumeOnboardingProps {
  store: Store;
  persist: (next: Store) => void;
}

function basename(p: string): string {
  return p.split(/[\\/]/).pop() ?? p;
}

export function ResumeOnboarding({ store, persist }: ResumeOnboardingProps) {
  const [stage, setStage] = useState<"welcome" | "upload" | "review">("welcome");
  const [filePaths, setFilePaths] = useState<string[]>([]);
  const [fields, setFields] = useState<ProfileData>({});
  const [resume, setResume] = useState<StructuredResume>(emptyResume());
  const [unsupportedFiles, setUnsupportedFiles] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  // Reading documents takes long enough that a bare spinner reads as a hang.
  const [progress, setProgress] = useState<ParseProgress | null>(null);
  const [elapsed, setElapsed] = useState(0);

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

  function finish(finalFields: ProfileData, finalResume: StructuredResume): void {
    persist({
      ...store,
      data: { ...store.data, ...finalFields },
      resume: finalResume,
      resumeFiles: filePaths,
      onboarded: true,
    });
  }

  async function addFiles(): Promise<void> {
    const picked = await window.api.pickResumeFiles();
    if (!picked.length) return;
    setFilePaths((prev) => Array.from(new Set([...prev, ...picked])));
  }

  /** Entry point from the welcome orb: pick files first, then drop into the
   * regular upload stage so the list can still be edited before extracting. */
  async function pickAndContinue(): Promise<void> {
    const picked = await window.api.pickResumeFiles();
    if (!picked.length) return;
    setFilePaths(picked);
    setStage("upload");
  }

  function removeFile(path: string): void {
    setFilePaths((prev) => prev.filter((p) => p !== path));
  }

  async function extractAndContinue(): Promise<void> {
    setStatus("");
    setProgress(null);
    setBusy(true);
    try {
      const result = await window.api.parseResume(filePaths);
      setUnsupportedFiles(result.unsupportedFiles);
      if (result.error) setStatus(result.error);
      setFields(result.fields);
      setResume(result.resume);
    } finally {
      setBusy(false);
      setProgress(null);
      setStage("review");
    }
  }

  const resumeCounts = [
    resume.experience.length ? `${resume.experience.length} work experience${resume.experience.length === 1 ? "" : "s"}` : null,
    resume.education.length ? `${resume.education.length} education entr${resume.education.length === 1 ? "y" : "ies"}` : null,
    resume.skills.length ? `${resume.skills.length} skill${resume.skills.length === 1 ? "" : "s"}` : null,
    resume.languages.length ? `${resume.languages.length} language${resume.languages.length === 1 ? "" : "s"}` : null,
  ].filter(Boolean);

  if (stage === "welcome") {
    return (
      <WelcomeShell>
        <WelcomeIntro
          greeting="Hi Welcome"
          message="Please upload the files that associate you for applying jobs"
          onPrimary={pickAndContinue}
          secondaryLabel="Skip for now"
          onSecondary={() => finish({}, emptyResume())}
        />
      </WelcomeShell>
    );
  }

  return (
    <WelcomeShell>
      <div className="w-[520px] rounded-xl border border-line bg-surface-2 p-6">
        {stage === "upload" && (
          <>
            <h1 className="mb-1 text-lg font-bold">Add your documents</h1>
            <p className="mb-4 text-xs text-ink-faint">
              Upload your resume, cover letter, or anything else worth reading — add as many as
              you like, they'll be combined into one read. You'll get a chance to review
              everything before it's saved.
            </p>

            {filePaths.length > 0 && (
              <div className="mb-3">
                {filePaths.map((path) => (
                  <div
                    key={path}
                    className="mb-1.5 flex items-center gap-2 rounded-md border border-line bg-surface-0 px-3 py-2"
                  >
                    <span className="min-w-0 flex-1 truncate text-[13px] text-ink-soft">{basename(path)}</span>
                    <button
                      type="button"
                      className="flex h-6 w-6 flex-shrink-0 cursor-pointer items-center justify-center rounded-md text-ink-faint hover:bg-surface-3 hover:text-danger-text"
                      aria-label="Remove"
                      onClick={() => removeFile(path)}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <button type="button" className={cx(btn, "w-full")} disabled={busy} onClick={addFiles}>
              + Add files…
            </button>
            <button
              type="button"
              className={cx(btnPrimary, btnBlock)}
              disabled={busy || filePaths.length === 0}
              onClick={extractAndContinue}
            >
              {busy ? (
                <span className="inline-flex items-center justify-center gap-2">
                  <Loader2 size={14} className="animate-spin" />
                  Working…
                </span>
              ) : (
                "Extract & Continue"
              )}
            </button>

            {busy && (
              <div className="mt-2 flex min-w-0 items-center gap-2 rounded-md border border-line bg-surface-0 px-3 py-2">
                <span className="min-w-0 flex-1 truncate text-[11px] text-ink-soft">
                  {progress ? progressLabel(progress) : "Starting…"}
                </span>
                <span className="flex-shrink-0 text-[11px] tabular-nums text-ink-faint">
                  {formatElapsed(elapsed)}
                </span>
              </div>
            )}
            <button
              type="button"
              className={cx(btn, btnBlock)}
              disabled={busy}
              onClick={() => finish({}, emptyResume())}
            >
              Skip for now
            </button>
          </>
        )}

        {stage === "review" && (
          <>
            <h1 className="mb-1 text-lg font-bold">Review your info</h1>
            <p className="mb-3 text-xs text-ink-faint">
              Fix anything that doesn't look right — this becomes the info used to fill out
              applications. Add or remove fields freely.
            </p>
            {unsupportedFiles.length > 0 && (
              <p className="mb-3 text-xs text-status-warn">
                Could only auto-read PDFs — {unsupportedFiles.map(basename).join(", ")} will stay
                attached as {unsupportedFiles.length === 1 ? "a document" : "documents"} but wasn't
                read.
              </p>
            )}
            {resumeCounts.length > 0 && (
              <p className="mb-3 text-xs text-ink-soft">
                Also found: {resumeCounts.join(", ")} — review the details in the Resume tab after.
              </p>
            )}

            <KeyValueEditor
              initialValue={fields}
              onChange={setFields}
              keyPlaceholder="e.g. firstName, Visa status"
              valuePlaceholder="Value"
            />

            <button
              type="button"
              className={cx(btnPrimary, btnBlock)}
              onClick={() => finish(fields, resume)}
            >
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
              Upload different files
            </button>
            <p className={statusText}>{status}</p>
          </>
        )}
      </div>
    </WelcomeShell>
  );
}

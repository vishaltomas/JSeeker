import type { ParseProgress } from "../types";

/** Narrates the current step of a document read in the terms the user thinks
 * in — which file, which model, how much has come back so far. Shared by the
 * Profile documents tab and first-run onboarding, which run the same slow
 * extraction. */
export function progressLabel(progress: ParseProgress): string {
  switch (progress.stage) {
    case "reading":
      return progress.total > 1
        ? `Reading ${progress.file} (${progress.index} of ${progress.total})…`
        : `Reading ${progress.file}…`;
    case "extracting": {
      const docs = `${progress.documents} document${progress.documents === 1 ? "" : "s"}`;
      const soFar = progress.chars ? ` — ${progress.chars.toLocaleString()} characters back` : "";
      return `${progress.model} is pulling your details out of ${docs}${soFar}…`;
    }
    case "embedding":
      return `Embedding ${progress.entries} entr${progress.entries === 1 ? "y" : "ies"} with ${progress.model}…`;
    case "comparing":
      return progress.mode === "embedding"
        ? "Comparing against your profile by meaning…"
        : "Comparing against your profile by text overlap…";
  }
}

/** m:ss for the elapsed counter beside the label. */
export function formatElapsed(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

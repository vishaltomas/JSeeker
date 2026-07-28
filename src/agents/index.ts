import { ipcMain } from "electron";
import { randomUUID } from "crypto";
import * as path from "path";
import type { Store, StructuredResume } from "../main/store";
import { emptyStructuredResume, loadStore } from "../main/store";
import type { ChatMessage, FieldDescriptor, FieldMapping, ResumeFields } from "./types";
import { chatWithOllama, parseResumeWithOllama, planAutofillWithOllama } from "./ollama";
import { chatWithClaude, parseResumeWithClaude, planAutofillWithClaude } from "./claude";
import { extractPdfText } from "./resumeExtract";

export { bootstrapOllama } from "./ollama";

/** Dispatches the autofill fallback to whichever model provider is
 * configured — called from the browser extension's local HTTP route (see
 * src/main/extensionServer.ts POST /autofill). */
export async function planAutofillWithLLM(
  store: Store,
  fields: FieldDescriptor[]
): Promise<FieldMapping[]> {
  return store.settings.provider === "claude"
    ? planAutofillWithClaude(store, fields)
    : planAutofillWithOllama(store, fields);
}

// Onboarding step: read one or more uploaded documents and (for PDFs)
// extract a profile — open key-value fields plus the structured resume
// sections — via the configured provider, combining all documents into one
// extraction pass. Non-PDF files are reported back as `unsupportedFiles` so
// the UI can say so instead of pretending it read them.
ipcMain.handle(
  "resume:parse",
  async (
    _event,
    args: { filePaths: string[] }
  ): Promise<{
    fields: ResumeFields;
    resume: StructuredResume;
    unsupportedFiles: string[];
    error?: string;
  }> => {
    const emptyResume = emptyStructuredResume();
    const pdfPaths = args.filePaths.filter((p) => p.toLowerCase().endsWith(".pdf"));
    const unsupportedFiles = args.filePaths.filter((p) => !p.toLowerCase().endsWith(".pdf"));

    if (!pdfPaths.length) {
      return { fields: {}, resume: emptyResume, unsupportedFiles };
    }

    try {
      const documents = await Promise.all(
        pdfPaths.map(async (filePath) => ({
          filename: path.basename(filePath),
          text: await extractPdfText(filePath),
        }))
      );
      const store = loadStore();
      const extraction =
        store.settings.provider === "claude"
          ? await parseResumeWithClaude(store, documents)
          : await parseResumeWithOllama(store, documents);

      const resume: StructuredResume = {
        summary: extraction.summary,
        experience: extraction.experience.map((e) => ({ id: randomUUID(), ...e })),
        education: extraction.education.map((e) => ({ id: randomUUID(), ...e })),
        skills: extraction.skills,
        languages: extraction.languages.map((l) => ({ id: randomUUID(), ...l })),
      };
      return { fields: extraction.fields, resume, unsupportedFiles };
    } catch (err) {
      return {
        fields: {},
        resume: emptyResume,
        unsupportedFiles,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
);

ipcMain.on("chat:send", async (event, history: ChatMessage[]) => {
  const store = loadStore();
  if (store.settings.provider === "claude") {
    await chatWithClaude(event, store, history);
  } else {
    await chatWithOllama(event, store, history);
  }
});

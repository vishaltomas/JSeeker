import { ipcMain } from "electron";
import { randomUUID } from "crypto";
import type { Store, StructuredResume } from "../main/store";
import { emptyStructuredResume, loadStore } from "../main/store";
import type { ChatMessage, FieldDescriptor, FieldMapping, ResumeFields } from "./types";
import { RESUME_FIELD_KEYS } from "./types";
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

// Onboarding step: read a resume file and (for PDFs) extract profile fields
// plus the structured resume sections via the configured provider. Non-PDF
// files are returned as `unsupported` so the UI can fall back to manual
// entry instead of pretending it read it.
ipcMain.handle(
  "resume:parse",
  async (
    _event,
    args: { filePath: string }
  ): Promise<{ fields: ResumeFields; resume: StructuredResume; unsupported?: boolean; error?: string }> => {
    const emptyFields = Object.fromEntries(RESUME_FIELD_KEYS.map((k) => [k, ""])) as ResumeFields;
    const emptyResume = emptyStructuredResume();

    if (!args.filePath.toLowerCase().endsWith(".pdf")) {
      return { fields: emptyFields, resume: emptyResume, unsupported: true };
    }

    try {
      const text = await extractPdfText(args.filePath);
      const store = loadStore();
      const extraction =
        store.settings.provider === "claude"
          ? await parseResumeWithClaude(store, text)
          : await parseResumeWithOllama(store, text);

      const resume: StructuredResume = {
        summary: extraction.summary,
        experience: extraction.experience.map((e) => ({ id: randomUUID(), ...e })),
        education: extraction.education.map((e) => ({ id: randomUUID(), ...e })),
        skills: extraction.skills,
      };
      return { fields: extraction.fields, resume };
    } catch (err) {
      return { fields: emptyFields, resume: emptyResume, error: err instanceof Error ? err.message : String(err) };
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

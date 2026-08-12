import { ipcMain } from "electron";
import { randomUUID } from "crypto";
import * as path from "path";
import type { Store, StructuredResume } from "../main/store";
import { emptyStructuredResume, loadStore } from "../main/store";
import type { ChatMessage, ChatSink, FieldFill, PageSnapshot, ResumeFields } from "./types";
import { chatWithOllama, parseResumeWithOllama, planPageAutofillWithOllama } from "./ollama";
import { chatWithClaude, parseResumeWithClaude, planPageAutofillWithClaude } from "./claude";
import { extractPdfText } from "./resumeExtract";

export { bootstrapOllama } from "./ollama";

/** Dispatches whole-page autofill to whichever model provider is configured
 * — called from the browser extension's local HTTP route (see
 * src/main/extensionServer.ts POST /autofill). */
export async function planPageAutofill(
  store: Store,
  snapshot: PageSnapshot
): Promise<FieldFill[]> {
  return store.settings.provider === "claude"
    ? planPageAutofillWithClaude(store, snapshot)
    : planPageAutofillWithOllama(store, snapshot);
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

/** Streams a chat reply from whichever provider is configured into `sink` —
 * shared by the app's own chat panel (over IPC, below) and the browser
 * extension's in-page panel (over SSE, see main/extensionServer.ts). */
export async function streamChat(
  store: Store,
  history: ChatMessage[],
  sink: ChatSink,
  pageContext?: string
): Promise<void> {
  if (store.settings.provider === "claude") {
    await chatWithClaude(sink, store, history, pageContext);
  } else {
    await chatWithOllama(sink, store, history, pageContext);
  }
}

ipcMain.on("chat:send", async (event, history: ChatMessage[]) => {
  await streamChat(loadStore(), history, {
    delta: (text) => event.sender.send("chat:delta", text),
    done: (full) => event.sender.send("chat:done", full),
    error: (message) => event.sender.send("chat:error", message),
  });
});

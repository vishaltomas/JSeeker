import { ipcMain } from "electron";
import { randomUUID } from "crypto";
import * as path from "path";
import type { Store, StructuredResume } from "../main/store";
import { emptyStructuredResume, loadStore } from "../main/store";
import type { ChatMessage, ChatSink, ExtraField, ProgressSink, ResumeFields } from "./types";
import { chatWithOllama, extractAnswersWithOllama, parseResumeWithOllama } from "./ollama";
import { chatWithClaude, extractAnswersWithClaude, parseResumeWithClaude } from "./claude";
import { extractPdfText } from "./resumeExtract";
import { buildDocumentPrompt } from "./prompts";
import { getSession, setAnswers } from "../main/sessions";
import { DEFAULT_EMBED_MODEL } from "./embeddings";
import { reconcileProfile, type MergeResult } from "./reconcile";
import { DEFAULT_HOST } from "./ollama";

export { bootstrapOllama } from "./ollama";

// Onboarding step: read one or more uploaded documents and (for PDFs)
// extract a profile — open key-value fields plus the structured resume
// sections — via the configured provider, combining all documents into one
// extraction pass. Non-PDF files are reported back as `unsupportedFiles` so
// the UI can say so instead of pretending it read them.
ipcMain.handle(
  "resume:parse",
  async (
    event,
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

    // Both steps are slow enough to need narration — the PDF read is per
    // file, and the extraction is one long model pass over all of them.
    const report: ProgressSink = (progress) =>
      event.sender.send("resume:progress", progress);

    try {
      // Sequential rather than parallel so "reading X (2 of 3)" reflects
      // real progress instead of three files all claiming to be in flight.
      const documents: { filename: string; text: string }[] = [];
      for (const [index, filePath] of pdfPaths.entries()) {
        report({ stage: "reading", file: path.basename(filePath), index: index + 1, total: pdfPaths.length });
        documents.push({ filename: path.basename(filePath), text: await extractPdfText(filePath) });
      }
      const store = loadStore();
      const extraction =
        store.settings.provider === "claude"
          ? await parseResumeWithClaude(store, documents, report)
          : await parseResumeWithOllama(store, documents, report);

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

// Folds an extraction into the profile the user already has. Kept in the main
// process because the comparison that decides "is this entry already in the
// profile?" runs against the local embedding model (see agents/reconcile.ts).
// Nothing is written to disk here — the renderer shows the result for review
// and the user still has to save.
ipcMain.handle(
  "resume:merge",
  async (
    event,
    args: {
      current: { fields: ResumeFields; resume: StructuredResume };
      incoming: { fields: ResumeFields; resume: StructuredResume };
    }
  ): Promise<MergeResult & { error?: string }> => {
    const store = loadStore();
    const host = store.settings.ollamaHost || DEFAULT_HOST;
    try {
      return await reconcileProfile(host, DEFAULT_EMBED_MODEL, args.current, args.incoming, (progress) =>
        event.sender.send("resume:progress", progress)
      );
    } catch (err) {
      // Leave the profile exactly as it was rather than guessing at a merge.
      return {
        fields: args.current.fields,
        resume: args.current.resume,
        report: {
          mode: "lexical",
          fieldsAdded: [],
          fieldConflicts: [],
          summary: "kept",
          experience: { added: 0, matched: 0, enriched: 0 },
          bulletsAdded: 0,
          education: { added: 0, matched: 0, enriched: 0 },
          skills: { added: 0, matched: 0, enriched: 0 },
          languages: { added: 0, matched: 0, enriched: 0 },
        },
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

/** Streams a drafted document — the panel's "Cover letter" / "Tailor resume"
 * buttons. The posting rides in as page context exactly as it does for chat,
 * so the difference from a chat turn is only the instruction. */
export async function streamDocument(
  store: Store,
  kind: "cover-letter" | "resume",
  posting: string,
  sink: ChatSink
): Promise<void> {
  const ask: ChatMessage[] = [{ role: "user", content: buildDocumentPrompt(store, kind) }];
  if (store.settings.provider === "claude") {
    await chatWithClaude(sink, store, ask, posting);
  } else {
    await chatWithOllama(sink, store, ask, posting);
  }
}

/** Pulls reusable answers out of one session's conversation (see
 * main/sessions.ts) — the History view asks for this on demand, and the user
 * reviews the result before any of it reaches their profile. */
ipcMain.handle(
  "sessions:extractAnswers",
  async (_event, id: string): Promise<{ answers: ExtraField[]; error?: string }> => {
    const session = getSession(id);
    if (!session) return { answers: [], error: "That session no longer exists." };
    if (!session.messages.length) return { answers: [] };

    try {
      const store = loadStore();
      const answers =
        store.settings.provider === "claude"
          ? await extractAnswersWithClaude(store, session.messages)
          : await extractAnswersWithOllama(store, session.messages);
      setAnswers(id, answers);
      return { answers };
    } catch (err) {
      return { answers: [], error: err instanceof Error ? err.message : String(err) };
    }
  }
);

ipcMain.on("chat:send", async (event, history: ChatMessage[]) => {
  await streamChat(loadStore(), history, {
    delta: (text) => event.sender.send("chat:delta", text),
    done: (full) => event.sender.send("chat:done", full),
    error: (message) => event.sender.send("chat:error", message),
  });
});

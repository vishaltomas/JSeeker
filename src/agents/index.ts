import { ipcMain } from "electron";
import type { Store } from "../main/store";
import { loadStore } from "../main/store";
import type {
  AgentAction,
  AutopilotSnapshot,
  ChatMessage,
  FieldDescriptor,
  FieldMapping,
  ResumeFields,
} from "./types";
import { RESUME_FIELD_KEYS } from "./types";
import { chatWithOllama, planAutofillWithOllama, planNextActionWithOllama, parseResumeWithOllama } from "./ollama";
import { chatWithClaude, planAutofillWithClaude, planNextActionWithClaude, parseResumeWithClaude } from "./claude";
import { extractPdfText } from "./resumeExtract";

export { bootstrapOllama } from "./ollama";

/** Dispatches the autofill fallback to whichever model provider is configured. */
async function planAutofillWithLLM(
  store: Store,
  fields: FieldDescriptor[]
): Promise<FieldMapping[]> {
  return store.settings.provider === "claude"
    ? planAutofillWithClaude(store, fields)
    : planAutofillWithOllama(store, fields);
}

// Fallback autofill step: hand fields the renderer's heuristic matcher
// skipped to the configured model, which maps them to values from the
// active profile.
ipcMain.handle("autofill:llm", async (_event, args: { fields: FieldDescriptor[] }) => {
  if (!args.fields.length) return [];
  const store = loadStore();
  return planAutofillWithLLM(store, args.fields);
});

// Autopilot loop step: given the current page's clickable elements, ask the
// configured provider what to do next (see agents/prompts.ts buildNextActionPrompt).
ipcMain.handle(
  "autopilot:next-action",
  async (
    _event,
    args: { snapshot: AutopilotSnapshot; recentSteps: string[]; jobContext: string }
  ): Promise<AgentAction> => {
    const store = loadStore();
    return store.settings.provider === "claude"
      ? planNextActionWithClaude(store, args.snapshot, args.recentSteps, args.jobContext)
      : planNextActionWithOllama(store, args.snapshot, args.recentSteps, args.jobContext);
  }
);

// Onboarding step: read a resume file and (for PDFs) extract profile fields
// via the configured provider. Non-PDF files are returned as `unsupported`
// so the UI can fall back to manual entry instead of pretending it read it.
ipcMain.handle(
  "resume:parse",
  async (
    _event,
    args: { filePath: string }
  ): Promise<{ fields: ResumeFields; unsupported?: boolean; error?: string }> => {
    const emptyFields = Object.fromEntries(RESUME_FIELD_KEYS.map((k) => [k, ""])) as ResumeFields;

    if (!args.filePath.toLowerCase().endsWith(".pdf")) {
      return { fields: emptyFields, unsupported: true };
    }

    try {
      const text = await extractPdfText(args.filePath);
      const store = loadStore();
      const fields =
        store.settings.provider === "claude"
          ? await parseResumeWithClaude(store, text)
          : await parseResumeWithOllama(store, text);
      return { fields };
    } catch (err) {
      return { fields: emptyFields, error: err instanceof Error ? err.message : String(err) };
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

import { ipcMain } from "electron";
import type { Store } from "../main/store";
import { loadStore } from "../main/store";
import type { AgentAction, AutopilotSnapshot, ChatMessage, FieldDescriptor, FieldMapping } from "./types";
import { chatWithOllama, planAutofillWithOllama, planNextActionWithOllama } from "./ollama";
import { chatWithClaude, planAutofillWithClaude, planNextActionWithClaude } from "./claude";

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
  async (_event, args: { snapshot: AutopilotSnapshot; recentSteps: string[] }): Promise<AgentAction> => {
    const store = loadStore();
    return store.settings.provider === "claude"
      ? planNextActionWithClaude(store, args.snapshot, args.recentSteps)
      : planNextActionWithOllama(store, args.snapshot, args.recentSteps);
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

import { ipcMain } from "electron";
import { spawn } from "child_process";
import type { Store } from "../main/store";
import { loadStore } from "../main/store";
import { getMainWindow } from "../main/window";
import type {
  AgentAction,
  AutopilotSnapshot,
  ChatMessage,
  FieldDescriptor,
  FieldMapping,
  ResumeFields,
} from "./types";
import { RESUME_FIELD_KEYS } from "./types";
import {
  buildAutofillPrompt,
  buildNextActionPrompt,
  buildResumeExtractionPrompt,
  buildSystemPrompt,
  parseAgentAction,
  parseFieldMappings,
  parseResumeFields,
} from "./prompts";

export const DEFAULT_HOST = process.env.OLLAMA_HOST || "http://127.0.0.1:11434";
// Qwen2.5 3B (Ollama's default quant is Q4_K_M) — small enough to load and run
// on low-VRAM consumer GPUs, which is what actually runs this app's default.
export const DEFAULT_MODEL = process.env.OLLAMA_MODEL || "qwen2.5:3b";

/**
 * Ask the local Ollama model to map leftover, unrecognized form fields to
 * values from the active profile — a fallback for fields the renderer's
 * heuristic matcher couldn't confidently label.
 */
export async function planAutofillWithOllama(
  store: Store,
  fields: FieldDescriptor[]
): Promise<FieldMapping[]> {
  const host = store.settings.ollamaHost || DEFAULT_HOST;
  const model = store.settings.ollamaModel || DEFAULT_MODEL;
  const prompt = [
    buildAutofillPrompt(store, fields),
    "",
    'Reply with ONLY a JSON array of objects: {"index": <field index>, "value": "<text to enter>"}.',
    "Reply with the JSON array and nothing else.",
  ].join("\n");

  const res = await fetch(`${host}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      stream: false,
      format: "json",
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Ollama responded ${res.status}. ${detail}`.trim());
  }

  const body = await res.json();
  const content: string = body?.message?.content ?? "";
  return parseFieldMappings(content);
}

/** Structured-output schema for AgentAction — passed as Ollama's `format`
 * (not just the string "json") so the model's `action` is actually
 * constrained to one of the four valid values at decode time, rather than
 * merely being asked nicely to produce one. Smaller local models especially
 * tend to leave loosely-requested JSON fields empty under `format: "json"`;
 * this forces a real value. */
const NEXT_ACTION_SCHEMA = {
  type: "object",
  properties: {
    action: { type: "string", enum: ["click", "confirm_submit", "done", "blocked"] },
    index: { type: "integer" },
    note: { type: "string" },
  },
  required: ["action", "index", "note"],
};

/** Ask the local Ollama model what the autopilot loop should do next on the
 * current page (see agents/types.ts `AgentAction`). */
export async function planNextActionWithOllama(
  store: Store,
  snapshot: AutopilotSnapshot,
  recentSteps: string[],
  jobContext: string
): Promise<AgentAction> {
  const host = store.settings.ollamaHost || DEFAULT_HOST;
  const model = store.settings.ollamaModel || DEFAULT_MODEL;
  const prompt = buildNextActionPrompt(store, snapshot, recentSteps, jobContext);

  const res = await fetch(`${host}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      stream: false,
      format: NEXT_ACTION_SCHEMA,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Ollama responded ${res.status}. ${detail}`.trim());
  }

  const body = await res.json();
  const content: string = body?.message?.content ?? "";
  return parseAgentAction(content);
}

/** Structured-output schema for ResumeFields — every field required (empty
 * string when unknown), same rationale as NEXT_ACTION_SCHEMA above. */
const RESUME_FIELDS_SCHEMA = {
  type: "object",
  properties: Object.fromEntries(RESUME_FIELD_KEYS.map((k) => [k, { type: "string" }])),
  required: [...RESUME_FIELD_KEYS],
};

/** Ask the local Ollama model to extract profile fields from resume text
 * during onboarding (see agents/types.ts `ResumeFields`). */
export async function parseResumeWithOllama(store: Store, resumeText: string): Promise<ResumeFields> {
  const host = store.settings.ollamaHost || DEFAULT_HOST;
  const model = store.settings.ollamaModel || DEFAULT_MODEL;
  const prompt = buildResumeExtractionPrompt(resumeText);

  const res = await fetch(`${host}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      stream: false,
      format: RESUME_FIELDS_SCHEMA,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Ollama responded ${res.status}. ${detail}`.trim());
  }

  const body = await res.json();
  const content: string = body?.message?.content ?? "";
  return parseResumeFields(content);
}

function friendlyOllamaError(err: unknown, host: string, model: string): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/ECONNREFUSED|fetch failed|Failed to fetch|ENOTFOUND/i.test(msg)) {
    return (
      `Couldn't reach the local model at ${host}. ` +
      `Make sure Ollama is running ("ollama serve") and the model "${model}" ` +
      `is installed ("ollama pull ${model}").`
    );
  }
  return msg;
}

// Streamed chat via the local Ollama model: renderer sends the conversation,
// we prepend a system prompt (seeded with the active profile), stream tokens
// from Ollama's NDJSON response, and relay each chunk back.
export async function chatWithOllama(
  event: Electron.IpcMainEvent,
  store: Store,
  history: ChatMessage[]
): Promise<void> {
  const host = store.settings.ollamaHost || DEFAULT_HOST;
  const model = store.settings.ollamaModel || DEFAULT_MODEL;

  const messages: ChatMessage[] = [
    { role: "system", content: buildSystemPrompt(store) },
    ...history,
  ];

  try {
    const res = await fetch(`${host}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages, stream: true }),
    });

    if (!res.ok || !res.body) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Ollama responded ${res.status}. ${detail}`.trim());
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let full = "";

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let newline: number;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (!line) continue;

        const obj = JSON.parse(line);
        if (obj.error) throw new Error(obj.error);
        const chunk: string = obj.message?.content ?? "";
        if (chunk) {
          full += chunk;
          event.sender.send("chat:delta", chunk);
        }
      }
    }

    event.sender.send("chat:done", full);
  } catch (err) {
    event.sender.send("chat:error", friendlyOllamaError(err, host, model));
  }
}

// --- Background Ollama bootstrap ---
//
// Runs once at launch so the configured local model is already running by
// the time the user opens the chat panel, instead of paying Ollama's own
// cold-start (and possibly a multi-GB download) on the first message.

export type OllamaStatus =
  | { state: "starting" }
  | { state: "pulling"; model: string; percent: number; detail: string }
  | { state: "ready"; model: string }
  | { state: "error"; message: string };

// Renderer may subscribe to "ollama:status" after we've already broadcast one
// (page load races the background bootstrap), so events sent before it
// attaches would otherwise be silently lost. Keep the latest one around so a
// late subscriber can fetch it via ollama:status:get.
let lastOllamaStatus: OllamaStatus | null = null;

function broadcastOllamaStatus(status: OllamaStatus): void {
  lastOllamaStatus = status;
  getMainWindow()?.webContents.send("ollama:status", status);
}

ipcMain.handle("ollama:status:get", () => lastOllamaStatus);

async function pingOllama(host: string): Promise<boolean> {
  try {
    const res = await fetch(`${host}/api/version`, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}

async function waitForOllama(host: string, timeoutMs: number): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await pingOllama(host)) return true;
    await new Promise((r) => setTimeout(r, 800));
  }
  return false;
}

/** If Ollama isn't already serving, try launching it and wait for it to come up. */
async function ensureOllamaRunning(host: string): Promise<boolean> {
  if (await pingOllama(host)) return true;

  // spawn() doesn't throw synchronously for a missing binary (ENOENT) — it
  // emits an async 'error' event, which crashes the process if unhandled.
  // Give it a brief moment to fail fast before falling back to polling.
  const spawnedOk = await new Promise<boolean>((resolve) => {
    try {
      const child = spawn("ollama", ["serve"], { detached: true, stdio: "ignore" });
      child.once("error", () => resolve(false));
      child.unref();
      setTimeout(() => resolve(true), 500);
    } catch {
      resolve(false);
    }
  });
  if (!spawnedOk) return false;

  return waitForOllama(host, 15000);
}

async function modelIsPulled(host: string, model: string): Promise<boolean> {
  try {
    const res = await fetch(`${host}/api/tags`);
    if (!res.ok) return false;
    const body = await res.json();
    const names: string[] = Array.isArray(body?.models)
      ? body.models.map((m: { name: string }) => m.name)
      : [];
    const withTag = model.includes(":") ? model : `${model}:latest`;
    return names.includes(model) || names.includes(withTag);
  } catch {
    return false;
  }
}

/** Streams `/api/pull` progress back to the renderer while the model downloads. */
async function pullModel(host: string, model: string): Promise<void> {
  const res = await fetch(`${host}/api/pull`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: model, stream: true }),
  });
  if (!res.ok || !res.body) throw new Error(`Pull failed: ${res.status}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let newline: number;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line) continue;

      const obj = JSON.parse(line);
      if (obj.error) throw new Error(obj.error);
      const total: number = obj.total ?? 0;
      const completed: number = obj.completed ?? 0;
      const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
      broadcastOllamaStatus({ state: "pulling", model, percent, detail: obj.status ?? "" });
    }
  }
}

/** Loads the model into memory ahead of time (an empty-prompt /api/generate
 * call is Ollama's documented way to warm a model without generating text)
 * and keeps it resident for a while so the first real chat message is fast. */
async function warmModel(host: string, model: string): Promise<void> {
  await fetch(`${host}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, keep_alive: "30m" }),
  }).catch(() => {});
}

/** Launches Ollama if needed, pulls the model if it isn't present, then warms
 * it — broadcasting status the whole way. Shared by the launch-time
 * bootstrap and the manual "Start Ollama" action. */
async function runOllamaSequence(host: string, model: string): Promise<void> {
  broadcastOllamaStatus({ state: "starting" });

  if (!(await ensureOllamaRunning(host))) {
    broadcastOllamaStatus({
      state: "error",
      message: `Couldn't start Ollama at ${host}. Install it from ollama.com and make sure it's on your PATH.`,
    });
    return;
  }

  try {
    if (!(await modelIsPulled(host, model))) {
      await pullModel(host, model);
    }
    await warmModel(host, model);
    broadcastOllamaStatus({ state: "ready", model });
  } catch (err) {
    broadcastOllamaStatus({
      state: "error",
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function bootstrapOllama(): Promise<void> {
  const store = loadStore();
  if (store.settings.provider === "claude") return;

  const host = store.settings.ollamaHost || DEFAULT_HOST;
  const model = store.settings.ollamaModel || DEFAULT_MODEL;
  await runOllamaSequence(host, model);
}

// Manual trigger for the same start/pull/warm sequence, invoked from the
// renderer (a "Start Ollama" button in Settings, or retrying after an
// error). Runs regardless of the configured provider, using whatever
// host/model are currently saved, so it also works before the user has
// switched the provider to Ollama.
ipcMain.handle("ollama:start", async () => {
  const store = loadStore();
  const host = store.settings.ollamaHost || DEFAULT_HOST;
  const model = store.settings.ollamaModel || DEFAULT_MODEL;
  await runOllamaSequence(host, model);
});

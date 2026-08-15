import { ipcMain } from "electron";
import { spawn } from "child_process";
import type { Store } from "../main/store";
import { loadStore } from "../main/store";
import { getMainWindow } from "../main/window";
import type {
  ChatMessage,
  ChatOptions,
  ChatSink,
  ExtraField,
  ProgressSink,
  ResumeExtraction,
} from "./types";
import { RESUME_ANCHOR_KEYS, RESUME_STRUCTURE_KEYS, RESUME_STRUCTURE_SCHEMA_PROPERTIES } from "./types";
import { ensureEmbedModel } from "./embeddings";
import { createToolCache, MAX_TOOL_STEPS, ollamaTools, runReportedTool } from "./toolDefs";
import {
  buildAnswerExtractionPrompt,
  buildResumeExtractionPrompt,
  buildSystemPrompt,
  parseExtractedAnswers,
  parseResumeExtraction,
} from "./prompts";

export const DEFAULT_HOST = process.env.OLLAMA_HOST || "http://127.0.0.1:11434";
// Qwen2.5 3B (Ollama's default quant is Q4_K_M) — small enough to load and run
// on low-VRAM consumer GPUs, which is what actually runs this app's default.
export const DEFAULT_MODEL = process.env.OLLAMA_MODEL || "qwen2.5:3b";

/** Structured-output schema for ResumeExtraction — every field required
 * (empty string/array when unknown). Smaller local models especially tend
 * to leave loosely-requested JSON fields empty under `format: "json"`; a
 * full schema forces real (if empty) values instead of an omitted key. */
const RESUME_EXTRACTION_SCHEMA = {
  type: "object",
  properties: {
    ...Object.fromEntries(RESUME_ANCHOR_KEYS.map((k) => [k, { type: "string" }])),
    ...RESUME_STRUCTURE_SCHEMA_PROPERTIES,
  },
  required: [...RESUME_ANCHOR_KEYS, ...RESUME_STRUCTURE_KEYS],
};

/** Ask the local Ollama model to extract a profile — anchor fields, open
 * extraFields, and structured resume sections — from one or more uploaded
 * documents at once (see agents/types.ts `ResumeExtraction`). */
export async function parseResumeWithOllama(
  store: Store,
  documents: { filename: string; text: string }[],
  onProgress?: ProgressSink
): Promise<ResumeExtraction> {
  const host = store.settings.ollamaHost || DEFAULT_HOST;
  const model = store.settings.ollamaModel || DEFAULT_MODEL;
  const prompt = buildResumeExtractionPrompt(documents);

  // Streamed purely for the progress signal: a local model can spend a
  // minute on a multi-page resume, and the growing character count is the
  // only honest evidence that it's still working. The JSON is assembled and
  // parsed at the end exactly as it was when this waited on one response.
  const res = await fetch(`${host}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      stream: true,
      format: RESUME_EXTRACTION_SCHEMA,
    }),
  });

  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Ollama responded ${res.status}. ${detail}`.trim());
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  let lastReport = 0;

  onProgress?.({ stage: "extracting", model, documents: documents.length, chars: 0 });

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
      content += obj.message?.content ?? "";
    }

    // Throttled: token-rate IPC would flood the renderer for no extra clarity.
    if (onProgress && Date.now() - lastReport > 250) {
      lastReport = Date.now();
      onProgress({ stage: "extracting", model, documents: documents.length, chars: content.length });
    }
  }

  return parseResumeExtraction(content);
}

/** Reusable answers pulled out of one application session — a flat list of
 * key/value pairs, the same shape the profile bag already stores. */
const ANSWERS_SCHEMA = {
  type: "object",
  properties: {
    answers: {
      type: "array",
      items: {
        type: "object",
        properties: { key: { type: "string" }, value: { type: "string" } },
        required: ["key", "value"],
      },
    },
  },
  required: ["answers"],
};

/** Reads one session's conversation and returns the facts worth keeping (see
 * main/sessions.ts). Not streamed and not on the hot path — the user asks for
 * it from the History view when they're ready to review. */
export async function extractAnswersWithOllama(
  store: Store,
  conversation: { role: string; content: string }[]
): Promise<ExtraField[]> {
  const host = store.settings.ollamaHost || DEFAULT_HOST;
  const model = store.settings.ollamaModel || DEFAULT_MODEL;

  const res = await fetch(`${host}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: buildAnswerExtractionPrompt(conversation) }],
      stream: false,
      format: ANSWERS_SCHEMA,
      // A whole conversation is longer than this app's other one-shot
      // prompts; the default context would cut off the earliest turns.
      options: { num_ctx: 16384 },
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Ollama responded ${res.status}. ${detail}`.trim());
  }

  const body = await res.json();
  return parseExtractedAnswers(body?.message?.content ?? "");
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

/** A turn in Ollama's chat format. Richer than `ChatMessage`: an assistant
 * turn can carry tool calls, and a tool's result comes back as its own role. */
interface OllamaMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: { function: { name: string; arguments: unknown } }[];
  /** Which tool produced this result — newer Ollama matches it back to the
   * call, older builds ignore the field. */
  tool_name?: string;
}

/** Ollama hands arguments back already parsed, but a model that emitted them
 *  as a JSON string still turns up that way often enough to be worth handling
 *  rather than failing the call. */
function toolArguments(raw: unknown): unknown {
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/** Whether Ollama refused the request because the model has no tool support.
 *  Small local models often don't, and the default here is a 3B one. */
function isNoToolSupport(detail: string): boolean {
  return /does not support tools|tools are not supported|unsupported.*tool/i.test(detail);
}

/** One `/api/chat` request, streamed. Text is relayed as it arrives; tool
 *  calls are accumulated and returned once the response is complete. */
async function streamOllamaTurn(
  host: string,
  body: unknown,
  sink: ChatSink,
  onText: (chunk: string) => void
): Promise<{ content: string; toolCalls: { name: string; arguments: unknown }[] }> {
  const res = await fetch(`${host}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "");
    const error = new Error(`Ollama responded ${res.status}. ${detail}`.trim());
    (error as Error & { detail?: string }).detail = detail;
    throw error;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  const toolCalls: { name: string; arguments: unknown }[] = [];
  const seenCalls = new Set<string>();

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
        content += chunk;
        onText(chunk);
      }
      // Depending on the build, these arrive in their own chunk or attached
      // to the last one — collecting across the whole stream covers both.
      //
      // Deduplicated because some builds repeat the completed message in the
      // final `done` chunk, which would otherwise read as the model asking
      // twice and run the tool twice. A model that genuinely emits the same
      // call twice in one message collapses here too, which is right: one
      // message asking for the identical thing twice is one request.
      for (const call of obj.message?.tool_calls ?? []) {
        const name = call?.function?.name;
        if (typeof name !== "string") continue;
        const args = toolArguments(call.function?.arguments);
        const signature = `${name}:${JSON.stringify(args ?? null)}`;
        if (seenCalls.has(signature)) continue;
        seenCalls.add(signature);
        toolCalls.push({ name, arguments: args });
      }
    }
  }

  return { content, toolCalls };
}

// Streamed chat via the local Ollama model: renderer sends the conversation,
// we prepend a system prompt (seeded with the active profile), stream tokens
// from Ollama's NDJSON response, and relay each chunk back.
//
// With tools on this runs as a loop — the model asks for a tool, the result
// goes back as another turn, and it answers again. A local model may not
// support tools at all, which Ollama reports as a 400 rather than a refusal;
// that falls back to a plain conversation instead of failing the message.
export async function chatWithOllama(
  sink: ChatSink,
  store: Store,
  history: ChatMessage[],
  pageContext?: string,
  options: ChatOptions = {}
): Promise<void> {
  const host = store.settings.ollamaHost || DEFAULT_HOST;
  const model = store.settings.ollamaModel || DEFAULT_MODEL;
  let useTools = options.tools !== false;

  const messages: OllamaMessage[] = [
    { role: "system", content: buildSystemPrompt(store, pageContext, { tools: useTools }) },
    ...history.map((m) => ({ role: m.role, content: m.content })),
  ];
  // One turn's worth of read results, so asking for the same page twice costs
  // one fetch. Discarded when this call returns.
  const cache = createToolCache();

  try {
    let full = "";

    for (let step = 0; ; step++) {
      // The extension's in-page panel can put a whole job posting in the
      // system prompt, which overflows Ollama's small default context and
      // would silently drop the earliest messages. Tool results are long
      // enough to need the same headroom.
      const request = {
        model,
        messages,
        stream: true,
        options: { num_ctx: pageContext || useTools ? 16384 : 8192 },
        ...(useTools ? { tools: ollamaTools() } : {}),
      };

      let turn;
      try {
        turn = await streamOllamaTurn(host, request, sink, (chunk) => {
          full += chunk;
          sink.delta(chunk);
        });
      } catch (err) {
        const detail = (err as Error & { detail?: string }).detail ?? "";
        if (!useTools || !isNoToolSupport(detail)) throw err;
        // The model can't call tools. Nothing has been streamed yet on this
        // attempt, so dropping them and retrying is invisible to the user.
        useTools = false;
        messages[0] = {
          role: "system",
          content: buildSystemPrompt(store, pageContext, { tools: false }),
        };
        continue;
      }

      if (!turn.toolCalls.length) break;

      messages.push({
        role: "assistant",
        content: turn.content,
        tool_calls: turn.toolCalls.map((call) => ({
          function: { name: call.name, arguments: call.arguments },
        })),
      });

      for (const call of turn.toolCalls) {
        const outcome = await runReportedTool(call.name, call.arguments, sink, cache);
        messages.push({ role: "tool", content: outcome.content, tool_name: call.name });
      }

      if (step + 1 >= MAX_TOOL_STEPS) {
        sink.tool?.({
          name: "",
          detail: `Stopped after ${MAX_TOOL_STEPS} tool steps`,
          status: "error",
          message: "The assistant kept reaching for tools without finishing an answer.",
        });
        break;
      }
    }

    sink.done(full);
  } catch (err) {
    sink.error(friendlyOllamaError(err, host, model));
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
    // Small extra pull, deliberately not awaited: it only matters when the
    // user merges a document into their profile, and until it lands that
    // merge just compares text lexically instead.
    void ensureEmbedModel(host);
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

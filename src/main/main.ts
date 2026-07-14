import { app, BrowserWindow, ipcMain, dialog, webContents, Menu } from "electron";
import * as path from "path";
import * as fs from "fs";
import Anthropic from "@anthropic-ai/sdk";
import { searchJobs } from "../web_loader/web_loader";

let mainWindow: BrowserWindow | null = null;

export type ProfileData = Record<string, string>;

interface ProfileRecord {
  id: string;
  name: string;
  data: ProfileData;
}

type Provider = "ollama" | "claude";

const DEFAULT_CLAUDE_MODEL = "claude-opus-4-8";

interface Settings {
  provider: Provider;
  ollamaModel: string;
  ollamaHost: string;
  anthropicApiKey: string;
  anthropicModel: string;
  adzunaAppId: string;
  adzunaAppKey: string;
  adzunaCountry: string;
  serpApiKey: string;
}

function normalizeSettings(s?: Partial<Settings>): Settings {
  return {
    provider: s?.provider === "claude" ? "claude" : "ollama",
    ollamaModel: s?.ollamaModel ?? "",
    ollamaHost: s?.ollamaHost ?? "",
    anthropicApiKey: s?.anthropicApiKey ?? "",
    anthropicModel: s?.anthropicModel ?? "",
    adzunaAppId: s?.adzunaAppId ?? "",
    adzunaAppKey: s?.adzunaAppKey ?? "",
    adzunaCountry: s?.adzunaCountry ?? "us",
    serpApiKey: s?.serpApiKey ?? "",
  };
}

interface Store {
  activeId: string;
  profiles: ProfileRecord[];
  settings: Settings;
}

const FIELD_KEYS = [
  "firstName",
  "lastName",
  "email",
  "phone",
  "address",
  "city",
  "state",
  "zip",
  "country",
  "linkedin",
  "github",
  "website",
  "currentTitle",
  "currentCompany",
  "resumePath",
];

function emptyProfileData(): ProfileData {
  const data: ProfileData = {};
  for (const key of FIELD_KEYS) data[key] = "";
  return data;
}

function defaultStore(): Store {
  return {
    activeId: "default",
    profiles: [{ id: "default", name: "Default", data: emptyProfileData() }],
    settings: normalizeSettings(),
  };
}

function storePath(): string {
  return path.join(app.getPath("userData"), "store.json");
}

function loadStore(): Store {
  // Preferred: the multi-profile store.
  try {
    const parsed = JSON.parse(fs.readFileSync(storePath(), "utf-8")) as Store;
    if (parsed && Array.isArray(parsed.profiles) && parsed.profiles.length) {
      parsed.settings = normalizeSettings(parsed.settings);
      for (const p of parsed.profiles) p.data = { ...emptyProfileData(), ...p.data };
      if (!parsed.profiles.some((p) => p.id === parsed.activeId)) {
        parsed.activeId = parsed.profiles[0].id;
      }
      return parsed;
    }
  } catch {
    /* fall through to migration / default */
  }

  // Migrate a legacy single profile.json if it exists.
  try {
    const legacy = JSON.parse(
      fs.readFileSync(path.join(app.getPath("userData"), "profile.json"), "utf-8")
    );
    const store = defaultStore();
    store.profiles[0].data = { ...emptyProfileData(), ...legacy };
    return store;
  } catch {
    return defaultStore();
  }
}

function saveStore(store: Store): void {
  fs.writeFileSync(storePath(), JSON.stringify(store, null, 2), "utf-8");
}

function activeProfileData(store: Store): ProfileData {
  const record =
    store.profiles.find((p) => p.id === store.activeId) ?? store.profiles[0];
  return record ? record.data : emptyProfileData();
}

ipcMain.handle("store:load", () => loadStore());
ipcMain.handle("store:save", (_event, store: Store) => {
  saveStore(store);
  return true;
});

// Job search via the web loader. Adzuna credentials (if any) come from settings.
ipcMain.handle(
  "jobs:search",
  (_event, args: { query: string; location?: string }) => {
    const s = loadStore().settings;
    return searchJobs(args.query, {
      location: args.location,
      adzuna: {
        appId: s.adzunaAppId,
        appKey: s.adzunaAppKey,
        country: s.adzunaCountry,
      },
      serpApiKey: s.serpApiKey,
    });
  }
);

/** Native file picker for the user's resume. Returns the path, or null. */
ipcMain.handle("dialog:pickResume", async () => {
  const result = await dialog.showOpenDialog({
    title: "Select your resume",
    properties: ["openFile"],
    filters: [
      { name: "Documents", extensions: ["pdf", "doc", "docx", "txt", "rtf"] },
      { name: "All Files", extensions: ["*"] },
    ],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

/**
 * Attach a file to every <input type="file"> in the loaded page. Page JS can't
 * set a file input's value, so we drive it over the Chrome DevTools Protocol
 * against the webview's web contents. Returns how many inputs were set.
 */
ipcMain.handle(
  "resume:attach",
  async (_event, args: { webContentsId: number; filePath: string }) => {
    const { webContentsId, filePath } = args;
    const wc = webContents.fromId(webContentsId);
    if (!wc) throw new Error("Web view not found.");
    if (!fs.existsSync(filePath)) throw new Error("Resume file not found.");

    const dbg = wc.debugger;
    let attachedHere = false;
    try {
      if (!dbg.isAttached()) {
        dbg.attach("1.3");
        attachedHere = true;
      }
      await dbg.sendCommand("DOM.enable");
      const { root } = await dbg.sendCommand("DOM.getDocument", {
        depth: -1,
        pierce: true,
      });
      const { nodeIds } = await dbg.sendCommand("DOM.querySelectorAll", {
        nodeId: root.nodeId,
        selector: 'input[type="file"]',
      });

      let count = 0;
      for (const nodeId of nodeIds as number[]) {
        await dbg.sendCommand("DOM.setFileInputFiles", {
          files: [filePath],
          nodeId,
        });
        count++;
      }
      return count;
    } finally {
      if (attachedHere && dbg.isAttached()) dbg.detach();
    }
  }
);

// --- LLM chat (Ollama or Claude, per settings) ---

const DEFAULT_HOST = process.env.OLLAMA_HOST || "http://127.0.0.1:11434";
const DEFAULT_MODEL = process.env.OLLAMA_MODEL || "llama3.2";

type ChatMessage = { role: "user" | "assistant" | "system"; content: string };

/** System prompt seeded with the active profile so the model can help fill applications. */
function buildSystemPrompt(store: Store): string {
  const record =
    store.profiles.find((p) => p.id === store.activeId) ?? store.profiles[0];
  const data = activeProfileData(store);
  const lines = Object.entries(data)
    .filter(([key, value]) => value && key !== "resumePath")
    .map(([key, value]) => `- ${key}: ${value}`);
  const profileText = lines.length ? lines.join("\n") : "(no info saved yet)";
  return [
    "You are JSeeker's assistant, helping the user complete job applications.",
    "Be concise and practical. Help draft and tailor answers to application questions,",
    "and use the user's saved info below when it is relevant.",
    "",
    `Active profile: ${record ? record.name : "Default"}`,
    "The user's saved info:",
    profileText,
  ].join("\n");
}

/** A form field the renderer's heuristic matcher couldn't confidently label,
 * sent to the local model as a fallback. */
interface FieldDescriptor {
  index: number;
  tag: string;
  type?: string;
  name?: string;
  id?: string;
  placeholder?: string;
  ariaLabel?: string;
  autocomplete?: string;
  label?: string;
  context?: string;
  options?: string[];
  required?: boolean;
}

interface FieldMapping {
  index: number;
  value: string;
}

/** Parse Ollama's JSON-mode response into field mappings, tolerating either a
 * bare array or an object wrapping one. */
function parseFieldMappings(content: string): FieldMapping[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return [];
  }
  const list = Array.isArray(parsed)
    ? parsed
    : Object.values(parsed as Record<string, unknown>).find(Array.isArray) ?? [];
  if (!Array.isArray(list)) return [];
  return list.filter(
    (x): x is FieldMapping =>
      !!x &&
      typeof x === "object" &&
      typeof (x as FieldMapping).index === "number" &&
      typeof (x as FieldMapping).value === "string" &&
      (x as FieldMapping).value.trim() !== ""
  );
}

/** Builds the shared prompt asking a model to map leftover fields to profile values. */
function buildAutofillPrompt(store: Store, fields: FieldDescriptor[]): string {
  const data = activeProfileData(store);
  const profileLines = Object.entries(data)
    .filter(([key, value]) => value && key !== "resumePath")
    .map(([key, value]) => `- ${key}: ${value}`);
  const profileText = profileLines.length ? profileLines.join("\n") : "(no info saved)";

  return [
    "You are filling out a job application form for the applicant described below.",
    "Here is a JSON list of form fields a rule-based matcher could not label with confidence.",
    "",
    "Applicant profile:",
    profileText,
    "",
    "Form fields:",
    JSON.stringify(fields),
    "",
    "Only include a field when the profile clearly supports the value.",
    "For a field with an `options` list, the value must be one of those option strings verbatim.",
    "Never invent information (employer names, dates, numbers, etc.) that isn't in the profile.",
    "Omit any field you're unsure about.",
  ].join("\n");
}

/**
 * Ask the local Ollama model to map leftover, unrecognized form fields to
 * values from the active profile — a fallback for fields the renderer's
 * heuristic matcher couldn't confidently label.
 */
async function planAutofillWithOllama(
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

/**
 * Ask Claude to map leftover, unrecognized form fields to values from the
 * active profile, using structured outputs so the response is always a
 * schema-valid mapping list.
 */
async function planAutofillWithClaude(
  store: Store,
  fields: FieldDescriptor[]
): Promise<FieldMapping[]> {
  const apiKey = store.settings.anthropicApiKey;
  if (!apiKey) return [];
  const model = store.settings.anthropicModel || DEFAULT_CLAUDE_MODEL;
  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model,
    max_tokens: 2048,
    messages: [{ role: "user", content: buildAutofillPrompt(store, fields) }],
    output_config: {
      format: {
        type: "json_schema",
        schema: {
          type: "object",
          properties: {
            mappings: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  index: { type: "integer" },
                  value: { type: "string" },
                },
                required: ["index", "value"],
                additionalProperties: false,
              },
            },
          },
          required: ["mappings"],
          additionalProperties: false,
        },
      },
    },
  });

  const block = response.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") return [];
  return parseFieldMappings(block.text);
}

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
ipcMain.handle(
  "autofill:llm",
  async (_event, args: { fields: FieldDescriptor[] }) => {
    if (!args.fields.length) return [];
    const store = loadStore();
    return planAutofillWithLLM(store, args.fields);
  }
);

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
async function chatWithOllama(
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

// Streamed chat via the Claude API: same system prompt, but the system role
// is a top-level field rather than a message, and streaming comes from the
// Anthropic SDK's text-delta events.
async function chatWithClaude(
  event: Electron.IpcMainEvent,
  store: Store,
  history: ChatMessage[]
): Promise<void> {
  const apiKey = store.settings.anthropicApiKey;
  if (!apiKey) {
    event.sender.send(
      "chat:error",
      "No Claude API key set. Add one in Settings → Assistant."
    );
    return;
  }
  const model = store.settings.anthropicModel || DEFAULT_CLAUDE_MODEL;
  const client = new Anthropic({ apiKey });

  try {
    const stream = client.messages.stream({
      model,
      max_tokens: 4096,
      system: buildSystemPrompt(store),
      messages: history.map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.content,
      })),
    });

    let full = "";
    stream.on("text", (delta) => {
      full += delta;
      event.sender.send("chat:delta", delta);
    });

    await stream.finalMessage();
    event.sender.send("chat:done", full);
  } catch (err) {
    event.sender.send(
      "chat:error",
      err instanceof Error ? err.message : String(err)
    );
  }
}

ipcMain.on("chat:send", async (event, history: ChatMessage[]) => {
  const store = loadStore();
  if (store.settings.provider === "claude") {
    await chatWithClaude(event, store, history);
  } else {
    await chatWithOllama(event, store, history);
  }
});

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    webPreferences: {
      preload: path.join(__dirname, "../preload/preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null); // remove the app menu bar entirely
  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

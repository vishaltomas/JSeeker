import { app, BrowserWindow, ipcMain, dialog, webContents, Menu } from "electron";
import * as path from "path";
import * as fs from "fs";

let mainWindow: BrowserWindow | null = null;

export type ProfileData = Record<string, string>;

interface ProfileRecord {
  id: string;
  name: string;
  data: ProfileData;
}

interface Settings {
  ollamaModel: string;
  ollamaHost: string;
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
    settings: { ollamaModel: "", ollamaHost: "" },
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
      parsed.settings = parsed.settings ?? { ollamaModel: "", ollamaHost: "" };
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

// --- Local LLM chat (Ollama) ---

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

// Streamed chat: renderer sends the conversation, we prepend a system prompt
// (seeded with the active profile), stream tokens from Ollama's NDJSON
// response, and relay each chunk back. Model/host come from settings.
ipcMain.on("chat:send", async (event, history: ChatMessage[]) => {
  const store = loadStore();
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

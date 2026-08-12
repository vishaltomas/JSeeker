import { createServer } from "http";
import { ipcMain } from "electron";
import { randomUUID } from "crypto";
import { loadStore } from "./store";
import { getMainWindow } from "./window";
import { planPageAutofill, streamChat } from "../agents";
import type { ChatMessage } from "../agents/types";

export const EXTENSION_SERVER_PORT = 8743;

/** One autofill attempt, as the app can see it. A single attempt is recorded
 * more than once — `reading` the moment the page arrives, then updated in
 * place as the model answers and the extension reports back what actually
 * landed — so `id` identifies the attempt, not the update. */
export interface ExtensionActivity {
  id: string;
  at: number;
  state: "reading" | "filled" | "error";
  url?: string;
  title?: string;
  /** Fillable controls the extension found on the page. */
  fields?: number;
  /** Values the model returned. */
  planned?: number;
  /** Values that actually landed in the page — absent until the extension
   * reports back (it may never, if the tab closed mid-fill). */
  applied?: number;
  message?: string;
}

/** Whether the local server actually came up — the Settings panel shows the
 * URL, and shouldn't claim it's serving if the port was taken. */
let listening = false;
let serverError: string | undefined;

const MAX_ACTIVITY = 25;

/** Newest first. In memory only: this is a live view of what the extension is
 * doing, not history worth persisting across restarts. Kept here (rather than
 * only pushed at the renderer) so the Settings panel can show what happened
 * while it wasn't mounted — the user is in their browser when the interesting
 * part happens, and only comes back to the app afterwards. */
const activity: ExtensionActivity[] = [];

function record(entry: ExtensionActivity): void {
  const existing = activity.findIndex((a) => a.id === entry.id);
  if (existing >= 0) activity[existing] = entry;
  else activity.unshift(entry);
  if (activity.length > MAX_ACTIVITY) activity.length = MAX_ACTIVITY;
  getMainWindow()?.webContents.send("extension:activity", entry);
}

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

function readBody(req: import("http").IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      // A page snapshot, generously capped — extension/content.js already
      // trims its own output well below this.
      if (body.length > 400_000) req.destroy();
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function sendJson(res: import("http").ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json", ...corsHeaders() });
  res.end(JSON.stringify(body));
}

/** Local-only HTTP server the companion browser extension talks to (see
 * extension/background.js) to fill forms in the user's real browser. One
 * route: the extension posts a snapshot of the page it's on, and the
 * configured model answers with what to type where — the profile itself
 * never leaves this process. Bound to 127.0.0.1, never reachable from the
 * network, and gated by a bearer token so other local processes or web pages
 * can't silently trigger fills — see the doc comment on
 * Settings.extensionSyncToken in store.ts for what that token does and
 * doesn't protect against. */
export function startExtensionServer(): void {
  const server = createServer(async (req, res) => {
    if (req.method === "OPTIONS") {
      res.writeHead(204, corsHeaders());
      res.end();
      return;
    }

    const store = loadStore();
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!token || token !== store.settings.extensionSyncToken) {
      sendJson(res, 401, { error: "Invalid or missing token." });
      record({
        id: randomUUID(),
        at: Date.now(),
        state: "error",
        message: "Refused a request with a missing or wrong token.",
      });
      return;
    }

    if (req.method === "POST" && req.url === "/autofill") {
      let payload: { page?: unknown; url?: unknown; title?: unknown };
      try {
        payload = JSON.parse(await readBody(req));
      } catch {
        sendJson(res, 400, { error: "Invalid JSON body." });
        return;
      }
      if (typeof payload.page !== "string" || !payload.page.trim()) {
        sendJson(res, 400, { error: "Missing page snapshot." });
        return;
      }

      const page = payload.page;
      const attempt: ExtensionActivity = {
        id: randomUUID(),
        at: Date.now(),
        state: "reading",
        url: typeof payload.url === "string" ? payload.url : undefined,
        title: typeof payload.title === "string" ? payload.title : undefined,
        fields: (page.match(/ jid="/g) || []).length,
      };
      record(attempt);

      try {
        const fills = await planPageAutofill(store, {
          page,
          url: attempt.url,
          title: attempt.title,
        });
        record({ ...attempt, state: "filled", planned: fills.length });
        sendJson(res, 200, { id: attempt.id, fills });
      } catch (error) {
        // The provider being down or misconfigured is the common case here,
        // and the extension can only show a badge — say what happened so
        // it's visible in the app, the tooltip and devtools alike.
        const message = error instanceof Error ? error.message : String(error);
        record({ ...attempt, state: "error", message });
        sendJson(res, 502, { error: message });
      }
      return;
    }

    // The in-page chat panel (extension/widget.js). Streams the reply as SSE
    // so the panel can render tokens as they arrive, the same way the app's
    // own chat panel does over IPC.
    if (req.method === "POST" && req.url === "/chat") {
      let payload: { messages?: unknown; page?: unknown };
      try {
        payload = JSON.parse(await readBody(req));
      } catch {
        sendJson(res, 400, { error: "Invalid JSON body." });
        return;
      }

      const history = Array.isArray(payload.messages)
        ? payload.messages.filter(
            (m): m is ChatMessage =>
              !!m &&
              typeof m === "object" &&
              (m.role === "user" || m.role === "assistant") &&
              typeof m.content === "string"
          )
        : [];
      if (!history.length) {
        sendJson(res, 400, { error: "No messages." });
        return;
      }

      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        ...corsHeaders(),
      });
      // The panel goes away when the user closes the tab, and the model keeps
      // streaming for a while after that — writing to a dead socket would
      // throw an unhandled error, so every write checks first.
      res.on("error", () => {});
      const send = (event: string, data: unknown): void => {
        if (res.destroyed || res.writableEnded) return;
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      };

      await streamChat(
        store,
        history,
        {
          delta: (text) => send("delta", text),
          done: () => {
            send("done", true);
            if (!res.writableEnded) res.end();
          },
          error: (message) => {
            send("error", message);
            if (!res.writableEnded) res.end();
          },
        },
        typeof payload.page === "string" ? payload.page : undefined
      );
      return;
    }

    // How many of the planned values actually landed — only the browser knows
    // that, so the extension reports it back to close out the attempt.
    if (req.method === "POST" && req.url === "/applied") {
      let payload: { id?: unknown; applied?: unknown };
      try {
        payload = JSON.parse(await readBody(req));
      } catch {
        sendJson(res, 400, { error: "Invalid JSON body." });
        return;
      }
      const attempt = activity.find((a) => a.id === payload.id);
      if (attempt && typeof payload.applied === "number") {
        record({ ...attempt, applied: payload.applied });
      }
      sendJson(res, 200, { ok: true });
      return;
    }

    // A route the extension doesn't know about — most likely an older
    // version of it still loaded in the browser, which is worth saying out
    // loud rather than 404ing into the void.
    record({
      id: randomUUID(),
      at: Date.now(),
      state: "error",
      message: `No route for ${req.method} ${req.url} — is an older version of the extension still loaded? Reload it at chrome://extensions.`,
    });
    res.writeHead(404, corsHeaders());
    res.end();
  });

  // Without this, a port already held by another instance of the app throws
  // an uncaught error in the main process and the UI goes on claiming the
  // server is up.
  server.on("error", (error) => {
    serverError = error instanceof Error ? error.message : String(error);
    record({
      id: randomUUID(),
      at: Date.now(),
      state: "error",
      message: `Local server can't listen on port ${EXTENSION_SERVER_PORT}: ${serverError}`,
    });
  });

  server.listen(EXTENSION_SERVER_PORT, "127.0.0.1", () => {
    listening = true;
    serverError = undefined;
  });
}

ipcMain.handle("extension:info", () => ({
  port: EXTENSION_SERVER_PORT,
  listening,
  error: serverError,
}));

/** The renderer subscribes to `extension:activity` for live updates, and
 * calls this on mount for whatever it missed. */
ipcMain.handle("extension:activity:get", () => activity);

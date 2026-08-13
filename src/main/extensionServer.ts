import { createServer } from "http";
import { ipcMain } from "electron";
import { loadStore } from "./store";
import { streamChat, streamDocument } from "../agents";
import type { ChatMessage } from "../agents/types";
import { recordArtifact, recordExchange } from "./sessions";

export const EXTENSION_SERVER_PORT = 8743;

/** Whether the local server actually came up — the Settings panel shows the
 * URL, and shouldn't claim it's serving if the port was taken. */
let listening = false;
let serverError: string | undefined;

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
      // A conversation plus the page's visible text, generously capped —
      // extension/widget.js trims the page well below this before sending.
      if (body.length > 200_000) req.destroy();
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
 * extension/background.js). One route: the extension's in-page chat panel
 * posts the conversation so far, and the configured model's reply streams
 * back — the profile itself never leaves this process, only the assistant's
 * words do. Bound to 127.0.0.1, never reachable from the network, and gated
 * by a bearer token so other local processes or web pages can't quietly use
 * the user's model and profile — see the doc comment on
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
      return;
    }

    // The in-page chat panel (extension/widget.js). Streams the reply as SSE
    // so the panel can render tokens as they arrive, the same way the app's
    // own chat panel does over IPC.
    if (req.method === "POST" && req.url === "/chat") {
      let payload: { messages?: unknown; page?: unknown; url?: unknown; title?: unknown };
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

      const url = typeof payload.url === "string" ? payload.url : "";
      const title = typeof payload.title === "string" ? payload.title : "";
      const asked = history[history.length - 1]?.content ?? "";

      await streamChat(
        store,
        history,
        {
          delta: (text) => send("delta", text),
          done: (full) => {
            // Recorded once the reply is whole, so History never shows a
            // half-streamed answer. Only pages the panel identified get a
            // session — a conversation with no URL has nothing to file under.
            if (url) recordExchange(url, title, asked, full);
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

    // The panel's "Cover letter" / "Tailor resume" buttons. Same streaming
    // shape as /chat so the panel renders it the same way, but the result is
    // kept as a downloadable artifact on the session rather than as a turn in
    // the conversation.
    if (req.method === "POST" && req.url === "/document") {
      let payload: { kind?: unknown; page?: unknown; url?: unknown; title?: unknown };
      try {
        payload = JSON.parse(await readBody(req));
      } catch {
        sendJson(res, 400, { error: "Invalid JSON body." });
        return;
      }

      const kind = payload.kind === "resume" ? "resume" : "cover-letter";
      const posting = typeof payload.page === "string" ? payload.page : "";
      if (!posting.trim()) {
        sendJson(res, 400, {
          error:
            "Nothing to write from — turn on “Let the assistant read this page” so it can see the posting.",
        });
        return;
      }
      const url = typeof payload.url === "string" ? payload.url : "";
      const title = typeof payload.title === "string" ? payload.title : "";

      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        ...corsHeaders(),
      });
      res.on("error", () => {});
      const sendDoc = (event: string, data: unknown): void => {
        if (res.destroyed || res.writableEnded) return;
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      };

      await streamDocument(store, kind, posting, {
        delta: (text) => sendDoc("delta", text),
        done: (full) => {
          if (url && full.trim()) {
            const artifact = recordArtifact(url, title, kind, full);
            sendDoc("artifact", { id: artifact.id, kind: artifact.kind });
          }
          sendDoc("done", true);
          if (!res.writableEnded) res.end();
        },
        error: (message) => {
          sendDoc("error", message);
          if (!res.writableEnded) res.end();
        },
      });
      return;
    }

    // A route the extension doesn't know about — most likely an older
    // version of it still loaded in the browser, which is worth saying out
    // loud rather than 404ing into the void.
    console.warn(
      `JSeeker: no route for ${req.method} ${req.url} — is an older version of the ` +
        "extension still loaded? Reload it at chrome://extensions."
    );
    res.writeHead(404, corsHeaders());
    res.end();
  });

  // Without this, a port already held by another instance of the app throws
  // an uncaught error in the main process and the UI goes on claiming the
  // server is up.
  server.on("error", (error) => {
    serverError = error instanceof Error ? error.message : String(error);
    console.error(
      `JSeeker: local server can't listen on port ${EXTENSION_SERVER_PORT}: ${serverError}`
    );
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

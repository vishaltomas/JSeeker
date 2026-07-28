import { createServer } from "http";
import { ipcMain } from "electron";
import { activeProfileData, activeProfileRecord, loadStore } from "./store";
import { planAutofillWithLLM } from "../agents";
import type { FieldDescriptor } from "../agents/types";

export const EXTENSION_SERVER_PORT = 8743;

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
      if (body.length > 100_000) req.destroy(); // a page's worth of field descriptors, generously capped
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
 * extension/background.js) to fill forms in the user's real browser. Bound
 * to 127.0.0.1, never reachable from the network, and gated by a bearer
 * token so other local processes or web pages can't silently read profile
 * data or trigger fills — see the doc comment on Settings.extensionSyncToken
 * in store.ts for what that token does and doesn't protect against. */
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

    if (req.method === "GET" && req.url === "/profile") {
      const data = activeProfileData(store);
      const resume = activeProfileRecord(store).resume;
      sendJson(res, 200, {
        ...data,
        fullName: [data.firstName, data.lastName].filter(Boolean).join(" "),
        summary: resume.summary,
        skills: resume.skills.join(", "),
      });
      return;
    }

    if (req.method === "POST" && req.url === "/autofill") {
      let payload: { fields?: FieldDescriptor[] };
      try {
        payload = JSON.parse(await readBody(req));
      } catch {
        sendJson(res, 400, { error: "Invalid JSON body." });
        return;
      }
      const fields = Array.isArray(payload.fields) ? payload.fields : [];
      const mapping = fields.length ? await planAutofillWithLLM(store, fields) : [];
      sendJson(res, 200, { mapping });
      return;
    }

    res.writeHead(404, corsHeaders());
    res.end();
  });

  server.listen(EXTENSION_SERVER_PORT, "127.0.0.1");
}

ipcMain.handle("extension:info", () => ({ port: EXTENSION_SERVER_PORT }));

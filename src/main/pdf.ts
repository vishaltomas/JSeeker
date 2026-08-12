import { app, BrowserWindow, dialog, ipcMain } from "electron";
import * as fs from "fs";
import * as path from "path";
import { randomBytes } from "crypto";
import { getMainWindow } from "./window";

export interface PdfExportResult {
  /** True only when a file was actually written. */
  ok: boolean;
  /** The user dismissed the save dialog — not an error, so the UI stays quiet. */
  canceled?: boolean;
  /** Where it was written, for the confirmation message. */
  filePath?: string;
  error?: string;
}

/** Turns a resume title into something safe to hand a file system. */
function safeFileName(name: unknown): string {
  const base = typeof name === "string" ? name.replace(/[/\\?%*:|"<>]/g, "").trim() : "";
  return `${base || "resume"}.pdf`;
}

/**
 * Renders a complete HTML document to PDF.
 *
 * The markup is loaded in its own hidden window rather than printed from the
 * preview iframe: the iframe is sandboxed down to static markup with no way to
 * reach the main process, and a separate window also means the page prints at
 * its natural size instead of whatever the preview happens to be scaled to.
 *
 * That window is locked down the same way the preview is — no scripts, no node
 * — because this is the one place app-authored HTML gets loaded and run
 * outside the sandbox. Chromium won't print a `data:` URL, so the document
 * goes through a temp file that is deleted either way.
 */
async function renderPdf(html: string): Promise<Buffer> {
  const tempFile = path.join(app.getPath("temp"), `jseeker-${randomBytes(8).toString("hex")}.html`);
  await fs.promises.writeFile(tempFile, html, "utf-8");

  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      javascript: false,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  try {
    await win.loadFile(tempFile);
    return await win.webContents.printToPDF({
      pageSize: "A4",
      printBackground: true,
      // 0.5in is exactly the 48px the preview pads the sheet by, which the
      // print stylesheet drops in favour of this — same inset, but applied to
      // every page rather than only around the first and last.
      margins: { top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 },
    });
  } finally {
    win.destroy();
    await fs.promises.unlink(tempFile).catch(() => {
      /* a leftover temp file is not worth failing an otherwise good export */
    });
  }
}

/** Saves the compiled resume as a PDF, asking the user where to put it. */
ipcMain.handle("pdf:export", async (_event, payload: unknown): Promise<PdfExportResult> => {
  const { html, name } = (payload ?? {}) as { html?: unknown; name?: unknown };
  if (typeof html !== "string" || !html.trim()) {
    return { ok: false, error: "Nothing to export." };
  }

  const parent = getMainWindow();
  const defaultPath = path.join(app.getPath("downloads"), safeFileName(name));
  const result = parent
    ? await dialog.showSaveDialog(parent, { title: "Save resume as PDF", defaultPath, filters: [{ name: "PDF", extensions: ["pdf"] }] })
    : await dialog.showSaveDialog({ title: "Save resume as PDF", defaultPath, filters: [{ name: "PDF", extensions: ["pdf"] }] });
  if (result.canceled || !result.filePath) return { ok: false, canceled: true };

  try {
    await fs.promises.writeFile(result.filePath, await renderPdf(html));
    return { ok: true, filePath: result.filePath };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
});

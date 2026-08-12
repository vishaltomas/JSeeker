import { app, dialog, ipcMain, shell } from "electron";
import * as fs from "fs";
import * as path from "path";
import { COVER_LETTER_SOURCE, SAMPLE_SOURCE } from "../resume_builder/samples";
import { STARTER_SOURCE } from "../resume_builder/sections";

/**
 * The builder's workspace: a folder of `.resb` documents inside the app's own
 * data directory, listed by the file explorer in BuilderView.
 *
 * Documents live here as files rather than as a string in store.json, so the
 * store only remembers which one is open. Everything the renderer can name is
 * checked back against this folder before it's touched — see `inWorkspace`.
 */

export interface BuilderFile {
  name: string;
  path: string;
  /** Epoch ms, for sorting most-recently-edited first. */
  modified: number;
}

export interface WorkspaceListing {
  /** Absolute path of the folder, shown in the explorer. */
  dir: string;
  files: BuilderFile[];
}

const EXTENSION = ".resb";
const DEFAULT_NAME = "resume";

export function workspaceDir(): string {
  return path.join(app.getPath("userData"), "resumes");
}

/**
 * Resolves a path the renderer supplied, or null if it isn't a `.resb` file
 * sitting directly in the workspace. The renderer only ever gets these paths
 * from `builder:list`, so anything that fails here is a bug or an attempt to
 * reach out of the folder — either way it doesn't get read or written.
 */
function inWorkspace(candidate: unknown): string | null {
  if (typeof candidate !== "string" || !candidate) return null;
  const resolved = path.resolve(candidate);
  // Windows paths are case-insensitive, and a bookmark saved by an older
  // build can differ from `app.getPath` in nothing but case — comparing the
  // two as plain strings would refuse a file sitting right in the folder.
  const sameFolder =
    process.platform === "win32"
      ? path.dirname(resolved).toLowerCase() === path.resolve(workspaceDir()).toLowerCase()
      : path.dirname(resolved) === path.resolve(workspaceDir());
  if (!sameFolder) return null;
  if (path.extname(resolved).toLowerCase() !== EXTENSION) return null;
  return resolved;
}

/** Strips a picked file's name down to something safe to create here. */
function safeStem(name: unknown): string {
  const raw = typeof name === "string" ? path.basename(name) : "";
  const stem = raw
    .replace(new RegExp(`${EXTENSION}$`, "i"), "")
    .replace(/[/\\?%*:|"<>]/g, "")
    .trim();
  return stem || DEFAULT_NAME;
}

/** `resume.resb`, or `resume-2.resb` if that's taken, and so on. */
function freePath(stem: string): string {
  const dir = workspaceDir();
  for (let n = 1; ; n++) {
    const candidate = path.join(dir, `${stem}${n === 1 ? "" : `-${n}`}${EXTENSION}`);
    if (!fs.existsSync(candidate)) return candidate;
  }
}

/**
 * Creates the workspace the first time the app needs one, holding the user's
 * own document — `source` from a store written before the workspace existed,
 * or the starter template — plus copies of the worked examples to read.
 *
 * Returns the user's document, or null if the folder was already there: this
 * runs once, so a workspace someone has emptied (or deleted the sample from)
 * stays the way they left it.
 */
export function seedWorkspace(source?: string): string | null {
  const dir = workspaceDir();
  if (fs.existsSync(dir)) return null;
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `sample-resume${EXTENSION}`), SAMPLE_SOURCE, "utf-8");
  fs.writeFileSync(
    path.join(dir, `sample-cover-letter${EXTENSION}`),
    COVER_LETTER_SOURCE,
    "utf-8"
  );
  const file = path.join(dir, `${DEFAULT_NAME}${EXTENSION}`);
  fs.writeFileSync(file, source?.trim() ? source : STARTER_SOURCE, "utf-8");
  return file;
}

function listFiles(): BuilderFile[] {
  const dir = workspaceDir();
  let names: string[];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return [];
  }
  return names
    .filter((name) => path.extname(name).toLowerCase() === EXTENSION)
    .map((name) => {
      const filePath = path.join(dir, name);
      let modified = 0;
      try {
        modified = fs.statSync(filePath).mtimeMs;
      } catch {
        /* a file that vanished between readdir and stat just sorts last */
      }
      return { name, path: filePath, modified };
    })
    .sort((a, b) => b.modified - a.modified);
}

function fileEntry(filePath: string): BuilderFile {
  let modified = 0;
  try {
    modified = fs.statSync(filePath).mtimeMs;
  } catch {
    /* freshly written; the list refresh will pick up the real time */
  }
  return { name: path.basename(filePath), path: filePath, modified };
}

ipcMain.handle("builder:list", (): WorkspaceListing => {
  seedWorkspace();
  return { dir: workspaceDir(), files: listFiles() };
});

ipcMain.handle("builder:read", async (_event, filePath: unknown) => {
  const resolved = inWorkspace(filePath);
  if (!resolved) return { error: "That file isn't in the resume workspace." };
  try {
    return { content: await fs.promises.readFile(resolved, "utf-8") };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
});

ipcMain.handle("builder:write", async (_event, payload: unknown) => {
  const { path: filePath, content } = (payload ?? {}) as { path?: unknown; content?: unknown };
  const resolved = inWorkspace(filePath);
  if (!resolved) return { error: "That file isn't in the resume workspace." };
  if (typeof content !== "string") return { error: "Nothing to write." };
  try {
    await fs.promises.writeFile(resolved, content, "utf-8");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
});

/** Creates a new document, giving way to any file already using that name. */
ipcMain.handle("builder:create", async (_event, payload: unknown) => {
  const { name, content } = (payload ?? {}) as { name?: unknown; content?: unknown };
  try {
    // Deliberately not `seedWorkspace`: the folder may be missing because the
    // user emptied it, and this call is already creating the document.
    fs.mkdirSync(workspaceDir(), { recursive: true });
    const filePath = freePath(safeStem(name));
    await fs.promises.writeFile(
      filePath,
      typeof content === "string" && content.trim() ? content : STARTER_SOURCE,
      "utf-8"
    );
    return { file: fileEntry(filePath) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
});

/**
 * Renames a document in place.
 *
 * A name already in use is refused rather than worked around: `builder:create`
 * side-steps a collision because the user asked for "another one", but someone
 * renaming a file has a specific name in mind and needs to know it's taken.
 */
ipcMain.handle("builder:rename", async (_event, payload: unknown) => {
  const { path: filePath, name } = (payload ?? {}) as { path?: unknown; name?: unknown };
  const resolved = inWorkspace(filePath);
  if (!resolved) return { error: "That file isn't in the resume workspace." };

  const stem = safeStem(name);
  const target = path.join(workspaceDir(), `${stem}${EXTENSION}`);
  // Nothing to do — and on a case-insensitive filesystem, renaming a file to
  // itself in different case must not look like a collision.
  if (path.resolve(target).toLowerCase() === resolved.toLowerCase()) {
    try {
      await fs.promises.rename(resolved, target);
    } catch {
      /* same name in the same case: nothing to rename */
    }
    return { file: fileEntry(target) };
  }
  if (fs.existsSync(target)) {
    return { error: `A document called ${stem}${EXTENSION} already exists.` };
  }
  try {
    await fs.promises.rename(resolved, target);
    return { file: fileEntry(target) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
});

/**
 * Deletes a document — to the OS bin rather than unlinking it, so a mis-click
 * costs a trip to the recycle bin instead of the afternoon's work. The app
 * itself offers no undo.
 */
ipcMain.handle("builder:delete", async (_event, filePath: unknown) => {
  const resolved = inWorkspace(filePath);
  if (!resolved) return { error: "That file isn't in the resume workspace." };
  try {
    await shell.trashItem(resolved);
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
});

/**
 * Reads a `.resb` file from anywhere on disk without touching the workspace.
 * The renderer checks that it's a valid resume before asking for a copy of it
 * to be created here, so a malformed file never lands in the folder.
 */
ipcMain.handle("builder:pick", async () => {
  const result = await dialog.showOpenDialog({
    title: "Import a resume document",
    properties: ["openFile"],
    filters: [
      { name: "Resume source", extensions: ["resb"] },
      { name: "All Files", extensions: ["*"] },
    ],
  });
  const picked = result.filePaths[0];
  if (result.canceled || !picked) return { canceled: true };
  try {
    return { name: path.basename(picked), content: await fs.promises.readFile(picked, "utf-8") };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
});

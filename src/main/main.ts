import { app, BrowserWindow, ipcMain, dialog, webContents } from "electron";
import * as path from "path";
import * as fs from "fs";

let mainWindow: BrowserWindow | null = null;

export type Profile = Record<string, string>;

const DEFAULT_PROFILE: Profile = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  address: "",
  city: "",
  state: "",
  zip: "",
  country: "",
  linkedin: "",
  github: "",
  website: "",
  currentTitle: "",
  currentCompany: "",
  resumePath: "",
};

function profilePath(): string {
  return path.join(app.getPath("userData"), "profile.json");
}

function loadProfile(): Profile {
  try {
    const raw = fs.readFileSync(profilePath(), "utf-8");
    return { ...DEFAULT_PROFILE, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_PROFILE };
  }
}

function saveProfile(profile: Profile): void {
  fs.writeFileSync(profilePath(), JSON.stringify(profile, null, 2), "utf-8");
}

ipcMain.handle("profile:load", () => loadProfile());
ipcMain.handle("profile:save", (_event, profile: Profile) => {
  saveProfile(profile);
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

app.whenReady().then(createWindow);

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

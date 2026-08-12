import { app, BrowserWindow, Menu } from "electron";
import * as path from "path";
import "./store";
import "./files";
import "./builderWorkspace";
import "./pdf";
import { bootstrapOllama } from "../agents";
import { setMainWindow } from "./window";
import { startExtensionServer } from "./extensionServer";

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    // Hides the native title bar text/background but keeps the native
    // minimize/maximize/close buttons (still fully functional — snapping,
    // accessibility, etc.) drawn as a colored overlay instead of the default
    // black strip, so the app's own header can extend all the way to the
    // top of the window. Height/color here must match the gradient header's
    // own sizing — see Header.tsx.
    titleBarStyle: "hidden",
    titleBarOverlay: {
      color: "#6d28d9",
      symbolColor: "#ffffff",
      height: 40,
    },
    webPreferences: {
      preload: path.join(__dirname, "../preload/preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  setMainWindow(win);
  win.loadFile(path.join(__dirname, "../renderer/index.html"));

  win.on("closed", () => {
    setMainWindow(null);
  });
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null); // remove the app menu bar entirely
  createWindow();
  bootstrapOllama(); // fire-and-forget: get the local model running in the background
  startExtensionServer(); // fire-and-forget: local HTTP server for the companion browser extension
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

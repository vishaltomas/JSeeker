import { app, BrowserWindow, Menu } from "electron";
import * as path from "path";
import "./store";
import "./files";
import "./jobs";
import { bootstrapOllama } from "../agents";
import { setMainWindow } from "./window";

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    webPreferences: {
      preload: path.join(__dirname, "../preload/preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
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

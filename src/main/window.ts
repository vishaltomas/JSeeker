import type { BrowserWindow } from "electron";

// A tiny registry so other main-process modules (e.g. the agents' status
// broadcasts) can reach the window without importing main.ts and creating a
// circular dependency.
let mainWindow: BrowserWindow | null = null;

export function setMainWindow(win: BrowserWindow | null): void {
  mainWindow = win;
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

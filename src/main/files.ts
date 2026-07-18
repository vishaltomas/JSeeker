import { dialog, ipcMain, webContents } from "electron";
import * as fs from "fs";

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

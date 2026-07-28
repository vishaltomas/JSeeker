import { dialog, ipcMain } from "electron";

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

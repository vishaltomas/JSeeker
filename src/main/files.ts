import { dialog, ipcMain } from "electron";

/** Native file picker for resume/CV/supporting documents — supports
 * selecting multiple at once so onboarding (and later, adding more) can
 * combine several documents into one extraction pass. Returns the picked
 * paths, or an empty array if canceled. */
ipcMain.handle("dialog:pickResumeFiles", async () => {
  const result = await dialog.showOpenDialog({
    title: "Select your resume, cover letter, or other documents",
    properties: ["openFile", "multiSelections"],
    filters: [
      { name: "Documents", extensions: ["pdf", "doc", "docx", "txt", "rtf"] },
      { name: "All Files", extensions: ["*"] },
    ],
  });
  if (result.canceled) return [];
  return result.filePaths;
});

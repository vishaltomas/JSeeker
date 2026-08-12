import { dialog, ipcMain, shell } from "electron";

/** Opens a link in the user's real browser. Markdown rendered in chat can
 * contain links, and letting the renderer follow one itself would navigate the
 * app window away from the UI with no way back — this window has no chrome and
 * loads over file://. Only http/https are handed to the OS: other schemes
 * (file:, javascript:, custom protocol handlers) can trigger local side
 * effects, and nothing in this app needs them. */
ipcMain.handle("shell:openExternal", async (_event, url: unknown) => {
  if (typeof url !== "string") return false;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
  await shell.openExternal(parsed.href);
  return true;
});

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

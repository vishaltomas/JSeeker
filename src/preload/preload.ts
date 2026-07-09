import { contextBridge, ipcRenderer } from "electron";

type Profile = Record<string, string>;

contextBridge.exposeInMainWorld("api", {
  versions: {
    node: process.versions.node,
    chrome: process.versions.chrome,
    electron: process.versions.electron,
  },
  loadProfile: (): Promise<Profile> => ipcRenderer.invoke("profile:load"),
  saveProfile: (profile: Profile): Promise<boolean> =>
    ipcRenderer.invoke("profile:save", profile),
  pickResume: (): Promise<string | null> =>
    ipcRenderer.invoke("dialog:pickResume"),
  attachResume: (webContentsId: number, filePath: string): Promise<number> =>
    ipcRenderer.invoke("resume:attach", { webContentsId, filePath }),
});

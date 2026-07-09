import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("api", {
  versions: {
    node: process.versions.node,
    chrome: process.versions.chrome,
    electron: process.versions.electron,
  },
  sendMessage: (message: string): Promise<string> =>
    ipcRenderer.invoke("chat:send", message),
});

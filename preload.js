const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktopApp", {
  isDesktop: true,
  getMode: () => ipcRenderer.invoke("app:get-mode"),
  setMode: mode => ipcRenderer.invoke("app:set-mode", mode)
});

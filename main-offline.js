const { app, BrowserWindow } = require("electron");
const path = require("path");
const { setupAutoUpdater } = require("./auto-update");

let mainWindow = null;

setupAutoUpdater(() => mainWindow, "FNF Onliine Offline");

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    resizable: true,
    useContentSize: true,
    icon: path.join(__dirname, "assets", "bf-logo-256.png"),
    webPreferences: {
      contextIsolation: true,
      backgroundThrottling: false
    }
  });

  mainWindow = win;
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, "FNF - Offline.html"));
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

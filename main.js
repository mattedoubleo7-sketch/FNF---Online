const { app, BrowserWindow, ipcMain } = require("electron");
const fs = require("fs");
const path = require("path");
const { createGameServer } = require("./server");
const { setupAutoUpdater } = require("./auto-update");
const PACKAGE_INFO = require("./package.json");

let mainWindow = null;
let embeddedServer = null;
let currentDesktopMode = "online";

setupAutoUpdater(() => mainWindow, "FNF Onliine");

function configPath() {
  return path.join(app.getPath("userData"), "desktop-mode.json");
}

function defaultDesktopMode() {
  return PACKAGE_INFO.fnfDefaultDesktopMode === "offline" ? "offline" : "online";
}

function readDesktopMode() {
  try {
    const parsed = JSON.parse(fs.readFileSync(configPath(), "utf8"));
    return parsed?.mode === "offline" ? "offline" : "online";
  } catch {
    return defaultDesktopMode();
  }
}

function writeDesktopMode(mode) {
  const normalized = mode === "offline" ? "offline" : "online";
  fs.mkdirSync(path.dirname(configPath()), { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify({ mode: normalized }, null, 2), "utf8");
  currentDesktopMode = normalized;
  return normalized;
}

function readRemoteServerUrl() {
  const envUrl = String(process.env.FNF_REMOTE_SERVER_URL || "").trim();
  if (envUrl) return envUrl;
  const targetPath = path.join(__dirname, "remote-server-url.txt");
  if (!fs.existsSync(targetPath)) return "";
  return String(fs.readFileSync(targetPath, "utf8")).trim();
}

async function stopEmbeddedServer() {
  if (!embeddedServer?.server) return;
  await new Promise(resolve => embeddedServer.server.close(resolve));
  embeddedServer = null;
}

async function loadDesktopMode(win, mode) {
  const normalized = mode === "offline" ? "offline" : "online";
  currentDesktopMode = normalized;

  if (normalized === "offline") {
    await stopEmbeddedServer();
    await win.loadFile(path.join(__dirname, "FNF - Offline.html"));
    return;
  }

  const targetUrl = readRemoteServerUrl();
  if (targetUrl) {
    await stopEmbeddedServer();
    await win.loadURL(targetUrl.replace(/\/$/, "") + "/play");
    return;
  }

  if (!embeddedServer) {
    embeddedServer = await createGameServer({ port: 0, host: "127.0.0.1" });
  }
  await win.loadURL(`http://127.0.0.1:${embeddedServer.port}/play`);
}

async function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    resizable: true,
    useContentSize: true,
    icon: path.join(__dirname, "assets", "bf-logo-256.png"),
    webPreferences: {
      contextIsolation: true,
      backgroundThrottling: false,
      preload: path.join(__dirname, "preload.js")
    }
  });

  mainWindow = win;
  win.setMenuBarVisibility(false);
  await loadDesktopMode(win, readDesktopMode());
}

ipcMain.handle("app:get-mode", () => currentDesktopMode || readDesktopMode());
ipcMain.handle("app:set-mode", async (_event, mode) => {
  const nextMode = writeDesktopMode(mode);
  if (mainWindow && !mainWindow.isDestroyed()) {
    await loadDesktopMode(mainWindow, nextMode);
  }
  return nextMode;
});

app.whenReady().then(createWindow);

app.on("window-all-closed", async () => {
  await stopEmbeddedServer();
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

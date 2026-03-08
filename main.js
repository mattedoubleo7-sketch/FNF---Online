const { app, BrowserWindow } = require("electron");
const fs = require("fs");
const path = require("path");
const { createGameServer } = require("./server");

let mainWindow = null;
let embeddedServer = null;

function readRemoteServerUrl() {
  const envUrl = String(process.env.FNF_REMOTE_SERVER_URL || "").trim();
  if (envUrl) return envUrl;
  const configPath = path.join(__dirname, "remote-server-url.txt");
  if (!fs.existsSync(configPath)) return "";
  return String(fs.readFileSync(configPath, "utf8")).trim();
}

async function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    resizable: true,
    useContentSize: true,
    icon: path.join(__dirname, "assets", "bf-logo-256.png"),
    webPreferences: {
      contextIsolation: true
    }
  });

  mainWindow = win;
  win.setMenuBarVisibility(false);

  const targetUrl = readRemoteServerUrl();
  if (targetUrl) {
    await win.loadURL(targetUrl.replace(/\/$/, "") + "/play");
    return;
  }

  embeddedServer = await createGameServer({ port: 0, host: "127.0.0.1" });
  await win.loadURL(`http://127.0.0.1:${embeddedServer.port}/play`);
}

app.whenReady().then(createWindow);

app.on("window-all-closed", async () => {
  if (embeddedServer && embeddedServer.server) {
    await new Promise(resolve => embeddedServer.server.close(resolve));
    embeddedServer = null;
  }
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

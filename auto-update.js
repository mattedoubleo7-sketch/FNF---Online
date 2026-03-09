const { app, dialog } = require("electron");
const { autoUpdater } = require("electron-updater");

function setupAutoUpdater(getWindow, appName) {
  if (!app.isPackaged || process.env.FNF_DISABLE_AUTO_UPDATE === "1") {
    return;
  }

  let checkTimer = null;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  function activeWindow() {
    try {
      return typeof getWindow === "function" ? getWindow() : null;
    } catch {
      return null;
    }
  }

  function showError(error) {
    const win = activeWindow();
    const detail = error && error.message ? error.message : String(error || "Unknown updater error");
    if (win && !win.isDestroyed()) {
      dialog.showMessageBox(win, {
        type: "error",
        buttons: ["OK"],
        title: appName + " Update Error",
        message: "Automatic update check failed.",
        detail
      }).catch(() => {});
    }
    console.error(appName + " updater error:", detail);
  }

  autoUpdater.on("error", error => {
    showError(error);
  });

  autoUpdater.on("update-available", info => {
    const win = activeWindow();
    if (!win || win.isDestroyed()) {
      autoUpdater.downloadUpdate().catch(showError);
      return;
    }
    dialog.showMessageBox(win, {
      type: "info",
      buttons: ["Download Update", "Later"],
      defaultId: 0,
      cancelId: 1,
      title: appName + " Update Available",
      message: "Version " + info.version + " is available.",
      detail: "Download the update now?"
    }).then(result => {
      if (result.response === 0) {
        autoUpdater.downloadUpdate().catch(showError);
      }
    }).catch(showError);
  });

  autoUpdater.on("download-progress", progress => {
    const win = activeWindow();
    if (win && !win.isDestroyed()) {
      win.setProgressBar(Math.max(0.02, Math.min(1, Number(progress.percent || 0) / 100)));
    }
  });

  autoUpdater.on("update-downloaded", info => {
    const win = activeWindow();
    if (win && !win.isDestroyed()) {
      win.setProgressBar(-1);
      dialog.showMessageBox(win, {
        type: "info",
        buttons: ["Install and Restart", "Later"],
        defaultId: 0,
        cancelId: 1,
        title: appName + " Update Ready",
        message: "Version " + info.version + " has been downloaded.",
        detail: "Restart now to install it."
      }).then(result => {
        if (result.response === 0) {
          setImmediate(() => autoUpdater.quitAndInstall(false, true));
        }
      }).catch(showError);
    } else {
      autoUpdater.quitAndInstall(false, true);
    }
  });

  app.whenReady().then(() => {
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch(showError);
    }, 3000);
    checkTimer = setInterval(() => {
      autoUpdater.checkForUpdates().catch(error => {
        console.error(appName + " background update check failed:", error && error.message ? error.message : error);
      });
    }, 30 * 60 * 1000);
  });

  app.on("before-quit", () => {
    if (checkTimer) {
      clearInterval(checkTimer);
      checkTimer = null;
    }
  });
}

module.exports = { setupAutoUpdater };

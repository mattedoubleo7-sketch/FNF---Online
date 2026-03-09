(() => {
  const bridge = window.desktopApp;
  if (!bridge || !bridge.isDesktop) return;

  function settingsModal() {
    return document.querySelector("#settings .modal");
  }

  function injectDesktopModeUI() {
    const modal = settingsModal();
    if (!modal || document.getElementById("desktopModeBlock")) return null;
    const footer = modal.querySelector(".modalFoot");
    if (!footer) return null;
    const block = document.createElement("div");
    block.className = "block";
    block.id = "desktopModeBlock";
    block.innerHTML = [
      "<h3>Desktop Mode</h3>",
      "<div style=\"display:grid;gap:12px;\">",
      "<label class=\"toggle\" style=\"justify-content:space-between;gap:14px;\">",
      "<span>Switch between the built-in offline page and the online room page.</span>",
      "<select id=\"desktopModeSelect\" style=\"font:inherit;background:rgba(255,255,255,0.08);color:#fff;border:1px solid rgba(255,255,255,0.15);border-radius:8px;padding:6px 10px;cursor:pointer;min-width:160px;\">",
      "<option value=\"online\">Online</option>",
      "<option value=\"offline\">Offline</option>",
      "</select>",
      "</label>",
      "<div id=\"desktopModeNote\" style=\"color:rgba(244,248,255,0.78);font-size:13px;line-height:1.45;\">Changing this reloads the desktop app into the selected mode.</div>",
      "</div>"
    ].join("");
    modal.insertBefore(block, footer);
    return block;
  }

  function updateOfflineMenuCopy(mode) {
    if (mode !== "offline") return;
    const onlineStatus = document.getElementById("onlineStatus");
    const onlineAccount = document.getElementById("onlineAccount");
    const onlineHint = document.getElementById("onlineHint");
    const authBtn = document.getElementById("onlineAuthBtn");
    if (onlineStatus) onlineStatus.textContent = "Offline mode";
    if (onlineAccount) onlineAccount.textContent = "Local only";
    if (onlineHint) onlineHint.textContent = "Offline mode is active in the desktop app. Switch to Online in Settings if you want rooms or matchmaking.";
    if (authBtn) authBtn.textContent = "Offline";
  }

  async function initDesktopMode() {
    injectDesktopModeUI();
    const select = document.getElementById("desktopModeSelect");
    const note = document.getElementById("desktopModeNote");
    if (!select || !note) return;
    try {
      const mode = await bridge.getMode();
      select.value = mode === "offline" ? "offline" : "online";
      updateOfflineMenuCopy(select.value);
      note.textContent = select.value === "online"
        ? "Online mode uses the room server page. Offline mode uses the local solo/local-versus page."
        : "Offline mode is active. Switch back to Online here when you want rooms or matchmaking.";
    } catch {
      note.textContent = "Desktop mode status could not be loaded.";
      return;
    }

    select.addEventListener("change", async () => {
      const nextMode = select.value === "offline" ? "offline" : "online";
      select.disabled = true;
      note.textContent = "Switching app mode and reloading now.";
      try {
        await bridge.setMode(nextMode);
      } catch {
        note.textContent = "Could not switch app mode.";
        select.disabled = false;
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initDesktopMode, { once: true });
  } else {
    initDesktopMode();
  }
})();

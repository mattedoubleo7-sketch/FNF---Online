const ONLINE_ONLY_MODE = true;

Object.assign(ui, {
  onlineStatus: document.getElementById("onlineStatus"),
  onlineAccount: document.getElementById("onlineAccount"),
  onlineHint: document.getElementById("onlineHint"),
  onlineAuthBtn: document.getElementById("onlineAuthBtn"),
  onlineLogoutBtn: document.getElementById("onlineLogoutBtn"),
  hostOnlineBtn: document.getElementById("hostOnlineBtn"),
  joinOnlineBtn: document.getElementById("joinOnlineBtn"),
  leaveOnlineBtn: document.getElementById("leaveOnlineBtn"),
  roomCodeInput: document.getElementById("roomCodeInput"),
  authWrap: document.getElementById("authWrap"),
  authUsername: document.getElementById("authUsername"),
  authPassword: document.getElementById("authPassword"),
  authMessage: document.getElementById("authMessage"),
  closeAuth: document.getElementById("closeAuth"),
  loginBtn: document.getElementById("loginBtn"),
  signupBtn: document.getElementById("signupBtn")
});

state.startTimer = null;
state.endTimer = null;
state.network = { socket: null, connected: false, roomId: "", role: null, peerConnected: false, user: null, matchStartAt: 0, pendingStartAt: 0, lastTrackSync: 0, matchmakingQueued: false, matchmakingStatus: "", ready: { host: false, guest: false }, loaded: { host: false, guest: false }, preparing: false, prepareMatchId: "", preparedSongId: "", loadingStatus: "", serverOffsetMs: 0 };

let socketClientPromise = null;
const originalVoice = voice;
const originalSongTime = songTime;
let matchmakingBtn = null;
let clockSyncTimer = null;

function ensureMatchmakingButton() {
  if (matchmakingBtn) return matchmakingBtn;
  const row = ui.hostOnlineBtn?.parentElement;
  if (!row) return null;
  matchmakingBtn = document.createElement("button");
  matchmakingBtn.className = "btn secondary onlineBtn";
  matchmakingBtn.id = "matchmakeOnlineBtn";
  matchmakingBtn.textContent = "Matchmake";
  row.insertBefore(matchmakingBtn, ui.leaveOnlineBtn || null);
  matchmakingBtn.onclick = () => toggleMatchmaking();
  return matchmakingBtn;
}

function syncMatchmakingButton() {
  const button = ensureMatchmakingButton();
  if (!button) return;
  button.textContent = state.network.matchmakingQueued ? "Cancel Queue" : "Matchmake";
}

function serverClockNow() {
  return Date.now() + (state.network.serverOffsetMs || 0);
}

function localFromServerTime(serverTime) {
  return Number(serverTime || 0) - (state.network.serverOffsetMs || 0);
}

function ingestServerClock(serverTime, sentAt = 0, receivedAt = Date.now()) {
  const serverNow = Number(serverTime || 0);
  if (!Number.isFinite(serverNow) || serverNow <= 0) return;
  const outbound = Number(sentAt || 0);
  const midpoint = outbound > 0 ? outbound + (receivedAt - outbound) / 2 : receivedAt;
  const candidate = serverNow - midpoint;
  if (!Number.isFinite(candidate)) return;
  if (!Number.isFinite(state.network.serverOffsetMs)) state.network.serverOffsetMs = candidate;
  else state.network.serverOffsetMs = state.network.serverOffsetMs * 0.75 + candidate * 0.25;
}

function requestTimeSync(socket = state.network.socket) {
  if (!socket || !socket.connected) return;
  socket.emit("time:sync", { sentAt: Date.now() });
}

function scheduleClockSync(socket = state.network.socket) {
  if (clockSyncTimer) clearInterval(clockSyncTimer);
  requestTimeSync(socket);
  [180, 600, 1400].forEach(delay => setTimeout(() => requestTimeSync(socket), delay));
  clockSyncTimer = setInterval(() => requestTimeSync(socket), 10000);
}

function clearPreparedMatch() {
  state.network.preparing = false;
  state.network.prepareMatchId = "";
  state.network.preparedSongId = "";
  state.network.loaded = { host: false, guest: false };
  state.network.loadingStatus = "";
}

function mediaListFrom(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value[Symbol.iterator] === "function") return Array.from(value).filter(Boolean);
  return [];
}

function waitForTrackReady(track, timeoutMs = 12000) {
  return new Promise(resolve => {
    if (!track) { resolve(); return; }
    if (track.readyState >= 3) { resolve(); return; }
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      cleanup();
      resolve();
    };
    const cleanup = () => {
      clearTimeout(timer);
      ["canplaythrough", "canplay", "loadeddata", "error"].forEach(name => track.removeEventListener(name, finish));
    };
    const timer = setTimeout(finish, timeoutMs);
    ["canplaythrough", "canplay", "loadeddata", "error"].forEach(name => track.addEventListener(name, finish, { once: false }));
    try { track.load(); } catch {}
  });
}

function importedTracksForSong(songId = state.selectedSong) {
  const chartSource = SONGS[songId]?.chartSource;
  if (chartSource === "sporting") {
    ensureSportingAudio();
    return [state.audio.inst, state.audio.voices];
  }
  if (chartSource === "boxingMatch") {
    ensureBoxingMatchAudio();
    return [state.audio.boxingInst, state.audio.boxingVoices];
  }
  if (chartSource === "perseverance") {
    ensurePerseveranceAudio();
    return [state.audio.inst2, state.audio.voices2a, state.audio.voices2b];
  }
  if (chartSource === "brokenReality") {
    if (typeof window.ensureBrokenRealityAudio === "function") window.ensureBrokenRealityAudio();
    return [state.audio.inst3, state.audio.voices3a, state.audio.voices3b];
  }
  if (chartSource === "challengeEdd") {
    if (typeof window.ensureChallengeEddAudio === "function") window.ensureChallengeEddAudio();
    return [state.audio.challengeInst, state.audio.challengeVoices];
  }
  if (chartSource === "ourBrokenConstellations") {
    if (typeof window.ensureFallenStarsAudio === "function") window.ensureFallenStarsAudio();
    return [state.audio.fallenStarsInst, state.audio.fallenStarsVoices];
  }
  if (chartSource === "genocide") {
    if (typeof window.ensureGenocideAudio === "function") window.ensureGenocideAudio();
    return [state.audio.genocideInst, state.audio.genocideVoices];
  }
  return [];
}

async function primeTrackPlayback(track) {
  if (!track || track.__onlinePrimed) return;
  const previousMuted = !!track.muted;
  const previousVolume = Number.isFinite(track.volume) ? track.volume : 1;
  const previousTime = Number.isFinite(track.currentTime) ? track.currentTime : 0;
  try {
    if (track.readyState === 0) {
      try { track.load(); } catch {}
    }
    track.muted = true;
    track.volume = 0;
    const playAttempt = track.play();
    track.__onlinePrimed = true;
    if (playAttempt && typeof playAttempt.then === "function") {
      await Promise.race([
        playAttempt.catch(() => {}),
        new Promise(resolve => setTimeout(resolve, 900))
      ]);
    }
  } catch {
    track.__onlinePrimed = false;
  } finally {
    try { track.pause(); } catch {}
    try { track.currentTime = previousTime; } catch { try { track.currentTime = 0; } catch {} }
    try { track.volume = previousVolume; } catch {}
    try { track.muted = previousMuted; } catch {}
  }
}

async function primeImportedSongPlayback(songId = state.selectedSong) {
  const tracks = importedTracksForSong(songId).filter(Boolean);
  if (!tracks.length) return;
  await Promise.allSettled(tracks.map(track => primeTrackPlayback(track)));
}

async function preloadSongForMatch(songId, matchId) {
  state.network.preparing = true;
  state.network.prepareMatchId = matchId;
  state.network.preparedSongId = "";
  state.network.loadingStatus = "Loading song files on your side.";
  updateOnlinePanel();
  if (SONGS[songId]?.chartSource === "sporting") {
    ensureSportingAudio();
    [state.audio.inst, state.audio.voices].forEach(track => {
      if (!track) return;
      track.pause();
      try { track.currentTime = 0; } catch {}
      try { track.load(); } catch {}
    });
    await Promise.all([waitForTrackReady(state.audio.inst), waitForTrackReady(state.audio.voices)]);
  } else if (SONGS[songId]?.chartSource === "boxingMatch") {
    ensureBoxingMatchAudio();
    [state.audio.boxingInst, state.audio.boxingVoices].forEach(track => {
      if (!track) return;
      track.pause();
      try { track.currentTime = 0; } catch {}
      try { track.load(); } catch {}
    });
    await Promise.all([waitForTrackReady(state.audio.boxingInst), waitForTrackReady(state.audio.boxingVoices)]);
  } else if (SONGS[songId]?.chartSource === "perseverance") {
    ensurePerseveranceAudio();
    [state.audio.inst2, state.audio.voices2a, state.audio.voices2b].forEach(track => {
      if (!track) return;
      track.pause();
      try { track.currentTime = 0; } catch {}
      try { track.load(); } catch {}
    });
    await Promise.all([waitForTrackReady(state.audio.inst2), waitForTrackReady(state.audio.voices2a), waitForTrackReady(state.audio.voices2b)]);
  } else if (SONGS[songId]?.chartSource === "brokenReality") {
    const prepared = typeof window.prepareBrokenRealityOnlineStart === "function"
      ? window.prepareBrokenRealityOnlineStart()
      : (typeof window.ensureBrokenRealityAudio === "function"
        ? (window.ensureBrokenRealityAudio(), [state.audio.inst3, state.audio.voices3a, state.audio.voices3b])
        : []);
    const media = mediaListFrom(prepared);
    const tracks = media.length ? media : [state.audio.inst3, state.audio.voices3a, state.audio.voices3b];
    await Promise.all(tracks.filter(Boolean).map(track => waitForTrackReady(track)));
  } else if (SONGS[songId]?.chartSource === "challengeEdd") {
    const prepared = typeof window.prepareChallengeEddOnlineStart === "function"
      ? window.prepareChallengeEddOnlineStart()
      : (typeof window.ensureChallengeEddAudio === "function"
        ? (window.ensureChallengeEddAudio(), [state.audio.challengeInst, state.audio.challengeVoices])
        : []);
    const media = mediaListFrom(prepared);
    const tracks = media.length ? media : [state.audio.challengeInst, state.audio.challengeVoices];
    await Promise.all(tracks.filter(Boolean).map(track => waitForTrackReady(track)));
  } else if (SONGS[songId]?.chartSource === "ourBrokenConstellations") {
    const prepared = typeof window.prepareFallenStarsOnlineStart === "function"
      ? window.prepareFallenStarsOnlineStart()
      : (typeof window.ensureFallenStarsAudio === "function"
        ? (window.ensureFallenStarsAudio(), [state.audio.fallenStarsInst, state.audio.fallenStarsVoices])
        : []);
    const media = mediaListFrom(prepared);
    const tracks = media.length ? media : [state.audio.fallenStarsInst, state.audio.fallenStarsVoices];
    await Promise.all(tracks.filter(Boolean).map(track => waitForTrackReady(track)));
  } else if (SONGS[songId]?.chartSource === "genocide") {
    const prepared = typeof window.prepareGenocideOnlineStart === "function"
      ? window.prepareGenocideOnlineStart()
      : (typeof window.ensureGenocideAudio === "function"
        ? (window.ensureGenocideAudio(), [state.audio.genocideInst, state.audio.genocideVoices])
        : []);
    const media = mediaListFrom(prepared);
    const tracks = media.length ? media : [state.audio.genocideInst, state.audio.genocideVoices];
    await Promise.all(tracks.filter(Boolean).map(track => waitForTrackReady(track)));
  }
  if (state.network.prepareMatchId !== matchId) return false;
  state.network.preparedSongId = songId;
  state.network.loadingStatus = "Loaded on your side. Waiting for the other player.";
  if (state.network.role === "host") state.network.loaded.host = true;
  if (state.network.role === "guest") state.network.loaded.guest = true;
  updateOnlinePanel();
  if (state.network.socket && state.network.roomId) {
    state.network.socket.emit("game:loaded", { matchId, songId });
  }
  return true;
}

function expectedOnlineSongTime() {
  if (state.mode !== "online" || !state.playing || !state.network.matchStartAt) return null;
  return Math.max(0, (serverClockNow() - state.network.matchStartAt) / 1000);
}
function syncTrackToTime(track, targetTime, shouldPlay, options = {}) {
  if (!track) return;
  if (track.readyState === 0) {
    try { track.load(); } catch {}
  }
  const duration = Number.isFinite(track.duration) && track.duration > 0 ? track.duration : null;
  const desiredTime = Math.max(0, duration == null ? targetTime : Math.min(targetTime, Math.max(0, duration - 0.05)));
  const tolerance = shouldPlay ? Number(options.playTolerance || 0.045) : Number(options.pauseTolerance || 0.02);
  if (Math.abs((track.currentTime || 0) - desiredTime) > tolerance) {
    try { track.currentTime = desiredTime; } catch {}
  }
  if (shouldPlay) {
    if (track.paused && !track.__onlineStarting && (duration == null || desiredTime < duration - 0.05)) {
      track.__onlineStarting = true;
      try {
        const playAttempt = track.play();
        if (playAttempt && typeof playAttempt.then === "function") {
          playAttempt.then(() => {
            track.__onlineStarting = false;
            const freshTarget = expectedOnlineSongTime();
            if (freshTarget == null) return;
            const freshDuration = Number.isFinite(track.duration) && track.duration > 0 ? track.duration : null;
            const freshDesired = Math.max(0, freshDuration == null ? freshTarget : Math.min(freshTarget, Math.max(0, freshDuration - 0.05)));
            if (Math.abs((track.currentTime || 0) - freshDesired) > 0.016) {
              try { track.currentTime = freshDesired; } catch {}
            }
          }).catch(() => {
            track.__onlineStarting = false;
          });
        } else {
          track.__onlineStarting = false;
        }
      } catch {
        track.__onlineStarting = false;
      }
    }
  } else {
    track.__onlineStarting = false;
    if (!track.paused) track.pause();
  }
}

function syncOnlinePlayback(force = false) {
  const targetTime = expectedOnlineSongTime();
  if (targetTime == null) return null;
  const localNow = Date.now();
  const now = serverClockNow();
  const syncGap = targetTime < 10 ? 55 : 85;
  if (!force && localNow - (state.network.lastTrackSync || 0) < syncGap) return targetTime;
  state.network.lastTrackSync = localNow;
  const shouldPlay = now + 40 >= state.network.matchStartAt;
  const syncOptions = { playTolerance: 0.045, pauseTolerance: 0.02 };
  if (state.currentSong.chartSource === "sporting") {
    ensureSportingAudio();
    syncTrackToTime(state.audio.inst, targetTime, shouldPlay, syncOptions);
    syncTrackToTime(state.audio.voices, targetTime, shouldPlay, syncOptions);
  } else if (state.currentSong.chartSource === "boxingMatch") {
    ensureBoxingMatchAudio();
    syncTrackToTime(state.audio.boxingInst, targetTime, shouldPlay, syncOptions);
    syncTrackToTime(state.audio.boxingVoices, targetTime, shouldPlay, syncOptions);
  } else if (state.currentSong.chartSource === "perseverance") {
    ensurePerseveranceAudio();
    syncTrackToTime(state.audio.inst2, targetTime, shouldPlay, syncOptions);
    syncTrackToTime(state.audio.voices2a, targetTime, shouldPlay, syncOptions);
    syncTrackToTime(state.audio.voices2b, targetTime, shouldPlay, syncOptions);
  }
  return targetTime;
}

songTime = function() {
  const targetTime = expectedOnlineSongTime();
  if (targetTime == null) return originalSongTime();
  syncOnlinePlayback();
  return targetTime;
};

function onlineSupported() {
  return location.protocol === "http:" || location.protocol === "https:";
}

function loadSocketClient() {
  if (window.io) return Promise.resolve(true);
  if (socketClientPromise) return socketClientPromise;
  if (!onlineSupported()) return Promise.resolve(false);
  socketClientPromise = new Promise(resolve => {
    const script = document.createElement("script");
    script.src = "/socket.io/socket.io.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
  });
  return socketClientPromise;
}

function localSideKey() {
  return state.network.role === "guest" ? "opp" : "player";
}

function remoteSideKey() {
  return localSideKey() === "player" ? "opp" : "player";
}

function localControlsSide(side) {
  return side === localSideKey();
}

function localStats() {
  return state.stats ? state.stats[localSideKey()] : blankSide();
}

function remoteStats() {
  return state.stats ? state.stats[remoteSideKey()] : blankSide();
}

function localReady() {
  if (state.network.role === "host") return !!state.network.ready.host;
  if (state.network.role === "guest") return !!state.network.ready.guest;
  return false;
}

function peerReady() {
  if (state.network.role === "host") return !!state.network.ready.guest;
  if (state.network.role === "guest") return !!state.network.ready.host;
  return false;
}

function localLoaded() {
  if (state.network.role === "host") return !!state.network.loaded.host;
  if (state.network.role === "guest") return !!state.network.loaded.guest;
  return false;
}

function peerLoaded() {
  if (state.network.role === "host") return !!state.network.loaded.guest;
  if (state.network.role === "guest") return !!state.network.loaded.host;
  return false;
}

function onlineCountdownSeconds() {
  if (!state.network.pendingStartAt || state.network.pendingStartAt <= serverClockNow()) return 0;
  return Math.ceil((state.network.pendingStartAt - serverClockNow()) / 1000);
}

function syncReadyButton() {
  if (!ui.playBtn) return;
  if (state.network.preparing || (state.network.pendingStartAt && state.network.pendingStartAt > serverClockNow())) {
    ui.playBtn.textContent = "Loading Match";
    return;
  }
  ui.playBtn.textContent = localReady() ? "Unready" : "Ready Up";
}

function cancelMatchmaking(silent = false) {
  if (state.network.socket && state.network.matchmakingQueued) state.network.socket.emit("matchmaking:leave");
  state.network.matchmakingQueued = false;
  state.network.matchmakingStatus = "";
  syncMatchmakingButton();
  if (!silent) updateOnlinePanel();
}

function emitReadyState(ready) {
  if (!state.network.socket || !state.network.roomId) return;
  state.network.socket.emit("game:ready", { ready: !!ready, songId: state.selectedSong });
}

function setOnlineMessage(title, hint) {
  if (ui.onlineStatus) ui.onlineStatus.textContent = title;
  if (ui.onlineHint) ui.onlineHint.textContent = hint || "";
}

function syncViewportMode() {
  const fullscreen = !!document.fullscreenElement || (window.innerWidth >= screen.availWidth - 4 && window.innerHeight >= screen.availHeight - 4);
  document.body.classList.toggle("fullViewport", fullscreen);
  document.getElementById("app")?.classList.toggle("coverViewport", fullscreen);
}

function syncModeUI() {
  state.mode = "online";
  ui.modeLabel.textContent = state.network.role === "guest" ? "Online Guest" : state.network.role === "host" ? "Online Host" : "Online Lobby";
  if (ui.versusToggle) {
    ui.versusToggle.checked = false;
    ui.versusToggle.disabled = true;
    ui.versusToggle.closest(".toggle")?.style.setProperty("display", "none");
  }
  rebuildKeyMap();
  ui.p1Box.style.display = "block";
}

function returnToOnlineLobby(status = "Match complete", hint = "Room is still open. Both players can press Ready Up again for a rematch.") {
  stopExternalAudio();
  if (state.endTimer) clearTimeout(state.endTimer);
  state.endTimer = null;
  state.playing = false;
  state.network.pendingStartAt = 0;
  state.network.matchStartAt = 0;
  ui.resultsWrap.classList.remove("show");
  ui.menu.classList.add("show");
  ui.statusText.textContent = status;
  ui.statusSub.textContent = hint;
  syncModeUI();
  updateOnlinePanel();
}

function updateOnlinePanel() {
  syncMatchmakingButton();
  ui.onlineAccount.textContent = state.network.user ? state.network.user.username : "Anonymous";
  if (state.network.roomId && document.activeElement !== ui.roomCodeInput) ui.roomCodeInput.value = state.network.roomId;
  syncReadyButton();
  if (!onlineSupported()) {
    setOnlineMessage("Server mode required", "Open the game through the server URL to use online rooms.");
    return;
  }
  if (!state.network.connected) {
    setOnlineMessage("Connecting", "Connecting to the room server now.");
    return;
  }
  if (state.network.matchmakingQueued) {
    setOnlineMessage("Matchmaking", state.network.matchmakingStatus || "Searching for another player now. You will be dropped into a room automatically when a match is found.");
    return;
  }
  if (!state.network.roomId) {
    state.network.pendingStartAt = 0;
    state.network.ready = { host: false, guest: false };
    clearPreparedMatch();
    setOnlineMessage("Server ready", "Host a room, enter a room code to join one, or use Matchmake for a quick room.");
    return;
  }
  if (state.network.pendingStartAt && state.network.pendingStartAt > serverClockNow()) {
    setOnlineMessage("Loading match", "Both players finished loading. Starting in " + onlineCountdownSeconds() + " seconds on the shared server clock.");
    return;
  }
  if (state.network.preparing) {
    if (localLoaded() && peerLoaded()) {
      setOnlineMessage("Both clients loaded", "The server is locking in the synced start time now.");
      return;
    }
    if (localLoaded()) {
      setOnlineMessage("Loaded on your side", "Waiting for the other player to finish loading.");
      return;
    }
    if (peerLoaded()) {
      setOnlineMessage("Opponent loaded", "Finishing your local preload now.");
      return;
    }
    setOnlineMessage("Preloading match", state.network.loadingStatus || "Both players are ready. Loading audio before the synced countdown.");
    return;
  }
  if (!state.network.peerConnected) {
    setOnlineMessage("Room " + state.network.roomId + " waiting", "Share the room code and wait for your friend.");
    return;
  }
  if (localReady() && peerReady()) {
    setOnlineMessage("Both players ready", "Waiting for both clients to finish loading before the server starts the countdown.");
    return;
  }
  if (localReady()) {
    setOnlineMessage("You are ready", "Waiting for the other player to ready up.");
    return;
  }
  if (peerReady()) {
    setOnlineMessage("Opponent ready", "Press Ready Up when your game is loaded.");
    return;
  }
  setOnlineMessage("Room " + state.network.roomId + " ready check", "Both players have to press Ready Up. After that, both games preload first, then the server starts an 8 second synced countdown.");
}
async function ensureOnlineSocket() {
  if (!onlineSupported()) {
    updateOnlinePanel();
    return null;
  }
  const ok = await loadSocketClient();
  if (!ok || !window.io) {
    setOnlineMessage("Server unavailable", "The socket client could not load from the server.");
    return null;
  }
  if (state.network.socket && state.network.socket.connected) return state.network.socket;
  if (state.network.socket) {
    try { state.network.socket.disconnect(); } catch {}
  }
  state.network.matchStartAt = 0;
  state.network.lastTrackSync = 0;
  clearPreparedMatch();
  const socket = window.io({ transports: ["websocket", "polling"] });
  state.network.socket = socket;
  socket.on("connect", () => {
    state.network.connected = true;
    scheduleClockSync(socket);
    updateOnlinePanel();
  });
  socket.on("disconnect", () => {
    if (state.endTimer) clearTimeout(state.endTimer);
    state.endTimer = null;
    if (clockSyncTimer) clearInterval(clockSyncTimer);
    clockSyncTimer = null;
    state.network.connected = false;
    state.network.peerConnected = false;
    state.network.roomId = "";
    state.network.role = null;
    state.network.ready = { host: false, guest: false };
    state.network.pendingStartAt = 0;
    state.network.matchStartAt = 0;
    state.network.matchmakingQueued = false;
    state.network.matchmakingStatus = "";
    clearPreparedMatch();
    syncModeUI();
    updateOnlinePanel();
  });
  socket.on("session:ready", payload => {
    state.network.user = payload && payload.user ? payload.user : { username: "Anonymous" };
    ingestServerClock(payload?.serverNow);
    updateOnlinePanel();
  });
  socket.on("time:sync", payload => {
    ingestServerClock(payload?.serverNow, Number(payload?.sentAt || 0), Date.now());
    if (state.network.pendingStartAt && state.network.pendingStartAt > serverClockNow()) updateOnlinePanel();
  });
  socket.on("room:error", payload => {
    setOnlineMessage("Room error", payload && payload.message ? payload.message : "Room request failed.");
  });
  socket.on("room:update", payload => {
    ingestServerClock(payload?.serverNow);
    state.network.roomId = payload && payload.roomId ? payload.roomId : "";
    state.network.role = payload && payload.role ? payload.role : null;
    state.network.ready = payload && payload.ready ? { host: !!payload.ready.host, guest: !!payload.ready.guest } : { host: false, guest: false };
    state.network.loaded = payload && payload.loaded ? { host: !!payload.loaded.host, guest: !!payload.loaded.guest } : { host: false, guest: false };
    state.network.preparing = !!payload?.preparing && !(Number(payload?.startAt || 0) > 0);
    state.network.pendingStartAt = Number(payload?.startAt || 0);
    const other = state.network.role === "host" ? payload?.players?.guest : payload?.players?.host;
    state.network.peerConnected = !!other;
    state.network.matchmakingQueued = false;
    state.network.matchmakingStatus = "";
    if (!state.network.preparing && !state.network.pendingStartAt) clearPreparedMatch();
    if (payload && payload.songId) selectSong(payload.songId, true);
    syncModeUI();
    updateOnlinePanel();
  });
  socket.on("matchmaking:update", payload => {
    state.network.matchmakingQueued = !!payload?.queued;
    state.network.matchmakingStatus = String(payload?.status || "");
    syncMatchmakingButton();
    updateOnlinePanel();
  });
  socket.on("game:prepare", payload => {
    if (payload && payload.songId) selectSong(payload.songId, true);
    ingestServerClock(payload?.serverNow);
    state.network.pendingStartAt = 0;
    state.network.matchStartAt = 0;
    state.network.loaded = { host: false, guest: false };
    state.network.preparing = true;
    state.network.prepareMatchId = String(payload?.matchId || "");
    state.network.preparedSongId = "";
    state.network.loadingStatus = "Loading song files on your side.";
    setOnlineMessage("Preloading match", "Both players are ready. Waiting for both games to finish loading before the synced countdown starts.");
    preloadSongForMatch(payload && payload.songId ? payload.songId : state.selectedSong, state.network.prepareMatchId).catch(() => {
      if (state.network.prepareMatchId === String(payload?.matchId || "")) {
        state.network.loadingStatus = "Local preload failed. Press Ready Up again.";
        updateOnlinePanel();
      }
    });
  });
  socket.on("game:start", payload => {
    if (payload && payload.songId) selectSong(payload.songId, true);
    ingestServerClock(payload?.serverNow);
    const delayMs = Number(payload?.delayMs || 8000);
    const startAt = payload && payload.startAt ? Number(payload.startAt) : serverClockNow() + delayMs;
    const matchId = String(payload?.matchId || "");
    const songId = payload && payload.songId ? payload.songId : state.selectedSong;
    const skipReload = state.network.prepareMatchId === matchId && state.network.preparedSongId === songId;
    state.network.pendingStartAt = startAt;
    state.network.ready = { host: false, guest: false };
    state.network.loaded = { host: false, guest: false };
    state.network.preparing = false;
    state.network.prepareMatchId = "";
    state.network.preparedSongId = "";
    state.network.loadingStatus = "";
    setOnlineMessage("Match starting", "Both players finished loading. The synced countdown ends in " + Math.ceil(delayMs / 1000) + " seconds.");
    startSong(songId, { forceMode: "online", startAt, skipReload });
  });
  socket.on("game:judgment", payload => applyRemoteJudgment(payload));
  socket.on("game:dodge", payload => applyRemoteDodge(payload));
  return socket;
}
async function hostOnlineRoom() {
  const socket = await ensureOnlineSocket();
  if (!socket) return;
  cancelMatchmaking(true);
  socket.emit("room:host", { songId: state.selectedSong });
}

async function joinOnlineRoom() {
  const roomId = ui.roomCodeInput.value.trim().toUpperCase();
  if (!roomId) {
    setOnlineMessage("Need a room code", "Enter a room code before joining.");
    return;
  }
  const socket = await ensureOnlineSocket();
  if (!socket) return;
  cancelMatchmaking(true);
  socket.emit("room:join", { roomId });
}

async function toggleMatchmaking() {
  const socket = await ensureOnlineSocket();
  if (!socket) return;
  if (state.network.matchmakingQueued) {
    socket.emit("matchmaking:leave");
    return;
  }
  leaveOnlineRoom();
  socket.emit("matchmaking:join", { songId: state.selectedSong });
}

function leaveOnlineRoom() {
  if (state.endTimer) clearTimeout(state.endTimer);
  state.endTimer = null;
  if (state.network.socket && state.network.roomId) state.network.socket.emit("room:leave");
  state.network.roomId = "";
  state.network.role = null;
  state.network.peerConnected = false;
  state.network.ready = { host: false, guest: false };
  state.network.pendingStartAt = 0;
  state.network.matchStartAt = 0;
  state.network.matchmakingQueued = false;
  state.network.matchmakingStatus = "";
  syncModeUI();
  updateOnlinePanel();
}

function emitOnlineJudgment(note, kind, timingError) {
  if (state.mode !== "online" || !state.network.socket || !state.network.roomId || !localControlsSide(note.side)) return;
  state.network.socket.emit("game:judgment", {
    noteId: note.id,
    kind,
    lane: note.lane,
    side: note.side,
    character: note.character,
    holdActive: !!note.holdActive && !note.holdDone,
    holdDone: !!note.holdDone,
    timingError,
    stats: state.stats[note.side]
  });
}

function findNoteById(id) {
  return state.chart ? state.chart.notes.find(note => note.id === id) : null;
}

function applyRemoteJudgment(payload) {
  if (!payload || !state.chart || localControlsSide(payload.side)) return;
  const note = findNoteById(payload.noteId);
  if (note) {
    if (payload.kind === "miss") {
      note.judged = true;
      note.played = true;
      note.holdDone = true;
    } else {
      note.judged = true;
      note.hit = true;
      if (isHoldNote(note)) {
        note.holdActive = !!payload.holdActive;
        note.holdDone = !!payload.holdDone;
        note.played = !!payload.holdDone;
      } else note.played = true;
    }
  }
  judge(payload.side, payload.kind, payload.lane, payload.character, payload.timingError == null ? 0.155 : payload.timingError);
  if (payload.stats && state.stats && state.stats[payload.side]) {
    state.stats[payload.side] = {
      ...state.stats[payload.side],
      ...payload.stats,
      judgments: { ...state.stats[payload.side].judgments, ...(payload.stats.judgments || {}) }
    };
  }
}

function applyRemoteDodge(payload) {
  if (!payload || state.selectedSong !== "perseverance" || localSideKey() === "player") return;
  state.perseverance.dodging = true;
  state.perseverance.dodged = true;
  state.perseverance.dodgeStart = payload.time || songTime();
}

blankSide = function(){
  return { score: 0, combo: 0, maxCombo: 0, judged: 0, accuracyTotal: 0, judgments: { perfect: 0, good: 0, bad: 0, miss: 0 } };
};

accuracy = function(stats){
  return stats && stats.judged ? stats.accuracyTotal / stats.judged : 1;
};

rebuildKeyMap = function(){
  const map = {};
  const offset = localSideKey() === "player" ? 4 : 0;
  Object.entries(state.settings.solo).forEach(([dir, key]) => map[key] = offset + DIRS.indexOf(dir));
  state.keyMap = map;
};

selectSong = function(id, fromNetwork = false){
  if (state.network.role === "guest" && !fromNetwork) {
    setOnlineMessage("Host controls setlist", "Wait for the host to choose the song.");
    return;
  }
  state.selectedSong = id;
  state.currentSong = SONGS[id];
  ui.songList.querySelectorAll(".songCard").forEach(el => el.classList.toggle("selected", el.dataset.id === id));
  ui.songTitle.textContent = state.currentSong.title;
  ui.songSub.textContent = state.currentSong.subtitle;
  ui.difficulty.textContent = "Difficulty: " + state.currentSong.diff;
  if (state.network.roomId && state.network.role === "host" && !fromNetwork && state.network.socket) state.network.socket.emit("room:set-song", { songId: id });
  if (!state.playing) {
    ui.statusText.textContent = "Selected: " + state.currentSong.title;
    ui.statusSub.textContent = state.currentSong.blurb;
  }
};

judge = function(side, kind, lane, char, timingError = 0.155){
  const stats = side === "player" ? state.stats.player : state.stats.opp;
  const gain = { perfect: 350, good: 220, bad: 90, miss: 0 }[kind];
  const color = { perfect: "#67ff9a", good: "#4de3ff", bad: "#ffd35b", miss: "#ff6d7a" }[kind];
  const label = { perfect: "SICK", good: "GOOD", bad: "BAD", miss: "MISS" }[kind];
  if (kind === "miss") stats.combo = 0;
  else {
    stats.combo++;
    stats.maxCombo = Math.max(stats.maxCombo, stats.combo);
    stats.score += gain + stats.combo * 12;
    if (!isImportedSong(state.currentSong)) originalVoice(state.audio.ctx.currentTime, side, lane % 4, kind === "perfect" ? 1.15 : 0.95, char);
  }
  stats.judged++;
  stats.judgments[kind]++;
  stats.accuracyTotal += kind === "miss" ? 0 : clamp(1 - timingError / 0.155, 0, 1);
  const healthSide = localSideKey();
  if (side === healthSide) {
    if (kind === "perfect") state.health = clamp(state.health + 0.028, 0.02, 1);
    if (kind === "good") state.health = clamp(state.health + 0.016, 0.02, 1);
    if (kind === "bad") state.health = clamp(state.health - 0.018, 0.02, 1);
    if (kind === "miss") state.health = clamp(state.health - 0.11, 0.02, 1);
  }
  if (kind !== "miss") {
    state.receptorFx[lane] = { time: performance.now() / 1000, lane };
    if (kind === "perfect" || kind === "good") {
      state.hitGlow.push({ time: performance.now() / 1000, lane, color });
      if (state.hitGlow.length > 12) state.hitGlow.shift();
    }
  } else state.shake = { time: performance.now() / 1000, intensity: 4 };
  feed(side, label, color);
  pose(char, lane % 4, kind === "miss" ? "miss" : "hit");
};

handlePress = function(lane){
  if (!state.playing || !state.chart) return;
  const t = songTime();
  const side = lane < 4 ? "opp" : "player";
  if (!localControlsSide(side)) return;
  let best = null;
  let bestDiff = Infinity;
  for (const n of state.chart.notes) {
    if (n.judged || n.side !== side || n.lane !== lane) continue;
    const d = Math.abs(n.time - t);
    if (d < bestDiff) {
      bestDiff = d;
      best = n;
    }
    if (n.time - t > 0.2) break;
  }
  if (!best || bestDiff > 0.155) return;
  best.judged = true;
  best.played = true;
  best.hit = true;
  if (isHoldNote(best)) {
    best.holdActive = true;
    best.holdDone = false;
    best.played = false;
  }
  const kind = bestDiff <= 0.045 ? "perfect" : bestDiff <= 0.09 ? "good" : "bad";
  judge(side, kind, lane, best.character, bestDiff);
  emitOnlineJudgment(best, kind, bestDiff);
};

handleMisses = function(t){
  for (const n of state.chart.notes) {
    if (n.judged) continue;
    if (!localControlsSide(n.side)) continue;
    if (t > n.time + 0.16) {
      n.judged = true;
      n.played = true;
      judge(n.side, "miss", n.lane, n.character, 0.155);
      emitOnlineJudgment(n, "miss", 0.155);
    }
  }
};

updateHoldNotes = function(t){
  if (!state.chart) return;
  for (const n of state.chart.notes) {
    if (!n.holdActive || n.holdDone || !isHoldNote(n)) continue;
    const end = holdEndTime(n);
    if (t >= end - 0.02) {
      n.holdDone = true;
      n.played = true;
      continue;
    }
    if (!localControlsSide(n.side)) continue;
    if (t > n.time + 0.09 && !state.keysDown[n.lane]) {
      n.holdDone = true;
      n.played = true;
      judge(n.side, "miss", n.lane, n.character, 0.155);
      emitOnlineJudgment(n, "miss", 0.155);
    }
  }
};

refreshHUD = function(t){
  const primary = localStats();
  const secondary = remoteStats();
  const acc = accuracy(primary);
  const sec = currentSection(t / state.chart.spb);
  ui.score.textContent = primary.score.toLocaleString();
  ui.combo.textContent = "Max Combo " + primary.maxCombo;
  ui.accuracy.textContent = (acc * 100).toFixed(2) + "%";
  ui.rating.textContent = rating(acc);
  ui.healthFill.style.width = (state.health * 100).toFixed(1) + "%";
  ui.timer.textContent = formatTime(t) + " / " + formatTime(state.chart.totalTime);
  ui.p1Score.textContent = secondary.score.toLocaleString();
  ui.p1Combo.textContent = "Combo " + secondary.combo;
  const waitMs = state.network.matchStartAt - serverClockNow();
  if (waitMs > 0) {
    const seconds = waitMs > 1000 ? String(Math.ceil(waitMs / 1000)) : (waitMs / 1000).toFixed(1);
    ui.statusText.textContent = "Loading match";
    ui.statusSub.textContent = "Both players are ready. Starting in " + seconds + " seconds so both clients can finish loading.";
    return;
  }
  if (state.selectedSong === "perseverance" && window.PERSEVERANCE_DATA) {
    const section = perseveranceSection(t);
    if (section && !state.perseverance.prompt) {
      ui.statusText.textContent = section.label;
      ui.statusSub.textContent = section.mode === "pixel" ? "Sans swaps into the original pixel phase and the noteskin changes with him." : section.mode === "forest-dodge" ? "Keep playing. The gaster blaster dodge is scripted near the end." : "Imported Friday Night Dustin chart and stage are active.";
    }
    return;
  }
  if (sec) {
    ui.statusText.textContent = sec.label;
    ui.statusSub.textContent = "Online room active. The host owns the right side and the guest owns the left side.";
  }
};

finish = function(failed = false){
  stopExternalAudio();
  state.playing = false;
  state.network.pendingStartAt = 0;
  state.network.matchStartAt = 0;
  if (state.endTimer) clearTimeout(state.endTimer);
  state.endTimer = null;
  const stats = localStats();
  const acc = accuracy(stats);
  const j = stats.judgments;
  ui.resultTitle.textContent = state.currentSong.title;
  ui.resultGrade.textContent = grade(acc);
  ui.resultSummary.textContent = failed ? "Online matches do not fail on health. Returning to the room lobby now." : rating(acc);
  ui.rScore.textContent = stats.score.toLocaleString();
  ui.rAccuracy.textContent = (acc * 100).toFixed(2) + "%";
  ui.rCombo.textContent = stats.maxCombo;
  ui.rJudge.textContent = j.perfect + " / " + j.good + " / " + j.bad + " / " + j.miss;
  ui.resultsWrap.classList.add("show");
  state.endTimer = setTimeout(() => {
    returnToOnlineLobby("Match complete", "Room is still open. Both players can press Ready Up again for a rematch.");
  }, 1800);
};

startSong = function(id = state.selectedSong, options = {}){
  const a = ensureAudio();
  if (a.state === "suspended") a.resume();
  stopExternalAudio();
  if (state.startTimer) clearTimeout(state.startTimer);
  state.startTimer = null;
  if (state.endTimer) clearTimeout(state.endTimer);
  state.endTimer = null;
  state.selectedSong = id;
  state.currentSong = SONGS[id];
  state.mode = "online";
  rebuildKeyMap();
  state.chart = makeChart(state.currentSong);
  state.chart.notes = state.chart.notes.map((n, i) => ({ ...n, id: n.id == null ? i : n.id }));
  resetStats();
  state.health = 0.65;
  state.playing = true;
  state.songStart = 0;
  state.nextStep = 0;
  state.nextStepTime = 0;
  state.feeds.player.time = -10;
  state.feeds.opp.time = -10;
  Object.values(state.poses).forEach(p => { p.time = -10; p.kind = "hit"; });
  state.receptorFx.forEach(fx => fx.time = -10);
  state.perseverance = { canDodge: false, prompt: false, dodging: false, dodged: false, resolved: false, dodgeStart: -10, flashTime: -10, gfAlpha: 0 };
  state.camera = { x: 0, target: 0, sideTime: 0, lastSide: "both" };
  state.network.matchStartAt = Number(options.startAt || (serverClockNow() + 8000));
  state.network.pendingStartAt = state.network.matchStartAt;
  state.network.lastTrackSync = 0;
  state.network.ready = { host: false, guest: false };
  ui.songTitle.textContent = state.currentSong.title;
  ui.songSub.textContent = state.currentSong.subtitle;
  ui.statusText.textContent = "Match syncing";
  ui.statusSub.textContent = "Both players finished loading. The server is holding an 8 second synced countdown before audio starts.";
  ui.timer.textContent = "0:00 / " + formatTime(state.chart.totalTime);
  ui.menu.classList.remove("show");
  ui.settings.classList.remove("show");
  ui.resultsWrap.classList.remove("show");
  syncModeUI();
  const skipReload = !!options.skipReload;
  if (state.currentSong.chartSource === "sporting") {
    ensureSportingAudio();
    state.audio.inst.pause();
    state.audio.voices.pause();
    try { state.audio.inst.currentTime = 0; } catch {}
    try { state.audio.voices.currentTime = 0; } catch {}
    if (!skipReload) {
      state.audio.inst.load();
      state.audio.voices.load();
    }
  } else if (state.currentSong.chartSource === "boxingMatch") {
    ensureBoxingMatchAudio();
    state.audio.boxingInst.pause();
    state.audio.boxingVoices.pause();
    try { state.audio.boxingInst.currentTime = 0; } catch {}
    try { state.audio.boxingVoices.currentTime = 0; } catch {}
    if (!skipReload) {
      state.audio.boxingInst.load();
      state.audio.boxingVoices.load();
    }
  } else {
    ensurePerseveranceAudio();
    state.audio.inst2.pause();
    state.audio.voices2a.pause();
    state.audio.voices2b.pause();
    try { state.audio.inst2.currentTime = 0; } catch {}
    try { state.audio.voices2a.currentTime = 0; } catch {}
    try { state.audio.voices2b.currentTime = 0; } catch {}
    if (!skipReload) {
      state.audio.inst2.load();
      state.audio.voices2a.load();
      state.audio.voices2b.load();
    }
  }
  syncOnlinePlayback(true);
};
ui.playBtn.onclick = async () => {
  if (!state.network.roomId) {
    setOnlineMessage("Join a room first", "Host a room or enter a room code before readying up.");
    return;
  }
  if (!state.network.peerConnected) {
    setOnlineMessage("Need another player", "A second player has to join before the match can start.");
    return;
  }
  if (state.network.preparing || (state.network.pendingStartAt && state.network.pendingStartAt > serverClockNow())) {
    setOnlineMessage("Loading match", "Both players are already ready. Waiting for the 8 second load countdown.");
    return;
  }
  const nextReady = !localReady();
  if (nextReady) {
    try { await primeImportedSongPlayback(state.selectedSong); } catch {}
  }
  emitReadyState(nextReady);
};

ui.replayBtn.onclick = async () => {
  if (!state.network.socket || !state.network.roomId) return;
  ui.resultsWrap.classList.remove("show");
  try { await primeImportedSongPlayback(state.selectedSong); } catch {}
  emitReadyState(true);
  updateOnlinePanel();
};

ui.menuBtn.onclick = () => {
  if (state.endTimer) clearTimeout(state.endTimer);
  state.endTimer = null;
  stopExternalAudio();
  ui.resultsWrap.classList.remove("show");
  ui.menu.classList.add("show");
  ui.statusText.textContent = "Join a room and ready up.";
  ui.statusSub.textContent = "This build is server-based only. Host or join a room, then both players press Ready Up to start.";
};

ui.versusToggle.onchange = () => {
  ui.versusToggle.checked = false;
};

if (ui.onlineAuthBtn) ui.onlineAuthBtn.textContent = "Reconnect";
if (ui.onlineAuthBtn) ui.onlineAuthBtn.onclick = () => ensureOnlineSocket();
if (ui.onlineLogoutBtn) ui.onlineLogoutBtn.style.display = "none";
if (ui.hostOnlineBtn) ui.hostOnlineBtn.onclick = () => hostOnlineRoom();
if (ui.joinOnlineBtn) ui.joinOnlineBtn.onclick = () => joinOnlineRoom();
if (ui.leaveOnlineBtn) ui.leaveOnlineBtn.onclick = () => leaveOnlineRoom();
ensureMatchmakingButton();
if (ui.authWrap) ui.authWrap.style.display = "none";

window.addEventListener("keydown", event => {
  if (event.key === " " && state.selectedSong === "perseverance" && state.playing && state.perseverance.canDodge && !state.perseverance.dodging && !state.perseverance.resolved && state.network.socket) {
    state.network.socket.emit("game:dodge", { time: songTime() });
  }
}, true);
window.addEventListener("resize", syncViewportMode);
document.addEventListener("fullscreenchange", syncViewportMode);

renderSongs();
renderBinds();
if (ui.playBtn) ui.playBtn.textContent = "Ready Up";
if (ui.statusText) ui.statusText.textContent = "Connect and join a room.";
if (ui.statusSub) ui.statusSub.textContent = "This build is server-based only. Host or join a room, then both players press Ready Up to start.";
const onlineMetaLabels = Array.from(document.querySelectorAll(".onlineMeta .eyebrow"));
if (onlineMetaLabels[1]) onlineMetaLabels[1].textContent = "Player";
const heroEyebrow = document.querySelector("#menu .hero .eyebrow");
if (heroEyebrow) heroEyebrow.textContent = "Online rhythm battle";
const heroText = document.querySelector("#menu .hero p");
if (heroText) heroText.textContent = "This build is server-based only. Open the shared URL, host or join a room, or use matchmaking, then have both players press Ready Up so the match gets an 8 second preload before starting.";
const featureNodes = Array.from(document.querySelectorAll("#menu .feature .name"));
const featureDescNodes = Array.from(document.querySelectorAll("#menu .feature .desc"));
if (featureNodes[0]) featureNodes[0].textContent = "Server-based rooms";
if (featureDescNodes[0]) featureDescNodes[0].textContent = "Everyone connects through the same room server, so there is no account setup anymore.";
if (featureNodes[1]) featureNodes[1].textContent = "Synced matches";
if (featureDescNodes[1]) featureDescNodes[1].textContent = "Both players have to ready up before the server starts an 8 second preload, which keeps everyone on the same part of the song.";
if (featureNodes[2]) featureNodes[2].textContent = "One shared link";
if (featureDescNodes[2]) featureDescNodes[2].textContent = "Deploy the server once, send your friends the URL, and they can join a room immediately.";
const pills = Array.from(document.querySelectorAll(".help .pill"));
if (pills[0]) pills[0].innerHTML = "<strong>Connect:</strong> Open the shared URL";
if (pills[1]) pills[1].innerHTML = "<strong>Host:</strong> Pick song, then ready up";
if (pills[2]) pills[2].innerHTML = "<strong>Matchmake:</strong> Queue into a room or join by code";
const settingsBlocks = Array.from(document.querySelectorAll("#settings .block"));
if (settingsBlocks[1]) settingsBlocks[1].style.display = "none";
const controlsTitle = document.querySelector("#settings .block h3");
if (controlsTitle) controlsTitle.textContent = "Room Controls";
syncModeUI();
syncViewportMode();
syncMatchmakingButton();
updateOnlinePanel();
setInterval(() => {
  if (state.network.preparing || (state.network.pendingStartAt && state.network.pendingStartAt > serverClockNow())) updateOnlinePanel();
}, 250);
ensureOnlineSocket();




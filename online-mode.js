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
state.network = { socket: null, connected: false, roomId: "", role: null, peerConnected: false, user: null, matchStartAt: 0, pendingStartAt: 0, lastTrackSync: 0, ready: { host: false, guest: false } };

let socketClientPromise = null;
const originalVoice = voice;
const originalSongTime = songTime;

function expectedOnlineSongTime() {
  if (state.mode !== "online" || !state.playing || !state.network.matchStartAt) return null;
  return Math.max(0, (Date.now() - state.network.matchStartAt) / 1000);
}

function syncTrackToTime(track, targetTime, shouldPlay) {
  if (!track) return;
  if (track.readyState === 0) {
    try { track.load(); } catch {}
  }
  const duration = Number.isFinite(track.duration) && track.duration > 0 ? track.duration : null;
  const desiredTime = Math.max(0, duration == null ? targetTime : Math.min(targetTime, Math.max(0, duration - 0.05)));
  const tolerance = shouldPlay ? 0.12 : 0.03;
  if (Math.abs((track.currentTime || 0) - desiredTime) > tolerance) {
    try { track.currentTime = desiredTime; } catch {}
  }
  if (shouldPlay) {
    if (track.paused && (duration == null || desiredTime < duration - 0.05)) track.play().catch(() => {});
  } else if (!track.paused) {
    track.pause();
  }
}

function syncOnlinePlayback(force = false) {
  const targetTime = expectedOnlineSongTime();
  if (targetTime == null) return null;
  const now = Date.now();
  if (!force && now - (state.network.lastTrackSync || 0) < 120) return targetTime;
  state.network.lastTrackSync = now;
  const shouldPlay = now + 40 >= state.network.matchStartAt;
  if (state.currentSong.chartSource === "sporting") {
    ensureSportingAudio();
    syncTrackToTime(state.audio.inst, targetTime, shouldPlay);
    syncTrackToTime(state.audio.voices, targetTime, shouldPlay);
  } else if (state.currentSong.chartSource === "perseverance") {
    ensurePerseveranceAudio();
    syncTrackToTime(state.audio.inst2, targetTime, shouldPlay);
    syncTrackToTime(state.audio.voices2a, targetTime, shouldPlay);
    syncTrackToTime(state.audio.voices2b, targetTime, shouldPlay);
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

function onlineCountdownSeconds() {
  if (!state.network.pendingStartAt || state.network.pendingStartAt <= Date.now()) return 0;
  return Math.ceil((state.network.pendingStartAt - Date.now()) / 1000);
}

function syncReadyButton() {
  if (!ui.playBtn) return;
  if (state.network.pendingStartAt && state.network.pendingStartAt > Date.now()) {
    ui.playBtn.textContent = "Loading Match";
    return;
  }
  ui.playBtn.textContent = localReady() ? "Unready" : "Ready Up";
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

function updateOnlinePanel() {
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
  if (!state.network.roomId) {
    state.network.pendingStartAt = 0;
    state.network.ready = { host: false, guest: false };
    setOnlineMessage("Server ready", "Host a room or enter a room code to join one.");
    return;
  }
  if (state.network.pendingStartAt && state.network.pendingStartAt > Date.now()) {
    setOnlineMessage("Loading match", "Both players are ready. Match starts in " + onlineCountdownSeconds() + " seconds so both games can finish loading.");
    return;
  }
  if (!state.network.peerConnected) {
    setOnlineMessage("Room " + state.network.roomId + " waiting", "Share the room code and wait for your friend.");
    return;
  }
  if (localReady() && peerReady()) {
    setOnlineMessage("Both players ready", "The server is preparing the match now.");
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
  setOnlineMessage("Room " + state.network.roomId + " ready check", "Both players have to press Ready Up. The match starts with an 8 second load window.");
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
  const socket = window.io({ transports: ["websocket", "polling"] });
  state.network.socket = socket;
  socket.on("connect", () => {
    state.network.connected = true;
    updateOnlinePanel();
  });
  socket.on("disconnect", () => {
    state.network.connected = false;
    state.network.peerConnected = false;
    state.network.roomId = "";
    state.network.role = null;
    state.network.ready = { host: false, guest: false };
    state.network.pendingStartAt = 0;
    state.network.matchStartAt = 0;
    syncModeUI();
    updateOnlinePanel();
  });
  socket.on("session:ready", payload => {
    state.network.user = payload && payload.user ? payload.user : { username: "Anonymous" };
    updateOnlinePanel();
  });
  socket.on("room:error", payload => {
    setOnlineMessage("Room error", payload && payload.message ? payload.message : "Room request failed.");
  });
  socket.on("room:update", payload => {
    state.network.roomId = payload && payload.roomId ? payload.roomId : "";
    state.network.role = payload && payload.role ? payload.role : null;
    state.network.ready = payload && payload.ready ? { host: !!payload.ready.host, guest: !!payload.ready.guest } : { host: false, guest: false };
    state.network.pendingStartAt = Number(payload?.startAt || 0);
    const other = state.network.role === "host" ? payload?.players?.guest : payload?.players?.host;
    state.network.peerConnected = !!other;
    if (payload && payload.songId) selectSong(payload.songId, true);
    syncModeUI();
    updateOnlinePanel();
  });
  socket.on("game:start", payload => {
    if (payload && payload.songId) selectSong(payload.songId, true);
    const delayMs = Number(payload?.delayMs || 8000);
    const startAt = payload && payload.startAt ? payload.startAt : Date.now() + delayMs;
    state.network.pendingStartAt = startAt;
    state.network.ready = { host: false, guest: false };
    setOnlineMessage("Match starting", "Both players are ready. The match will start in " + Math.ceil(delayMs / 1000) + " seconds so audio can finish loading on both machines.");
    startSong(payload && payload.songId ? payload.songId : state.selectedSong, { forceMode: "online", startAt });
  });
  socket.on("game:judgment", payload => applyRemoteJudgment(payload));
  socket.on("game:dodge", payload => applyRemoteDodge(payload));
  return socket;
}

async function hostOnlineRoom() {
  const socket = await ensureOnlineSocket();
  if (!socket) return;
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
  socket.emit("room:join", { roomId });
}

function leaveOnlineRoom() {
  if (state.network.socket && state.network.roomId) state.network.socket.emit("room:leave");
  state.network.roomId = "";
  state.network.role = null;
  state.network.peerConnected = false;
  state.network.ready = { host: false, guest: false };
  state.network.pendingStartAt = 0;
  state.network.matchStartAt = 0;
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
    if (kind === "perfect") state.health = clamp(state.health + 0.028, 0, 1);
    if (kind === "good") state.health = clamp(state.health + 0.016, 0, 1);
    if (kind === "bad") state.health = clamp(state.health - 0.018, 0, 1);
    if (kind === "miss") state.health = clamp(state.health - 0.11, 0, 1);
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
  const waitMs = state.network.matchStartAt - Date.now();
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
  state.playing = false;
  const stats = localStats();
  const acc = accuracy(stats);
  const j = stats.judgments;
  ui.resultTitle.textContent = state.currentSong.title;
  ui.resultGrade.textContent = failed ? "F" : grade(acc);
  ui.resultSummary.textContent = failed ? "Health dropped to zero before the song ended." : rating(acc);
  ui.rScore.textContent = stats.score.toLocaleString();
  ui.rAccuracy.textContent = (acc * 100).toFixed(2) + "%";
  ui.rCombo.textContent = stats.maxCombo;
  ui.rJudge.textContent = j.perfect + " / " + j.good + " / " + j.bad + " / " + j.miss;
  ui.resultsWrap.classList.add("show");
};

startSong = function(id = state.selectedSong, options = {}){
  const a = ensureAudio();
  if (a.state === "suspended") a.resume();
  stopExternalAudio();
  if (state.startTimer) clearTimeout(state.startTimer);
  state.startTimer = null;
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
  state.network.matchStartAt = Number(options.startAt || Date.now() + 8000);
  state.network.pendingStartAt = state.network.matchStartAt;
  state.network.lastTrackSync = 0;
  state.network.ready = { host: false, guest: false };
  ui.songTitle.textContent = state.currentSong.title;
  ui.songSub.textContent = state.currentSong.subtitle;
  ui.statusText.textContent = "Match syncing";
  ui.statusSub.textContent = "Both players readied up. The server is giving the match 8 seconds to preload before audio starts.";
  ui.timer.textContent = "0:00 / " + formatTime(state.chart.totalTime);
  ui.menu.classList.remove("show");
  ui.settings.classList.remove("show");
  ui.resultsWrap.classList.remove("show");
  syncModeUI();
  if (state.currentSong.chartSource === "sporting") {
    ensureSportingAudio();
    state.audio.inst.pause();
    state.audio.voices.pause();
    state.audio.inst.currentTime = 0;
    state.audio.voices.currentTime = 0;
    state.audio.inst.load();
    state.audio.voices.load();
  } else {
    ensurePerseveranceAudio();
    state.audio.inst2.pause();
    state.audio.voices2a.pause();
    state.audio.voices2b.pause();
    state.audio.inst2.currentTime = 0;
    state.audio.voices2a.currentTime = 0;
    state.audio.voices2b.currentTime = 0;
    state.audio.inst2.load();
    state.audio.voices2a.load();
    state.audio.voices2b.load();
  }
  syncOnlinePlayback(true);
};

ui.playBtn.onclick = () => {
  if (!state.network.roomId) {
    setOnlineMessage("Join a room first", "Host a room or enter a room code before readying up.");
    return;
  }
  if (!state.network.peerConnected) {
    setOnlineMessage("Need another player", "A second player has to join before the match can start.");
    return;
  }
  if (state.network.pendingStartAt && state.network.pendingStartAt > Date.now()) {
    setOnlineMessage("Loading match", "Both players are already ready. Waiting for the 8 second load countdown.");
    return;
  }
  emitReadyState(!localReady());
};

ui.replayBtn.onclick = () => {
  if (!state.network.socket || !state.network.roomId) return;
  ui.resultsWrap.classList.remove("show");
  emitReadyState(true);
  updateOnlinePanel();
};

ui.menuBtn.onclick = () => {
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
if (heroText) heroText.textContent = "This build is server-based only. Open the shared URL, host or join a room, then have both players press Ready Up so the match gets an 8 second preload before starting.";
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
if (pills[2]) pills[2].innerHTML = "<strong>Join:</strong> Enter room code, then ready up";
const settingsBlocks = Array.from(document.querySelectorAll("#settings .block"));
if (settingsBlocks[1]) settingsBlocks[1].style.display = "none";
const controlsTitle = document.querySelector("#settings .block h3");
if (controlsTitle) controlsTitle.textContent = "Room Controls";
syncModeUI();
syncViewportMode();
updateOnlinePanel();
setInterval(() => {
  if (state.network.pendingStartAt && state.network.pendingStartAt > Date.now()) updateOnlinePanel();
}, 250);
ensureOnlineSocket();

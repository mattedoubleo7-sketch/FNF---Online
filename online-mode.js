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
state.network = { socket: null, connected: false, roomId: "", role: null, peerConnected: false, user: null };

let socketClientPromise = null;
const originalVoice = voice;

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
  if (!onlineSupported()) {
    setOnlineMessage("Server mode required", "Open the game through the server URL to use online rooms.");
    return;
  }
  if (!state.network.connected) {
    setOnlineMessage("Connecting", "Connecting to the room server now.");
    return;
  }
  if (!state.network.roomId) {
    setOnlineMessage("Server ready", "Host a room or enter a room code to join one.");
    return;
  }
  if (state.network.role === "host") {
    setOnlineMessage(state.network.peerConnected ? "Room " + state.network.roomId + " ready" : "Room " + state.network.roomId + " waiting", state.network.peerConnected ? "Pick a song and press Start Online Match." : "Share the room code and wait for your friend.");
  } else {
    setOnlineMessage("Joined room " + state.network.roomId, "The host controls song select and match start.");
  }
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
    const other = state.network.role === "host" ? payload?.players?.guest : payload?.players?.host;
    state.network.peerConnected = !!other;
    if (payload && payload.songId) selectSong(payload.songId, true);
    syncModeUI();
    updateOnlinePanel();
  });
  socket.on("game:start", payload => {
    if (payload && payload.songId) selectSong(payload.songId, true);
    const delay = Math.max(0, (payload && payload.startAt ? payload.startAt : Date.now()) - Date.now());
    setOnlineMessage("Match starting", "Both players are syncing now.");
    startSong(payload && payload.songId ? payload.songId : state.selectedSong, { forceMode: "online", startDelayMs: delay });
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
  state.selectedSong = id;
  state.currentSong = SONGS[id];
  state.mode = "online";
  rebuildKeyMap();
  state.chart = makeChart(state.currentSong);
  state.chart.notes = state.chart.notes.map((n, i) => ({ ...n, id: n.id == null ? i : n.id }));
  resetStats();
  state.health = 0.65;
  state.playing = false;
  state.songStart = 0;
  state.nextStep = 0;
  state.nextStepTime = 0;
  state.feeds.player.time = -10;
  state.feeds.opp.time = -10;
  Object.values(state.poses).forEach(p => { p.time = -10; p.kind = "hit"; });
  state.receptorFx.forEach(fx => fx.time = -10);
  state.perseverance = { canDodge: false, prompt: false, dodging: false, dodged: false, resolved: false, dodgeStart: -10, flashTime: -10, gfAlpha: 0 };
  state.camera = { x: 0, target: 0, sideTime: 0, lastSide: "both" };
  ui.songTitle.textContent = state.currentSong.title;
  ui.songSub.textContent = state.currentSong.subtitle;
  ui.statusText.textContent = options.forceMode === "online" ? "Match syncing" : "Get ready";
  ui.statusSub.textContent = state.currentSong.chartSource === "sporting" ? "Sporting is using the original beat and vocal track at full speed." : "Perseverance is using the original hard chart, split vocals, pixel section, and dodge mechanic.";
  ui.timer.textContent = "0:00 / " + formatTime(state.chart.totalTime);
  ui.menu.classList.remove("show");
  ui.settings.classList.remove("show");
  ui.resultsWrap.classList.remove("show");
  syncModeUI();
  const delayMs = Math.max(0, options.startDelayMs == null ? 120 : options.startDelayMs);
  const beginPlayback = () => {
    if (state.currentSong.chartSource === "sporting") {
      ensureSportingAudio();
      state.audio.inst.currentTime = 0;
      state.audio.voices.currentTime = 0;
      state.playing = true;
      state.audio.inst.play();
      state.audio.voices.play();
    } else {
      ensurePerseveranceAudio();
      state.audio.inst2.currentTime = 0;
      state.audio.voices2a.currentTime = 0;
      state.audio.voices2b.currentTime = 0;
      state.playing = true;
      state.audio.inst2.play();
      state.audio.voices2a.play();
      state.audio.voices2b.play();
    }
    ui.statusText.textContent = "Battle live";
  };
  if (delayMs > 0) state.startTimer = setTimeout(beginPlayback, delayMs);
  else beginPlayback();
};

ui.playBtn.onclick = () => {
  if (state.network.role !== "host") {
    setOnlineMessage("Waiting for host", "Only the host can start the online match.");
    return;
  }
  if (!state.network.peerConnected) {
    setOnlineMessage("Need another player", "A second player has to join before the match can start.");
    return;
  }
  if (state.network.socket) state.network.socket.emit("game:start", { songId: state.selectedSong });
};

ui.replayBtn.onclick = () => {
  if (state.network.socket && state.network.role === "host") state.network.socket.emit("game:start", { songId: state.selectedSong });
};

ui.menuBtn.onclick = () => {
  stopExternalAudio();
  ui.resultsWrap.classList.remove("show");
  ui.menu.classList.add("show");
  ui.statusText.textContent = "Join a room and start the battle.";
  ui.statusSub.textContent = "This build is server-based only. Host or join a room, then let the host start the match.";
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
if (ui.playBtn) ui.playBtn.textContent = "Start Online Match";
if (ui.statusText) ui.statusText.textContent = "Connect and join a room.";
if (ui.statusSub) ui.statusSub.textContent = "This build is server-based only. Host or join a room, then let the host start the match.";
const onlineMetaLabels = Array.from(document.querySelectorAll(".onlineMeta .eyebrow"));
if (onlineMetaLabels[1]) onlineMetaLabels[1].textContent = "Player";
const heroEyebrow = document.querySelector("#menu .hero .eyebrow");
if (heroEyebrow) heroEyebrow.textContent = "Online rhythm battle";
const heroText = document.querySelector("#menu .hero p");
if (heroText) heroText.textContent = "This build is server-based only. Open the shared URL, host or join a room, and play synced matches with your friends.";
const featureNodes = Array.from(document.querySelectorAll("#menu .feature .name"));
const featureDescNodes = Array.from(document.querySelectorAll("#menu .feature .desc"));
if (featureNodes[0]) featureNodes[0].textContent = "Server-based rooms";
if (featureDescNodes[0]) featureDescNodes[0].textContent = "Everyone connects through the same room server, so there is no account setup anymore.";
if (featureNodes[1]) featureNodes[1].textContent = "Synced matches";
if (featureDescNodes[1]) featureDescNodes[1].textContent = "The host controls the song and match start, while both clients judge their own side in the same room.";
if (featureNodes[2]) featureNodes[2].textContent = "One shared link";
if (featureDescNodes[2]) featureDescNodes[2].textContent = "Deploy the server once, send your friends the URL, and they can join a room immediately.";
const pills = Array.from(document.querySelectorAll(".help .pill"));
if (pills[0]) pills[0].innerHTML = "<strong>Connect:</strong> Open the shared URL";
if (pills[1]) pills[1].innerHTML = "<strong>Host:</strong> Pick song, share room code";
if (pills[2]) pills[2].innerHTML = "<strong>Join:</strong> Enter room code";
const settingsBlocks = Array.from(document.querySelectorAll("#settings .block"));
if (settingsBlocks[1]) settingsBlocks[1].style.display = "none";
const controlsTitle = document.querySelector("#settings .block h3");
if (controlsTitle) controlsTitle.textContent = "Room Controls";
syncModeUI();
syncViewportMode();
updateOnlinePanel();
ensureOnlineSocket();

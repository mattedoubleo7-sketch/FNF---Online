(function(){
  if (typeof SONGS === "undefined" || !window.BALLISTIC_DATA) return;

  const DIR = ["left", "down", "up", "right"];
  const ballisticState = {
    initialized: false,
    images: {},
    stageCache: new Map(),
    firstDrawIndex: 0,
    lastNoteRenderTime: 0,
    fxCanvas: null,
    fxCtx: null,
    lastSongId: "",
    lastEventIndex: -1
  };

  Object.assign(SONGS, {
    loFight: {
      title: "Lo-Fight",
      subtitle: "Whitty Erect hard chart",
      diff: "Erect (Original Chart)",
      tempo: 110,
      root: 38,
      scale: [0, 1, 3, 5, 6, 8, 10],
      prog: [0, 6, 3, 8],
      scroll: 860,
      seed: 47,
      introBeats: 0,
      outroBeats: 4,
      palette: ["#06070b", "#16202b", "#2b4251", "#fa5137", "#19fff1", "#f8e1b6"],
      blurb: "Imported from the local Whitty Erect files with the original Lo-Fight chart, split vocals, alley stage, BF, GF, and normal Whitty sprites.",
      chartSource: "whitty",
      whittySong: "loFight"
    },
    overhead: {
      title: "Overhead",
      subtitle: "Whitty Erect hard chart",
      diff: "Erect (Original Chart)",
      tempo: 190,
      root: 38,
      scale: [0, 1, 3, 5, 6, 8, 10],
      prog: [0, 6, 3, 8],
      scroll: 970,
      seed: 48,
      introBeats: 0,
      outroBeats: 4,
      palette: ["#08070b", "#17212b", "#334956", "#ff6339", "#19fff1", "#f8e1b6"],
      blurb: "Imported from the local Whitty Erect files with the original Overhead chart, split vocals, alley stage, camera events, and normal Whitty sprites.",
      chartSource: "whitty",
      whittySong: "overhead"
    },
    ballistic: {
      title: "Ballistic",
      subtitle: "Whitty Erect hard chart",
      diff: "Erect (Original Chart)",
      tempo: 212,
      root: 38,
      scale: [0, 1, 3, 5, 6, 8, 10],
      prog: [0, 6, 3, 8],
      scroll: 1180,
      seed: 49,
      introBeats: 0,
      outroBeats: 4,
      palette: ["#12060c", "#35111f", "#751935", "#080307", "#ff1d60", "#19fff1"],
      blurb: "Imported from the local Whitty Erect files with the original Ballistic chart, split vocals, alley-ballistic stage, crazy Whitty, and event-driven camera pulses.",
      chartSource: "whitty",
      whittySong: "ballistic"
    }
  });

  function whittyRoot(){
    return window.BALLISTIC_DATA;
  }

  function whittySongKeyFromSong(song){
    if(!song) return null;
    if(song.whittySong) return song.whittySong;
    if(song.chartSource === "ballistic") return "ballistic";
    return null;
  }

  function whittySongKeyFromId(id = state?.selectedSong){
    return whittySongKeyFromSong(SONGS[id]) || null;
  }

  function isWhittySong(song){
    return !!whittySongKeyFromSong(song) && (song.chartSource === "whitty" || song.chartSource === "ballistic");
  }

  function activeWhittyData(songOrKey){
    const root = whittyRoot();
    const key = typeof songOrKey === "string" ? songOrKey : whittySongKeyFromSong(songOrKey) || whittySongKeyFromId();
    return root.songs?.[key] || root.songs?.ballistic || root;
  }

  function activeWhittyStage(songData = activeWhittyData()){
    const root = whittyRoot();
    return songData.stage || root.stages?.[songData.stageKey] || root.stage;
  }

  function isBallistic(){
    return typeof state !== "undefined" && !!whittySongKeyFromId(state.selectedSong);
  }

  function isBallisticSpecial(){
    return activeWhittyData().special === "ballistic";
  }

  function cloneChart(song){
    const chart = activeWhittyData(song).chart;
    return {
      ...chart,
      notes: chart.notes.map(n => ({ ...n })),
      timeline: (chart.timeline || []).map(s => ({ ...s }))
    };
  }

  const baseMakeChart = makeChart;
  makeChart = function(song){
    if(isWhittySong(song)) return cloneChart(song);
    return baseMakeChart(song);
  };

  const baseImportedSong = isImportedSong;
  isImportedSong = function(song){
    return isWhittySong(song) || baseImportedSong(song);
  };

  function whittyAudioSlug(songOrKey = state?.selectedSong){
    const key = whittySongKeyFromId(songOrKey) || songOrKey || "ballistic";
    return key === "loFight" ? "lo-fight" : key;
  }

  function currentWhittyAudioEntry(songOrKey = state?.selectedSong){
    const key = whittySongKeyFromId(songOrKey) || songOrKey || "ballistic";
    return state.audio.whittyTracks?.[key] || null;
  }

  function ballisticTracks(songOrKey = state?.selectedSong){
    const entry = currentWhittyAudioEntry(songOrKey);
    if(!entry) return [];
    return [entry.inst, entry.voicesOpp, entry.voicesPlayer].filter(Boolean);
  }

  function allWhittyTracks(){
    return Object.values(state.audio.whittyTracks || {}).flatMap(entry => [entry.inst, entry.voicesOpp, entry.voicesPlayer]).filter(Boolean);
  }

  function ensureBallisticAudio(songOrKey = state?.selectedSong){
    if(!state.audio.whittyTracks) state.audio.whittyTracks = {};
    const key = whittySongKeyFromId(songOrKey) || songOrKey || "ballistic";
    const slug = whittyAudioSlug(key);
    if(!state.audio.whittyTracks[key]){
      state.audio.whittyTracks[key] = {
        inst: new Audio(slug + "-inst.ogg"),
        voicesOpp: new Audio(slug + "-voices-opp.ogg"),
        voicesPlayer: new Audio(slug + "-voices-player.ogg")
      };
      state.audio.whittyTracks[key].inst.volume = 0.9;
      state.audio.whittyTracks[key].voicesOpp.volume = 0.84;
      state.audio.whittyTracks[key].voicesPlayer.volume = 0.82;
      ballisticTracks(key).forEach(track => { track.preload = "auto"; });
    }
    return ballisticTracks(key);
  }
  window.ensureBallisticAudio = ensureBallisticAudio;
  window.prepareBallisticOnlineStart = function(songId = state?.selectedSong){
    return ensureBallisticAudio(songId);
  };

  const baseStopExternalAudio = stopExternalAudio;
  stopExternalAudio = function(){
    baseStopExternalAudio();
    allWhittyTracks().forEach(track => {
      try {
        track.pause();
        track.currentTime = 0;
      } catch {}
    });
  };

  const baseSongTime = songTime;
  songTime = function(){
    if(isBallistic()){
      const onlineTarget = typeof expectedOnlineSongTime === "function" ? expectedOnlineSongTime() : null;
      const entry = currentWhittyAudioEntry();
      if(onlineTarget == null) return entry?.inst ? entry.inst.currentTime : 0;
    }
    return baseSongTime();
  };

  function loadImage(key, src){
    if(!src || ballisticState.images[key]) return;
    const img = new Image();
    img.decoding = "async";
    img.src = src;
    if(img.decode) img.decode().catch(() => {});
    ballisticState.images[key] = img;
  }

  function normalizeStageAsset(asset, key){
    if(!asset) return null;
    if(typeof asset === "string") return { image: asset, imageKey: key };
    return { ...asset, imageKey: asset.imageKey || key };
  }

  function loadStageImages(stage){
    Object.entries(stage || {}).forEach(([key, asset]) => {
      const normalized = normalizeStageAsset(asset, key);
      if(normalized?.image) loadImage(normalized.imageKey, normalized.image);
    });
  }

  function initBallisticVisuals(){
    if(ballisticState.initialized) return;
    ballisticState.initialized = true;
    const data = window.BALLISTIC_DATA;
    if(data.stages) Object.values(data.stages).forEach(loadStageImages);
    else loadStageImages(data.stage);
    Object.entries(data.sprites || {}).forEach(([key, sprite]) => loadImage(key, sprite.image));
    if(data.cutscenes && data.cutscenes.whittyScream) loadImage("whittyScream", data.cutscenes.whittyScream.image);
  }

  function imgReady(img){
    return img && img.complete && img.naturalWidth;
  }

  function ballisticReady(){
    return ballisticState.initialized && Object.values(ballisticState.images).every(imgReady);
  }

  function lastEvent(t, name){
    const events = activeWhittyData().mechanics?.events || [];
    for(let i = events.length - 1; i >= 0; i--){
      const event = events[i];
      if(event.time <= t && event.name === name) return event;
    }
    return null;
  }

  function ballisticRage(t){
    if(!isBallisticSpecial()) return 0;
    return clamp((t - 34) / 18, 0, 1);
  }

  function ballisticZoom(t){
    const event = lastEvent(t, "SetCamZoom");
    const raw = event ? Number(event.value1 || 0.65) : 0.65;
    const camBeat = ballisticCamBeat(t);
    return 1 + Math.max(0, raw - 0.6) * 0.36 + camBeat * 0.045 + ballisticRage(t) * 0.025;
  }

  function ballisticCamBeat(t){
    const event = lastEvent(t, "CamBeat");
    if(!event) return 0;
    const beats = Number(event.value1 || 0);
    const intensity = Number(event.value2 || 0);
    if(beats <= 0 || intensity <= 0) return 0;
    const age = t - event.time;
    const windowSeconds = Math.max(0.18, beats * (activeWhittyData().chart.spb || 0.28));
    if(age > windowSeconds) return 0;
    const pulse = Math.max(0, Math.sin((t / (activeWhittyData().chart.spb || 0.28)) * Math.PI * 2));
    return pulse * intensity * (1 - age / windowSeconds);
  }

  function ballisticFlashAlpha(t){
    let alpha = 0;
    const events = activeWhittyData().mechanics?.events || [];
    for(const event of events){
      if(event.time > t) break;
      if(event.name !== "Camera Flash") continue;
      const duration = Math.max(0.1, Number(event.value2 || 0.4));
      const age = t - event.time;
      if(age >= 0 && age < duration) alpha = Math.max(alpha, 1 - age / duration);
    }
    return alpha;
  }

  function easeOutCubic(v){
    const x = clamp(v, 0, 1);
    return 1 - Math.pow(1 - x, 3);
  }

  function smoothStep(v){
    const x = clamp(v, 0, 1);
    return x * x * (3 - 2 * x);
  }

  function ballisticBeat(t){
    return Math.max(0, t / (activeWhittyData().chart.spb || 60 / 212));
  }

  function secondsToBeats(seconds){
    return seconds / (activeWhittyData().chart.spb || 60 / 212);
  }

  function beatTween(beat, startBeat, durationBeats){
    return smoothStep((beat - startBeat) / Math.max(0.001, durationBeats));
  }

  function ballisticSpecialState(t){
    const beat = ballisticBeat(t);
    const twoSeconds = secondsToBeats(2);
    const whittyFadeBeats = secondsToBeats(2.4);
    const halfSecond = secondsToBeats(0.5);
    const songData = activeWhittyData();
    const cutscene = songData.special === "ballistic" && songData.cutscenes && songData.cutscenes.whittyScream;
    let playerCenter = 0;
    let opponentAlpha = 1;
    let blackAlpha = 0;
    let whiteAlpha = 0;

    if(songData.special === "ballistic"){
      if(beat >= 515 && beat < 515 + twoSeconds) playerCenter = beatTween(beat, 515, twoSeconds);
      else if(beat >= 515 + twoSeconds && beat < 662) playerCenter = 1;
      else if(beat >= 662 && beat < 662 + halfSecond) playerCenter = 1 - beatTween(beat, 662, halfSecond);

      if(beat >= 500 && beat < 500 + whittyFadeBeats) opponentAlpha = 1 - beatTween(beat, 500, whittyFadeBeats);
      else if(beat >= 500 + whittyFadeBeats && beat < 660) opponentAlpha = 0;
      else if(beat >= 660 && beat < 660 + whittyFadeBeats) opponentAlpha = beatTween(beat, 660, whittyFadeBeats);

      if(beat >= 432 && beat < 436) blackAlpha = 1;
      if(beat >= 728) blackAlpha = 1;
      if(beat >= 433 && beat < 436) whiteAlpha = beatTween(beat, 433, secondsToBeats(1.1)) * 0.82;
      else if(beat >= 436 && beat < 436 + secondsToBeats(0.6)) whiteAlpha = (1 - beatTween(beat, 436, secondsToBeats(0.6))) * 0.82;
    }

    return {
      beat,
      scream: !!cutscene && beat >= (cutscene.beatStart || 366) && beat < (cutscene.beatEnd || 368),
      playerCenter,
      opponentAlpha,
      blackAlpha,
      whiteAlpha
    };
  }

  function ballisticLanePosition(lane, t, special = ballisticSpecialState(t)){
    const x = laneX(lane);
    if(lane < 4) return { x, y: 0 };
    const center = smoothStep(special.playerCenter);
    const slot = lane - 4;
    const centerShift = ((laneX(4) + laneX(7)) * 0.5 - canvas.width * 0.5) * special.playerCenter;
    const side = [-1.5, -0.5, 0.5, 1.5][slot] || 0;
    const pinch = [0.5, -0.5, -0.5, 0.5][slot] || 0;
    const lift = [-0.75, 0.9, -0.9, 0.75][slot] || 0;
    const spin = t * 5.4;
    return {
      x: x - centerShift + (side * Math.sin(spin) * 15 + pinch * Math.cos(t * 7.8) * 12) * center,
      y: (lift * Math.cos(spin * 0.86) * 18 + pinch * Math.sin(t * 4.2) * 10) * center
    };
  }

  function ballisticLaneX(lane, t){
    return ballisticLanePosition(lane, t).x;
  }

  function ballisticDepth(t){
    const loFight = whittySongKeyFromId() === "loFight";
    const side = loFight ? "both" : typeof cameraActiveSide === "function" ? cameraActiveSide(t) : "both";
    const sidePan = side === "opp" ? -0.72 : side === "player" ? 0.72 : 0;
    const pan = loFight ? Math.sin(t * 0.12) * 0.08 : clamp(sidePan + Math.sin(t * 0.55) * 0.18, -1, 1);
    const beat = ballisticCamBeat(t);
    const rage = ballisticRage(t);
    return {
      far: { x: -pan * 14, y: Math.sin(t * 0.32) * 3, scale: 1 + beat * 0.006, angle: pan * 0.004 },
      mid: { x: -pan * 32, y: Math.sin(t * 0.42 + 1.2) * 5, scale: 1 + rage * 0.012 + beat * 0.008, angle: pan * 0.007 },
      near: { x: -pan * 58, y: Math.sin(t * 0.5 + 2.4) * 7, scale: 1 + rage * 0.02 + beat * 0.012, angle: pan * 0.012 }
    };
  }

  function drawBallisticDepthLayer(depth, draw){
    ctx.save();
    ctx.translate(canvas.width * 0.5, canvas.height * 0.54);
    ctx.rotate(depth.angle);
    ctx.scale(depth.scale, depth.scale);
    ctx.translate(-canvas.width * 0.5 + depth.x, -canvas.height * 0.54 + depth.y);
    draw();
    ctx.restore();
  }

  function ensureBallisticFxCanvas(){
    if(!ballisticState.fxCanvas){
      ballisticState.fxCanvas = document.createElement("canvas");
      ballisticState.fxCtx = ballisticState.fxCanvas.getContext("2d");
    }
    if(ballisticState.fxCanvas.width !== canvas.width || ballisticState.fxCanvas.height !== canvas.height){
      ballisticState.fxCanvas.width = canvas.width;
      ballisticState.fxCanvas.height = canvas.height;
      if(typeof setRenderQuality === "function") setRenderQuality(ballisticState.fxCtx);
    }
    ballisticState.fxCtx.clearRect(0, 0, canvas.width, canvas.height);
    ballisticState.fxCtx.drawImage(canvas, 0, 0);
    return ballisticState.fxCanvas;
  }

  function ballisticCombatFxState(t){
    const beat = ballisticCamBeat(t);
    const flash = ballisticFlashAlpha(t);
    const pulse = Math.max(beat * 0.95, flash * 0.75);
    if(pulse <= 0.025) return null;
    const wobble = 1 - easeOutCubic(Math.min(1, ((t / (activeWhittyData().chart.spb || 0.28)) % 1)));
    return {
      mirror: Math.min(0.72, pulse * 0.55 + wobble * pulse * 0.18),
      bloom: Math.min(0.72, pulse * 0.5),
      speed: Math.min(0.7, pulse * 0.42),
      chrom: 1.2 + pulse * 12,
      angle: Math.sin(t * 9.5) * pulse * 4.5,
      bars: Math.min(0.7, pulse * 0.48)
    };
  }

  function drawBallisticSpeedLines(amount, t){
    if(amount <= 0.01) return;
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.lineWidth = 2;
    for(let i = 0; i < 22; i++){
      const lane = i / 22;
      const angle = lane * Math.PI * 2 + t * 1.1;
      const inner = 140 + (i % 4) * 18;
      const outer = 620 + (i % 6) * 28;
      const x1 = canvas.width * 0.5 + Math.cos(angle) * inner;
      const y1 = canvas.height * 0.5 + Math.sin(angle) * inner * 0.55;
      const x2 = canvas.width * 0.5 + Math.cos(angle) * outer;
      const y2 = canvas.height * 0.5 + Math.sin(angle) * outer * 0.55;
      const grad = ctx.createLinearGradient(x1, y1, x2, y2);
      grad.addColorStop(0, "rgba(255,255,255,0)");
      grad.addColorStop(0.55, "rgba(25,255,241," + (0.055 * amount).toFixed(3) + ")");
      grad.addColorStop(1, "rgba(255,29,96,0)");
      ctx.strokeStyle = grad;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawBallisticCombatPostFx(t){
    if(!state.playing || !Number.isFinite(t)) return;
    const fx = ballisticCombatFxState(t);
    if(!fx) return;
    const source = ensureBallisticFxCanvas();
    const cx = canvas.width * 0.5;
    const cy = canvas.height * 0.5;

    if(fx.mirror > 0.01){
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      ctx.globalAlpha = Math.min(0.2, 0.045 + fx.mirror * 0.14);
      ctx.translate(cx, cy);
      ctx.rotate(fx.angle * Math.PI / 180 * 0.35);
      const scale = 1 + fx.mirror * 0.04;
      ctx.scale(scale, scale);
      ctx.drawImage(source, -cx + Math.sin(t * 12) * fx.mirror * 5, -cy);
      ctx.restore();
    }

    if(fx.chrom > 1.45){
      const offset = Math.min(14, fx.chrom);
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      ctx.globalAlpha = Math.min(0.18, 0.055 + fx.mirror * 0.1);
      ctx.filter = "sepia(1) saturate(6) hue-rotate(275deg)";
      ctx.drawImage(source, -offset, 0);
      ctx.filter = "sepia(1) saturate(6) hue-rotate(145deg)";
      ctx.drawImage(source, offset, 0);
      ctx.filter = "none";
      ctx.restore();
    }

    if(fx.bloom > 0.04){
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      ctx.globalAlpha = Math.min(0.46, 0.12 + fx.bloom * 0.38);
      ctx.filter = "blur(" + (4 + fx.bloom * 10).toFixed(1) + "px) saturate(1.55) brightness(1.14)";
      ctx.drawImage(source, 0, 0);
      ctx.filter = "none";
      ctx.restore();
    }

    drawBallisticSpeedLines(fx.speed, t);

    if(fx.bars > 0.01){
      ctx.save();
      const h = 18 + fx.bars * 30;
      ctx.fillStyle = "rgba(3,0,8," + Math.min(0.34, fx.bars * 0.28).toFixed(3) + ")";
      ctx.fillRect(0, 0, canvas.width, h);
      ctx.fillRect(0, canvas.height - h, canvas.width, h);
      ctx.restore();
    }
  }

  const baseCameraPoseKeys = cameraPoseKeys;
  cameraPoseKeys = function(){
    if(isBallistic()) return { opp: "whitty", player: "player" };
    return baseCameraPoseKeys();
  };

  function whittySingShake(t){
    if(!isBallisticSpecial()) return 0;
    let amount = 0;
    const now = performance.now() / 1000;
    const pose = state.poses?.whitty;
    if(pose && pose.kind !== "miss"){
      const age = now - pose.time;
      if(age >= 0 && age < 0.22) amount = Math.max(amount, 1 - age / 0.22);
    }
    if(state.chart?.notes){
      for(const n of state.chart.notes){
        if(n.time > t + 0.08) break;
        if(n.side !== "opp") continue;
        const activeHold = isHoldNote(n) && n.hit && !n.holdDone && holdEndTime(n) >= t - 0.02;
        const activeTap = !isHoldNote(n) && t >= n.time - 0.025 && t <= n.time + 0.08;
        if(activeHold || activeTap) amount = Math.max(amount, activeHold ? 0.62 : 0.88);
      }
    }
    return amount;
  }

  function whittyCameraProfile(){
    if(whittySongKeyFromId() === "loFight"){
      return { oppX: 0.5, playerX: 0.5, bothX: 0.5, y: 0.5, speed: 0.18, drift: true };
    }
    return { oppX: 0.39, playerX: 0.62, bothX: 0.5, y: 0.49, speed: 3.8 };
  }

  function loFightCameraSide(t){
    return "both";
  }

  const baseUpdateCamera = updateCamera;
  updateCamera = function(t, dt){
    if(!isBallistic()) return baseUpdateCamera(t, dt);
    if(!state.poses.whitty) state.poses.whitty = { lane: 1, time: -10, kind: "hit" };
    const side = whittySongKeyFromId() === "loFight" ? loFightCameraSide(t) : typeof cameraActiveSide === "function" ? cameraActiveSide(t) : "both";
    const profile = whittyCameraProfile();
    const driftX = profile.drift ? Math.sin(t * 0.1) * canvas.width * 0.012 : 0;
    const driftY = profile.drift ? Math.cos(t * 0.08) * canvas.height * 0.01 : 0;
    const targetX = (side === "opp" ? canvas.width * profile.oppX : side === "player" ? canvas.width * profile.playerX : canvas.width * profile.bothX) + driftX;
    const targetY = canvas.height * profile.y + driftY;
    const speed = 1 - Math.pow(0.001, Math.max(0.001, dt) * profile.speed);
    state.camera.zoom = state.camera.zoom + (ballisticZoom(t) - state.camera.zoom) * speed;
    state.camera.focusX = state.camera.focusX + (targetX - state.camera.focusX) * speed;
    state.camera.focusY = state.camera.focusY + (targetY - state.camera.focusY) * speed;
    state.camera.lastSide = side;
    const singShake = whittySingShake(t);
    state.camera.highwayX = Math.sin(t * 115.3) * singShake * 7.5;
    state.camera.highwayY = Math.cos(t * 132.7) * singShake * 4.5;
  };

  function stageFrame(key, t){
    const stage = normalizeStageAsset(activeWhittyStage()[key], key);
    if(!stage?.frames) return null;
    return frameFromList(stage.frames, t, 18, true);
  }

  function cachedStageCanvas(key, img, frame, scale){
    const cacheKey = key + ":" + frame.x + ":" + frame.y + ":" + frame.w + ":" + frame.h + ":" + scale;
    let cached = ballisticState.stageCache.get(cacheKey);
    if(cached) return cached;
    const width = Math.max(1, Math.ceil(frame.w * scale));
    const height = Math.max(1, Math.ceil(frame.h * scale));
    cached = document.createElement("canvas");
    cached.width = width;
    cached.height = height;
    const cctx = cached.getContext("2d");
    cctx.imageSmoothingEnabled = true;
    cctx.imageSmoothingQuality = "medium";
    cctx.drawImage(img, frame.x, frame.y, frame.w, frame.h, 0, 0, width, height);
    ballisticState.stageCache.set(cacheKey, cached);
    return cached;
  }

  function drawStageFrame(key, x, y, scale, t, alpha = 1){
    const frame = stageFrame(key, t);
    const stage = normalizeStageAsset(activeWhittyStage()[key], key);
    const img = ballisticState.images[stage?.imageKey || key];
    if(!frame || !imgReady(img)) return;
    const cached = cachedStageCanvas(stage?.imageKey || key, img, frame, scale);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.drawImage(cached, x - (frame.fx || 0) * scale, y - (frame.fy || 0) * scale);
    ctx.restore();
  }

  function drawStageImage(key, x, y, scale, alpha = 1){
    const stage = normalizeStageAsset(activeWhittyStage()[key], key);
    const img = ballisticState.images[stage?.imageKey || key];
    if(!imgReady(img)) return;
    const frame = { x: 0, y: 0, w: img.naturalWidth, h: img.naturalHeight, fx: 0, fy: 0 };
    const cached = cachedStageCanvas(stage?.imageKey || key, img, frame, scale);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.drawImage(cached, x, y);
    ctx.restore();
  }

  function drawStageLayer(key, x, y, scale, t, alpha = 1){
    const stage = normalizeStageAsset(activeWhittyStage()[key], key);
    if(stage?.frames) drawStageFrame(key, x, y, scale, t, alpha);
    else drawStageImage(key, x, y, scale, alpha);
  }

  function animDuration(frames, fps, min = 0.16, max = 0.62){
    if(!frames || !frames.length) return min;
    return Math.min(max, Math.max(min, frames.length / Math.max(1, fps)));
  }

  function ballisticPose(spriteKey, poseKey, t){
    const def = whittyRoot().sprites[spriteKey];
    if(spriteKey === "gf") return { anim: "dance", elapsed: t * 1.15, fps: 24, loop: true };
    if(spriteKey === "whitty"){
      const event = lastEvent(t, "Play Animation");
      const target = String(event && event.value2 || "").toLowerCase();
      const isTimesUp = event && event.value1 === "timesUp" && (target === "dad" || target === "whitty");
      const anim = def.animations.voiceline ? "voiceline" : def.animations.timesUp ? "timesUp" : null;
      if(isTimesUp && anim){
        const fps = def.fps[anim] || 24;
        const age = t - event.time;
        const frames = def.animations[anim];
        if(age >= 0 && age < frames.length / Math.max(1, fps)) return { anim, elapsed: age, fps, loop: false };
      }
    }
    const pose = state.poses[poseKey] || { lane: 1, time: -10, kind: "hit" };
    const dir = DIR[pose.lane % 4] || "down";
    const missAnim = dir + "Miss";
    const anim = pose.kind === "miss" && def.animations[missAnim] ? missAnim : dir;
    const frames = def.animations[anim];
    const fps = def.fps[anim] || 24;
    const age = performance.now() / 1000 - pose.time;
    if(age >= 0 && age < animDuration(frames, fps)) return { anim, elapsed: age, fps, loop: false };
    return { anim: "idle", elapsed: t, fps: def.fps.idle || 24, loop: true };
  }

  function drawBallisticCharacter(spriteKey, poseKey, x, y, scale, t, options = {}){
    const def = whittyRoot().sprites[spriteKey];
    const img = ballisticState.images[spriteKey];
    if(!def || !imgReady(img)) return;
    const pose = ballisticPose(spriteKey, poseKey, t);
    const frame = spriteFrame(def, pose.anim, pose.elapsed, pose.fps, pose.loop);
    if(!frame) return;
    const rage = ballisticRage(t);
    ctx.save();
    if(options.glow){
      ctx.shadowBlur = 8 + rage * 14;
      ctx.shadowColor = options.glow;
    }
    drawAtlasFrame(img, frame, x, y, scale, options.alpha == null ? 1 : options.alpha, options.flipX == null ? def.flipX : options.flipX);
    ctx.restore();
  }

  function drawWhittyScream(t){
    const cutscene = activeWhittyData().cutscenes && activeWhittyData().cutscenes.whittyScream;
    const img = ballisticState.images.whittyScream;
    if(!cutscene || !imgReady(img)) return false;
    const spb = activeWhittyData().chart.spb || 60 / 212;
    const elapsed = Math.max(0, t - (cutscene.beatStart || 366) * spb);
    const frame = frameFromList(cutscene.frames, elapsed, cutscene.fps || 24, true);
    if(!frame) return false;
    ctx.save();
    ctx.shadowBlur = 14 + ballisticRage(t) * 16;
    ctx.shadowColor = "rgba(255,29,96,0.82)";
    drawAtlasFrame(img, frame, cutscene.x || 110, cutscene.y || 650, cutscene.scale || 0.58, 1, false);
    ctx.restore();
    return true;
  }

  const baseBg = bg;
  bg = function(song, t){
    if(isBallistic()){
      ctx.fillStyle = "#050105";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      return;
    }
    return baseBg(song, t);
  };

  const baseStage = stage;
  stage = function(t){
    if(!isBallistic()) return baseStage(t);
    initBallisticVisuals();
    const songData = activeWhittyData();
    if(!ballisticReady()){
      baseBg(state.currentSong || SONGS.ballistic, t);
      actor(330, 486, { id: "dad", label: "Whitty", body: "#141018", head: "#ff1d60", detail: "#050105", accent: "#19fff1", scale: 1.12, phase: 0.2 }, t);
      actor(962, 486, { id: "player", label: "Boyfriend", body: "#4de3ff", head: "#ffd9cf", detail: "#0d2a6c", accent: "#ff4fa0", scale: 1.02, phase: 0.4 }, t);
      return;
    }

    const scale = 0.44;
    const x = (canvas.width - 2947 * scale) / 2;
    const y = -8;
    const rage = ballisticRage(t);
    const beat = ballisticCamBeat(t);
    const special = ballisticSpecialState(t);
    const depth = ballisticDepth(t);
    const singShake = whittySingShake(t);
    const shake = (rage * 3.2 + beat * 4.5 + singShake * 7.2);
    const sx = Math.sin(t * 31.1) * shake;
    const sy = Math.cos(t * 27.7) * shake * 0.65;
    const gf = songData.gf || { spriteKey: "gf", x: 655, y: 544, scale: 0.52, alpha: 0.9 };
    const opp = songData.opponent || { spriteKey: songData.opponentSprite || "whitty", x: 340, y: 642, scale: 0.56, glow: "rgba(255,29,96,0.78)" };
    const player = songData.player || { spriteKey: "boyfriend", x: 908, y: 630, scale: 0.64, glow: "rgba(25,255,241,0.42)", flipX: false };

    ctx.save();
    ctx.translate(sx, sy);
    drawBallisticDepthLayer(depth.far, () => {
      drawStageLayer("background", x, y, scale, t);
      drawStageImage("volumetric", x, y, scale, 0.72 + beat * 0.08);
    });
    drawBallisticDepthLayer(depth.mid, () => {
      drawStageImage("angry", x, y, scale, rage * 0.4 + beat * 0.075);
      drawBallisticCharacter(gf.spriteKey || "gf", "gf", gf.x, gf.y, gf.scale, t, { alpha: gf.alpha == null ? 0.9 : gf.alpha });
    });
    drawBallisticDepthLayer(depth.near, () => {
      drawStageImage("smog", x - 18 + Math.sin(t * 0.7) * 18, y + 16, scale, 0.44 + rage * 0.16);
      if(!special.scream || !drawWhittyScream(t)) drawBallisticCharacter(opp.spriteKey || songData.opponentSprite || "whitty", "whitty", opp.x, opp.y, opp.scale, t, { glow: opp.glow });
      drawBallisticCharacter(player.spriteKey || "boyfriend", "player", player.x, player.y, player.scale, t, { glow: player.glow, flipX: player.flipX });
      drawStageLayer("foreground", x, y + 2, scale, t, 0.98);
    });
    ctx.restore();
  };

  const baseReceptors = receptors;
  receptors = function(t){
    if(!isBallistic()) return baseReceptors(t);
    const pulse = 0.5 + Math.sin(t * 7.5) * 0.5;
    const y = receptorY();
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(canvas.width * 0.5, 72);
    ctx.lineTo(canvas.width * 0.5, 452);
    ctx.stroke();
    const special = ballisticSpecialState(t);
    for(let lane = 0; lane < 8; lane++){
      const lanePos = ballisticLanePosition(lane, t, special);
      const x = lanePos.x;
      const laneY = y + lanePos.y;
      const laneAlpha = lane < 4 ? special.opponentAlpha : 1;
      if(laneAlpha <= 0.01) continue;
      ctx.save();
      ctx.globalAlpha = laneAlpha;
      if(typeof sportingSpritesReady === "function" && sportingSpritesReady()) drawSportingReceptor(lane, x, laneY);
      else {
        const on = !!state.keysDown[lane];
        arrow(x, laneY, 48, [Math.PI, Math.PI / 2, -Math.PI / 2, 0][lane % 4], on ? COLORS[lane] : "rgba(13,20,36,0.88)", on ? "#fff" : "rgba(255,255,255,0.18)");
      }
      ctx.strokeStyle = "rgba(255,29,96," + (0.07 + pulse * 0.035).toFixed(3) + ")";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x, typeof receptorGuideStartY === "function" ? receptorGuideStartY(laneY) : laneY + 26);
      ctx.lineTo(x, typeof receptorGuideEndY === "function" ? receptorGuideEndY(lanePos.y * 0.4) : 448 + lanePos.y * 0.4);
      ctx.stroke();
      ctx.restore();
    }
  };

  function drawBallisticSustain(lane, x, headY, tailY, alpha){
    const top = Math.min(headY, tailY);
    const height = Math.max(18, Math.abs(tailY - headY));
    ctx.save();
    ctx.globalAlpha = alpha * 0.72;
    ctx.fillStyle = COLORS[lane] || "#fff";
    ctx.beginPath();
    ctx.roundRect(x - 10, top, 20, height, 9);
    ctx.fill();
    ctx.restore();
  }

  const baseNotes = notes;
  notes = function(t){
    if(!isBallistic()) return baseNotes(t);
    if(!state.chart) return;
    const noteList = state.chart.notes;
    const scroll = state.currentSong.scroll;
    const minY = -140;
    const maxY = canvas.height + 140;
    const ry = receptorY();
    if(t < ballisticState.lastNoteRenderTime - 0.5) ballisticState.firstDrawIndex = 0;
    ballisticState.lastNoteRenderTime = t;
    const down = typeof isDownScroll === "function" && isDownScroll();
    if(down) ballisticState.firstDrawIndex = 0;
    while(!down && ballisticState.firstDrawIndex < noteList.length){
      const n = noteList[ballisticState.firstDrawIndex];
      if(ry + (holdEndTime(n) - t) * scroll >= minY) break;
      ballisticState.firstDrawIndex++;
    }
    const special = ballisticSpecialState(t);
    for(let i = ballisticState.firstDrawIndex; i < noteList.length; i++){
      const n = noteList[i];
      if(n.played && n.hit && (!isHoldNote(n) || n.holdDone)) continue;
      if(n.judged && n.side !== "opp" && (!isHoldNote(n) || n.holdDone || !n.hit)) continue;
      const diff = n.time - t;
      const y = typeof noteYFromDiff === "function" ? noteYFromDiff(diff, scroll, ry) : ry + diff * scroll;
      const tailY = typeof noteYFromDiff === "function" ? noteYFromDiff(holdEndTime(n) - t, scroll, ry) : ry + (holdEndTime(n) - t) * scroll;
      if(typeof notePastViewport === "function" ? notePastViewport(y, tailY, minY, maxY) : (y < minY && tailY < minY)) continue;
      if(typeof noteFutureViewport === "function" ? noteFutureViewport(y, tailY, minY, maxY) : (y > maxY && tailY > maxY)) break;
      const lane = n.lane;
      const lanePos = ballisticLanePosition(lane, t, special);
      const x = lanePos.x;
      const drawY = y + lanePos.y;
      const drawTailY = tailY + lanePos.y;
      const rawScale = clamp(1 - Math.pow(Math.abs(diff), 0.7) * 0.45, 0.75, 1.12);
      const sideAlpha = (n.side === "opp" || lane < 4) ? special.opponentAlpha : 1;
      const alpha = (n.side === "opp" ? 0.86 : 1) * sideAlpha;
      if(alpha <= 0.01) continue;
      if(isHoldNote(n)) drawBallisticSustain(lane, x, n.hit ? ry + lanePos.y : drawY, drawTailY, alpha);
      if(n.hit && isHoldNote(n) && t > n.time) continue;
      if(typeof sportingSpritesReady === "function" && sportingSpritesReady()) drawSportingNote(lane, x, drawY, 0.76 * rawScale, alpha);
      else {
        const angle = [Math.PI, Math.PI / 2, -Math.PI / 2, 0][lane % 4];
        ctx.save();
        ctx.shadowBlur = 18;
        ctx.shadowColor = COLORS[lane];
        arrow(x, drawY, 42 * rawScale, angle, COLORS[lane], "rgba(255,255,255,0.8)", alpha);
        ctx.restore();
      }
    }
  };

  const baseRenderScene = renderScene;
  renderScene = function(songT, previewT){
    baseRenderScene(songT, previewT);
    if(!isBallistic()) return;
    const t = state.playing ? songT : previewT;
    const rage = ballisticRage(t);
    const flash = ballisticFlashAlpha(t);
    const special = ballisticSpecialState(t);
    drawBallisticCombatPostFx(t);
    ctx.save();
    if(flash > 0.001){
      ctx.globalAlpha = Math.min(0.85, flash);
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    const vignette = ctx.createRadialGradient(canvas.width * 0.5, canvas.height * 0.46, 120, canvas.width * 0.5, canvas.height * 0.46, canvas.width * 0.75);
    vignette.addColorStop(0, "rgba(0,0,0,0)");
    vignette.addColorStop(0.72, "rgba(40,0,8," + (0.18 + rage * 0.18).toFixed(3) + ")");
    vignette.addColorStop(1, "rgba(0,0,0," + (0.32 + rage * 0.22).toFixed(3) + ")");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if(special.blackAlpha > 0.001){
      ctx.globalAlpha = special.blackAlpha;
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    if(special.whiteAlpha > 0.001){
      ctx.globalAlpha = special.whiteAlpha;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.restore();
  };

  function resetBallisticPose(){
    if(!state.poses.whitty) state.poses.whitty = { lane: 1, time: -10, kind: "hit" };
    state.poses.whitty.time = -10;
    state.poses.whitty.kind = "hit";
    state.poses.whitty.lane = 1;
  }

  function playBallisticTracksFromStart(id = state.selectedSong){
    ensureBallisticAudio(id).forEach(track => {
      try {
        track.pause();
        track.currentTime = 0;
      } catch {}
    });
    state.playing = true;
    ballisticTracks(id).forEach(track => {
      try {
        const p = track.play();
        if(p && typeof p.catch === "function") p.catch(() => {});
      } catch {}
    });
  }

  function setupBallisticCommon(id){
    state.selectedSong = id;
    state.currentSong = SONGS[id];
    resetBallisticPose();
    ballisticState.firstDrawIndex = 0;
    ballisticState.lastNoteRenderTime = 0;
    rebuildKeyMap();
    state.chart = makeChart(state.currentSong);
    state.chart.notes = state.chart.notes.map((n, i) => ({ ...n, id: n.id == null ? i : n.id }));
    resetStats();
    state.health = 0.65;
    state.songStart = 0;
    state.nextStep = 0;
    state.nextStepTime = 0;
    state.feeds.player.time = -10;
    state.feeds.opp.time = -10;
    Object.values(state.poses).forEach(p => { p.time = -10; p.kind = "hit"; });
    state.receptorFx.forEach(fx => fx.time = -10);
    state.perseverance = { canDodge:false, prompt:false, dodging:false, dodged:false, resolved:false, dodgeStart:-10, flashTime:-10, gfAlpha:0 };
    state.camera = { zoom: 1, focusX: canvas.width / 2, focusY: canvas.height * 0.45, sideTime: 0, lastSide: "both", highwayX: 0, highwayY: 0 };
    ui.songTitle.textContent = state.currentSong.title;
    ui.songSub.textContent = state.currentSong.subtitle;
    ui.statusText.textContent = state.currentSong.title;
    ui.statusSub.textContent = state.currentSong.blurb || "Original Whitty Erect chart, split vocals, alley stage, and Whitty sprites are active.";
    ui.timer.textContent = "0:00 / " + formatTime(state.chart.totalTime);
    ui.menu.classList.remove("show");
    ui.settings.classList.remove("show");
    ui.resultsWrap.classList.remove("show");
  }

  function startBallisticLocal(id){
    const a = ensureAudio();
    if(a.state === "suspended") a.resume();
    stopExternalAudio();
    setupBallisticCommon(id);
    state.mode = ui.versusToggle.checked ? "versus" : "solo";
    ui.modeLabel.textContent = state.mode === "versus" ? "1v1 Versus" : "Solo Battle";
    ui.p1Box.style.display = state.mode === "versus" ? "block" : "none";
    playBallisticTracksFromStart(id);
  }

  function startBallisticOnline(id, options = {}){
    const a = ensureAudio();
    if(a.state === "suspended") a.resume();
    stopExternalAudio();
    if(state.startTimer) clearTimeout(state.startTimer);
    if(state.endTimer) clearTimeout(state.endTimer);
    state.startTimer = null;
    state.endTimer = null;
    setupBallisticCommon(id);
    state.mode = "online";
    state.playing = true;
    state.network.matchStartAt = Number(options.startAt || (serverClockNow() + 8000));
    state.network.pendingStartAt = state.network.matchStartAt;
    state.network.lastTrackSync = 0;
    state.network.ready = { host: false, guest: false };
    ui.statusText.textContent = "Match syncing";
    ui.statusSub.textContent = "Both players finished loading. The server is holding an 8 second synced countdown before " + state.currentSong.title + " starts.";
    if(typeof syncModeUI === "function") syncModeUI();
    const skipReload = !!options.skipReload;
    ensureBallisticAudio(id).forEach(track => {
      track.pause();
      try { track.currentTime = 0; } catch {}
      if(!skipReload) {
        try { track.load(); } catch {}
      }
    });
    if(typeof syncOnlinePlayback === "function") syncOnlinePlayback(true);
  }

  const baseStartSong = startSong;
  startSong = function(id = state.selectedSong, options = {}){
    if(!isWhittySong(SONGS[id])) return baseStartSong(id, options);
    if(state.network && (options.forceMode === "online" || state.mode === "online" || state.network.roomId)) return startBallisticOnline(id, options);
    return startBallisticLocal(id);
  };

  if(typeof importedTracksForSong === "function"){
    const baseImportedTracksForSong = importedTracksForSong;
    importedTracksForSong = function(songId = state.selectedSong){
      if(isWhittySong(SONGS[songId])) return ensureBallisticAudio(songId);
      return baseImportedTracksForSong(songId);
    };
  }

  if(typeof preloadSongForMatch === "function"){
    const basePreloadSongForMatch = preloadSongForMatch;
    preloadSongForMatch = async function(songId, matchId){
      if(!isWhittySong(SONGS[songId])) return basePreloadSongForMatch(songId, matchId);
      state.network.preparing = true;
      state.network.prepareMatchId = matchId;
      state.network.preparedSongId = "";
      state.network.loadingStatus = "Loading " + SONGS[songId].title + " song files on your side.";
      if(typeof updateOnlinePanel === "function") updateOnlinePanel();
      const tracks = ensureBallisticAudio(songId);
      tracks.forEach(track => {
        track.pause();
        try { track.currentTime = 0; } catch {}
        try { track.load(); } catch {}
      });
      if(typeof waitForTrackReady === "function") await Promise.all(tracks.map(track => waitForTrackReady(track)));
      if(state.network.prepareMatchId !== matchId) return false;
      state.network.preparedSongId = songId;
      state.network.loadingStatus = "Loaded on your side. Waiting for the other player.";
      if(state.network.role === "host") state.network.loaded.host = true;
      if(state.network.role === "guest") state.network.loaded.guest = true;
      if(typeof updateOnlinePanel === "function") updateOnlinePanel();
      return true;
    };
  }

  if(typeof syncOnlinePlayback === "function"){
    const baseSyncOnlinePlayback = syncOnlinePlayback;
    syncOnlinePlayback = function(force = false){
      if(!isBallistic()) return baseSyncOnlinePlayback(force);
      const targetTime = typeof expectedOnlineSongTime === "function" ? expectedOnlineSongTime() : null;
      if(targetTime == null) return null;
      const localNow = Date.now();
      const now = serverClockNow();
      const syncGap = targetTime < 10 ? 55 : 85;
      if(!force && localNow - (state.network.lastTrackSync || 0) < syncGap) return targetTime;
      state.network.lastTrackSync = localNow;
      const shouldPlay = now + 40 >= state.network.matchStartAt;
      const syncOptions = { playTolerance: 0.045, pauseTolerance: 0.02, secondaryPlayTolerance: 0.12, secondaryPauseTolerance: 0.06 };
      const tracks = ensureBallisticAudio();
      if(typeof syncTrackToTime === "function"){
        syncTrackToTime(tracks[0], targetTime, shouldPlay, syncOptions);
        syncTrackToTime(tracks[1], targetTime, shouldPlay, { ...syncOptions, isSecondary: true });
        syncTrackToTime(tracks[2], targetTime, shouldPlay, { ...syncOptions, isSecondary: true });
      }
      return targetTime;
    };
  }

  initBallisticVisuals();
  if(typeof renderSongs === "function"){
    const selected = state.selectedSong;
    renderSongs();
    if(SONGS[selected]) selectSong(selected);
  }
})();

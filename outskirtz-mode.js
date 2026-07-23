(function() {
  const OUT = window.OUTSKIRTZ_DATA;
  if (!OUT || typeof SONGS === "undefined") return;

  const DIR = ["left", "down", "up", "right"];
  const DIR_ANIM = ["singLEFT", "singDOWN", "singUP", "singRIGHT"];
  const SOURCE_W = 1280;
  const STEP_SEC = (Number(OUT.chart?.spb) || 0.3) / 4;
  const STAGE_ZOOM = 0.64;
  const NOTE_X = {
    opp: [92, 204, 316, 428],
    player: [740, 852, 963, 1075]
  };

  SONGS.outskirtz = {
    title: OUT.meta?.title || "Outskirtz",
    subtitle: OUT.meta?.subtitle || "Outskritz Psych Engine hard chart",
    diff: "Hard (Original Chart)",
    tempo: Number(OUT.meta?.bpm || 200),
    root: 41,
    scale: [0, 2, 3, 5, 7, 8, 10],
    prog: [0, 5, 3, 7],
    scroll: 1296,
    seed: 57,
    introBeats: 0,
    outroBeats: 2,
    palette: ["#050206", "#180910", "#3b121b", "#050207", "#f7efff", "#ff4e66"],
    blurb: "Imported from Outskritz with the original Outskirtz hard chart, arena stage, Alex and BF Wii sprites, custom note skin, source modchart events, health drain, and official shader files.",
    chartSource: "outskirtz"
  };
  if (typeof NEW_SONGS !== "undefined" && NEW_SONGS?.add) NEW_SONGS.add("outskirtz");

  const out = {
    initialized: false,
    images: {},
    camera: null,
    fxCanvas: null,
    fxCtx: null,
    workingCanvas: null,
    workingCtx: null,
    lastSong: "",
    lastSide: "opp",
    lastSideTime: -99,
    warmScheduled: false,
    warmWidth: 0,
    warmHeight: 0,
    rasterWarmed: false,
    liveWarmWidth: 0,
    liveWarmHeight: 0,
    fxCacheTime: NaN,
    fxCache: null
  };

  const baseIsImportedSong = isImportedSong;
  const baseMakeChart = makeChart;
  const baseSongTime = songTime;
  const baseSongEndTime = songEndTime;
  const baseStopExternalAudio = stopExternalAudio;
  const baseStartSong = startSong;
  const baseFinish = finish;
  const baseRefreshHUD = refreshHUD;
  const baseUpdateCamera = updateCamera;
  const baseJudge = judge;
  const baseHandleMisses = handleMisses;
  const baseBg = bg;
  const baseStage = stage;
  const baseReceptors = receptors;
  const baseNotes = notes;
  const baseApplyDustinBloom = applyDustinBloom;

  function clampValue(value, min, max) {
    const number = Number(value) || 0;
    return Math.max(min, Math.min(max, number));
  }

  function clamp01(value) {
    return clampValue(value, 0, 1);
  }

  function lerp(a, b, t) {
    return a + (b - a) * clamp01(t);
  }

  function imageReady(image) {
    return !!(image && image.complete && image.naturalWidth);
  }

  function loadImage(key, src) {
    if (!src) return;
    const image = new Image();
    image.decoding = "async";
    image.loading = "eager";
    image.addEventListener("load", () => {
      out.rasterWarmed = false;
      scheduleOutskirtzWarmup();
    }, { once: true });
    image.src = src;
    out.images[key] = image;
  }

  function decodeOutskirtzImages() {
    Object.values(out.images).forEach(image => {
      if (image && typeof image.decode === "function") image.decode().catch(() => {});
    });
  }

  function initAssets() {
    if (out.initialized) return;
    out.initialized = true;
    loadImage("ground", OUT.stage.sprites.ground.image);
    loadImage("overlay", OUT.stage.sprites.overlay.image);
    loadImage("alex", OUT.sprites.alex.image);
    loadImage("bf", OUT.sprites.boyfriend.image);
    loadImage("notes", OUT.notes.image);
    decodeOutskirtzImages();
  }

  function assetsReady() {
    initAssets();
    return ["ground", "overlay", "alex", "bf", "notes"].every(key => imageReady(out.images[key]));
  }

  function cloneChart() {
    return {
      ...OUT.chart,
      notes: OUT.chart.notes.map((note, index) => ({ ...note, id: note.id == null ? index : note.id })),
      timeline: (OUT.chart.timeline || []).map(section => ({ ...section })),
      events: (OUT.events || []).map(event => ({ ...event }))
    };
  }

  function ensureOutskirtzAudio() {
    if (!state.audio.outskirtzInst) {
      state.audio.outskirtzInst = new Audio(OUT.audio.inst || "outskirtz-inst.ogg");
      state.audio.outskirtzInst.preload = "auto";
      state.audio.outskirtzInst.volume = 0.94;
    }
    state.audio.outskirtzInst.playbackRate = 1;
    return [state.audio.outskirtzInst];
  }

  window.ensureOutskirtzAudio = ensureOutskirtzAudio;
  window.prepareOutskirtzOnlineStart = function() {
    initAssets();
    const tracks = ensureOutskirtzAudio();
    tracks.forEach(track => {
      if (!track) return;
      try {
        track.pause();
        track.currentTime = 0;
        track.load();
      } catch {}
    });
    return tracks;
  };

  function sourceScale() {
    return canvas.width / SOURCE_W;
  }

  function outskirtzDisplayLane(lane, t, fx) {
    const raw = Number(lane);
    if (!Number.isFinite(raw)) {
      return lane;
    }
    const dir = ((raw % 4) + 4) % 4;
    if ((dir === 1 || dir === 2) && outskirtzCameraUpsideDown(t, fx)) {
      return raw + (dir === 1 ? 1 : -1);
    }
    return raw;
  }

  function outskirtzLaneX(lane, t, fx) {
    const visualLane = outskirtzDisplayLane(lane, t, fx);
    const scale = sourceScale();
    const side = visualLane < 4 ? "opp" : "player";
    return clampValue(NOTE_X[side][visualLane % 4] * scale, 72, canvas.width - 72);
  }

  function outskirtzReceptorY() {
    return (typeof isDownScroll === "function" && isDownScroll()) ? 548 : 172;
  }

  function outskirtzScrollDirection() {
    return (typeof isDownScroll === "function" && isDownScroll()) ? -1 : 1;
  }

  function outskirtzNoteY(time, t) {
    return outskirtzReceptorY() + (time - t) * SONGS.outskirtz.scroll * outskirtzScrollDirection();
  }

  function dirKey(lane) {
    return DIR[lane % 4];
  }

  function noteFrames(lane) {
    return OUT.notes.skin[dirKey(lane)];
  }

  function frameFor(anim, elapsed) {
    if (!anim?.frames?.length) return null;
    return frameFromList(anim.frames, elapsed, Number(anim.fps || 24), !!anim.loop);
  }

  function animDuration(anim) {
    if (!anim?.frames?.length) return 0.3;
    return anim.frames.length / Math.max(1, Number(anim.fps || 24));
  }

  function drawTopLeft(image, frame, x, y, scale, alpha = 1, flipX = false) {
    if (!frame || !imageReady(image)) return;
    const fw = frame.fw || frame.w;
    const fx = frame.fx || 0;
    const fy = frame.fy || 0;
    ctx.save();
    ctx.globalAlpha = alpha;
    if (flipX) {
      ctx.translate(x + fw * scale, y);
      ctx.scale(-1, 1);
      drawAtlasSub(image, frame, -fx * scale, -fy * scale, scale);
    } else {
      drawAtlasSub(image, frame, x - fx * scale, y - fy * scale, scale);
    }
    ctx.restore();
  }

  function spriteData(kind) {
    return kind === "bf" ? OUT.sprites.boyfriend : OUT.sprites.alex;
  }

  function spritePoseKey(kind) {
    return kind === "bf" ? "outskirtzBf" : "alex";
  }

  function characterTopLeft(kind) {
    const sprite = spriteData(kind);
    const base = kind === "bf" ? OUT.stage.boyfriend : OUT.stage.opponent;
    return {
      x: Number(base[0] || 0) + Number(sprite.position?.[0] || 0),
      y: Number(base[1] || 0) + Number(sprite.position?.[1] || 0)
    };
  }

  function idleFrame(kind) {
    return spriteData(kind).animations.idle?.frames?.[0] || { w: 320, h: 480, fw: 320, fh: 480 };
  }

  function characterCameraWorld(kind) {
    const sprite = spriteData(kind);
    const top = characterTopLeft(kind);
    const idle = idleFrame(kind);
    const midX = top.x + Number(idle.fw || idle.w || 0) * 0.5;
    const midY = top.y + Number(idle.fh || idle.h || 0) * 0.5;
    const cam = sprite.cameraPosition || [0, 0];
    if (kind === "bf") {
      return {
        x: midX - 100 + Number(cam[0] || 0),
        y: midY - 100 + Number(cam[1] || 0)
      };
    }
    return {
      x: midX + 150 + Number(cam[0] || 0),
      y: midY - 100 + Number(cam[1] || 0)
    };
  }

  function currentTimelineSection(t) {
    const timeline = state.chart?.timeline || OUT.chart.timeline || [];
    return timeline.find(section => t >= Number(section.startTime || 0) && t < Number(section.endTime || 0)) || timeline[timeline.length - 1] || null;
  }

  function activeCameraSide(t) {
    if (out.lastSong !== state.selectedSong || t < 0.05) {
      out.lastSong = state.selectedSong;
      out.lastSide = "opp";
      out.lastSideTime = -99;
    }
    let hasOpp = false;
    let hasPlayer = false;
    for (const note of state.chart?.notes || []) {
      if (note.time > t + 0.08) break;
      const activeTap = !isHoldNote(note) && note.time >= t - 0.06;
      const activeHold = isHoldNote(note) && t >= note.time - 0.06 && holdEndTime(note) >= t - 0.02;
      if (!activeTap && !activeHold) continue;
      if (note.side === "opp") hasOpp = true;
      if (note.side === "player") hasPlayer = true;
    }
    const liveSide = hasOpp && hasPlayer ? "both" : hasPlayer ? "player" : hasOpp ? "opp" : "";
    if (liveSide) {
      out.lastSide = liveSide;
      out.lastSideTime = t;
      return liveSide;
    }
    if (t - out.lastSideTime < 0.62) return out.lastSide;
    const section = currentTimelineSection(t);
    return section?.gfSection ? "both" : section?.mustHitSection ? "player" : "opp";
  }

  function recentNoteBump(t, side) {
    let latest = null;
    for (const note of state.chart?.notes || []) {
      if (note.time > t) break;
      if (note.side !== side && side !== "both") continue;
      const age = t - note.time;
      const holdActive = isHoldNote(note) && t <= holdEndTime(note) + 0.02;
      if (age < 0 || (!holdActive && age > 0.28)) continue;
      if (!latest || note.time > latest.time) latest = note;
    }
    if (!latest) return { x: 0, y: 0 };
    const lane = latest.lane % 4;
    const sameSide = side === "both" || latest.side === side;
    const pix = 69 * (sameSide ? 1 : 0.45);
    if (lane === 0) return { x: -pix, y: 0 };
    if (lane === 1) return { x: 0, y: pix };
    if (lane === 2) return { x: 0, y: -pix };
    return { x: pix, y: 0 };
  }

  function cameraZoomEvent(t) {
    let value = 0;
    let active = null;
    for (const event of OUT.events || []) {
      if (event.name !== "Set Camera Zoom") continue;
      if (event.time > t) break;
      const from = value;
      const to = Number(event.value1 || 0);
      const duration = Math.max(0.01, Number(event.value2 || 0.2));
      active = { time: event.time, end: event.time + duration, from, to };
      value = to;
    }
    if (active && t < active.end) return lerp(active.from, active.to, (t - active.time) / (active.end - active.time));
    return value;
  }

  function resetCamera() {
    const opp = characterCameraWorld("alex");
    const bf = characterCameraWorld("bf");
    out.camera = {
      x: (opp.x + bf.x) * 0.5,
      y: (opp.y + bf.y) * 0.5,
      zoom: STAGE_ZOOM
    };
  }

  function updateOutskirtzCamera(t, dt) {
    if (!out.camera) resetCamera();
    const side = activeCameraSide(t);
    const opp = characterCameraWorld("alex");
    const bf = characterCameraWorld("bf");
    const bump = recentNoteBump(t, side);
    const target = side === "player"
      ? { x: bf.x, y: bf.y, zoom: STAGE_ZOOM * 1.04 }
      : side === "opp"
        ? { x: opp.x, y: opp.y, zoom: STAGE_ZOOM * 1.04 }
        : { x: (opp.x + bf.x) * 0.5, y: (opp.y + bf.y) * 0.5, zoom: STAGE_ZOOM * 0.94 };
    target.x += bump.x;
    target.y += bump.y;
    target.zoom *= 1 + cameraZoomEvent(t) * 0.08;
    const speed = 2.4 * ((1 / 0.69) + 1) * (Number(OUT.stage.cameraSpeed || 3));
    const lerpAmount = clamp01((dt || 1 / 60) * speed);
    out.camera.x += (target.x - out.camera.x) * lerpAmount;
    out.camera.y += (target.y - out.camera.y) * lerpAmount;
    out.camera.zoom += (target.zoom - out.camera.zoom) * clamp01(lerpAmount * 0.74);
    state.camera.zoom = 1;
    state.camera.focusX = canvas.width * 0.5;
    state.camera.focusY = canvas.height * 0.5;
    state.camera.highwayX = 0;
    state.camera.highwayY = 0;
    state.camera.lastSide = side;
  }

  function stagePoint(x, y, scrollX = 1, scrollY = scrollX) {
    if (!out.camera) resetCamera();
    const zoom = out.camera.zoom;
    return {
      x: (x - out.camera.x * scrollX) * zoom + canvas.width * 0.5,
      y: (y - out.camera.y * scrollY) * zoom + canvas.height * 0.5
    };
  }

  function drawStageImage(key, spec, t, alpha = 1) {
    const image = out.images[key];
    if (!imageReady(image)) return;
    const p = stagePoint(spec.x, spec.y, Number(spec.scrollX || 1), Number(spec.scrollY || 1));
    const scale = out.camera.zoom * Number(spec.scale || 1);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(image, p.x, p.y, image.naturalWidth * scale, image.naturalHeight * scale);
    ctx.restore();
  }

  function activeAnim(kind, t) {
    const sprite = spriteData(kind);
    const poseKey = spritePoseKey(kind);
    const poseInfo = state.poses[poseKey] || { lane: 1, time: -10, kind: "hit" };
    const held = activeHoldNoteForCharacter(poseKey, t);
    const lane = (held ? held.lane : poseInfo.lane) || 0;
    const animName = DIR_ANIM[lane % 4];
    const age = held ? Math.max(0, t - held.time) : performance.now() / 1000 - Number(poseInfo.time || -10);
    const hitAnim = sprite.animations[animName];
    const singDuration = Math.max(0.22, Number(sprite.singDuration || 4) * STEP_SEC);
    if (hitAnim && (held || (age >= 0 && age < Math.max(singDuration, Math.min(0.56, animDuration(hitAnim)))))) {
      return { anim: hitAnim, name: animName, elapsed: age, loop: false };
    }
    const idle = sprite.animations.idle || hitAnim || Object.values(sprite.animations)[0];
    return { anim: idle, name: "idle", elapsed: t * 0.95, loop: true };
  }

  function drawCharacter(kind, t) {
    const sprite = spriteData(kind);
    const image = kind === "bf" ? out.images.bf : out.images.alex;
    const pose = activeAnim(kind, t);
    const frame = frameFor({ ...pose.anim, loop: pose.loop }, pose.elapsed);
    if (!frame || !imageReady(image)) return;
    const top = characterTopLeft(kind);
    const p = stagePoint(top.x, top.y);
    const scale = out.camera.zoom * Number(sprite.scale || 1);
    const offsets = pose.anim.offsets || pose.anim.offset || [0, 0];
    const bob = pose.name === "idle" ? Math.sin(t * 2.5 + (kind === "bf" ? 0.7 : 0)) * 2.2 : 0;
    const flipX = kind === "bf" ? !sprite.flipX : !!sprite.flipX;
    drawTopLeft(
      image,
      frame,
      p.x - Number(offsets[0] || 0) * scale,
      p.y - Number(offsets[1] || 0) * scale + bob,
      scale,
      1,
      flipX
    );
  }

  function drawOutskirtzStage(t) {
    if (!assetsReady()) {
      ctx.fillStyle = "#060205";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      return;
    }
    ctx.fillStyle = "#060205";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawStageImage("ground", OUT.stage.sprites.ground, t);
    drawCharacter("alex", t);
    drawCharacter("bf", t);
    drawStageImage("overlay", OUT.stage.sprites.overlay, t, 0.96);
  }

  function drawOutskirtzReceptor(lane, x, y, t, alpha = 1) {
    const skin = noteFrames(lane);
    const age = performance.now() / 1000 - Number(state.receptorFx[lane]?.time || -10);
    if (age >= 0 && age < 0.16 && skin.confirm?.length) {
      const frame = frameFromList(skin.confirm, age, 24, false);
      if (frame) {
        ctx.save();
        ctx.shadowBlur = 22;
        ctx.shadowColor = COLORS[lane];
        drawAtlasCentered(out.images.notes, frame, x, y, 0.72 + (0.16 - age) * 0.52, alpha * (1 - age / 0.18));
        ctx.restore();
        return;
      }
    }
    const pressed = state.keysDown[lane] && skin.press?.length;
    const frame = pressed ? frameFromList(skin.press, performance.now() / 1000, 24, true) : skin.static;
    if (!frame) return;
    ctx.save();
    ctx.shadowBlur = pressed ? 18 : 8;
    ctx.shadowColor = COLORS[lane];
    drawAtlasCentered(out.images.notes, frame, x, y, pressed ? 0.7 : 0.68, alpha);
    ctx.restore();
  }

  function drawOutskirtzNote(lane, x, y, scale, alpha = 1) {
    const skin = noteFrames(lane);
    if (!skin?.gem) return;
    ctx.save();
    ctx.shadowBlur = 20;
    ctx.shadowColor = COLORS[lane];
    drawAtlasCentered(out.images.notes, skin.gem, x, y, 0.7 * scale, alpha);
    ctx.restore();
  }

  function drawOutskirtzSustain(note, x, headY, tailY, alpha = 1) {
    if (!isHoldNote(note)) return;
    const skin = noteFrames(note.lane);
    if (!skin?.holdPiece || !skin?.holdEnd) return;
    const upperY = Math.min(headY, tailY);
    const lowerY = Math.max(headY, tailY);
    const scale = 0.72;
    const endH = (skin.holdEnd.fh || skin.holdEnd.h) * scale;
    const bodyW = (skin.holdPiece.fw || skin.holdPiece.w) * scale;
    const bodyTop = upperY + endH * 0.42;
    const bodyBottom = lowerY - endH * 0.42;
    if (bodyBottom > bodyTop) drawAtlasStretchVertical(out.images.notes, skin.holdPiece, x, bodyTop, bodyW, bodyBottom - bodyTop, alpha * 0.9);
    drawAtlasCentered(out.images.notes, skin.holdEnd, x, tailY, scale, alpha);
  }

  function defaultFx() {
    return {
      mirrorZoom: 1,
      mirrorX: 0,
      mirrorY: 0,
      mirrorAngle: 0,
      mirrorHudZoom: 1,
      mirrorHudX: 0,
      mirrorHudY: 0,
      mirrorHudAngle: 0,
      barrelZoom: 1,
      barrel: 0,
      barrelX: 0,
      barrelY: 0,
      barrelAngle: 0,
      barrelHudZoom: 1,
      barrelHud: 0,
      barrelHudX: 0,
      barrelHudY: 0,
      barrelHudAngle: 0,
      chrom: 0,
      goodChrom: 0,
      blur: 0,
      blur2: 0.3,
      bloomContrast: 1,
      grey: 0,
      fish: 0,
      hue: 0,
      vigStrength: 3,
      vigSize: 50,
      vigR: 1,
      vigG: 1,
      vigB: 1,
      fishbarsEffect: 0,
      fishbarsEffect2: 0,
      fishbarsAngle1: 0,
      fishbarsAngle2: 0,
      fishbarsPower: 0,
      diAngle: 0,
      diStrength: 0,
      flash: 0,
      hudAlpha: 1,
      fadeWhite: 0,
      badApple: 0,
      swingGame: 0,
      swingHud: 0
    };
  }

  function easeValue(name, p) {
    const t = clamp01(p);
    const key = String(name || "linear").toLowerCase();
    if (key.includes("inout")) {
      if (t < 0.5) return easeValue(key.replace("inout", "in"), t * 2) / 2;
      return 1 - easeValue(key.replace("inout", "out"), (1 - t) * 2) / 2;
    }
    const outMode = key.includes("out");
    const baseKey = key.replace("out", "").replace("in", "");
    const base = x => {
      if (baseKey.includes("quart")) return Math.pow(x, 4);
      if (baseKey.includes("quad")) return x * x;
      if (baseKey.includes("cube")) return x * x * x;
      if (baseKey.includes("sine")) return 1 - Math.cos((x * Math.PI) / 2);
      if (baseKey.includes("bounce")) {
        const n1 = 7.5625, d1 = 2.75;
        if (x < 1 / d1) return n1 * x * x;
        if (x < 2 / d1) return n1 * (x -= 1.5 / d1) * x + 0.75;
        if (x < 2.5 / d1) return n1 * (x -= 2.25 / d1) * x + 0.9375;
        return n1 * (x -= 2.625 / d1) * x + 0.984375;
      }
      return x;
    };
    return outMode ? 1 - base(1 - t) : base(t);
  }

  function parseList(value) {
    return String(value || "").split(",").map(part => part.trim()).filter(part => part.length);
  }

  function numericList(value) {
    return parseList(value).map(part => Number(part) || 0);
  }

  function addTween(active, values, prop, to, duration, ease) {
    const from = Number(values[prop] || 0);
    const seconds = Math.max(0, Number(duration || 0));
    if (seconds <= 0.0001) {
      values[prop] = to;
      return;
    }
    active.push({ prop, from, to, startValue: from, startTime: active.time || 0, endTime: (active.time || 0) + seconds, ease });
  }

  function advanceTweens(active, values, time) {
    for (let i = active.length - 1; i >= 0; i--) {
      const tween = active[i];
      if (time >= tween.endTime) {
        values[tween.prop] = tween.to;
        active.splice(i, 1);
        continue;
      }
      const p = (time - tween.startTime) / Math.max(0.0001, tween.endTime - tween.startTime);
      values[tween.prop] = lerp(tween.from, tween.to, easeValue(tween.ease, p));
    }
  }

  function propDefault(name) {
    if (name.endsWith("Zoom") || name === "bloomContrast") return 1;
    if (name === "blur2") return 0.3;
    if (name === "vigStrength") return 3;
    if (name === "vigSize") return 50;
    if (name === "vigR" || name === "vigG" || name === "vigB") return 1;
    return 0;
  }

  function cancelPropTweens(active, prop) {
    for (let i = active.length - 1; i >= 0; i--) {
      if (active[i].prop === prop) active.splice(i, 1);
    }
  }

  function queueTween(active, values, prop, to, duration, ease) {
    cancelPropTweens(active, prop);
    const from = Number(values[prop] ?? propDefault(prop));
    const seconds = Math.max(0, Number(duration || 0));
    if (seconds <= 0.0001) {
      values[prop] = Number(to) || 0;
      return;
    }
    active.push({ prop, from, to: Number(to) || 0, startTime: active.time || 0, endTime: (active.time || 0) + seconds, ease });
  }

  function bumpTween(active, values, prop, amount, duration, ease) {
    cancelPropTweens(active, prop);
    values[prop] = Number(amount) || 0;
    queueTween(active, values, prop, propDefault(prop), duration, ease);
  }

  function applyMirrorLike(event, values, active, prefix, bump) {
    const props = parseList(event.value1);
    const args = parseList(event.value2);
    props.forEach((prop, index) => {
      const target = Number(args[index * 3] || 0);
      const duration = Number(args[index * 3 + 1] || 0) * STEP_SEC;
      const ease = args[index * 3 + 2] || "linear";
      const hud = index === 1;
      let key = "";
      if (prefix === "barrel") {
        if (prop === "zoom") key = hud ? "barrelHudZoom" : "barrelZoom";
        else if (prop === "barrel") key = hud ? "barrelHud" : "barrel";
        else if (prop === "x") key = hud ? "barrelHudX" : "barrelX";
        else if (prop === "y") key = hud ? "barrelHudY" : "barrelY";
        else if (prop === "angle") key = hud ? "barrelHudAngle" : "barrelAngle";
      } else {
        if (prop === "zoom") key = hud ? "mirrorHudZoom" : "mirrorZoom";
        else if (prop === "x") key = hud ? "mirrorHudX" : "mirrorX";
        else if (prop === "y") key = hud ? "mirrorHudY" : "mirrorY";
        else if (prop === "angle") key = hud ? "mirrorHudAngle" : "mirrorAngle";
      }
      if (!key) return;
      if (bump) bumpTween(active, values, key, target, duration, ease);
      else queueTween(active, values, key, target, duration, ease);
    });
  }

  function computeFxAt(time) {
    const values = defaultFx();
    const active = [];
    active.time = 0;
    const events = OUT.events || [];
    for (const event of events) {
      if (event.time > time) break;
      active.time = event.time;
      advanceTweens(active, values, event.time);
      const name = event.name;
      if (name === "mirror") applyMirrorLike(event, values, active, "mirror", false);
      else if (name === "mirrorbump") applyMirrorLike(event, values, active, "mirror", true);
      else if (name === "barrelbump") applyMirrorLike(event, values, active, "barrel", true);
      else if (name === "bloom") {
        const args = parseList(event.value2);
        queueTween(active, values, "bloomContrast", Number(event.value1 || 1), Number(args[0] || 0) * STEP_SEC, args[1] || "linear");
      } else if (name === "bloombump") {
        const args = parseList(event.value2);
        bumpTween(active, values, "bloomContrast", Number(event.value1 || 1), Number(args[0] || 0) * STEP_SEC, args[1] || "linear");
      } else if (name === "chrombump") {
        const args = parseList(event.value2);
        bumpTween(active, values, "chrom", Number(event.value1 || 0), Number(args[0] || 0) * STEP_SEC, args[1] || "linear");
      } else if (name === "fish") {
        const args = parseList(event.value2);
        queueTween(active, values, "fish", Number(event.value1 || 0), Number(args[0] || 0) * STEP_SEC, args[1] || "linear");
      } else if (name === "fishbars") {
        const nums = numericList(event.value1);
        const args = parseList(event.value2);
        ["fishbarsEffect", "fishbarsEffect2", "fishbarsAngle1", "fishbarsAngle2", "fishbarsPower"].forEach((prop, i) => {
          queueTween(active, values, prop, nums[i] || 0, Number(args[0] || 0) * STEP_SEC, args[1] || "linear");
        });
      } else if (name === "DIblur") {
        const nums = numericList(event.value1);
        const args = parseList(event.value2);
        queueTween(active, values, "diAngle", nums[0] || 0, Number(args[0] || 0) * STEP_SEC, args[1] || "linear");
        queueTween(active, values, "diStrength", nums[1] || 0, Number(args[0] || 0) * STEP_SEC, args[1] || "linear");
      } else if (name === "greyscale") {
        const args = parseList(event.value2);
        queueTween(active, values, "grey", Number(event.value1 || 0), Number(args[0] || 0) * STEP_SEC, args[1] || "linear");
      } else if (name === "hue") {
        const args = parseList(event.value2);
        queueTween(active, values, "hue", Number(event.value1 || 0), Number(args[0] || 0) * STEP_SEC, args[1] || "linear");
      } else if (name === "vignette") {
        const nums = numericList(event.value1);
        const args = parseList(event.value2);
        const duration = Number(args[0] || 0) * STEP_SEC;
        const ease = args[1] || "linear";
        queueTween(active, values, "vigStrength", nums[0] ?? values.vigStrength, duration, ease);
        queueTween(active, values, "vigSize", nums[1] ?? values.vigSize, duration, ease);
        queueTween(active, values, "vigR", nums[2] ?? values.vigR, duration, ease);
        queueTween(active, values, "vigG", nums[3] ?? values.vigG, duration, ease);
        queueTween(active, values, "vigB", nums[4] ?? values.vigB, duration, ease);
      } else if (name === "Goodbye Hud") {
        queueTween(active, values, "hudAlpha", Number(event.value1 || 1), Number(event.value2 || 0), "linear");
      } else if (name === "Camera Flash2" || name === "camShalf") {
        const duration = name === "camShalf" ? Number(event.value1 || 0.2) : Number(event.value1 || 0.4);
        const to = name === "camShalf" ? Number(event.value2 || 1) : 1;
        bumpTween(active, values, "flash", Math.max(values.flash, to), duration, "linear");
      } else if (name === "FadeScreenOut") {
        const duration = Number(event.value1 || 0.3);
        bumpTween(active, values, "fadeWhite", Math.max(values.fadeWhite, 1), duration, "cubeOut");
      } else if (name === "FadeScreenIn") {
        const duration = Number(event.value1 || 0.3);
        queueTween(active, values, "fadeWhite", 1, duration, "cubeIn");
      } else if (name === "badappleSprite") {
        values.badApple = 1;
      } else if (name === "MirrorSwing") {
        values.swingGame = Number(event.value1 || 1);
      } else if (name === "MirrorSwingHud") {
        values.swingHud = Number(event.value1 || 1);
      }
    }
    active.time = time;
    advanceTweens(active, values, time);
    if (values.swingGame) values.mirrorAngle += Math.sin(time * 4.2) * values.swingGame * 5;
    if (values.swingHud) values.mirrorHudAngle += Math.sin(time * 5.1) * values.swingHud * 5;
    return values;
  }

  function fxAt(time) {
    const numberTime = Number(time) || 0;
    if (out.fxCache && out.fxCacheTime === numberTime) return out.fxCache;
    const values = computeFxAt(numberTime);
    out.fxCacheTime = numberTime;
    out.fxCache = values;
    return values;
  }

  const previousGameplayLaneMapper = window.mapGameplayLaneForCurrentView;

  function normalizeOutskirtzAngle(angle) {
    return ((Number(angle) % 360) + 360) % 360;
  }

  function isOutskirtzCurrentSong() {
    return state.selectedSong === "outskirtz" || state.currentSong?.chartSource === "outskirtz";
  }

  function outskirtzCameraUpsideDown(t, fxOverride) {
    const time = Number.isFinite(Number(t)) ? Number(t) : (state.playing ? songTime() : 0);
    const fx = fxOverride || fxAt(time);
    const gameAngle = normalizeOutskirtzAngle((Number(fx.mirrorAngle) || 0) + (Number(fx.barrelAngle) || 0));
    return gameAngle > 95 && gameAngle < 265;
  }

  function outskirtzInputLane(lane, t, fx) {
    const raw = Number(lane);
    if (!Number.isFinite(raw)) {
      return lane;
    }
    return outskirtzDisplayLane(raw, t, fx);
  }

  window.outskirtzCameraUpsideDown = outskirtzCameraUpsideDown;
  window.mapGameplayLaneForCurrentView = function(lane, t) {
    if (isOutskirtzCurrentSong()) {
      return outskirtzInputLane(lane, t);
    }
    return typeof previousGameplayLaneMapper === "function" ? previousGameplayLaneMapper(lane, t) : lane;
  };

  function ensureFxCanvas() {
    if (!out.fxCanvas) {
      out.fxCanvas = document.createElement("canvas");
      out.fxCtx = out.fxCanvas.getContext("2d");
      out.workingCanvas = document.createElement("canvas");
      out.workingCtx = out.workingCanvas.getContext("2d");
    }
    if (out.fxCanvas.width !== canvas.width || out.fxCanvas.height !== canvas.height) {
      out.fxCanvas.width = canvas.width;
      out.fxCanvas.height = canvas.height;
      out.workingCanvas.width = canvas.width;
      out.workingCanvas.height = canvas.height;
    }
  }

  function copyCanvasTo(workCtx = out.workingCtx) {
    workCtx.clearRect(0, 0, canvas.width, canvas.height);
    workCtx.drawImage(canvas, 0, 0, canvas.width, canvas.height);
  }

  function warmOutskirtzFallbackCanvases() {
    ensureFxCanvas();
    const w = Math.max(1, canvas.width || 1);
    const h = Math.max(1, canvas.height || 1);
    const workCtx = out.workingCtx;
    const fxCtx = out.fxCtx;
    workCtx.save();
    workCtx.setTransform(1, 0, 0, 1, 0, 0);
    workCtx.globalCompositeOperation = "source-over";
    workCtx.globalAlpha = 1;
    workCtx.filter = "none";
    workCtx.fillStyle = "#050206";
    workCtx.fillRect(0, 0, w, h);
    workCtx.fillStyle = "#251018";
    workCtx.fillRect(w * 0.08, h * 0.12, w * 0.84, h * 0.76);
    workCtx.fillStyle = "#efe6ff";
    workCtx.fillRect(w * 0.42, h * 0.34, w * 0.16, h * 0.3);
    workCtx.restore();

    fxCtx.save();
    fxCtx.setTransform(1, 0, 0, 1, 0, 0);
    fxCtx.globalCompositeOperation = "source-over";
    fxCtx.globalAlpha = 1;
    fxCtx.clearRect(0, 0, w, h);
    fxCtx.filter = "grayscale(1) hue-rotate(180deg) saturate(0.8)";
    fxCtx.drawImage(out.workingCanvas, 0, 0, w, h);
    fxCtx.filter = "none";
    fxCtx.clearRect(0, 0, w, h);
    fxCtx.restore();

    fxCtx.save();
    fxCtx.setTransform(1, 0, 0, 1, 0, 0);
    fxCtx.globalCompositeOperation = "screen";
    fxCtx.globalAlpha = 0.75;
    fxCtx.filter = "blur(25px) brightness(1.48)";
    fxCtx.drawImage(out.workingCanvas, -10, -10, w + 20, h + 20);
    fxCtx.filter = "none";
    fxCtx.clearRect(0, 0, w, h);
    fxCtx.restore();
  }

  function warmOutskirtzShaderSamples(source) {
    const webgl = window.FNF_WEBGL;
    if (!webgl?.warmOutskirtzPostStack || window.PERFORMANCE_MODE || window.REDUCE_MOTION) return;
    const samples = [0, 7.2, 8.7, 9.15, 9.6, 10.95, 30, 60].map(time => ({ time, ...fxAt(time) }));
    for (const sample of samples) {
      webgl.warmOutskirtzPostStack(source || null, sample);
    }
  }

  function warmOutskirtzImageRasterCache() {
    if (!assetsReady()) return false;
    ensureFxCanvas();
    const w = Math.max(1, canvas.width || 1);
    const h = Math.max(1, canvas.height || 1);
    const workCtx = out.workingCtx;
    workCtx.save();
    workCtx.setTransform(1, 0, 0, 1, 0, 0);
    workCtx.globalCompositeOperation = "source-over";
    workCtx.globalAlpha = 1;
    workCtx.filter = "none";
    workCtx.clearRect(0, 0, w, h);
    ["ground", "overlay", "alex", "bf", "notes"].forEach(key => {
      const image = out.images[key];
      if (!imageReady(image)) return;
      try {
        workCtx.drawImage(image, 0, 0, image.naturalWidth, image.naturalHeight, 0, 0, w, h);
      } catch {}
    });
    workCtx.clearRect(0, 0, w, h);
    workCtx.restore();
    out.rasterWarmed = true;
    return true;
  }

  function warmOutskirtzEffects(force = false) {
    initAssets();
    decodeOutskirtzImages();
    if (!force && out.warmWidth === canvas.width && out.warmHeight === canvas.height && out.rasterWarmed) return;
    warmOutskirtzFallbackCanvases();
    warmOutskirtzShaderSamples();
    warmOutskirtzImageRasterCache();
    if (window.location?.protocol === "file:") {
      window.FNF_WEBGL?.blockSourceUploads?.("file:// canvas source upload is blocked; using warmed Canvas2D fallback");
    }
    out.warmWidth = canvas.width;
    out.warmHeight = canvas.height;
  }

  function warmOutskirtzLiveCanvasUpload() {
    if (window.PERFORMANCE_MODE || window.REDUCE_MOTION || window.location?.protocol === "file:") return;
    if (out.liveWarmWidth === canvas.width && out.liveWarmHeight === canvas.height) return;
    const webgl = window.FNF_WEBGL;
    if (!webgl?.drawOutskirtzPostStack || webgl.status?.().sourceUploadBlocked) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.filter = "none";
    ctx.fillStyle = "#060205";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (assetsReady()) drawOutskirtzStage(0);
    warmOutskirtzShaderSamples(canvas);
    ctx.restore();
    out.liveWarmWidth = canvas.width;
    out.liveWarmHeight = canvas.height;
  }

  function scheduleOutskirtzWarmup() {
    if (out.warmScheduled) return;
    out.warmScheduled = true;
    let ran = false;
    const run = () => {
      if (ran) return;
      ran = true;
      out.warmScheduled = false;
      warmOutskirtzEffects();
    };
    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(run, { timeout: 1200 });
      setTimeout(run, 650);
    } else {
      setTimeout(run, 120);
    }
  }

  function applyChromatic(fx) {
    const amount = Math.min(18, Math.abs(fx.chrom) * 900 + Math.abs(fx.diStrength) * 360);
    if (amount <= 0.25) return;
    ensureFxCanvas();
    copyCanvasTo(out.workingCtx);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 0.34;
    ctx.filter = "none";
    ctx.drawImage(out.workingCanvas, amount, 0, canvas.width, canvas.height);
    ctx.globalAlpha = 0.3;
    ctx.drawImage(out.workingCanvas, -amount * 0.72, 0, canvas.width, canvas.height);
    ctx.restore();
  }

  function applyDirectionalBlur(fx) {
    const strength = Math.min(12, Math.abs(fx.diStrength) * 420);
    if (strength <= 0.4 || window.PERFORMANCE_MODE) return;
    ensureFxCanvas();
    copyCanvasTo(out.workingCtx);
    const radians = (fx.diAngle || 0) * Math.PI / 180;
    const dx = Math.cos(radians) * strength;
    const dy = Math.sin(radians) * strength;
    ctx.save();
    ctx.globalAlpha = 0.16;
    for (let i = 1; i <= 4; i++) {
      ctx.drawImage(out.workingCanvas, dx * i * 0.38, dy * i * 0.38, canvas.width, canvas.height);
      ctx.drawImage(out.workingCanvas, -dx * i * 0.25, -dy * i * 0.25, canvas.width, canvas.height);
    }
    ctx.restore();
  }

  function applyToneAndBloom(fx) {
    ensureFxCanvas();
    const grey = clamp01(fx.grey);
    const hue = Number(fx.hue || 0) * 360;
    if (grey > 0.001 || Math.abs(hue) > 0.1 || fx.badApple) {
      copyCanvasTo(out.workingCtx);
      ctx.save();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.filter = fx.badApple
        ? "grayscale(1) contrast(2.4) brightness(0.72)"
        : `grayscale(${grey}) hue-rotate(${hue.toFixed(2)}deg) saturate(${Math.max(0.1, 1 - grey * 0.3).toFixed(3)})`;
      ctx.drawImage(out.workingCanvas, 0, 0, canvas.width, canvas.height);
      ctx.restore();
    }
    const bloom = Math.max(0, Number(fx.bloomContrast || 1) - 1);
    if (bloom > 0.02 && !window.PERFORMANCE_MODE) {
      copyCanvasTo(out.workingCtx);
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      ctx.globalAlpha = Math.min(0.75, bloom * 0.22);
      ctx.filter = `blur(${Math.min(30, 5 + bloom * 5).toFixed(1)}px) brightness(${(1 + bloom * 0.16).toFixed(2)})`;
      ctx.drawImage(out.workingCanvas, -10, -10, canvas.width + 20, canvas.height + 20);
      ctx.restore();
    }
  }

  function applyBarsAndVignette(fx, t) {
    const bars = Math.max(Math.abs(fx.fishbarsEffect), Math.abs(fx.fishbarsEffect2));
    if (bars > 0.01) {
      ctx.save();
      ctx.globalAlpha = Math.min(0.95, bars * 2.6);
      ctx.fillStyle = "#05020a";
      const h = Math.min(canvas.height * 0.48, bars * canvas.height);
      const xW = Math.min(canvas.width * 0.5, Math.abs(fx.fishbarsEffect2) * canvas.width);
      ctx.translate(0, Math.sin(t * 5 + fx.fishbarsAngle1) * 4 * Math.abs(fx.fishbarsPower));
      ctx.fillRect(0, 0, canvas.width, h);
      ctx.fillRect(0, canvas.height - h, canvas.width, h);
      if (xW > 1) {
        ctx.fillRect(0, 0, xW, canvas.height);
        ctx.fillRect(canvas.width - xW, 0, xW, canvas.height);
      }
      ctx.restore();
    }
    ctx.save();
    const cx = canvas.width * 0.5;
    const cy = canvas.height * 0.5;
    const strength = Math.max(0, Number(fx.vigStrength || 0));
    const radius = canvas.width * clampValue(Number(fx.vigSize || 0) / 5, 0.15, 12);
    const grad = ctx.createRadialGradient(cx, cy, radius * 0.05, cx, cy, radius);
    grad.addColorStop(0, "rgba(0,0,0,0)");
    grad.addColorStop(1, `rgba(0,0,0,${Math.min(0.82, strength * 0.22).toFixed(3)})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
  }

  function applyFlash(fx) {
    const flash = Math.max(0, fx.flash, fx.fadeWhite);
    if (flash <= 0.002) return;
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = Math.min(1, flash);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
  }

  function applyOutskirtzPostFx(t) {
    if (state.selectedSong !== "outskirtz") return;
    const fx = fxAt(t);
    const useCameraFx = !window.PERFORMANCE_MODE && !window.REDUCE_MOTION;
    if (useCameraFx) {
      const usedWebGl = window.FNF_WEBGL?.drawOutskirtzPostStack?.(canvas, {
        time: t,
        mirrorZoom: fx.mirrorZoom,
        mirrorAngle: fx.mirrorAngle,
        mirrorX: fx.mirrorX,
        mirrorY: fx.mirrorY,
        barrelZoom: fx.barrelZoom,
        barrel: fx.barrel,
        barrelAngle: fx.barrelAngle,
        barrelX: fx.barrelX,
        barrelY: fx.barrelY,
        fish: fx.fish,
        fishbarsEffect: fx.fishbarsEffect,
        fishbarsEffect2: fx.fishbarsEffect2,
        fishbarsAngle1: fx.fishbarsAngle1,
        fishbarsAngle2: fx.fishbarsAngle2,
        fishbarsPower: fx.fishbarsPower,
        chrom: fx.chrom,
        goodChrom: fx.goodChrom,
        grey: fx.grey,
        hue: fx.hue,
        blur: fx.blur,
        blur2: fx.blur2,
        bloomContrast: fx.bloomContrast,
        vigStrength: fx.vigStrength,
        vigSize: fx.vigSize,
        vigR: fx.vigR,
        vigG: fx.vigG,
        vigB: fx.vigB,
        diAngle: fx.diAngle,
        diStrength: fx.diStrength,
        badApple: fx.badApple
      });
      if (usedWebGl) {
        applyFlash(fx);
        return;
      }
      const cameraWarp = (fx.barrel || 0) * 0.012 + (fx.fish || 0) * 0.12 + (fx.barrelZoom - 1) * 0.04;
      const usedGenericWebGl = window.FNF_WEBGL?.drawCameraPass(canvas, {
        zoom: clampValue(fx.mirrorZoom * fx.barrelZoom, 0.35, 2.4),
        angle: fx.mirrorAngle + fx.barrelAngle,
        offsetX: clampValue((fx.mirrorX + fx.barrelX) * 0.035, -0.5, 0.5),
        offsetY: clampValue((fx.mirrorY + fx.barrelY) * 0.035, -0.5, 0.5),
        warp: clampValue(cameraWarp, -1.1, 1.1),
        mirror: clampValue(Math.abs(fx.mirrorZoom - 1) + Math.abs(fx.fish) + Math.abs(fx.barrel) * 0.02, 0, 1.4)
      });
      if (!usedGenericWebGl && Math.abs(fx.mirrorAngle) > 0.02) {
        ensureFxCanvas();
        copyCanvasTo(out.workingCtx);
        ctx.save();
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.translate(canvas.width * 0.5, canvas.height * 0.5);
        ctx.rotate(fx.mirrorAngle * Math.PI / 180);
        ctx.scale(fx.mirrorZoom, fx.mirrorZoom);
        ctx.drawImage(out.workingCanvas, -canvas.width * 0.5, -canvas.height * 0.5, canvas.width, canvas.height);
        ctx.restore();
      }
    }
    applyDirectionalBlur(fx);
    applyChromatic(fx);
    applyToneAndBloom(fx);
    applyBarsAndVignette(fx, t);
    applyFlash(fx);
  }

  function withHudTransform(t, draw) {
    const fx = fxAt(t);
    ctx.save();
    ctx.globalAlpha = clampValue(fx.hudAlpha, 0, 1);
    draw(fx);
    ctx.restore();
  }

  isImportedSong = function(song) {
    return !!song && (song.chartSource === "outskirtz" || baseIsImportedSong(song));
  };

  makeChart = function(song) {
    if (song?.chartSource === "outskirtz") return cloneChart();
    return baseMakeChart(song);
  };

  songTime = function() {
    if (state.currentSong?.chartSource === "outskirtz" && state.audio.outskirtzInst) return state.audio.outskirtzInst.currentTime;
    return baseSongTime();
  };

  songEndTime = function() {
    if (state.currentSong?.chartSource === "outskirtz") {
      const duration = Number(state.audio.outskirtzInst?.duration || 0);
      return Math.max(Number(OUT.chart.totalTime || 80), Number.isFinite(duration) ? duration : 0);
    }
    return baseSongEndTime();
  };

  stopExternalAudio = function() {
    const leakedInst = state.audio.inst === state.audio.outskirtzInst;
    baseStopExternalAudio();
    if (state.audio.outskirtzInst) {
      try {
        state.audio.outskirtzInst.pause();
        state.audio.outskirtzInst.currentTime = 0;
      } catch {}
    }
    if (leakedInst) state.audio.inst = null;
  };

  startSong = function(id = state.selectedSong, options = {}) {
    const song = SONGS[id] || state.currentSong;
    if (song?.chartSource !== "outskirtz") return baseStartSong(id, options);
    const audioContext = ensureAudio();
    if (audioContext.state === "suspended") audioContext.resume();
    stopExternalAudio();
    initAssets();
    warmOutskirtzEffects();
    ensureOutskirtzAudio();
    if (state.startTimer) clearTimeout(state.startTimer);
    state.startTimer = null;
    if (state.endTimer) clearTimeout(state.endTimer);
    state.endTimer = null;
    const inst = state.audio.outskirtzInst;
    const onlineStart = Number(options.startAt);
    const isOnlineStart = Number.isFinite(onlineStart);
    const skipReload = !!options.skipReload;
    state.audio.inst = inst;
    state.selectedSong = id;
    state.currentSong = SONGS[id];
    state.mode = options.forceMode || (isOnlineStart ? "online" : (ui.versusToggle?.checked ? "versus" : "solo"));
    ui.modeLabel.textContent = state.mode === "versus" ? "1v1 Versus" : state.mode === "online" ? "Online Match" : "Solo Battle";
    rebuildKeyMap();
    state.chart = makeChart(state.currentSong);
    state.chart.notes = state.chart.notes.map((note, index) => ({ ...note, id: note.id == null ? index : note.id }));
    resetStats();
    state.health = 0.65;
    state.poses.alex = state.poses.alex || { lane: 1, time: -10, kind: "hit" };
    state.poses.outskirtzBf = state.poses.outskirtzBf || { lane: 2, time: -10, kind: "hit" };
    resetCamera();
    warmOutskirtzLiveCanvasUpload();
    inst.currentTime = 0;
    state.songStart = 0;
    state.nextStep = 0;
    state.nextStepTime = 0;
    state.playing = true;
    if (state.mode === "online") {
      const now = typeof serverClockNow === "function" ? serverClockNow() : Date.now();
      state.network.matchStartAt = isOnlineStart ? onlineStart : Number(options.startAt || (now + 8000));
      state.network.pendingStartAt = state.network.matchStartAt;
      state.network.lastTrackSync = 0;
      state.network.ready = { host: false, guest: false };
      inst.pause();
      if (!skipReload) {
        try { inst.load(); } catch {}
      }
    } else {
      inst.play().catch(() => {});
    }
    state.feeds.player.time = -10;
    state.feeds.opp.time = -10;
    Object.values(state.poses).forEach(poseInfo => { poseInfo.time = -10; poseInfo.kind = "hit"; });
    state.receptorFx.forEach(fxInfo => fxInfo.time = -10);
    state.perseverance = { canDodge: false, prompt: false, dodging: false, dodged: false, resolved: false, dodgeStart: -10, flashTime: -10, gfAlpha: 0 };
    state.camera = { zoom: 1, focusX: canvas.width / 2, focusY: canvas.height * 0.5, sideTime: 0, lastSide: "both", highwayX: 0, highwayY: 0 };
    ui.p1Box.style.display = state.mode === "versus" || state.mode === "online" ? "block" : "none";
    ui.songTitle.textContent = state.currentSong.title;
    ui.songSub.textContent = state.currentSong.subtitle;
    ui.statusText.textContent = state.mode === "online" ? "Match syncing" : "Outskirtz";
    ui.statusSub.textContent = state.mode === "online"
      ? "Both players finished loading. The server is holding a synced countdown before audio starts."
      : "Original Outskirtz chart, arena stage, Alex/BF Wii sprites, source arrows, drain, and shader events are active.";
    ui.timer.textContent = `0:00 / ${formatTime(songEndTime())}`;
    ui.menu.classList.remove("show");
    ui.settings.classList.remove("show");
    ui.resultsWrap.classList.remove("show");
    if (state.mode === "online") {
      if (typeof syncModeUI === "function") syncModeUI();
      if (typeof syncOnlinePlayback === "function") syncOnlinePlayback(true);
    }
  };

  finish = function(failed = false) {
    if (state.currentSong?.chartSource === "outskirtz" && state.audio.outskirtzInst) {
      try { state.audio.outskirtzInst.pause(); } catch {}
    }
    return baseFinish(failed);
  };

  refreshHUD = function(t) {
    baseRefreshHUD(t);
    if (state.selectedSong !== "outskirtz") return;
    ui.timer.textContent = `${formatTime(t)} / ${formatTime(songEndTime())}`;
    const section = currentTimelineSection(t);
    ui.statusText.textContent = section?.turn === "player" ? "BF Wii" : section?.turn === "both" ? "Duet" : "Alex";
    ui.statusSub.textContent = "Outskritz source stage, chart events, noteskin, camera movement, and health drain are running.";
  };

  updateCamera = function(t, dt) {
    baseUpdateCamera(t, dt);
    if (state.selectedSong !== "outskirtz") return;
    updateOutskirtzCamera(t, dt);
  };

  judge = function(side, kind, lane, char) {
    baseJudge(side, kind, lane, char);
    if (state.selectedSong === "outskirtz" && side === "opp" && kind !== "miss" && state.health > 0.3) {
      state.health = clampValue(state.health - 0.023, 0, 1);
    }
  };

  handleMisses = function(t) {
    if (state.selectedSong !== "outskirtz") return baseHandleMisses(t);
    const before = new Set((state.chart?.notes || []).filter(note => note.side === "opp" && note.judged).map(note => note.id));
    baseHandleMisses(t);
    for (const note of state.chart?.notes || []) {
      if (note.side !== "opp" || !note.judged || before.has(note.id) || !note.hit) continue;
      if (state.health > 0.3) state.health = clampValue(state.health - 0.023, 0, 1);
    }
  };

  bg = function(song, t) {
    if (state.selectedSong === "outskirtz") {
      ctx.fillStyle = "#060205";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      return;
    }
    return baseBg(song, t);
  };

  stage = function(t) {
    if (state.selectedSong === "outskirtz") return drawOutskirtzStage(t);
    return baseStage(t);
  };

  receptors = function(t) {
    if (state.selectedSong !== "outskirtz") return baseReceptors(t);
    if (!assetsReady()) return;
    withHudTransform(t, fx => {
      const y = outskirtzReceptorY();
      for (let lane = 0; lane < 8; lane++) {
        const x = outskirtzLaneX(lane, t, fx);
        drawOutskirtzReceptor(lane, x, y, t, (lane < 4 ? 0.92 : 1) * fx.hudAlpha);
        ctx.strokeStyle = "rgba(255,255,255,0.04)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x, y + (outskirtzScrollDirection() > 0 ? 28 : -28));
        ctx.lineTo(x, outskirtzScrollDirection() > 0 ? canvas.height - 118 : 96);
        ctx.stroke();
      }
    });
  };

  notes = function(t) {
    if (state.selectedSong !== "outskirtz") return baseNotes(t);
    if (!assetsReady() || !state.chart) return;
    withHudTransform(t, fx => {
      for (const note of state.chart.notes) {
        if (note.played && note.hit && (!isHoldNote(note) || note.holdDone)) continue;
        if (note.judged && note.side !== "opp" && (!isHoldNote(note) || note.holdDone || !note.hit)) continue;
        const x = outskirtzLaneX(note.lane, t, fx);
        const y = outskirtzNoteY(note.time, t);
        const tailY = outskirtzNoteY(holdEndTime(note), t);
        if ((y < -140 && tailY < -140) || (y > canvas.height + 140 && tailY > canvas.height + 140)) continue;
        if ((outskirtzScrollDirection() > 0 && y > canvas.height + 140 && tailY > canvas.height + 140) || (outskirtzScrollDirection() < 0 && y < -140 && tailY < -140)) break;
        const diff = note.time - t;
        const scale = clampValue(1 - Math.pow(Math.abs(diff), 0.7) * 0.36, 0.78, 1.08);
        const alpha = (note.side === "opp" ? 0.84 : 1) * fx.hudAlpha;
        if (isHoldNote(note)) drawOutskirtzSustain(note, x, note.hit ? outskirtzReceptorY() : y, tailY, alpha * (note.hit ? 0.94 : 1));
        if (note.hit && isHoldNote(note) && t > note.time) continue;
        drawOutskirtzNote(note.lane, x, y, scale, alpha);
      }
    });
  };

  applyDustinBloom = function(t) {
    if (state.selectedSong === "outskirtz") {
      applyOutskirtzPostFx(t);
      return;
    }
    return baseApplyDustinBloom(t);
  };

  if (typeof syncOnlinePlayback === "function" && typeof expectedOnlineSongTime === "function") {
    const baseSyncOnlinePlayback = syncOnlinePlayback;
    syncOnlinePlayback = function(force = false) {
      const targetTime = expectedOnlineSongTime();
      const base = baseSyncOnlinePlayback(force);
      if (targetTime == null || state.currentSong?.chartSource !== "outskirtz") return base;
      ensureOutskirtzAudio();
      const now = typeof serverClockNow === "function" ? serverClockNow() : Date.now();
      const shouldPlay = now + 40 >= (state.network?.matchStartAt || 0);
      const track = state.audio.outskirtzInst;
      if (track) {
        if (track.readyState === 0) {
          try { track.load(); } catch {}
        }
        const duration = Number.isFinite(track.duration) && track.duration > 0 ? track.duration : null;
        const desired = Math.max(0, duration == null ? targetTime : Math.min(targetTime, Math.max(0, duration - 0.05)));
        const tolerance = shouldPlay ? 0.12 : 0.03;
        if (Math.abs((track.currentTime || 0) - desired) > tolerance) {
          try { track.currentTime = desired; } catch {}
        }
        if (shouldPlay) {
          if (track.paused && (duration == null || desired < duration - 0.05)) track.play().catch(() => {});
        } else if (!track.paused) track.pause();
      }
      return targetTime;
    };
  }

  if (typeof importedTracksForSong === "function") {
    const baseImportedTracksForSong = importedTracksForSong;
    importedTracksForSong = function(songId = state.selectedSong) {
      if (SONGS[songId]?.chartSource === "outskirtz") {
        ensureOutskirtzAudio();
        return [state.audio.outskirtzInst];
      }
      return baseImportedTracksForSong(songId);
    };
  }

  if (typeof preloadSongForMatch === "function" && typeof waitForTrackReady === "function") {
    const basePreloadSongForMatch = preloadSongForMatch;
    preloadSongForMatch = async function(songId, matchId) {
      if (SONGS[songId]?.chartSource !== "outskirtz") return basePreloadSongForMatch(songId, matchId);
      state.network.preparing = true;
      state.network.prepareMatchId = matchId;
      state.network.preparedSongId = "";
      state.network.loadingStatus = "Loading song files on your side.";
      if (typeof updateOnlinePanel === "function") updateOnlinePanel();
      const tracks = window.prepareOutskirtzOnlineStart();
      await Promise.all(tracks.filter(Boolean).map(track => waitForTrackReady(track)));
      if (state.network.prepareMatchId !== matchId) return false;
      state.network.preparedSongId = songId;
      state.network.loadingStatus = "Loaded on your side. Waiting for the other player.";
      if (state.network.role === "host") state.network.loaded.host = true;
      if (state.network.role === "guest") state.network.loaded.guest = true;
      if (typeof updateOnlinePanel === "function") updateOnlinePanel();
      if (state.network.socket && state.network.roomId) state.network.socket.emit("game:loaded", { matchId, songId });
      return true;
    };
  }

  state.poses.alex = state.poses.alex || { lane: 1, time: -10, kind: "hit" };
  state.poses.outskirtzBf = state.poses.outskirtzBf || { lane: 2, time: -10, kind: "hit" };
  initAssets();
  scheduleOutskirtzWarmup();
  renderSongs();
})();

(() => {
  try {
    if (!window.PERSEVERANCE_DATA) return;

    const SOURCE_W = 1280;
    const SOURCE_H = 720;
    const BASE_BPM = 120;
    const STAGE = {
      zoom: 0.6,
      playerZoom: 0.65,
      back: { key: "bgA", x: -60, y: 0, scale: 1, scrollX: 0.7, scrollY: 1 },
      frontBack: { key: "bgB", x: -40, y: 0, scale: 1, scrollX: 0.9, scrollY: 1 },
      mid: { key: "bgMid", x: 0, y: 0, scale: 1, scrollX: 1, scrollY: 1 },
      foreground: { key: "bgFore", x: 15, y: -104, scale: 0.82, scrollX: 0.8, scrollY: 0.8, flixelScaleOrigin: true },
      pillars: { key: "pillars", x: 1950, y: 900, scale: 7, scrollX: 1, scrollY: 1 }
    };

    function clamp01(v) { return Math.max(0, Math.min(1, v)); }
    function lerp(a, b, t) { return a + (b - a) * clamp01(t); }
    function num(v, fallback = 0) {
      const n = Number(v);
      return Number.isFinite(n) ? n : fallback;
    }
    function sourceEvents(name) {
      const source = window.PERSEVERANCE_DATA?.events || window.PERSEVERANCE_SOURCE_EVENTS || [];
      const events = Array.isArray(source) ? source : (Array.isArray(window.PERSEVERANCE_SOURCE_EVENTS) ? window.PERSEVERANCE_SOURCE_EVENTS : []);
      return name ? events.filter(e => e.name === name) : events;
    }
    function baseEase(name, p) {
      const t = clamp01(p);
      const key = String(name || "linear").toLowerCase();
      if (key.includes("smoother")) return t * t * t * (t * (t * 6 - 15) + 10);
      if (key.includes("smooth")) return t * t * (3 - 2 * t);
      if (key.includes("quint")) return Math.pow(t, 5);
      if (key.includes("quart")) return Math.pow(t, 4);
      if (key.includes("cube")) return t * t * t;
      if (key.includes("quad")) return t * t;
      if (key.includes("circ")) return 1 - Math.sqrt(Math.max(0, 1 - t * t));
      if (key.includes("sine")) return 1 - Math.cos((t * Math.PI) / 2);
      return t;
    }
    function sourceEase(name, mode, p) {
      const dir = String(mode || "In").toLowerCase();
      const t = clamp01(p);
      if (dir.includes("inout")) {
        if (t < 0.5) return baseEase(name, t * 2) / 2;
        return 1 - baseEase(name, (1 - t) * 2) / 2;
      }
      if (dir.includes("out")) return 1 - baseEase(name, 1 - t);
      return baseEase(name, t);
    }

    let bpmSegments = null;
    function buildBpmSegments() {
      if (bpmSegments) return bpmSegments;
      const changes = sourceEvents("BPM Change")
        .map(e => ({ time: num(e.time), bpm: num(e.params?.[0], BASE_BPM) }))
        .sort((a, b) => a.time - b.time);
      let time = 0;
      let step = 0;
      let bpm = BASE_BPM;
      bpmSegments = [{ time, step, bpm }];
      for (const change of changes) {
        if (change.time < time) continue;
        step += (change.time - time) / (60 / bpm / 4);
        time = change.time;
        bpm = change.bpm || bpm;
        bpmSegments.push({ time, step, bpm });
      }
      return bpmSegments;
    }
    function bpmAt(time) {
      let bpm = BASE_BPM;
      for (const seg of buildBpmSegments()) {
        if (seg.time > time) break;
        bpm = seg.bpm;
      }
      return bpm || BASE_BPM;
    }
    function secondsForSteps(time, steps) {
      return num(steps) * 60 / Math.max(1, bpmAt(time)) / 4;
    }
    function timeForStep(targetStep) {
      const segments = buildBpmSegments();
      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        const next = segments[i + 1];
        if (!next || targetStep < next.step) {
          return seg.time + (targetStep - seg.step) * (60 / Math.max(1, seg.bpm) / 4);
        }
      }
      const last = segments[segments.length - 1];
      return last.time + (targetStep - last.step) * (60 / Math.max(1, last.bpm) / 4);
    }

    function eventTween(name, time, def, getValue, durationIndex, filter) {
      let current = def;
      for (const event of sourceEvents(name).sort((a, b) => a.time - b.time)) {
        if (filter && !filter(event)) continue;
        if (event.time > time) break;
        const target = getValue(event);
        const duration = secondsForSteps(event.time, event.params?.[durationIndex] || 0);
        if (duration > 0 && time < event.time + duration) {
          const ease = sourceEase(event.params?.[durationIndex + 1], event.params?.[durationIndex + 2], (time - event.time) / duration);
          return lerp(current, target, ease);
        }
        current = target;
      }
      return current;
    }

    function sourceZoomValue(time, key) {
      const base = key === "default" ? STAGE.zoom : key === "bf" ? STAGE.playerZoom : -1;
      const flagIndex = key === "default" ? 0 : key === "bf" ? 1 : key === "dad" ? 2 : 3;
      let current = base;
      let active = null;
      const advance = toTime => {
        if (!active) return;
        if (toTime < active.start + active.duration) {
          const ease = sourceEase(active.ease, active.mode, (toTime - active.start) / Math.max(0.001, active.duration));
          current = lerp(active.from, active.to, ease);
        } else {
          current = active.to;
          active = null;
        }
      };
      for (const event of sourceEvents("Change Stage Zoom").sort((a, b) => a.time - b.time)) {
        const p = event.params || [];
        if (!p[flagIndex]) continue;
        if (event.time > time) break;
        advance(event.time);
        const target = num(p[5], current);
        if (key !== "default" && current === -1 && target !== -1) current = sourceZoomValue(event.time, "default");
        const duration = secondsForSteps(event.time, p[6] || 0);
        if (p[4] && duration > 0) {
          active = { start: event.time, duration, from: current, to: target, ease: p[7], mode: p[8] };
        } else {
          current = target;
          active = null;
        }
      }
      advance(time);
      return current;
    }
    function sourceStageZoom(time, side) {
      const defaultZoom = sourceZoomValue(time, "default");
      const sideZoom = side === "player"
        ? sourceZoomValue(time, "bf")
        : side === "gf"
          ? sourceZoomValue(time, "gf")
          : sourceZoomValue(time, "dad");
      return sideZoom === -1 ? defaultZoom : sideZoom;
    }
    function sourceCameraSide(time) {
      let side = "opp";
      for (const event of sourceEvents("Camera Movement").sort((a, b) => a.time - b.time)) {
        if (event.time > time) break;
        const target = num(event.params?.[0]);
        side = target === 1 ? "player" : target === 2 ? "gf" : "opp";
      }
      return side;
    }
    function sourceCharacterCameraOffset(index, time) {
      let current = { x: 0, y: 0 };
      let active = null;
      const advance = toTime => {
        if (!active) return;
        if (toTime < active.start + active.duration) {
          const ease = sourceEase(active.ease, active.mode, (toTime - active.start) / Math.max(0.001, active.duration));
          current = {
            x: lerp(active.from.x, active.to.x, ease),
            y: lerp(active.from.y, active.to.y, ease)
          };
        } else {
          current = active.to;
          active = null;
        }
      };
      for (const event of sourceEvents("Change Character Offset").sort((a, b) => a.time - b.time)) {
        const p = event.params || [];
        if (num(p[1], -1) !== index) continue;
        if (event.time > time) break;
        advance(event.time);
        const target = { x: current.x + num(p[2]), y: current.y + num(p[3]) };
        const duration = secondsForSteps(event.time, p[4] || 0);
        if (p[0] && duration > 0) {
          active = { start: event.time, duration, from: { ...current }, to: target, ease: p[5], mode: p[6] };
        } else {
          current = target;
          active = null;
        }
      }
      advance(time);
      return current;
    }

    function ensureSourceImages() {
      const images = perseveranceSpriteState?.images;
      const fore = window.PERSEVERANCE_DATA?.stage?.images?.fore || "assets/perseverance-bg-fore.png";
      if (images && fore && !images.bgFore) {
        const img = new Image();
        img.src = fore;
        images.bgFore = img;
      }
    }
    const originalInitPerseveranceSprites = typeof initPerseveranceSprites === "function" ? initPerseveranceSprites : null;
    if (originalInitPerseveranceSprites) {
      initPerseveranceSprites = function() {
        const result = originalInitPerseveranceSprites.apply(this, arguments);
        ensureSourceImages();
        return result;
      };
      ensureSourceImages();
    }
    function imageReady(image) {
      return !!(image && image.complete && image.naturalWidth);
    }

    const originalPlayerDirAnim = typeof perseverancePlayerDirAnim === "function" ? perseverancePlayerDirAnim : null;
    const originalPlayerMissAnim = typeof perseverancePlayerMissAnim === "function" ? perseverancePlayerMissAnim : null;
    perseverancePlayerDirAnim = function(dir) { return perseveranceDirAnim(dir); };
    perseverancePlayerMissAnim = function(dir) { return perseveranceMissAnim(dir); };

    function sourceCharacterName(index, time) {
      let name = index === 0 ? "sans_perseverance" : index === 1 ? "bf_frisk" : "gf";
      for (const event of sourceEvents("Change Character").sort((a, b) => a.time - b.time)) {
        if (event.time > time) break;
        if (num(event.params?.[0], -1) === index) name = String(event.params?.[1] || name);
      }
      return name;
    }
    function sourceAnimSuffix(index, time) {
      let suffix = "";
      for (const event of sourceEvents("Change Char Anim Suffix").sort((a, b) => a.time - b.time)) {
        if (event.time > time) break;
        if (num(event.params?.[0], -1) === index) suffix = String(event.params?.[1] || "");
      }
      return suffix;
    }
    function sourceForcedAnimation(index, time) {
      let current = null;
      const phaseEvents = sourceEvents().filter(event =>
        event.name === "Play Animation" ||
        event.name === "Change Character" ||
        event.name === "Change Char Anim Suffix"
      ).sort((a, b) => a.time - b.time);
      for (const event of phaseEvents) {
        if (event.time > time) break;
        if (num(event.params?.[0], -1) !== index) continue;
        if (event.name === "Play Animation") current = { name: String(event.params?.[1] || ""), start: event.time, forced: !!event.params?.[2] };
        else current = null;
      }
      return current;
    }

    const originalPerseveranceCharacter = perseveranceCharacter;
    perseveranceCharacter = function(kind, time) {
      if (kind !== "sans") {
        const data = originalPerseveranceCharacter(kind, time);
        if (kind === "boyfriend" && data) data.flipX = false;
        return data;
      }
      const characterName = sourceCharacterName(0, time);
      if (characterName === "sans_pixel") {
        const sprite = window.PERSEVERANCE_DATA.sprites.sansPixel;
        const pose = state.poses.sans;
        const held = perseveranceHeldNote("sans", perseveranceTime());
        const dir = sportingLaneKey((held ? held.lane : pose.lane) || 0);
        const age = performance.now() / 1000 - pose.time;
        const active = perseveranceAnimation(sprite, perseveranceDirAnim(dir));
        const idle = perseveranceAnimation(sprite, "idle");
        if (held && active) return { sprite, image: perseveranceSpriteState.images.sansPixel, anim: active, elapsed: Math.max(0, perseveranceTime() - held.time), loop: false, flipX: false, alpha: 1 };
        if (age >= 0 && active && age < sportingAnimDuration(active.frames, active.fps || 12, 0.18, 0.8)) return { sprite, image: perseveranceSpriteState.images.sansPixel, anim: active, elapsed: age, loop: false, flipX: false, alpha: 1 };
        return { sprite, image: perseveranceSpriteState.images.sansPixel, anim: idle, elapsed: time * 0.5, loop: true, flipX: false, alpha: 1 };
      }
      const sprite = window.PERSEVERANCE_DATA.sprites.sans;
      const pose = state.poses.sans;
      const held = perseveranceHeldNote("sans", perseveranceTime());
      const dir = sportingLaneKey((held ? held.lane : pose.lane) || 0);
      const age = performance.now() / 1000 - pose.time;
      const suffix = sourceAnimSuffix(0, time);
      const forced = sourceForcedAnimation(0, time);
      const activeName = perseveranceDirAnim(dir) + suffix;
      const active = perseveranceAnimation(sprite, activeName) || perseveranceAnimation(sprite, perseveranceDirAnim(dir));
      if (held && active) return { sprite, image: perseveranceSpriteState.images.sans, anim: active, elapsed: Math.max(0, perseveranceTime() - held.time), loop: false, flipX: false, alpha: 1 };
      if (age >= 0 && active && age < sportingAnimDuration(active.frames, active.fps || 24, 0.16, 0.7)) return { sprite, image: perseveranceSpriteState.images.sans, anim: active, elapsed: age, loop: false, flipX: false, alpha: 1 };
      if (forced?.name) {
        const intro = perseveranceAnimation(sprite, forced.name);
        const loop = perseveranceAnimation(sprite, forced.name + "-loop") || (forced.name === "eyedle" ? intro : null);
        const elapsed = Math.max(0, time - forced.start);
        const introLen = perseveranceExactAnimDuration(intro);
        if (intro && (forced.name === "eyedle" || elapsed < introLen || !loop)) {
          return { sprite, image: perseveranceSpriteState.images.sans, anim: intro, elapsed, loop: forced.name === "eyedle", flipX: false, alpha: 1 };
        }
        if (loop) return { sprite, image: perseveranceSpriteState.images.sans, anim: loop, elapsed: Math.max(0, elapsed - introLen), loop: true, flipX: false, alpha: 1 };
      }
      const idle = perseveranceAnimation(sprite, "idle" + suffix) || perseveranceAnimation(sprite, "idle");
      return { sprite, image: perseveranceSpriteState.images.sans, anim: idle, elapsed: time * 0.5, loop: true, flipX: false, alpha: 1 };
    };

    function currentFrameData(kind, time) {
      const data = perseveranceCharacter(kind, time);
      if (!data?.anim) return null;
      const frame = perseveranceAnimFrame(data.anim, data.elapsed, !!data.loop);
      return frame ? { data, frame } : null;
    }
    function stagePosition(kind, time) {
      const positions = window.PERSEVERANCE_DATA.stage.positions;
      if (kind === "boyfriend") {
        const p = positions.player;
        const base = window.PERSEVERANCE_DATA.sprites.boyfriend.baseOffset || [0, 0];
        return { x: num(p.x) + base[0], y: num(p.y) + base[1] };
      }
      if (kind === "gf") {
        const p = positions.gf;
        return {
          x: num(p.x) + Math.sin(time) * 24,
          y: num(p.y) + Math.sin(time * 2) * 6
        };
      }
      const p = positions.opponent;
      const sprite = window.PERSEVERANCE_DATA.sprites.sans;
      const base = sprite.baseOffset || [0, 0];
      return { x: num(p.x) + base[0], y: num(p.y) + base[1] };
    }
    function sourceCameraFrame(kind, time) {
      const data = perseveranceCharacter(kind, time);
      if (!data?.sprite) return null;
      const idleName = kind === "gf" ? "danceLeft" : "idle";
      const idle = perseveranceAnimation(data.sprite, idleName) || data.anim;
      const frame = idle?.frames?.[0] || data.anim?.frames?.[0] || null;
      return frame ? { data, frame } : null;
    }
    function characterBox(kind, time) {
      const current = sourceCameraFrame(kind, time);
      const pos = stagePosition(kind, time);
      if (!current) return { x: pos.x, y: pos.y, w: 1, h: 1 };
      const scale = current.data.sprite.scale || 1;
      return {
        x: pos.x,
        y: pos.y,
        w: (current.frame.fw || current.frame.w) * scale,
        h: (current.frame.fh || current.frame.h) * scale
      };
    }
    function sourceCameraFollowLerp(time) {
      const t = s => timeForStep(s);
      let follow = 0.007;
      if (time >= t(128)) follow = 0.02;
      if (time >= t(656)) follow = 0.035;
      if (time >= t(2528) && time < t(2536)) follow = 2;
      if (time >= t(2536)) follow = 0.04;
      for (const event of sourceEvents("Camera Speed").sort((a, b) => a.time - b.time)) {
        if (event.time > time) break;
        follow = num(event.params?.[0], follow);
      }
      return Math.max(0, follow);
    }
    function sourceCameraBlend(follow, dt) {
      const frameLerp = follow >= 1 ? 0.035 : Math.min(0.25, follow);
      return clamp01(1 - Math.pow(1 - frameLerp, dt * 60));
    }
    function sourceZoomBlend(dt) {
      return clamp01(1 - Math.pow(1 - 0.05, dt * 60));
    }
    function sourceCharacterBaseCameraOffset(kind, time) {
      if (kind === "sans") return sourceCharacterName(0, time) === "sans_pixel" ? { x: -310, y: 30 } : { x: 0, y: -50 };
      return { x: 0, y: 0 };
    }
    function sourceCameraEventOffset(side, time) {
      if (side === "player") return sourceCharacterCameraOffset(1, time);
      if (side === "gf") return sourceCharacterCameraOffset(2, time);
      return sourceCharacterCameraOffset(0, time);
    }
    function sourceCameraOffset(side, time) {
      const positions = window.PERSEVERANCE_DATA.stage.positions;
      const kind = side === "player" ? "boyfriend" : side === "gf" ? "gf" : "sans";
      const charBase = sourceCharacterBaseCameraOffset(kind, time);
      const eventOffset = sourceCameraEventOffset(side, time);
      if (side === "player") {
        const p = positions.player;
        return { x: num(p.camxoffset, -180) + charBase.x + eventOffset.x, y: num(p.camyoffset, -40) + charBase.y + eventOffset.y };
      }
      if (side === "gf") {
        const p = positions.gf;
        return { x: num(p.camxoffset, 0) + charBase.x + eventOffset.x, y: num(p.camyoffset, 0) + charBase.y + eventOffset.y };
      }
      const p = positions.opponent;
      return { x: num(p.camxoffset, 200) + charBase.x + eventOffset.x, y: num(p.camyoffset, 40) + charBase.y + eventOffset.y };
    }
    function sourceCamMoveOffset(time) {
      const t = s => timeForStep(s);
      if (time >= t(1000) && time < t(1040)) return 0;
      if (time >= t(1136) && time < t(1167)) return 0;
      return 15;
    }
    function sourceCurrentSingDir(side, time) {
      if (side === "gf") return null;
      const noteSide = side === "player" ? "player" : "opp";
      let best = null;
      const notes = state?.chart?.notes || window.PERSEVERANCE_DATA?.chart?.notes || [];
      for (const note of notes) {
        if (note.side !== noteSide) continue;
        if (note.time > time + 0.04) break;
        const end = note.time + Math.max(0.18, num(note.sLen, 0) + 0.14);
        if (time >= note.time - 0.025 && time <= end) best = note;
      }
      if (best) return sportingLaneKey(best.lane);
      const poseKey = side === "player" ? "player" : "sans";
      const pose = state?.poses?.[poseKey];
      const age = performance.now() / 1000 - (pose?.time || -99);
      return age >= 0 && age < 0.18 ? sportingLaneKey(pose.lane || 0) : null;
    }
    function sourceSingCameraOffset(side, time) {
      const dir = sourceCurrentSingDir(side, time);
      const move = sourceCamMoveOffset(time);
      if (!dir || move <= 0) return { x: 0, y: 0 };
      if (dir === "left") return { x: -move, y: 0 };
      if (dir === "right") return { x: move, y: 0 };
      if (dir === "up") return { x: 0, y: -move };
      return { x: 0, y: move };
    }
    function sourceCameraTarget(time) {
      const side = sourceCameraSide(time);
      const kind = side === "player" ? "boyfriend" : side === "gf" ? "gf" : "sans";
      const box = characterBox(kind, time);
      const offset = sourceCameraOffset(side, time);
      const sing = sourceSingCameraOffset(side, time);
      const idle = sourceIdleCamera(time, side);
      const zoomBase = sourceStageZoom(time, side);
      const fit = Math.min(canvas.width / SOURCE_W, canvas.height / SOURCE_H) || 1;
      const zoom = Math.max(0.05, zoomBase * fit);
      const focusX = box.x + box.w / 2 + offset.x + sing.x + idle.x;
      const focusY = box.y + box.h / 2 + offset.y + sing.y + idle.y;
      return {
        side,
        zoom,
        scrollX: focusX - canvas.width / (2 * zoom),
        scrollY: focusY - canvas.height / (2 * zoom)
      };
    }
    let sourceCameraState = null;
    function sourceCamera(time) {
      const target = sourceCameraTarget(time);
      const follow = sourceCameraFollowLerp(time);
      const last = sourceCameraState;
      const canvasChanged = !last || last.width !== canvas.width || last.height !== canvas.height;
      const jumped = !last || time < last.time - 0.01 || Math.abs(time - last.time) > 0.45 || canvasChanged;
      if (jumped) {
        sourceCameraState = { time, width: canvas.width, height: canvas.height, camera: target };
      } else if (Math.abs(time - last.time) > 0.00001) {
        const dt = Math.max(0, Math.min(0.25, time - last.time));
        const blend = sourceCameraBlend(follow, dt);
        const zoomBlend = sourceZoomBlend(dt);
        const camera = {
          side: target.side,
          zoom: lerp(last.camera.zoom, target.zoom, zoomBlend),
          scrollX: lerp(last.camera.scrollX, target.scrollX, blend),
          scrollY: lerp(last.camera.scrollY, target.scrollY, blend)
        };
        sourceCameraState = { time, width: canvas.width, height: canvas.height, camera };
      }
      return sourceCameraState.camera;
    }
    function sourceIdleCamera(time, side) {
      if (sourceCurrentSingDir(side, time)) return { x: 0, y: 0 };
      let amp = 0;
      for (const event of sourceEvents("Idle Cam Movement").sort((a, b) => a.time - b.time)) {
        if (event.time > time) break;
        amp = num(event.params?.[0]);
      }
      if (amp <= 0) return { x: 0, y: 0 };
      const phase = time * (30 / amp);
      return {
        x: Math.sin(phase) * amp,
        y: (Math.sin(phase * 2) / 2) * (amp * 0.6)
      };
    }
    function worldToScreen(camera, x, y, scrollX = 1, scrollY = 1) {
      return {
        x: (x - camera.scrollX * scrollX) * camera.zoom,
        y: (y - camera.scrollY * scrollY) * camera.zoom
      };
    }
    function drawSourceLayer(layer, camera, alpha = 1) {
      const img = perseveranceSpriteState.images[layer.key];
      if (!imageReady(img)) return;
      const point = worldToScreen(camera, layer.x, layer.y, layer.scrollX, layer.scrollY);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.imageSmoothingEnabled = layer.key === "pillars" ? false : true;
      ctx.imageSmoothingQuality = "high";
      if (layer.key === "bgFore") {
        const fade = clamp01((timeForStep(128) + secondsForSteps(timeForStep(128), 8) - (window.__perseveranceLastDrawTime || 0)) / secondsForSteps(timeForStep(128), 8));
        const brightness = (window.__perseveranceLastDrawTime || 0) < timeForStep(128) ? 0.105 : 1 - fade * 0.895;
        ctx.filter = "brightness(" + Math.max(0.105, brightness).toFixed(3) + ")";
      }
      let drawX = point.x;
      let drawY = point.y;
      if (layer.flixelScaleOrigin) {
        drawX += ((img.naturalWidth - img.naturalWidth * layer.scale) / 2) * camera.zoom;
        drawY += ((img.naturalHeight - img.naturalHeight * layer.scale) / 2) * camera.zoom;
      }
      ctx.drawImage(img, drawX, drawY, img.naturalWidth * layer.scale * camera.zoom, img.naturalHeight * layer.scale * camera.zoom);
      ctx.restore();
    }
    function drawSourceCharacter(kind, camera, time, alphaOverride) {
      const current = currentFrameData(kind, time);
      if (!current) return;
      const pos = stagePosition(kind, time);
      const animOffset = current.data.anim?.offset || [0, 0];
      const point = worldToScreen(camera, pos.x - num(animOffset[0]), pos.y - num(animOffset[1]));
      const sourceScale = current.data.sprite.scale || 1;
      const drawScale = sourceScale * camera.zoom;
      const anchorX = point.x + (((current.frame.fw || current.frame.w) / 2) + (current.frame.fx || 0)) * drawScale;
      const anchorY = point.y + ((current.frame.fh || current.frame.h) + (current.frame.fy || 0)) * drawScale;
      if (alphaOverride == null) {
        drawPerseveranceCharacter(kind, anchorX, anchorY, camera.zoom, time);
        return;
      }
      ctx.save();
      ctx.globalAlpha = alphaOverride;
      drawPerseveranceCharacter(kind, anchorX, anchorY, camera.zoom, time);
      ctx.restore();
    }
    function drawAtlasTopLeftWorld(image, frame, worldX, worldY, sourceScale, camera, alpha = 1, scrollX = 1, scrollY = 1) {
      if (!imageReady(image) || !frame) return;
      const point = worldToScreen(camera, worldX, worldY, scrollX, scrollY);
      drawAtlasTopLeft(image, frame, point.x, point.y, sourceScale * camera.zoom, alpha);
    }
    function drawImageWorld(image, worldX, worldY, sourceScale, camera, alpha = 1) {
      if (!imageReady(image)) return;
      const point = worldToScreen(camera, worldX, worldY);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.drawImage(image, point.x, point.y, image.naturalWidth * sourceScale * camera.zoom, image.naturalHeight * sourceScale * camera.zoom);
      ctx.restore();
    }
    function drawSourceIntroOverlay(time) {
      const fadeStart = timeForStep(128);
      const fadeDuration = 3.6;
      let alpha = 0;
      if (time < fadeStart) alpha = 1;
      else if (time < fadeStart + fadeDuration) alpha = 1 - (time - fadeStart) / fadeDuration;
      if (alpha <= 0) return;
      const gray = Math.round(lerp(0x1b, 0x5f, clamp01((time - timeForStep(96)) / Math.max(0.001, fadeStart - timeForStep(96)))));
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = "rgb(" + gray + "," + gray + "," + gray + ")";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
    }
    function drawSourceMechanics(camera, time) {
      const m = window.PERSEVERANCE_DATA.mechanics;
      const p = state.perseverance;
      const warn = m.dodgeWarn;
      const fire = m.dodgeFire;
      if (time >= warn - 0.01 && time < m.dodgeEnd + 2.4) {
        const yDur = secondsForSteps(warn, 10);
        const xDur = secondsForSteps(warn, 13);
        const yEase = sourceEase("sine", "InOut", (time - warn) / Math.max(0.001, yDur));
        const xEase = sourceEase("cube", "Out", (time - warn) / Math.max(0.001, xDur));
        const worldX = lerp(-180, 1080, xEase);
        const worldY = lerp(320, 920, yEase);
        const frame = time >= fire
          ? frameFromList(window.PERSEVERANCE_DATA.stage.blaster.blast, time - fire, 24, false)
          : frameFromList(window.PERSEVERANCE_DATA.stage.blaster.idle, time * 1.3, 14, true);
        drawAtlasTopLeftWorld(perseveranceSpriteState.images.blaster, frame, worldX, worldY, 1.2, camera, 1);
      }
      if (p.prompt && time < fire) {
        const alpha = clamp01((time - warn) / Math.max(0.001, secondsForSteps(warn, 8)));
        const frame = frameFromList(window.PERSEVERANCE_DATA.stage.prompt.idle, time * 1.5, 12, true);
        drawAtlasTopLeftWorld(perseveranceSpriteState.images.prompt, frame, 1400, 920, 1, camera, alpha * 0.95, 0.95, 0.9);
      }
      const flashAge = time - p.flashTime;
      if (flashAge >= 0 && flashAge < 0.08) drawImageWorld(perseveranceSpriteState.images.impact1, 430, 510, 1, camera, 1);
      else if (flashAge >= 0 && flashAge < 0.18) drawImageWorld(perseveranceSpriteState.images.impact2, 425, 510, 0.9, camera, 1);
    }

    function usesOfficialPerseveranceSnow() {
      if (window.PERFORMANCE_MODE || state?.settings?.performance) return false;
      const webgl = window.FNF_WEBGL;
      const status = typeof webgl?.status === "function" ? webgl.status() : null;
      return !!webgl?.drawDustinPostStack && !status?.failed;
    }
    function drawFallbackSnow(time) {
      if (!usesOfficialPerseveranceSnow()) drawSnow(time);
    }

    function drawPerseveranceSourceStage(time) {
      ensureSourceImages();
      window.__perseveranceLastDrawTime = time;
      const camera = sourceCamera(time);
      if (perseveranceIsPixelPhase(time)) {
        ctx.save();
        ctx.fillStyle = "#050505";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        drawSourceLayer(STAGE.pillars, camera, 1);
        drawSourceCharacter("sans", camera, time);
        drawFallbackSnow(time);
        ctx.restore();
        return;
      }
      drawSourceLayer(STAGE.back, camera, 1);
      drawSourceLayer(STAGE.frontBack, camera, 1);
      drawSourceLayer(STAGE.mid, camera, 1);
      drawSourceIntroOverlay(time);
      drawSourceCharacter("gf", camera, time);
      drawSourceCharacter("sans", camera, time);
      drawSourceCharacter("boyfriend", camera, time);
      drawSourceMechanics(camera, time);
      drawSourceLayer(STAGE.foreground, camera, 0.98);
      drawFallbackSnow(time);
    }

    function sourceBloomRaw(time) {
      return eventTween("Bloom Effect", time, 1.4, e => num(e.params?.[1], 1.4), 2);
    }
    function sourceBloomSize(time) {
      const t = s => timeForStep(s);
      let size = 10;
      const pulses = [
        [645, 10, 25, 8],
        [752, 35, 10, 8],
        [760, 35, 10, 8],
        [768, 35, 10, 8],
        [880, 35, 10, 8],
        [888, 35, 10, 8],
        [896, 35, 10, 8],
        [1840, 15, 30, 12],
        [1936, 32, 15, 8],
        [1952, 32, 15, 8],
        [1968, 32, 15, 8],
        [2064, 32, 15, 8],
        [2080, 32, 15, 8],
        [2096, 32, 15, 8],
        [2288, 10, 50, 4],
        [2528, 10, 50, 6],
        [2536, 10, 50, 26]
      ];
      if (time >= t(2128)) size = 10;
      for (const [step, from, to, steps] of pulses) {
        const start = t(step);
        if (time < start) continue;
        const duration = secondsForSteps(start, steps);
        size = time < start + duration ? lerp(from, to, sourceEase("quad", "Out", (time - start) / duration)) : to;
      }
      return size;
    }
    const originalBloomStrength = perseveranceBloomStrength;
    perseveranceBloomStrength = function(time) {
      if (state?.selectedSong !== "perseverance") return originalBloomStrength(time);
      if (Math.abs((window.__perseveranceOfficialBloomTime || -999) - time) < 0.05) return 0;
      if (perseveranceIsPixelPhase(time)) return 0;
      return clamp01(sourceBloomRaw(time) / 3.2);
    };
    perseveranceGrayness = function(time) {
      const s645 = timeForStep(645);
      const s2128 = timeForStep(2128);
      const s2236 = timeForStep(2236);
      const s2288 = timeForStep(2288);
      if (time < s645) return 1;
      const d645 = secondsForSteps(s645, 4);
      if (time < s645 + d645) return lerp(1, 0, sourceEase("quad", "Out", (time - s645) / d645));
      if (time < s2128) return 0;
      if (time < s2236) return 1;
      const d2236 = secondsForSteps(s2236, 4);
      if (time < s2236 + d2236) return lerp(1, 0.3, sourceEase("quad", "Out", (time - s2236) / d2236));
      if (time < s2288) return 0.3;
      const d2288 = secondsForSteps(s2288, 1);
      if (time < s2288 + d2288) return lerp(0.3, 0.5, sourceEase("quad", "Out", (time - s2288) / d2288));
      return 0.5;
    };
    function sourcePulse(time, start, from, to, steps, ease = "quad", mode = "Out") {
      const duration = secondsForSteps(start, steps);
      if (time < start || time > start + duration) return null;
      return lerp(from, to, sourceEase(ease, mode, (time - start) / Math.max(0.001, duration)));
    }
    function maxPulse(time, starts, from, to, steps, ease, mode) {
      let value = 0;
      for (const start of starts) {
        const pulse = sourcePulse(time, start, from, to, steps, ease, mode);
        if (pulse != null) value = Math.max(value, pulse);
      }
      return value;
    }
    function sourceScriptShaderState(time) {
      const t = s => timeForStep(s);
      let water = 0;
      let chrom = time < t(656) ? 0.3 : 0;
      let glitch = 0;
      let staticStrength = 0;
      if (time < t(645)) staticStrength = 1.2;
      else if (time < t(645) + secondsForSteps(t(645), 4)) staticStrength = lerp(1.3, 0, sourceEase("quad", "Out", (time - t(645)) / secondsForSteps(t(645), 4)));
      if (time >= t(2128)) staticStrength = 4;
      if (time >= t(2288)) staticStrength = 1.9;
      if (time >= t(2536)) staticStrength = 3;
      const burstA = [752, 760, 768, 880, 888, 896, 1936, 1952, 1968, 2064, 2080, 2096].map(t);
      water = Math.max(water, maxPulse(time, burstA, 0.35, 0, 6, "cube", "In"));
      chrom = Math.max(chrom, maxPulse(time, burstA, 0.4, 0.05, 6, "cube", "In"));
      const burstB = [976, 1104].map(t);
      water = Math.max(water, maxPulse(time, burstB, 0.4, 0, 16, "cube", "Out"));
      chrom = Math.max(chrom, maxPulse(time, burstB, 0.5, 0, 12, "cube", "In"));
      for (const event of sourceEvents("HScript Call")) {
        const call = String(event.params?.[0] || "");
        if (call === "pixelbump") {
          water = Math.max(water, maxPulse(time, [event.time], 0.4, 0, 6, "cube", "In"));
          chrom = Math.max(chrom, maxPulse(time, [event.time], 0.05, 0, 8, "quad", "Out"));
        } else if (call === "epicbump") {
          water = Math.max(water, maxPulse(time, [event.time], 0.5, 0.2, 12, "cube", "In"));
          chrom = Math.max(chrom, maxPulse(time, [event.time], 0.6, 0.4, 8, "cube", "In"));
        } else if (call === "swagbump") {
          water = Math.max(water, maxPulse(time, [event.time], 0.3, 0.1, 4, "cube", "Out"));
        } else if (call === "epicimpact") {
          glitch = Math.max(glitch, maxPulse(time, [event.time], 1, 0, 6, "cube", "In"));
          chrom = Math.max(chrom, maxPulse(time, [event.time], 0.13, 0, 8, "quad", "Out"));
        }
      }
      water = Math.max(water, maxPulse(time, [t(1136), t(1664), t(2288)], 0.3, 0.1, 8, "cube", "Out"));
      chrom = Math.max(chrom, maxPulse(time, [t(1136), t(1664), t(2288), t(2528)], 0.3, 0.05, 8, "cube", "In"));
      const snow = sourceSnowState(time);
      return {
        heat: Math.min(0.12, water * 0.12),
        chrom: Math.min(0.16, chrom * 0.18),
        waterStrength: water,
        chromDistortion: chrom,
        dust: snow.layers / 37,
        light: sourceFogIntensity(time) * 0.28,
        radial: eventTween("Screen Vignette", time, 1.4, e => num(e.params?.[1], 1), 3) * 0.08,
        snow: snow.layers / 37,
        snowSpeed: snow.speed,
        snowBright: snow.bright,
        staticStrength,
        glitch
      };
    }
    function sourcePixelBlockSize(time) {
      const t = s => timeForStep(s);
      const transitions = [
        [1168, 1, 16, 8],
        [1184, 32, 1, 24],
        [1688, 1, 16, 7.7],
        [1696, 16, 1, 8]
      ];
      let block = 1;
      for (const [step, from, to, steps] of transitions) {
        const start = t(step);
        if (time < start) continue;
        const duration = secondsForSteps(start, steps);
        block = time < start + duration ? lerp(from, to, sourceEase("circ", "Out", (time - start) / duration)) : to;
      }
      return block;
    }
    function sourceFogIntensity(time) {
      const s1840 = timeForStep(1840);
      const s2288 = timeForStep(2288);
      let intensity = 1;
      if (time >= s1840) {
        const d = secondsForSteps(s1840, 8);
        intensity = time < s1840 + d ? lerp(1, 1.8, sourceEase("quad", "Out", (time - s1840) / d)) : 1.8;
      }
      if (time >= s2288) intensity = 1.85;
      return intensity;
    }
    function quadOutIntegral(p) {
      const t = clamp01(p);
      return t * t - (t * t * t) / 3;
    }
    function integrateConstantSpeed(time, start, end, speed) {
      if (time <= start) return 0;
      return Math.max(0, Math.min(time, end) - start) * speed;
    }
    function integrateQuadOutSpeed(time, start, steps, from, to) {
      const duration = secondsForSteps(start, steps);
      if (time <= start || duration <= 0) return 0;
      const p = clamp01((Math.min(time, start + duration) - start) / duration);
      return duration * (from * p + (to - from) * quadOutIntegral(p));
    }
    function sourceSnowClock(time) {
      const t = s => timeForStep(s);
      const s128 = t(128);
      const d128 = secondsForSteps(s128, 8);
      const s1696 = t(1696);
      const s1840 = t(1840);
      const d1840 = secondsForSteps(s1840, 32);
      const s2128 = t(2128);
      const s2288 = t(2288);
      const s2536 = t(2536);
      let clock = 0;
      clock += integrateConstantSpeed(time, 0, s128, 7);
      clock += integrateQuadOutSpeed(time, s128, 8, 7, 1.3);
      clock += integrateConstantSpeed(time, s128 + d128, s1696, 1.3);
      clock += integrateConstantSpeed(time, s1696, s1840, 3);
      clock += integrateQuadOutSpeed(time, s1840, 32, 3, 2.7);
      clock += integrateConstantSpeed(time, s1840 + d1840, s2128, 2.7);
      clock += integrateConstantSpeed(time, s2128, s2288, 0.7);
      clock += integrateConstantSpeed(time, s2288, s2536, 4);
      if (time > s2536) clock += (time - s2536) * 7;
      return clock;
    }
    function sourceSnowState(time) {
      const t = s => timeForStep(s);
      const s128 = t(128);
      const s1696 = t(1696);
      const s1840 = t(1840);
      const s2128 = t(2128);
      const s2280 = t(2280);
      const s2288 = t(2288);
      const s2536 = t(2536);
      let speed = time < s128 ? 7 : 1.3;
      if (time >= s128 && time < s128 + secondsForSteps(s128, 8)) {
        speed = lerp(7, 1.3, sourceEase("quad", "Out", (time - s128) / secondsForSteps(s128, 8)));
      }
      let gameLayers = perseveranceIsPixelPhase(time) ? 0 : 14;
      let charLayers = perseveranceIsPixelPhase(time) ? 7 : 13;
      let gameBright = 1;
      let charBright = 1;
      let pixely = perseveranceIsPixelPhase(time);
      let charMelts = true;
      let meltRect = pixely ? [1000, 1430, 1700, 70] : [1000, 1220, 1500, 100];
      if (time >= s1696) {
        speed = 3;
        gameLayers = 14;
        charLayers = 13;
        pixely = false;
        meltRect = [1000, 1220, 1500, 100];
      }
      if (time >= s1840) {
        const speedDur = secondsForSteps(s1840, 32);
        const brightDur = secondsForSteps(s1840, 34);
        speed = time < s1840 + speedDur ? lerp(3, 2.7, sourceEase("quad", "Out", (time - s1840) / speedDur)) : 2.7;
        gameLayers = 31;
        charLayers = 30;
        gameBright = time < s1840 + brightDur ? lerp(1, 2.4, sourceEase("quad", "Out", (time - s1840) / brightDur)) : 2.4;
        charBright = time < s1840 + brightDur ? lerp(1, 2.8, sourceEase("quad", "Out", (time - s1840) / brightDur)) : 2.8;
        charMelts = false;
      }
      if (time >= s2128) {
        speed = 0.7;
        gameBright = 1;
        charBright = 1;
        charMelts = true;
      }
      if (time >= s2280) {
        gameLayers = 37;
        charLayers = 36;
        charMelts = false;
      }
      if (time >= s2288) {
        speed = 4;
        gameBright = 2.8;
        charBright = 3.5;
      }
      if (time >= s2536) {
        speed = 7;
        gameBright = 2.9;
        charBright = 4;
      }
      if ((time >= t(1432) && time < t(1440)) || (time >= t(1568) && time < t(1572))) charLayers = 0;
      return {
        speed,
        layers: Math.max(gameLayers, charLayers),
        bright: Math.max(gameBright, charBright),
        gameLayers,
        charLayers,
        gameBright,
        charBright,
        pixely,
        gameMelts: true,
        charMelts,
        meltRect,
        clock: sourceSnowClock(time)
      };
    }
    perseveranceShaderState = function(time) {
      return sourceScriptShaderState(time);
    };

    const originalLightShader = drawPerseveranceLightShader;
    drawPerseveranceLightShader = function(time) {
      if (state?.selectedSong !== "perseverance" || !perseveranceSpritesReady()) return originalLightShader(time);
      const fx = perseveranceShaderState(time);
      const camera = sourceCamera(time);
      const applyY = worldToScreen(camera, 0, perseveranceIsPixelPhase(time) ? 9999999 : 1520).y;
      const range = (perseveranceIsPixelPhase(time) ? 0 : 950) * camera.zoom;
      if (range <= 0) return;
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      const g = ctx.createLinearGradient(0, applyY - range, 0, applyY + 80 * camera.zoom);
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(0.75, "rgba(166,185,189," + (0.10 * fx.light).toFixed(3) + ")");
      g.addColorStop(1, "rgba(216,235,240," + (0.18 * fx.light).toFixed(3) + ")");
      ctx.fillStyle = g;
      ctx.fillRect(0, Math.max(0, applyY - range - 120), canvas.width, Math.min(canvas.height, range + 240));
      ctx.restore();
    };

    const originalDustShader = drawPerseveranceDustShader;
    drawPerseveranceDustShader = function(time) {
      if (state?.selectedSong !== "perseverance" || !perseveranceSpritesReady()) return originalDustShader(time);
      if (usesOfficialPerseveranceSnow()) return;
      const fx = perseveranceShaderState(time);
      if (fx.snow <= 0.01) return;
      const stride = (window.PERFORMANCE_MODE || state?.settings?.performance) ? 4 : 2;
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      ctx.lineCap = "round";
      for (let i = 0; i < perseveranceSpriteState.dust.length; i += stride) {
        const p = perseveranceSpriteState.dust[i];
        const y = ((p.y + time * fx.snowSpeed * (18 + p.depth * 16)) % (canvas.height + 80)) - 40;
        const x = ((p.x + Math.sin(time * 0.7 + p.phase) * 24) % (canvas.width + 80)) - 40;
        const alpha = Math.min(0.48, p.alpha * fx.snow * fx.snowBright * 0.42);
        const len = 4 + p.depth * 7 + fx.snowSpeed * 0.5;
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = "rgba(230,240,255,0.9)";
        ctx.lineWidth = Math.max(0.7, p.size * 0.75);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - 1.5, y + len);
        ctx.stroke();
      }
      ctx.restore();
    };

    const originalApplyShaders = applyPerseveranceScreenShaders;
    applyPerseveranceScreenShaders = function(time) {
      window.__perseveranceOfficialBloomTime = -999;
      if (state?.selectedSong !== "perseverance" || window.PERFORMANCE_MODE || state?.settings?.performance) return;
      const fx = perseveranceShaderState(time);
      const snow = sourceSnowState(time);
      const camera = sourceCamera(time);
      const warpCtx = typeof syncPerseveranceWarpCanvas === "function" ? syncPerseveranceWarpCanvas() : null;
      if (warpCtx && window.FNF_WEBGL?.drawDustinPostStack) {
        warpCtx.clearRect(0, 0, perseveranceWarpCanvas.width, perseveranceWarpCanvas.height);
        warpCtx.drawImage(canvas, 0, 0, perseveranceWarpCanvas.width, perseveranceWarpCanvas.height);
        const usedOfficial = window.FNF_WEBGL.drawDustinPostStack(perseveranceWarpCanvas, {
          time,
          resX: SOURCE_W,
          resY: SOURCE_H,
          grayness: perseveranceGrayness(time),
          staticStrength: fx.staticStrength,
          chromDistortion: fx.chromDistortion || 0,
          waterStrength: fx.waterStrength || 0,
          glitchAmount: fx.glitch || 0,
          pixelBlockSize: sourcePixelBlockSize(time),
          bloomBrightness: perseveranceIsPixelPhase(time) ? 0 : sourceBloomRaw(time),
          bloomSize: sourceBloomSize(time),
          bloomThreshold: 0.5,
          fogIntensity: perseveranceIsPixelPhase(time) ? 0 : sourceFogIntensity(time),
          fogApplyY: perseveranceIsPixelPhase(time) ? 9999999 : 1520,
          fogApplyRange: perseveranceIsPixelPhase(time) ? 0 : 900,
          cameraZoom: camera.zoom,
          cameraX: camera.scrollX,
          cameraY: camera.scrollY,
          snowTime: snow.clock * 3,
          snowLayersA: snow.gameLayers,
          snowLayersB: snow.charLayers,
          snowBrightA: snow.gameBright,
          snowBrightB: snow.charBright,
          snowPixely: snow.pixely,
          snowMeltsA: snow.gameMelts,
          snowMeltsB: snow.charMelts,
          snowMeltRect: snow.meltRect
        });
        if (usedOfficial) {
          window.__perseveranceOfficialBloomTime = time;
          return;
        }
      }
      originalApplyShaders(time);
      if (fx.staticStrength > 0.01) {
        ctx.save();
        ctx.globalAlpha = Math.min(0.18, fx.staticStrength * 0.035);
        for (let y = 0; y < canvas.height; y += 3) {
          const v = Math.floor(110 + seededUnit(y + Math.floor(time * 60), 11) * 80);
          ctx.fillStyle = "rgb(" + v + "," + v + "," + v + ")";
          ctx.fillRect(0, y, canvas.width, 1);
        }
        ctx.restore();
      }
      if (fx.glitch > 0.01) {
        syncPerseveranceWarpCanvas().drawImage(canvas, 0, 0, perseveranceWarpCanvas.width, perseveranceWarpCanvas.height);
        ctx.save();
        ctx.globalAlpha = Math.min(0.5, fx.glitch * 0.45);
        for (let i = 0; i < 8; i++) {
          const y = Math.floor(seededUnit(i + Math.floor(time * 40), 31) * canvas.height);
          const h = 8 + seededUnit(i, 32) * 26;
          const dx = (seededUnit(i + Math.floor(time * 30), 33) - 0.5) * 90 * fx.glitch;
          ctx.drawImage(perseveranceWarpCanvas, 0, y, canvas.width, h, dx, y, canvas.width, h);
        }
        ctx.restore();
      }
    };

    drawPerseveranceReflections = function() {};

    const originalStage = stage;
    stage = function(time) {
      if (state?.selectedSong === "perseverance" && perseveranceSpritesReady()) {
        drawPerseveranceSourceStage(time);
        return;
      }
      originalStage(time);
    };

    window.drawPerseveranceSourceFlashSilhouettes = function(time) {
      const camera = sourceCamera(time);
      drawSourceCharacter("sans", camera, time);
      drawSourceCharacter("boyfriend", camera, time);
    };
  } catch (error) {
    console.error("Perseverance source mode failed to initialize", error);
  }
})();

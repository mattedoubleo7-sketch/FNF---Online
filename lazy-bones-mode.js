(() => {
  try {
    const LAZY = window.LAZY_BONES_DATA;
    if (!LAZY || typeof SONGS === "undefined") return;

    const SONG_ID = "lazyBones";
    const SONG_SOURCE = "lazyBones";
    const DIR_ANIM = ["singLEFT", "singDOWN", "singUP", "singRIGHT"];
    const HOLD_COLORS = ["#c24bff", "#00d9ff", "#12ed36", "#f93954"];
    const SOURCE_W = Number(LAZY.stage?.viewport?.[0] || 1280);
    const SOURCE_H = Number(LAZY.stage?.viewport?.[1] || 720);
    const scene = {
      initialized: false,
      images: {},
      holdFrames: {},
      cameraX: null,
      cameraY: null,
      cameraOffsetX: 0,
      cameraOffsetY: 0,
      lastTime: null,
      zoomImpulses: null,
      coloredNoteFrames: {}
    };

    SONGS[SONG_ID] = {
      title: LAZY.song?.title || "Lazy Bones",
      subtitle: LAZY.song?.subtitle || "FNF x Undertale source mod",
      diff: LAZY.song?.diff || "Boned (Original Chart)",
      tempo: Number(LAZY.song?.bpm || 158),
      root: 45,
      scale: [0, 2, 3, 5, 7, 8, 10],
      prog: [0, 5, 3, 7],
      scroll: 1170,
      seed: 83,
      introBeats: 0,
      outroBeats: 2,
      palette: ["#171129", "#4a3c75", "#9e8bd1", "#080711", "#f6ecff", "#7cd9ff"],
      blurb: "Imported from FNF x Undertale with the original Boned chart, baked source audio, Psych note atlas, split upscroll/downscroll lanes, pastel throne stage, and complete Lua camera and cinematic event timeline.",
      chartSource: SONG_SOURCE
    };
    if (typeof NEW_SONGS !== "undefined" && NEW_SONGS?.add) NEW_SONGS.add(SONG_ID);
    state.poses.sans = state.poses.sans || { lane: 1, time: -10, kind: "hit" };

    const baseIsImportedSong = isImportedSong;
    const baseMakeChart = makeChart;
    const baseStopExternalAudio = stopExternalAudio;
    const baseSongTime = songTime;
    const baseSongEndTime = songEndTime;
    const baseStartSong = startSong;
    const baseRefreshHUD = refreshHUD;
    const baseFinish = finish;
    const baseBg = bg;
    const baseStage = stage;
    const baseReceptors = receptors;
    const baseNotes = notes;
    const baseRenderScene = renderScene;
    const baseUpdateCamera = updateCamera;
    const baseCameraTargets = cameraTargets;
    const baseCameraPanProfile = cameraPanProfile;
    const baseCameraPoseKeys = cameraPoseKeys;

    const clamp01 = value => Math.max(0, Math.min(1, Number(value || 0)));
    const lerp = (a, b, amount) => Number(a || 0) + (Number(b || 0) - Number(a || 0)) * clamp01(amount);
    const clone = value => JSON.parse(JSON.stringify(value));
    const isLazyBones = song => !!song && song.chartSource === SONG_SOURCE;
    const imageReady = image => !!(image && image.complete && image.naturalWidth);

    function injectStyle() {
      if (document.getElementById("lazyBonesStyle")) return;
      const style = document.createElement("style");
      style.id = "lazyBonesStyle";
      style.textContent = `
        body.lazy-bones-active .hud .top,
        body.lazy-bones-active .hud .bottom { opacity: 0 !important; pointer-events: none !important; }
      `;
      document.head.appendChild(style);
    }

    function initAssets() {
      if (scene.initialized) return;
      scene.initialized = true;
      const sources = {
        background: LAZY.stage?.background?.image,
        stand: LAZY.stage?.stand?.image,
        boyfriend: LAZY.sprites?.boyfriend?.image,
        sans: LAZY.sprites?.sans?.image,
        notes: LAZY.notes?.image,
        boyfriendIcon: LAZY.hud?.boyfriendIcon,
        sansIcon: LAZY.hud?.sansIcon
      };
      Object.entries(sources).forEach(([key, source]) => {
        if (!source) return;
        const image = new Image();
        image.decoding = "async";
        image.src = source;
        if (typeof image.decode === "function") image.decode().catch(() => {});
        scene.images[key] = image;
      });
    }

    function ensureAudioTrack() {
      if (!state.audio.lazyBonesInst) {
        state.audio.lazyBonesInst = new Audio(LAZY.audio.inst);
        state.audio.lazyBonesInst.preload = "auto";
        state.audio.lazyBonesInst.volume = 0.96;
      }
      return state.audio.lazyBonesInst;
    }

    window.ensureLazyBonesAudio = () => [ensureAudioTrack()];
    window.prepareLazyBonesOnlineStart = function() {
      const track = ensureAudioTrack();
      track.pause();
      try { track.currentTime = 0; } catch {}
      try { track.load(); } catch {}
      return [track];
    };

    function totalTime() {
      const track = ensureAudioTrack();
      const audioDuration = Number(track.duration || 0);
      return Number.isFinite(audioDuration) && audioDuration > 0
        ? Math.max(audioDuration, Number(LAZY.charts?.boned?.totalTime || 0))
        : Number(LAZY.charts?.boned?.totalTime || 0);
    }

    function sectionAt(t) {
      const timeline = LAZY.charts?.boned?.timeline || [];
      return timeline.find(section => t >= section.startTime && t < section.endTime) || timeline[timeline.length - 1];
    }

    function eventsByName(...names) {
      const accepted = new Set(names);
      return (LAZY.charts?.boned?.events || []).filter(event => accepted.has(event.name));
    }

    function tweenedSwitchAlpha(t, names, initial = 1) {
      let value = initial;
      let tween = null;
      const valueAt = time => {
        if (!tween) return value;
        if (time >= tween.end) return tween.to;
        return lerp(tween.from, tween.to, (time - tween.start) / Math.max(0.0001, tween.end - tween.start));
      };
      for (const event of eventsByName(...names)) {
        if (event.time > t) break;
        value = valueAt(event.time);
        const duration = Math.max(0.001, Number(event.value1 || 0.001));
        tween = {
          start: event.time,
          end: event.time + duration,
          from: value,
          to: String(event.value2).toLowerCase() === "on" ? 1 : 0
        };
      }
      return clamp01(valueAt(t));
    }

    function gameAlphaAt(t) {
      return tweenedSwitchAlpha(t, ["Camera Switch", "Camera Switch with HUD"], 1);
    }

    function hudAlphaAt(t) {
      return tweenedSwitchAlpha(t, ["Hud fade", "Camera Switch with HUD"], 1);
    }

    function easeQuadOut(p) {
      const value = clamp01(p);
      return 1 - (1 - value) * (1 - value);
    }

    function easeQuadIn(p) {
      const value = clamp01(p);
      return value * value;
    }

    function cinematicDistanceAt(t) {
      let value = 0;
      let tween = null;
      const valueAt = time => {
        if (!tween) return value;
        if (time >= tween.end) return tween.to;
        const raw = (time - tween.start) / Math.max(0.0001, tween.end - tween.start);
        const eased = tween.to > 0 ? easeQuadOut(raw) : easeQuadIn(raw);
        return lerp(tween.from, tween.to, eased);
      };
      for (const event of eventsByName("Better Cinematics")) {
        if (event.time > t) break;
        value = valueAt(event.time);
        const duration = Math.max(0.001, Number(event.value1 || 0.001));
        const target = Math.max(0, Number(event.value2 || 0));
        tween = { start: event.time, end: event.time + duration, from: value, to: target };
      }
      return Math.max(0, valueAt(t));
    }

    function flashAlphaAt(t) {
      let alpha = 0;
      for (const event of eventsByName("Flash Camera")) {
        if (event.time > t) break;
        const duration = Math.max(0.001, Number(event.value1 || 0.001));
        const age = t - event.time;
        if (age <= duration) alpha = Math.max(alpha, 1 - age / duration);
      }
      return clamp01(alpha);
    }

    function bopAmountAt(t) {
      let amount = 0;
      for (const event of eventsByName("Bopping HUD")) {
        if (event.time > t) break;
        amount = Number(event.value1 || 0);
      }
      return Number.isFinite(amount) ? amount : 0;
    }

    function backOut(p) {
      const value = clamp01(p);
      const c1 = 1.70158;
      const c3 = c1 + 1;
      return 1 + c3 * Math.pow(value - 1, 3) + c1 * Math.pow(value - 1, 2);
    }

    function cameraAngleAt(t) {
      const amount = bopAmountAt(t);
      if (!amount) return 0;
      const spb = Number(LAZY.charts?.boned?.spb || 60 / 158);
      const beat = Math.floor(t / spb + 0.0001);
      const beatTime = beat * spb;
      const startAngle = amount * 12 * (beat % 2 === 0 ? 1 : -1);
      return startAngle * (1 - backOut((t - beatTime) / 0.5));
    }

    function buildZoomImpulses() {
      if (scene.zoomImpulses) return scene.zoomImpulses;
      const chart = LAZY.charts?.boned;
      const events = chart?.events || [];
      const impulses = events
        .filter(event => event.name === "Add Camera Zoom")
        .map(event => ({
          time: event.time,
          game: Number(event.value1 || 0.015),
          hud: Number(event.value2 || 0.03)
        }));
      let boomSpeed = 4;
      let boomPower = 1;
      let eventIndex = 0;
      const boomEvents = events.filter(event => event.name === "Cam Boom Speed");
      const spb = Number(chart?.spb || 60 / 158);
      for (let beat = 0; beat <= Math.ceil(Number(chart?.totalBeats || 0)); beat += 1) {
        const beatTime = beat * spb;
        while (eventIndex < boomEvents.length && boomEvents[eventIndex].time <= beatTime + 0.0001) {
          boomSpeed = Math.max(1, Math.round(Number(boomEvents[eventIndex].value1 || 4)));
          boomPower = Math.max(0, Number(boomEvents[eventIndex].value2 || 1));
          eventIndex += 1;
        }
        if (beat % boomSpeed === 0) {
          impulses.push({ time: beatTime, game: 0.015 * boomPower, hud: 0.03 * boomPower });
        }
      }
      impulses.sort((a, b) => a.time - b.time);
      scene.zoomImpulses = impulses;
      return impulses;
    }

    function zoomAt(t, key) {
      let zoom = key === "game" ? Number(LAZY.stage?.defaultZoom || 0.9) : 1;
      for (const impulse of buildZoomImpulses()) {
        const age = t - impulse.time;
        if (age < 0) break;
        if (age > 1.5) continue;
        zoom += Number(impulse[key] || 0) * Math.exp(-age * 5.2);
      }
      return zoom;
    }

    function frameForAnimation(animation, elapsed, forceLoop = null) {
      if (!animation?.frames?.length) return null;
      const fps = Math.max(1, Number(animation.fps || 12));
      const shouldLoop = forceLoop == null ? !!animation.loop : !!forceLoop;
      const frameIndex = Math.floor(Math.max(0, elapsed) * fps);
      return animation.frames[shouldLoop ? frameIndex % animation.frames.length : Math.min(animation.frames.length - 1, frameIndex)];
    }

    function activeAnimation(characterKey, t) {
      const sprite = LAZY.sprites?.[characterKey];
      const poseKey = characterKey === "boyfriend" ? "player" : "sans";
      const pose = state.poses?.[poseKey] || { lane: 1, time: -10, kind: "hit" };
      const held = typeof activeHoldNoteForCharacter === "function" ? activeHoldNoteForCharacter(poseKey, t) : null;
      const age = performance.now() / 1000 - Number(pose.time || -10);
      const lane = Number((held ? held.lane : pose.lane) || 0) % 4;
      const name = DIR_ANIM[lane];
      const singLength = Number(sprite?.singDuration || 4) * Number(LAZY.charts?.boned?.spb || 60 / 158) / 4;
      if ((held || age < singLength) && sprite?.animations?.[name]?.frames?.length) {
        const animation = sprite.animations[name];
        return { animation, frame: frameForAnimation(animation, held ? Math.max(0, t - held.time) : age, false) };
      }
      const animation = sprite?.animations?.idle;
      const idleClock = t % (Number(LAZY.charts?.boned?.spb || 60 / 158) * 2);
      return { animation, frame: frameForAnimation(animation, idleClock, false) };
    }

    function drawAtlasTopLeft(image, frame, x, y, scale = 1, alpha = 1, flipX = false) {
      if (!imageReady(image) || !frame) return;
      const fw = Number(frame.fw || frame.w || 0);
      ctx.save();
      ctx.globalAlpha *= alpha;
      ctx.imageSmoothingEnabled = true;
      ctx.translate(x, y);
      if (flipX) {
        ctx.translate(fw * scale, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(
        image,
        frame.x,
        frame.y,
        frame.w,
        frame.h,
        -Number(frame.fx || 0) * scale,
        -Number(frame.fy || 0) * scale,
        frame.w * scale,
        frame.h * scale
      );
      ctx.restore();
    }

    function combinedPosition(characterKey) {
      const stagePosition = LAZY.stage?.positions?.[characterKey] || [0, 0];
      const characterPosition = LAZY.sprites?.[characterKey]?.position || [0, 0];
      return [Number(stagePosition[0]) + Number(characterPosition[0]), Number(stagePosition[1]) + Number(characterPosition[1])];
    }

    function cameraTargetForSide(side) {
      const characterKey = side === "player" ? "boyfriend" : "sans";
      const position = combinedPosition(characterKey);
      const sprite = LAZY.sprites?.[characterKey];
      const idleFrame = sprite?.animations?.idle?.frames?.[0];
      const midpointX = position[0] + Number(idleFrame?.fw || 1280) * 0.5;
      const midpointY = position[1] + Number(idleFrame?.fh || 720) * 0.5;
      return {
        x: midpointX + (side === "player" ? -100 - Number(sprite?.camera?.[0] || 0) : 150 + Number(sprite?.camera?.[0] || 0)),
        y: midpointY - 100 + Number(sprite?.camera?.[1] || 0)
      };
    }

    function activeCameraNote(t, side) {
      const notes = LAZY.charts?.boned?.notes || [];
      let active = null;
      for (const note of notes) {
        if (note.time > t + 0.0001) break;
        if (note.side !== side) continue;
        const release = note.time + Math.max(Number(note.sLen || 0), 0.42);
        if (release >= t) active = note;
      }
      return active;
    }

    function updateSourceCamera(t) {
      const section = sectionAt(t);
      const side = section?.turn || "opp";
      const baseTarget = cameraTargetForSide(side);
      const cameraNote = activeCameraNote(t, side);
      let offsetX = 0;
      let offsetY = 0;
      if (cameraNote) {
        const amount = Number(LAZY.source?.cameraOffset || 40);
        const lane = Number(cameraNote.lane || 0) % 4;
        if (lane === 0) offsetX = -amount;
        else if (lane === 1) offsetY = amount;
        else if (lane === 2) offsetY = -amount;
        else offsetX = amount;
      }

      let dt = scene.lastTime == null ? 0 : Math.max(0, Math.min(0.1, t - scene.lastTime));
      if (scene.lastTime == null || t < scene.lastTime - 0.05) {
        scene.cameraX = baseTarget.x;
        scene.cameraY = baseTarget.y;
        scene.cameraOffsetX = offsetX;
        scene.cameraOffsetY = offsetY;
        dt = 0;
      }
      const cameraFollow = 1 - Math.exp(-dt * 5.4 * Number(LAZY.stage?.cameraSpeed || 1));
      const offsetFollow = 1 - Math.exp(-dt * 3.35 / Math.max(0.1, Number(LAZY.source?.cameraTweenDuration || 1.7)));
      scene.cameraX = lerp(scene.cameraX, baseTarget.x, cameraFollow);
      scene.cameraY = lerp(scene.cameraY, baseTarget.y, cameraFollow);
      scene.cameraOffsetX = lerp(scene.cameraOffsetX, offsetX, offsetFollow);
      scene.cameraOffsetY = lerp(scene.cameraOffsetY, offsetY, offsetFollow);
      scene.lastTime = t;
      return { x: scene.cameraX + scene.cameraOffsetX, y: scene.cameraY + scene.cameraOffsetY, side };
    }

    function drawCharacter(characterKey, t) {
      const sprite = LAZY.sprites?.[characterKey];
      const image = scene.images[characterKey];
      if (!sprite || !imageReady(image)) return;
      const { animation, frame } = activeAnimation(characterKey, t);
      if (!frame) return;
      const position = combinedPosition(characterKey);
      const offset = animation?.offset || [0, 0];
      const flipX = characterKey === "boyfriend" ? !sprite.flipX : !!sprite.flipX;
      drawAtlasTopLeft(
        image,
        frame,
        position[0] - Number(offset[0] || 0),
        position[1] - Number(offset[1] || 0),
        Number(sprite.scale || 1),
        1,
        flipX
      );
    }

    function drawLazyBonesStage(t) {
      initAssets();
      const background = LAZY.stage?.background;
      const stand = LAZY.stage?.stand;
      const camera = updateSourceCamera(t);
      const zoom = zoomAt(t, "game");
      const angle = cameraAngleAt(t) * Math.PI / 180;
      const alpha = gameAlphaAt(t);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(canvas.width * 0.5, canvas.height * 0.5);
      ctx.rotate(angle);
      ctx.scale(zoom, zoom);
      ctx.translate(-camera.x, -camera.y);
      if (imageReady(scene.images.background)) {
        ctx.drawImage(scene.images.background, Number(background.x || 0), Number(background.y || 0), scene.images.background.naturalWidth * Number(background.scale || 1), scene.images.background.naturalHeight * Number(background.scale || 1));
      }
      drawCharacter("sans", t);
      if (imageReady(scene.images.stand)) {
        ctx.drawImage(scene.images.stand, Number(stand.x || 0), Number(stand.y || 0), scene.images.stand.naturalWidth * Number(stand.scale || 1), scene.images.stand.naturalHeight * Number(stand.scale || 1));
      }
      drawCharacter("boyfriend", t);
      const flash = flashAlphaAt(t);
      if (flash > 0) {
        ctx.fillStyle = `rgba(255,255,255,${flash})`;
        ctx.fillRect(camera.x - SOURCE_W, camera.y - SOURCE_H, SOURCE_W * 2, SOURCE_H * 2);
      }
      ctx.restore();
    }

    function noteLayout(lane) {
      const localLane = Number(lane || 0) % 4;
      const opponent = lane < 4;
      return {
        x: Number(opponent ? LAZY.receptors?.opponentX?.[localLane] : LAZY.receptors?.playerX?.[localLane]),
        y: Number(opponent ? LAZY.receptors?.opponentY : LAZY.receptors?.playerY),
        down: opponent
      };
    }

    function drawNoteFrame(frame, centerX, centerY, scale = 0.7, alpha = 1) {
      if (!frame || !imageReady(scene.images.notes)) return;
      const fw = Number(frame.fw || frame.w || 0);
      const fh = Number(frame.fh || frame.h || 0);
      drawAtlasTopLeft(scene.images.notes, frame, centerX - fw * scale * 0.5, centerY - fh * scale * 0.5, scale, alpha, false);
    }

    function coloredNoteFrame(lane, frame, kind) {
      if (!frame || !imageReady(scene.images.notes)) return null;
      const key = `${lane}:${kind}:${frame.name || `${frame.x},${frame.y}`}`;
      if (scene.coloredNoteFrames[key]) return scene.coloredNoteFrames[key];
      const target = document.createElement("canvas");
      target.width = Number(frame.w || 1);
      target.height = Number(frame.h || 1);
      const targetCtx = target.getContext("2d", { willReadFrequently: true });
      targetCtx.drawImage(scene.images.notes, frame.x, frame.y, frame.w, frame.h, 0, 0, frame.w, frame.h);
      const pixels = targetCtx.getImageData(0, 0, target.width, target.height);
      const color = HOLD_COLORS[lane].match(/[\da-f]{2}/gi).map(value => parseInt(value, 16));
      for (let index = 0; index < pixels.data.length; index += 4) {
        if (!pixels.data[index + 3]) continue;
        const light = (pixels.data[index] * 0.2126 + pixels.data[index + 1] * 0.7152 + pixels.data[index + 2] * 0.0722) / 255;
        const shade = 0.38 + light * 0.9;
        const highlight = Math.max(0, (light - 0.72) / 0.28) * 0.55;
        for (let channel = 0; channel < 3; channel += 1) {
          pixels.data[index + channel] = Math.min(255, color[channel] * shade * (1 - highlight) + 255 * highlight);
        }
      }
      targetCtx.putImageData(pixels, 0, 0);
      scene.coloredNoteFrames[key] = target;
      return target;
    }

    function drawColoredNoteFrame(lane, frame, centerX, centerY, scale = 0.7, alpha = 1, kind = "tap") {
      const colored = coloredNoteFrame(lane, frame, kind);
      if (!colored) return;
      ctx.save();
      ctx.globalAlpha *= alpha;
      ctx.drawImage(colored, centerX - colored.width * scale * 0.5, centerY - colored.height * scale * 0.5, colored.width * scale, colored.height * scale);
      ctx.restore();
    }

    function tintedHoldFrame(lane, kind) {
      const key = `${lane}:${kind}`;
      if (scene.holdFrames[key]) return scene.holdFrames[key];
      const frame = LAZY.notes?.lanes?.[lane]?.[kind]?.[0];
      if (!frame || !imageReady(scene.images.notes)) return null;
      const target = document.createElement("canvas");
      target.width = frame.w;
      target.height = frame.h;
      const targetCtx = target.getContext("2d");
      targetCtx.drawImage(scene.images.notes, frame.x, frame.y, frame.w, frame.h, 0, 0, frame.w, frame.h);
      targetCtx.globalCompositeOperation = "source-atop";
      targetCtx.fillStyle = HOLD_COLORS[lane];
      targetCtx.fillRect(0, 0, target.width, target.height);
      targetCtx.globalCompositeOperation = "source-over";
      scene.holdFrames[key] = target;
      return target;
    }

    function drawHold(note, headCenterY, tailCenterY, alpha) {
      const localLane = note.lane % 4;
      const layout = noteLayout(note.lane);
      const centerX = layout.x + 55;
      const scale = 0.7;
      const piece = tintedHoldFrame(localLane, "holdPiece");
      const end = tintedHoldFrame(localLane, "holdEnd");
      const top = Math.min(headCenterY, tailCenterY);
      const bottom = Math.max(headCenterY, tailCenterY);
      ctx.save();
      ctx.globalAlpha *= alpha;
      if (piece && bottom - top > 18) ctx.drawImage(piece, centerX - piece.width * scale * 0.5, top, piece.width * scale, bottom - top);
      if (end) {
        const endY = layout.down ? tailCenterY - end.height * scale * 0.5 : tailCenterY - end.height * scale * 0.5;
        ctx.drawImage(end, centerX - end.width * scale * 0.5, endY, end.width * scale, end.height * scale);
      }
      ctx.restore();
    }

    function drawWithHudCamera(t, draw) {
      const alpha = hudAlphaAt(t);
      const angle = cameraAngleAt(t) * Math.PI / 180;
      const zoom = zoomAt(t, "hud");
      ctx.save();
      ctx.globalAlpha *= alpha;
      ctx.translate(canvas.width * 0.5, canvas.height * 0.5);
      ctx.rotate(angle);
      ctx.scale(zoom, zoom);
      ctx.translate(-canvas.width * 0.5, -canvas.height * 0.5);
      draw();
      ctx.restore();
    }

    function opponentConfirming(lane, t) {
      for (const note of state.chart?.notes || []) {
        if (note.time > t + 0.02) break;
        if (note.lane !== lane || note.side !== "opp") continue;
        if (t <= note.time + Math.max(0.16, Number(note.sLen || 0))) return note;
      }
      return null;
    }

    function drawLazyReceptor(lane, t) {
      const localLane = lane % 4;
      const layout = noteLayout(lane);
      const centerX = layout.x + 55;
      const centerY = layout.y + 55;
      const hitAge = performance.now() / 1000 - Number(state.receptorFx?.[lane]?.time || -10);
      const confirming = lane < 4 ? opponentConfirming(lane, t) : hitAge >= 0 && hitAge < 0.18;
      const pressed = lane >= 4 && !!state.keysDown?.[lane];
      let frames = LAZY.notes?.lanes?.[localLane]?.receptor;
      if (confirming) frames = LAZY.notes?.lanes?.[localLane]?.confirm;
      else if (pressed) frames = LAZY.notes?.lanes?.[localLane]?.press;
      const frameIndex = confirming ? Math.floor(Math.max(0, hitAge) * 24) : Math.floor(t * 24);
      const frame = frames?.[Math.max(0, frameIndex) % Math.max(1, frames?.length || 1)];
      if (confirming || pressed) drawColoredNoteFrame(localLane, frame, centerX, centerY, 0.7, 1, confirming ? "confirm" : "press");
      else drawNoteFrame(frame, centerX, centerY, 0.7, 0.72);
    }

    function drawLazyNotes(t) {
      const scroll = 450 * Number(LAZY.charts?.boned?.speed || 2.6);
      for (const note of state.chart?.notes || []) {
        if (note.played && note.hit && (!isHoldNote(note) || note.holdDone)) continue;
        if (note.judged && (!isHoldNote(note) || note.holdDone || !note.hit)) continue;
        const layout = noteLayout(note.lane);
        const diff = Number(note.time || 0) - t;
        const headTop = layout.y + diff * scroll * (layout.down ? -1 : 1);
        const endTime = typeof holdEndTime === "function" ? holdEndTime(note) : Number(note.time || 0) + Number(note.sLen || 0);
        const tailTop = layout.y + (endTime - t) * scroll * (layout.down ? -1 : 1);
        const headCenter = (note.hit && isHoldNote(note)) ? layout.y + 55 : headTop + 55;
        const tailCenter = tailTop + 55;
        if (headCenter < -180 && tailCenter < -180) continue;
        if (headCenter > canvas.height + 180 && tailCenter > canvas.height + 180) continue;
        if (isHoldNote(note)) drawHold(note, headCenter, tailCenter, note.hit ? 0.9 : 1);
        if (!(note.hit && isHoldNote(note) && t > note.time)) {
          const frame = LAZY.notes?.lanes?.[note.lane % 4]?.tap?.[0];
          drawColoredNoteFrame(note.lane % 4, frame, layout.x + 55, headTop + 55, 0.7, 1, "tap");
        }
      }
    }

    function drawHealthIcon(image, frameIndex, x, y) {
      if (!imageReady(image)) return;
      const frameSize = image.naturalHeight;
      const frameCount = Math.max(1, Math.floor(image.naturalWidth / frameSize));
      const sourceFrame = Math.max(0, Math.min(frameCount - 1, frameIndex));
      ctx.drawImage(image, sourceFrame * frameSize, 0, frameSize, frameSize, x, y, 150, 150);
    }

    function drawSourceHud(t) {
      const health = clamp01(state.health);
      const playerStats = state.stats?.player || {
        score: 0,
        points: 0,
        judged: 0,
        judgments: { miss: 0 }
      };
      const barBgX = 339;
      const barBgY = 641;
      const barBgW = 601;
      const barBgH = 19;
      const barX = barBgX + 4;
      const barY = barBgY + 4;
      const barW = barBgW - 8;
      const barH = barBgH - 8;
      const splitX = barX + barW * (1 - health);
      ctx.save();
      ctx.fillStyle = "#111";
      ctx.fillRect(barBgX, barBgY, barBgW, barBgH);
      ctx.fillStyle = "#fff";
      ctx.fillRect(barX, barY, splitX - barX, barH);
      ctx.fillStyle = "#769ee8";
      ctx.fillRect(splitX, barY, barX + barW - splitX, barH);
      drawHealthIcon(scene.images.sansIcon, health > 0.8 ? 1 : 0, splitX - 124, barY - 75);
      drawHealthIcon(scene.images.boyfriendIcon, health < 0.2 ? 1 : 0, splitX - 26, barY - 75);
      ctx.fillStyle = "#fff";
      ctx.strokeStyle = "#000";
      ctx.lineWidth = 4;
      ctx.textAlign = "center";
      ctx.font = "700 20px monospace";
      const scoreText = `Score: ${Number(playerStats.score || 0).toLocaleString()} | Misses: ${Number(playerStats.judgments?.miss || 0)} | Rating: ${(accuracy(playerStats) * 100).toFixed(2)}%`;
      ctx.strokeText(scoreText, canvas.width * 0.5, barBgY + 38);
      ctx.fillText(scoreText, canvas.width * 0.5, barBgY + 38);
      ctx.restore();

      const distance = cinematicDistanceAt(t);
      if (distance > 0.1) {
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, canvas.width, distance);
        ctx.fillRect(0, canvas.height - distance, canvas.width, distance);
      }
    }

    isImportedSong = song => isLazyBones(song) || baseIsImportedSong(song);

    makeChart = function(song) {
      if (!isLazyBones(song)) return baseMakeChart(song);
      const chart = LAZY.charts.boned;
      return { ...clone(chart), notes: clone(chart.notes || []), events: clone(chart.events || []), timeline: clone(chart.timeline || []) };
    };

    stopExternalAudio = function() {
      const leaked = state.audio.inst === state.audio.lazyBonesInst;
      baseStopExternalAudio();
      const track = state.audio.lazyBonesInst;
      if (track) {
        try { track.pause(); track.currentTime = 0; } catch {}
      }
      if (leaked) state.audio.inst = null;
      if (!isLazyBones(state.currentSong)) document.body.classList.remove("lazy-bones-active");
    };

    songTime = function() {
      if (isLazyBones(state.currentSong) && state.audio.lazyBonesInst) return state.audio.lazyBonesInst.currentTime;
      return baseSongTime();
    };

    songEndTime = function() {
      if (isLazyBones(state.currentSong)) return totalTime();
      return baseSongEndTime();
    };

    function resetSceneState() {
      scene.cameraX = null;
      scene.cameraY = null;
      scene.cameraOffsetX = 0;
      scene.cameraOffsetY = 0;
      scene.lastTime = null;
      state.feeds.player.time = -10;
      state.feeds.opp.time = -10;
      Object.values(state.poses).forEach(pose => {
        if (!pose) return;
        pose.time = -10;
        pose.kind = "hit";
      });
      state.receptorFx.forEach(effect => { effect.time = -10; });
      state.hitGlow.length = 0;
      state.camera = { zoom: 1, focusX: canvas.width / 2, focusY: canvas.height / 2, sideTime: 0, lastSide: "opp", highwayX: 0, highwayY: 0 };
    }

    startSong = function(id = state.selectedSong, options = {}) {
      const song = SONGS[id] || state.currentSong;
      if (!isLazyBones(song)) {
        document.body.classList.remove("lazy-bones-active");
        if (state.audio.inst === state.audio.lazyBonesInst) state.audio.inst = null;
        return baseStartSong(id, options);
      }

      const audioContext = ensureAudio();
      if (audioContext.state === "suspended") audioContext.resume();
      stopExternalAudio();
      initAssets();
      const track = ensureAudioTrack();
      const onlineStart = Number(options.startAt);
      const isOnlineStart = Number.isFinite(onlineStart) || options.forceMode === "online";

      if (state.startTimer) clearTimeout(state.startTimer);
      state.startTimer = null;
      if (state.endTimer) clearTimeout(state.endTimer);
      state.endTimer = null;
      state.selectedSong = id;
      state.currentSong = song;
      state.mode = options.forceMode || (isOnlineStart ? "online" : (ui.versusToggle?.checked ? "versus" : "solo"));
      rebuildKeyMap();
      state.chart = makeChart(song);
      state.chart.notes = state.chart.notes.map((note, index) => ({ ...note, id: note.id == null ? index : note.id }));
      resetStats();
      state.health = 0.65;
      state.playing = true;
      state.songStart = 0;
      state.nextStep = 0;
      state.nextStepTime = 0;
      resetSceneState();
      document.body.classList.add("lazy-bones-active");

      if (isOnlineStart) {
        const now = typeof serverClockNow === "function" ? serverClockNow() : Date.now();
        state.network.matchStartAt = Number(options.startAt || now + 8000);
        state.network.pendingStartAt = state.network.matchStartAt;
        state.network.lastTrackSync = 0;
        state.network.ready = { host: false, guest: false };
      }

      ui.songTitle.textContent = song.title;
      ui.songSub.textContent = song.subtitle;
      ui.timer.textContent = `0:00 / ${formatTime(totalTime())}`;
      ui.modeLabel.textContent = state.mode === "versus" ? "1v1 Versus" : state.mode === "online" ? "Online Match" : "Solo Battle";
      ui.statusText.textContent = isOnlineStart ? "Match syncing" : "Lazy Bones";
      ui.statusSub.textContent = "Boned chart and source camera events are active.";
      ui.menu.classList.remove("show");
      ui.settings.classList.remove("show");
      ui.resultsWrap.classList.remove("show");
      if (typeof syncModeUI === "function") syncModeUI();

      track.pause();
      try { track.currentTime = 0; } catch {}
      if (!options.skipReload) {
        try { track.load(); } catch {}
      }
      if (state.mode === "online" && state.network?.matchStartAt) {
        if (typeof syncOnlinePlayback === "function") syncOnlinePlayback(true);
      } else {
        track.play().catch(() => {});
      }
      return null;
    };

    refreshHUD = function(t) {
      baseRefreshHUD(t);
      if (!isLazyBones(state.currentSong)) return;
      ui.timer.textContent = `${formatTime(t)} / ${formatTime(totalTime())}`;
      const section = sectionAt(t);
      ui.statusText.textContent = section?.turn === "player" ? "Boyfriend" : "Sans";
      ui.statusSub.textContent = "Original Boned camera, split receptors, and cinematic timeline.";
    };

    finish = function(failed = false) {
      if (isLazyBones(state.currentSong)) {
        try { state.audio.lazyBonesInst?.pause(); } catch {}
        document.body.classList.remove("lazy-bones-active");
      }
      return baseFinish(failed);
    };

    bg = function(song, t) {
      if (!isLazyBones(song)) return baseBg(song, t);
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    };

    updateCamera = function(t, dt) {
      baseUpdateCamera(t, dt);
      if (!isLazyBones(state.currentSong)) return;
      const camera = updateSourceCamera(t);
      state.camera.zoom = zoomAt(t, "game");
      state.camera.focusX = camera.x;
      state.camera.focusY = camera.y;
      state.camera.lastSide = camera.side;
      state.camera.highwayX = 0;
      state.camera.highwayY = 0;
    };

    stage = function(t) {
      if (!isLazyBones(state.currentSong)) return baseStage(t);
      drawLazyBonesStage(t);
    };

    receptors = function(t) {
      if (!isLazyBones(state.currentSong)) return baseReceptors(t);
      initAssets();
      drawWithHudCamera(t, () => {
        for (let lane = 0; lane < 8; lane += 1) drawLazyReceptor(lane, t);
      });
    };

    notes = function(t) {
      if (!isLazyBones(state.currentSong)) return baseNotes(t);
      initAssets();
      drawWithHudCamera(t, () => drawLazyNotes(t));
    };

    renderScene = function(songT, previewT) {
      const result = baseRenderScene(songT, previewT);
      if (isLazyBones(state.currentSong)) {
        const t = state.playing ? songT : 0;
        drawWithHudCamera(t, () => drawSourceHud(t));
      }
      return result;
    };

    cameraTargets = function() {
      if (isLazyBones(state.currentSong)) {
        const opponent = cameraTargetForSide("opp");
        const player = cameraTargetForSide("player");
        return { oppX: opponent.x, playerX: player.x, focusY: (opponent.y + player.y) * 0.5 };
      }
      return baseCameraTargets();
    };

    cameraPanProfile = function() {
      if (isLazyBones(state.currentSong)) return { zoom: Number(LAZY.stage?.defaultZoom || 0.9), bias: 1, hud: 0, hudClamp: 0, speed: Number(LAZY.stage?.cameraSpeed || 1) };
      return baseCameraPanProfile();
    };

    cameraPoseKeys = function() {
      if (isLazyBones(state.currentSong)) return { opp: "sans", player: "player" };
      return baseCameraPoseKeys();
    };

    if (typeof syncOnlinePlayback === "function" && typeof expectedOnlineSongTime === "function") {
      const baseSyncOnlinePlayback = syncOnlinePlayback;
      syncOnlinePlayback = function(force = false) {
        const targetTime = expectedOnlineSongTime();
        const result = baseSyncOnlinePlayback(force);
        if (targetTime == null || !isLazyBones(state.currentSong)) return result;
        const track = ensureAudioTrack();
        const now = typeof serverClockNow === "function" ? serverClockNow() : Date.now();
        const shouldPlay = now + 40 >= Number(state.network?.matchStartAt || 0);
        const duration = Number.isFinite(track.duration) && track.duration > 0 ? track.duration : null;
        const desired = Math.max(0, duration == null ? targetTime : Math.min(targetTime, Math.max(0, duration - 0.05)));
        if (force || Math.abs(Number(track.currentTime || 0) - desired) > 0.05) {
          try { track.currentTime = desired; } catch {}
        }
        if (shouldPlay) {
          if (track.paused && (duration == null || desired < duration - 0.05)) track.play().catch(() => {});
        } else if (!track.paused) track.pause();
        return targetTime;
      };
    }

    injectStyle();
    renderSongs();
  } catch (error) {
    console.error("Lazy Bones mode failed to initialize", error);
  }
})();

(() => {
  try {
    const G = window.GENOCIDE_DATA;
    if (!G || typeof SONGS === "undefined") return;

    const SONG_ID = "genocide";
    const SONG_SOURCE = "genocide";
    const genState = { ready: false, images: {}, groundCache: {}, referenceCache: {}, afterimages: { opponent: [], boyfriend: [] }, clockStart: 0, cacheKey: "genocide-v7" };
    const clamp01 = value => Math.max(0, Math.min(1, value));
    const DIR_TO_ANIM = {
      left: "singLEFT",
      down: "singDOWN",
      up: "singUP",
      right: "singRIGHT"
    };
    const LAYOUT = {
      stageScale: 0.5,
      stageX: 0,
      stageY: 10,
      destroyedAlpha: 0.22,
      fireX: 640,
      fireY: 708,
      fireScale: 0.86,
      fireAlpha: 0.56,
      fireGlowAlpha: 0.17,
      speakerX: 650,
      speakerY: 594,
      speakerScale: 0.5,
      vignetteAlpha: 0.38,
      roleScale: {
        opponent: 0.78,
        girlfriend: 0.58,
        boyfriend: 0.76
      },
      roleAnchor: {
        opponent: { x: 448, y: 646, mode: "ground" },
        boyfriend: { x: 930, y: 648, mode: "ground" },
        girlfriend: { x: 398, y: 252, mode: "ground" }
      },
      camera: {
        opponent: { x: 405, y: 480 },
        boyfriend: { x: 820, y: 500 }
      }
    };

    state.poses.tabi = state.poses.tabi || { lane: 1, time: -10, kind: "hit" };
    state.poses.gf = state.poses.gf || { lane: 1, time: -10, kind: "hit" };

    SONGS[SONG_ID] = {
      title: G.song.title,
      subtitle: G.song.subtitle,
      diff: G.song.diff,
      tempo: Number(G.song.bpm || 213),
      root: 38,
      scale: [0, 2, 3, 5, 7, 8, 10],
      prog: [0, 5, 3, 6],
      scroll: 1080,
      seed: 59,
      introBeats: 0,
      outroBeats: 4,
      palette: ["#0e0508", "#28090f", "#4d141e", "#090406", "#ff9a73", "#ffd2b3"],
      blurb: "Imported from VS Tabi Rework with the original Genocide hard chart, angry Tabi sprites, post-exp BF/GF, Genocide note skin, and the fire stage audio.",
      chartSource: SONG_SOURCE
    };

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
    const baseCameraTargets = typeof cameraTargets === "function" ? cameraTargets : null;
    const baseCameraPanProfile = typeof cameraPanProfile === "function" ? cameraPanProfile : null;
    const baseCameraPoseKeys = typeof cameraPoseKeys === "function" ? cameraPoseKeys : null;

    function clone(value) {
      return JSON.parse(JSON.stringify(value));
    }

    function assetUrl(src) {
      if (!src) return src;
      const text = String(src);
      return text.includes("?") ? text : `${text}?v=${genState.cacheKey}`;
    }

    function initAssets() {
      if (genState.ready) return;
      genState.ready = true;
      const sources = {
        back: G.stage.images.back,
        fire: G.stage.images.fire,
        glow: G.stage.images.glow,
        furniture: G.stage.images.furniture,
        sticks: G.stage.images.sticks,
        boombox: G.stage.images.boombox,
        destroyed: G.stage.images.destroyed,
        vignette: "assets/genocide-vignette.png",
        tabi: G.sprites.tabi.image,
        boyfriend: G.sprites.boyfriend.image,
        gf: G.sprites.gf.image,
        notes: G.sprites.notes.image
      };
      Object.entries(sources).forEach(([key, src]) => {
        if (!src) return;
        const image = new Image();
        image.src = assetUrl(src);
        genState.images[key] = image;
      });
    }

    function imageReady(image) {
      return !!(image && image.complete && image.naturalWidth);
    }

    function ensureAudioTracks() {
      if (!state.audio.genocideInst) {
        state.audio.genocideInst = new Audio(assetUrl(G.audio.inst));
        state.audio.genocideInst.preload = "auto";
        state.audio.genocideInst.volume = 0.92;
      }
      if (!state.audio.genocideVoices) {
        state.audio.genocideVoices = new Audio(assetUrl(G.audio.voices));
        state.audio.genocideVoices.preload = "auto";
        state.audio.genocideVoices.volume = 0.88;
      }
    }

    window.ensureGenocideAudio = ensureAudioTracks;
    window.prepareGenocideOnlineStart = function() {
      ensureAudioTracks();
      [state.audio.genocideInst, state.audio.genocideVoices].forEach(track => {
        if (!track) return;
        track.pause();
        try { track.currentTime = 0; } catch {}
        try { track.load(); } catch {}
      });
      return [state.audio.genocideInst, state.audio.genocideVoices];
    };

    function noteEndTime() {
      return (G.chart?.notes || []).reduce((max, note) => Math.max(max, Number(note.time || 0) + Math.max(0, Number(note.sLen || 0))), 0);
    }

    function totalTime() {
      ensureAudioTracks();
      const durations = [state.audio.genocideInst, state.audio.genocideVoices]
        .filter(Boolean)
        .map(track => Number(track.duration || 0))
        .filter(duration => Number.isFinite(duration) && duration > 0);
      const chartEnd = Math.max(noteEndTime() + 2, Number(G.chart?.songEndTime || 0));
      return durations.length ? Math.max(chartEnd, ...durations) : chartEnd;
    }

    function spriteByRole(role) {
      if (role === "opponent") return G.sprites.tabi;
      if (role === "girlfriend") return G.sprites.gf;
      return G.sprites.boyfriend;
    }

    function roleImageKey(role) {
      if (role === "opponent") return "tabi";
      if (role === "girlfriend") return "gf";
      return "boyfriend";
    }

    function animDuration(anim) {
      if (!anim?.frames?.length) return 0.24;
      return anim.frames.length / Math.max(1, Number(anim.fps || 24));
    }

    function animOffset(anim) {
      const rawOffset = anim?.offset || anim?.offsets || [0, 0];
      return {
        x: Number(rawOffset?.[0] || 0),
        y: Number(rawOffset?.[1] || 0)
      };
    }

    function missAnimName(sprite, hitAnim) {
      const lower = hitAnim + "miss";
      const upper = hitAnim + "Miss";
      if (sprite.animations[lower]) return lower;
      if (sprite.animations[upper]) return upper;
      return null;
    }

    function idleAnimName(sprite, role, t) {
      if (role === "girlfriend") {
        const beat = t / Math.max(0.001, Number(G.chart?.spb || 0.5));
        return Math.floor(beat) % 2 === 0 ? "danceLeft" : "danceRight";
      }
      return sprite.animations.idle ? "idle" : Object.keys(sprite.animations)[0];
    }

    function spriteAnimState(sprite, role, poseKey, t) {
      const pose = state.poses[poseKey] || { lane: 1, time: -10, kind: "hit" };
      const dir = DIRS[(pose.lane || 0) % 4] || "left";
      const hitAnim = DIR_TO_ANIM[dir];
      const missAnim = missAnimName(sprite, hitAnim);
      const age = performance.now() / 1000 - Number(pose.time || -10);
      if (age >= 0) {
        if (pose.kind === "miss" && missAnim && age < animDuration(sprite.animations[missAnim])) {
          return { name: missAnim, elapsed: age, loop: false };
        }
        if (sprite.animations[hitAnim] && age < animDuration(sprite.animations[hitAnim])) {
          return { name: hitAnim, elapsed: age, loop: false };
        }
      }
      const idle = idleAnimName(sprite, role, t);
      return { name: idle, elapsed: role === "girlfriend" ? t * 1.1 : t * 0.8, loop: true };
    }

    function frameGroundPoint(image, frame) {
      if (!imageReady(image) || !frame) return { x: 0, y: 0 };
      const key = image.src + "|" + (frame.name || [frame.x, frame.y, frame.w, frame.h].join(","));
      if (genState.groundCache[key]) return genState.groundCache[key];
      if (!frameGroundPoint.canvas) frameGroundPoint.canvas = document.createElement("canvas");
      const sample = frameGroundPoint.canvas;
      const sw = Math.max(1, Number(frame.w || frame.fw || 1));
      const sh = Math.max(1, Number(frame.h || frame.fh || 1));
      sample.width = sw;
      sample.height = sh;
      const sampleCtx = sample.getContext("2d", { willReadFrequently: true });
      sampleCtx.clearRect(0, 0, sw, sh);
      sampleCtx.drawImage(image, frame.x, frame.y, frame.w, frame.h, 0, 0, sw, sh);
      const pixels = sampleCtx.getImageData(0, 0, sw, sh).data;
      let row = sh - 1;
      for (; row >= 0; row--) {
        let found = false;
        for (let x = 0; x < sw; x++) {
          if (pixels[(row * sw + x) * 4 + 3] > 10) {
            found = true;
            break;
          }
        }
        if (found) break;
      }
      if (row < 0) row = sh - 1;
      let sumX = 0;
      let count = 0;
      for (let y = Math.max(0, row - 2); y <= row; y++) {
        for (let x = 0; x < sw; x++) {
          if (pixels[(y * sw + x) * 4 + 3] > 10) {
            sumX += x;
            count += 1;
          }
        }
      }
      const point = {
        x: Number(frame.fx || 0) + (count ? sumX / count : sw / 2),
        y: Number(frame.fy || 0) + row
      };
      genState.groundCache[key] = point;
      return point;
    }

    function roleAnchor(role) {
      const anchor = LAYOUT.roleAnchor?.[role];
      return {
        x: Number(anchor?.x || 0),
        y: Number(anchor?.y || 0),
        mode: anchor?.mode || "ground"
      };
    }

    function referenceAnimName(sprite, role) {
      if (role === "girlfriend" && sprite.animations?.danceLeft) return "danceLeft";
      if (sprite.animations?.idle) return "idle";
      return Object.keys(sprite.animations || {})[0];
    }

    function spriteReference(role) {
      if (genState.referenceCache[role]) return genState.referenceCache[role];
      const sprite = spriteByRole(role);
      const image = genState.images[roleImageKey(role)];
      if (!sprite || !imageReady(image)) return null;
      const animName = referenceAnimName(sprite, role);
      const anim = sprite.animations?.[animName];
      const frame = anim?.frames?.[0];
      if (!anim || !frame) return null;
      const reference = {
        anim,
        frame,
        offset: animOffset(anim),
        ground: frameGroundPoint(image, frame)
      };
      genState.referenceCache[role] = reference;
      return reference;
    }

    function roleRenderState(role, poseKey, t) {
      const sprite = spriteByRole(role);
      const image = genState.images[roleImageKey(role)];
      if (!sprite || !imageReady(image)) return null;
      const animState = spriteAnimState(sprite, role, poseKey, t);
      const anim = sprite.animations[animState.name] || sprite.animations.idle || Object.values(sprite.animations)[0];
      if (!anim?.frames?.length) return null;
      const frame = frameFromList(anim.frames, animState.elapsed, Number(anim.fps || 24), animState.loop);
      if (!frame) return null;
      const scale = Number(LAYOUT.roleScale[role] || 1) * Number(sprite.scale || 1);
      const currentOffset = animOffset(anim);
      const anchor = roleAnchor(role);
      let pos;
      if (anchor.mode === "fixed") {
        const reference = spriteReference(role);
        if (!reference?.frame) return null;
        const refOffset = reference.offset;
        pos = {
          x: anchor.x + (refOffset.x - currentOffset.x) * scale,
          y: anchor.y + (refOffset.y - currentOffset.y) * scale
        };
      } else {
        const ground = frameGroundPoint(image, frame);
        pos = {
          x: anchor.x + (Number(frame.fw || frame.w || 0) * 0.5 + Number(frame.fx || 0) - ground.x - currentOffset.x) * scale,
          y: anchor.y + (Number(frame.fh || frame.h || 0) + Number(frame.fy || 0) - ground.y - currentOffset.y) * scale
        };
      }
      return {
        image,
        frame,
        scale,
        pos,
        flipX: role === "boyfriend" ? false : !!sprite.flipX
      };
    }

    function drawShadow(x, y, width, alpha = 0.24) {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = "#060102";
      ctx.beginPath();
      ctx.ellipse(x, y, width * 0.5, width * 0.13, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    function drawRoleRender(role, render, alpha = 1) {
      if (!render) return;
      if (role !== "girlfriend") {
        const shadowWidth = Math.max(88, (render.frame.fw || render.frame.w || 240) * render.scale * 0.44);
        drawShadow(render.pos.x, render.pos.y + 12, shadowWidth, (role === "opponent" ? 0.3 : 0.22) * alpha);
      }
      drawAtlasFrame(render.image, render.frame, render.pos.x, render.pos.y, render.scale, alpha, render.flipX);
    }

    function drawRole(role, poseKey, t) {
      const render = roleRenderState(role, poseKey, t);
      if (!render) return null;
      drawRoleRender(role, render);
      return render;
    }

    function poseAge(poseKey) {
      return performance.now() / 1000 - Number(state.poses[poseKey]?.time || -10);
    }

    function trailPoseKey(role) {
      return role === "opponent" ? "tabi" : "player";
    }

    function cleanupAfterimages(role, now) {
      const list = genState.afterimages[role];
      if (!list) return;
      while (list.length && now - list[0].time > 0.11) list.shift();
    }

    function recordAfterimage(role, render) {
      const poseKey = trailPoseKey(role);
      if (!render || poseAge(poseKey) > 0.16) return;
      const now = performance.now() / 1000;
      cleanupAfterimages(role, now);
      const list = genState.afterimages[role];
      if (list.length && now - list[list.length - 1].time < 0.024) return;
      list.push({
        time: now,
        frame: render.frame,
        pos: { x: render.pos.x, y: render.pos.y },
        scale: render.scale,
        flipX: render.flipX,
        frameHeight: Number(render.frame?.fh || render.frame?.h || 0)
      });
      while (list.length > 3) list.shift();
    }

    function drawAfterimages(role) {
      const list = genState.afterimages[role];
      if (!list?.length) return;
      const now = performance.now() / 1000;
      cleanupAfterimages(role, now);
      const image = genState.images[role === "opponent" ? "tabi" : "boyfriend"];
      if (!imageReady(image)) return;
      const purpleTint = role === "opponent" ? "#c36fff" : "#9d83ff";
      const offsetDir = role === "opponent" ? -1 : 1;
      for (const echo of list.slice(-3)) {
        const age = now - echo.time;
        const p = clamp01(age / 0.11);
        const alpha = (role === "opponent" ? 0.85 : 0.62) * (1 - p);
        if (alpha <= 0.02) continue;
        const lift = (echo.frameHeight / 14) * p;
        const offsetX = offsetDir * (3.5 + p * 1.5);
        const offsetY = -(1.5 + p * 1.2) - lift * 0.25;
        ctx.save();
        ctx.globalCompositeOperation = "screen";
        ctx.filter = `blur(${(0.35 + p * 0.45).toFixed(1)}px) brightness(1.18)`;
        drawAtlasFrameSilhouette(image, echo.frame, echo.pos.x + offsetX, echo.pos.y + offsetY, echo.scale, alpha * 0.34, echo.flipX, purpleTint);
        ctx.restore();
        ctx.save();
        ctx.globalCompositeOperation = "screen";
        ctx.filter = `blur(${(0.5 + p * 0.9).toFixed(1)}px) brightness(${role === "opponent" ? 1.42 : 1.18})`;
        drawAtlasFrame(image, echo.frame, echo.pos.x, echo.pos.y - lift, echo.scale, alpha, echo.flipX);
        ctx.restore();
      }
    }

    function drawBackdropLayer(image, scale, yOffset = 0, alpha = 1, composite = "source-over") {
      if (!imageReady(image)) return;
      const width = image.naturalWidth * scale;
      const height = image.naturalHeight * scale;
      const x = (canvas.width - width) / 2 + Number(LAYOUT.stageX || 0);
      const y = Number(LAYOUT.stageY || 0) + yOffset;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.globalCompositeOperation = composite;
      ctx.drawImage(image, x, y, width, height);
      ctx.restore();
    }

    function drawAtlasBottomCentered(image, frame, x, y, scale, alpha = 1, flipX = false, composite = "source-over") {
      if (!imageReady(image) || !frame) return;
      const fw = Number(frame.fw || frame.w || 0);
      const fh = Number(frame.fh || frame.h || 0);
      const fx = Number(frame.fx || 0);
      const fy = Number(frame.fy || 0);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.globalCompositeOperation = composite;
      ctx.translate(x, y);
      if (flipX) ctx.scale(-1, 1);
      if (frame.rotated) {
        ctx.rotate(-Math.PI / 2);
        ctx.drawImage(image, frame.x, frame.y, frame.w, frame.h, -fh * scale / 2 - fx * scale, -fw * scale - fy * scale, fh * scale, fw * scale);
      } else {
        ctx.drawImage(image, frame.x, frame.y, frame.w, frame.h, -fw * scale / 2 - fx * scale, -fh * scale - fy * scale, fw * scale, fh * scale);
      }
      ctx.restore();
    }

    function genocideBeatPulse(t, sharpness = 0.22) {
      const spb = Math.max(0.001, Number(G.chart?.spb || 60 / Number(G.song?.bpm || 213)));
      const phase = (t / spb) % 1;
      return phase <= sharpness ? Math.pow(1 - phase / sharpness, 2.35) : 0;
    }

    function drawBottomCenteredImage(image, x, y, scale, alpha = 1, composite = "source-over") {
      if (!imageReady(image)) return;
      const width = image.naturalWidth * scale;
      const height = image.naturalHeight * scale;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.globalCompositeOperation = composite;
      ctx.drawImage(image, x - width / 2, y - height, width, height);
      ctx.restore();
    }

    function drawStageBackdrop(t) {
      const pulse = genocideBeatPulse(t, 0.18);
      drawBackdropLayer(genState.images.back, LAYOUT.stageScale, 0, 1);
      drawBackdropLayer(genState.images.destroyed, LAYOUT.stageScale, 0, LAYOUT.destroyedAlpha + pulse * 0.08, "screen");
      drawBackdropLayer(genState.images.furniture, LAYOUT.stageScale, 0, 0.96);
    }

    function drawStageFire(t) {
      const frame = frameFromList(G.stage.fireFrames || [], t * 0.7, 24, true);
      if (!frame || !imageReady(genState.images.fire)) return;
      const pulse = genocideBeatPulse(t, 0.22);
      const fireAlpha = LAYOUT.fireAlpha + pulse * 0.12;
      drawAtlasBottomCentered(genState.images.fire, frame, LAYOUT.fireX, LAYOUT.fireY, LAYOUT.fireScale, fireAlpha);
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      ctx.globalAlpha = LAYOUT.fireGlowAlpha + pulse * 0.16 + Math.sin(t * 3.6) * 0.025;
      drawAtlasBottomCentered(genState.images.fire, frame, LAYOUT.fireX, LAYOUT.fireY, LAYOUT.fireScale * 1.03, 1);
      ctx.restore();
    }

    function drawStageForeground() {
      drawBottomCenteredImage(genState.images.boombox, LAYOUT.speakerX, LAYOUT.speakerY, LAYOUT.speakerScale, 1);
    }

    function drawStagePostFX(t) {
      const pulse = genocideBeatPulse(t, 0.2);
      drawBackdropLayer(genState.images.sticks, LAYOUT.stageScale, 0, 0.82 + pulse * 0.08, "screen");
      if (imageReady(genState.images.vignette)) {
        ctx.save();
        ctx.globalAlpha = LAYOUT.vignetteAlpha + pulse * 0.1;
        ctx.drawImage(genState.images.vignette, 0, 0, canvas.width, canvas.height);
        ctx.restore();
      }
    }

    function currentNoteSkin() {
      return G.sprites.notes;
    }

    function drawGenocideReceptor(lane, x, y) {
      const notes = currentNoteSkin();
      const dir = sportingLaneKey(lane);
      const fx = state.receptorFx[lane];
      const age = performance.now() / 1000 - fx.time;
      const image = genState.images.notes;
      if (age < 0.16 && notes.confirm[dir]?.length) {
        const frame = frameFromList(notes.confirm[dir], age, 24, false);
        if (frame) {
          ctx.save();
          ctx.shadowBlur = 18;
          ctx.shadowColor = COLORS[lane];
          drawAtlasCentered(image, frame, x, y, 0.78 + (0.16 - age) * 0.58, 1 - age / 0.16);
          ctx.restore();
          return;
        }
      }
      const pressed = !!state.keysDown[lane];
      const pressFrames = notes.press[dir] || [];
      const frame = pressed && pressFrames.length ? frameFromList(pressFrames, performance.now() / 1000, 24, true) : notes.static[dir];
      if (!frame) return;
      ctx.save();
      ctx.shadowBlur = pressed ? 18 : 10;
      ctx.shadowColor = COLORS[lane];
      drawAtlasCentered(image, frame, x, y, pressed ? 0.76 : 0.72, lane < 4 ? 0.88 : 1);
      ctx.restore();
    }

    function drawGenocideNote(lane, x, y, scale, alpha = 1) {
      const frame = currentNoteSkin().gem[sportingLaneKey(lane)];
      if (!frame || !imageReady(genState.images.notes)) return;
      ctx.save();
      ctx.shadowBlur = 18;
      ctx.shadowColor = COLORS[lane];
      drawAtlasCentered(genState.images.notes, frame, x, y, 0.72 * scale, alpha);
      ctx.restore();
    }

    function drawGenocideSustain(note, headY, tailY, alpha = 1, x = laneX(note.lane)) {
      const hold = currentNoteSkin().hold[sportingLaneKey(note.lane)];
      if (!hold?.piece || !hold?.end || !imageReady(genState.images.notes)) return;
      const bodyScale = 0.84;
      const top = Math.min(headY, tailY);
      const bottom = Math.max(headY, tailY);
      const endH = (hold.end.fh || hold.end.h) * bodyScale;
      const bodyW = (hold.piece.fw || hold.piece.w) * bodyScale;
      const bodyTop = top + endH * 0.44;
      const bodyBottom = bottom - endH * 0.44;
      if (bodyBottom > bodyTop) drawAtlasStretchVertical(genState.images.notes, hold.piece, x, bodyTop, bodyW, bodyBottom - bodyTop, alpha * 0.88);
      drawAtlasCentered(genState.images.notes, hold.end, x, tailY, bodyScale, alpha);
    }

    isImportedSong = function(song) {
      return !!song && (song.chartSource === SONG_SOURCE || baseIsImportedSong(song));
    };

    makeChart = function(song) {
      if (song?.chartSource === SONG_SOURCE) return clone(G.chart);
      return baseMakeChart(song);
    };

    stopExternalAudio = function() {
      baseStopExternalAudio();
      [state.audio.genocideInst, state.audio.genocideVoices].forEach(track => {
        if (!track) return;
        try {
          track.pause();
          track.currentTime = 0;
        } catch {}
      });
    };

    songTime = function() {
      if (state.currentSong?.chartSource === SONG_SOURCE && state.audio.genocideInst) {
        const trackTime = Number(state.audio.genocideInst.currentTime || 0);
        if (!state.playing) return trackTime;
        const fallback = Math.max(0, performance.now() / 1000 - Number(genState.clockStart || 0));
        return Math.max(trackTime, fallback);
      }
      return baseSongTime();
    };

    songEndTime = function() {
      if (state.currentSong?.chartSource === SONG_SOURCE) return totalTime();
      return baseSongEndTime();
    };

    startSong = function(id = state.selectedSong, options = {}) {
      const song = SONGS[id] || state.currentSong;
      if (song?.chartSource !== SONG_SOURCE) return baseStartSong(id, options);
      const audioContext = ensureAudio();
      if (audioContext.state === "suspended") audioContext.resume();
      const skipReload = !!options.skipReload;
      stopExternalAudio();
      initAssets();
      ensureAudioTracks();
      state.selectedSong = id;
      state.currentSong = SONGS[id];
      state.mode = options.forceMode || (ui.versusToggle?.checked ? "versus" : "solo");
      ui.modeLabel.textContent = state.mode === "versus" ? "1v1 Versus" : "Solo Battle";
      rebuildKeyMap();
      state.chart = makeChart(state.currentSong);
      state.chart.notes = state.chart.notes.map(note => ({ ...note }));
      resetStats();
      state.health = 0.65;
      genState.clockStart = performance.now() / 1000;
      state.audio.genocideInst.currentTime = 0;
      state.audio.genocideVoices.currentTime = 0;
      state.songStart = 0;
      state.nextStep = 0;
      state.nextStepTime = 0;
      state.playing = true;
      if (state.mode === "online" && state.network?.matchStartAt) {
        state.audio.genocideInst.pause();
        state.audio.genocideVoices.pause();
        if (!skipReload) {
          state.audio.genocideInst.load();
          state.audio.genocideVoices.load();
        }
      } else {
        state.audio.genocideInst.play().catch(() => {});
        state.audio.genocideVoices.play().catch(() => {});
      }
      state.feeds.player.time = -10;
      state.feeds.opp.time = -10;
      genState.afterimages.opponent = [];
      genState.afterimages.boyfriend = [];
      Object.values(state.poses).forEach(pose => {
        pose.time = -10;
        pose.kind = "hit";
      });
      state.receptorFx.forEach(fx => fx.time = -10);
      state.camera = { zoom: 1, focusX: canvas.width / 2, focusY: canvas.height * 0.48, sideTime: 0, lastSide: "both", highwayX: 0, highwayY: 0 };
      ui.p1Box.style.display = state.mode === "versus" ? "block" : "none";
      ui.songTitle.textContent = state.currentSong.title;
      ui.songSub.textContent = state.currentSong.subtitle;
      ui.statusText.textContent = "Genocide";
      ui.statusSub.textContent = "Angry Tabi, post-exp BF/GF, the Genocide note skin, and the fire stage are active.";
      ui.timer.textContent = `0:00 / ${formatTime(totalTime())}`;
      ui.menu.classList.remove("show");
      ui.settings.classList.remove("show");
      ui.resultsWrap.classList.remove("show");
    };

    refreshHUD = function(t) {
      baseRefreshHUD(t);
      if (state.selectedSong !== SONG_ID) return;
      ui.timer.textContent = `${formatTime(t)} / ${formatTime(totalTime())}`;
      ui.statusText.textContent = t < 16 ? "Genocide intro" : "Genocide";
      ui.statusSub.textContent = t < 16
        ? "The original VS Tabi intro lead-in is still running before the note wall starts."
        : "Angry Tabi, the Genocide chart, and the Tabi noteskin are running from the original mod files.";
    };

    finish = function(failed = false) {
      if (state.currentSong?.chartSource === SONG_SOURCE) {
        [state.audio.genocideInst, state.audio.genocideVoices].forEach(track => {
          if (!track) return;
          try { track.pause(); } catch {}
        });
      }
      return baseFinish(failed);
    };

    bg = function(song, t) {
      if (state.selectedSong !== SONG_ID) return baseBg(song, t);
      const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
      gradient.addColorStop(0, "#030002");
      gradient.addColorStop(0.56, "#140306");
      gradient.addColorStop(1, "#090102");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const haze = ctx.createRadialGradient(canvas.width * 0.5, canvas.height * 0.34, 48, canvas.width * 0.5, canvas.height * 0.34, 560);
      haze.addColorStop(0, "rgba(255,144,88,0.12)");
      haze.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = haze;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    };

    stage = function(t) {
      if (state.selectedSong !== SONG_ID) return baseStage(t);
      initAssets();
      drawStageBackdrop(t);
      drawStageFire(t);
      drawStageForeground();
      const gfRender = roleRenderState("girlfriend", "gf", t);
      const oppRender = roleRenderState("opponent", "tabi", t);
      const bfRender = roleRenderState("boyfriend", "player", t);
      recordAfterimage("opponent", oppRender);
      recordAfterimage("boyfriend", bfRender);
      drawRoleRender("girlfriend", gfRender);
      drawAfterimages("opponent");
      drawRoleRender("opponent", oppRender);
      drawAfterimages("boyfriend");
      drawRoleRender("boyfriend", bfRender);
      drawStagePostFX(t);
    };

    receptors = function(t) {
      if (state.selectedSong !== SONG_ID || !imageReady(genState.images.notes)) return baseReceptors(t);
      const y = receptorY();
      ctx.strokeStyle = "rgba(255,255,255,0.09)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(canvas.width * 0.5, 72);
      ctx.lineTo(canvas.width * 0.5, 452);
      ctx.stroke();
      for (let lane = 0; lane < 8; lane++) {
        const x = laneX(lane);
        drawGenocideReceptor(lane, x, y);
        ctx.strokeStyle = "rgba(255,255,255,0.055)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x, y + 26);
        ctx.lineTo(x, 448);
        ctx.stroke();
      }
    };

    notes = function(t) {
      if (state.selectedSong !== SONG_ID || !imageReady(genState.images.notes)) return baseNotes(t);
      if (!state.chart) return;
      const scroll = state.currentSong.scroll;
      for (const note of state.chart.notes) {
        if (note.played && note.hit && (!isHoldNote(note) || note.holdDone)) continue;
        if (note.judged && note.side !== "opp" && (!isHoldNote(note) || note.holdDone || !note.hit)) continue;
        const diff = note.time - t;
        const x = laneX(note.lane);
        const y = receptorY() + diff * scroll;
        const tailY = receptorY() + (holdEndTime(note) - t) * scroll;
        if (y < -120 && tailY < -120) continue;
        if (y > canvas.height + 120 && tailY > canvas.height + 120) continue;
        const scale = clamp(1 - Math.pow(Math.abs(diff), 0.7) * 0.45, 0.75, 1.12);
        const alpha = note.side === "opp" ? 0.84 : 1;
        if (isHoldNote(note)) drawGenocideSustain(note, note.hit ? receptorY() : y, tailY, alpha * (note.hit ? 0.94 : 1), x);
        if (note.hit && isHoldNote(note) && t > note.time) continue;
        drawGenocideNote(note.lane, x, y, scale, alpha);
      }
    };

    if (baseCameraTargets) {
      cameraTargets = function() {
        if (state.selectedSong === SONG_ID) {
          return { oppX: Number(LAYOUT.camera.opponent.x || 405), playerX: Number(LAYOUT.camera.boyfriend.x || 820), focusY: Number(LAYOUT.camera.boyfriend.y || 500) };
        }
        return baseCameraTargets();
      };
    }

    if (baseCameraPanProfile) {
      cameraPanProfile = function() {
        if (state.selectedSong === SONG_ID) {
          return { zoom: 1.04, bias: 1.15, hud: 0.18, hudClamp: 58, speed: 3.4 };
        }
        return baseCameraPanProfile();
      };
    }

    if (baseCameraPoseKeys) {
      cameraPoseKeys = function() {
        if (state.selectedSong === SONG_ID) return { opp: "tabi", player: "player" };
        return baseCameraPoseKeys();
      };
    }

    if (typeof syncOnlinePlayback === "function" && typeof expectedOnlineSongTime === "function") {
      const baseSyncOnlinePlayback = syncOnlinePlayback;
      syncOnlinePlayback = function(force = false) {
        const targetTime = expectedOnlineSongTime();
        const base = baseSyncOnlinePlayback(force);
        if (targetTime == null || state.currentSong?.chartSource !== SONG_SOURCE) return base;
        ensureAudioTracks();
        const now = typeof serverClockNow === "function" ? serverClockNow() : Date.now();
        const shouldPlay = now + 40 >= (state.network?.matchStartAt || 0);
        for (const track of [state.audio.genocideInst, state.audio.genocideVoices]) {
          if (!track) continue;
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
          } else if (!track.paused) {
            track.pause();
          }
        }
        return targetTime;
      };
    }

    renderSongs();
  } catch (error) {
    console.error("Genocide mode failed to initialize", error);
  }
})();

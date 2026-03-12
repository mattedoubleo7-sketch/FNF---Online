(() => {
  try {
    const FS = window.FALLEN_STARS_DATA;
    if (!FS || typeof SONGS === "undefined") return;

    const SONG_ID = "ourBrokenConstellations";
    const SONG_SOURCE = "ourBrokenConstellations";
    const fsState = { ready: false, images: {}, groundCache: {} };
    const DEFAULT_NOTE_HOLD = window.PERSEVERANCE_DATA?.sprites?.notes?.default?.hold || null;
    const nowSec = () => performance.now() / 1000;
    const clamp01 = value => Math.max(0, Math.min(1, value));
    const DIR_TO_ANIM = {
      left: "singLEFT",
      down: "singDOWN",
      up: "singUP",
      right: "singRIGHT"
    };
    const LAYOUT = {
      bgX: -16,
      bgY: -18,
      bgScale: 0.5,
      starsScale: 0.5,
      starzX: 172,
      starzY: 54,
      starzScale: 0.66,
      groundX: -18,
      groundY: 78,
      groundScale: 0.5,
      rockLargeX: 760,
      rockLargeY: 130,
      rockLargeScale: 0.78,
      rockSmallX: 188,
      rockSmallY: 140,
      rockSmallScale: 0.66,
      sansScale: 0.6,
      bfScale: 0.52,
      gfScale: 0.48,
      roleGround: {
        opponent: { x: 306, y: 594 },
        girlfriend: { x: 582, y: 512 },
        boyfriend: { x: 806, y: 632 }
      }
    };
    const FS_ADD_CAMERA_ZOOM_TIMES = [19.672131, 27.540984, 29.508197, 31.47541, 33.442623, 35.409836, 37.377049, 39.344262, 41.311475, 45.491803, 49.180328, 51.147541, 53.114754, 55.081967, 57.04918, 64.918033, 82.622951, 94.42623, 96.393443, 97.377049, 110.163934, 112.131148, 113.114754, 127.868852, 129.836066, 131.803279, 143.606557, 145.57377, 180.983607, 182.95082, 184.918033, 186.885246, 188.852459, 190.819672, 192.786885, 194.754098, 196.721311, 204.590164, 212.459016, 228.196721];
    const FS_WILTER_CAMERA_ZOOMS = [[180.980533, 0.92], [182.947746, 0.92], [184.914959, 0.92], [186.882172, 0.92], [188.849385, 0.92], [190.816598, 0.92], [192.783811, 0.92], [194.751025, 0.92], [228.193648, 0.72], [230.163934, 0.72], [232.131148, 0.72], [234.098361, 0.72], [236.065574, 0.72], [238.032787, 0.72], [240, 0.72], [241.967213, 0.72], [243.934426, 0.72], [245.901639, 0.72], [247.868852, 0.72], [249.836066, 0.72], [251.803279, 0.72], [253.770492, 0.72], [255.737705, 0.72], [257.704918, 0.72]];

    state.poses.sans = state.poses.sans || { lane: 1, time: -10, kind: "hit" };
    state.poses.gf = state.poses.gf || { lane: 1, time: -10, kind: "hit" };

    SONGS[SONG_ID] = {
      title: FS.song.title,
      subtitle: FS.song.subtitle,
      diff: FS.song.diff,
      tempo: Number(FS.song.bpm || 122),
      root: 45,
      scale: [0, 2, 3, 5, 7, 8, 10],
      prog: [0, 5, 3, 6],
      scroll: 1180,
      seed: 53,
      introBeats: 0,
      outroBeats: 4,
      palette: ["#040715", "#151d3a", "#2f2d52", "#070811", "#bba8ff", "#f3d3ff"],
      blurb: "Imported from FNF x Fallen Stars with the original Our Broken Constellations hard chart, space stage, Sans/BF/GF atlases, and the original song audio.",
      chartSource: SONG_SOURCE
    };

    const baseIsImportedSong = isImportedSong;
    const baseMakeChart = makeChart;
    const baseStopExternalAudio = stopExternalAudio;
    const baseSongTime = songTime;
    const baseStartSong = startSong;
    const baseRefreshHUD = refreshHUD;
    const baseFinish = finish;
    const baseBg = bg;
    const baseStage = stage;
    const baseUpdateCamera = updateCamera;
    const baseReceptors = receptors;
    const baseNotes = notes;
    const baseCameraTargets = cameraTargets;
    const baseCameraPanProfile = cameraPanProfile;
    const baseCameraPoseKeys = cameraPoseKeys;

    function clone(value) {
      return JSON.parse(JSON.stringify(value));
    }

    function imageReady(image) {
      return !!(image && image.complete && image.naturalWidth);
    }

    function spriteByRole(role) {
      if (role === "opponent") return FS.sprites.sans;
      if (role === "girlfriend") return FS.sprites.gf;
      return FS.sprites.boyfriend;
    }

    function resetVfxState() {
      return {
        addIndex: 0,
        wilterIndex: 0,
        pulses: [],
        trails: [],
        blackAlpha: 0,
        blackHoldUntil: -1,
        blackCount: 0,
        lastTime: -1
      };
    }

    function fallenStarsVfx() {
      state.fallenStars = state.fallenStars || resetVfxState();
      return state.fallenStars;
    }

    function elasticOut(value) {
      const t = clamp01(value);
      if (t === 0 || t === 1) return t;
      return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (2 * Math.PI / 3)) + 1;
    }

    function roleBaseScale(role) {
      if (role === "opponent") return LAYOUT.sansScale;
      if (role === "girlfriend") return LAYOUT.gfScale;
      return LAYOUT.bfScale;
    }

    function initAssets() {
      if (fsState.ready) return;
      fsState.ready = true;
      const sources = {
        stars: FS.stage.images.stars,
        space: FS.stage.images.space,
        ground: "assets/fallen-stars-bg0.png",
        rockLarge: "assets/fallen-stars-rock-large.png",
        rockSmall: "assets/fallen-stars-rock-small.png",
        shooting: FS.sprites.shooting.image,
        sans: FS.sprites.sans.image,
        boyfriend: FS.sprites.boyfriend.image,
        gf: FS.sprites.gf.image,
        defaultNotes: window.PERSEVERANCE_DATA?.sprites?.notes?.default?.image
      };
      Object.entries(sources).forEach(([key, src]) => {
        if (!src) return;
        const image = new Image();
        image.src = src;
        fsState.images[key] = image;
      });
      if (typeof initSportingSprites === "function") initSportingSprites();
    }

    function ensureAudioTracks() {
      if (!state.audio.fallenStarsInst) {
        state.audio.fallenStarsInst = new Audio(FS.audio.inst);
        state.audio.fallenStarsInst.preload = "auto";
        state.audio.fallenStarsInst.volume = 0.95;
      }
      if (!state.audio.fallenStarsVoices) {
        state.audio.fallenStarsVoices = new Audio(FS.audio.voices);
        state.audio.fallenStarsVoices.preload = "auto";
        state.audio.fallenStarsVoices.volume = 0.92;
      }
    }

    window.ensureFallenStarsAudio = ensureAudioTracks;
    window.prepareFallenStarsOnlineStart = function() {
      ensureAudioTracks();
      [state.audio.fallenStarsInst, state.audio.fallenStarsVoices].forEach(track => {
        if (!track) return;
        track.pause();
        try { track.currentTime = 0; } catch {}
        try { track.load(); } catch {}
      });
      return [state.audio.fallenStarsInst, state.audio.fallenStarsVoices];
    };

    function totalTime() {
      ensureAudioTracks();
      const tracks = [state.audio.fallenStarsInst, state.audio.fallenStarsVoices].filter(Boolean);
      const durations = tracks
        .map(track => Number(track.duration || 0))
        .filter(duration => Number.isFinite(duration) && duration > 0);
      return durations.length ? Math.max(Number(FS.chart.totalTime || 0), ...durations) : Number(FS.chart.totalTime || 0);
    }

    function animDuration(anim) {
      if (!anim?.frames?.length) return 0.25;
      return anim.frames.length / Math.max(1, Number(anim.fps || 24));
    }

    function missAnimName(sprite, hitAnim) {
      const lower = hitAnim + "miss";
      const upper = hitAnim + "Miss";
      if (sprite.animations[lower]) return lower;
      if (sprite.animations[upper]) return upper;
      return null;
    }

    function idleAnimName(sprite, t) {
      if (sprite === FS.sprites.gf) {
        const beat = t / Math.max(0.001, Number(FS.chart.spb || 0.5));
        return Math.floor(beat) % 2 === 0 ? "danceLeft" : "danceRight";
      }
      return "idle";
    }

    function spriteAnimState(sprite, poseKey, t) {
      const pose = state.poses[poseKey] || { lane: 1, time: -10, kind: "hit" };
      const dir = DIRS[(pose.lane || 0) % 4] || "left";
      const hitAnim = DIR_TO_ANIM[dir];
      const missAnim = missAnimName(sprite, hitAnim);
      const age = nowSec() - Number(pose.time || -10);
      if (age >= 0) {
        if (pose.kind === "miss" && missAnim && age < animDuration(sprite.animations[missAnim])) {
          return { name: missAnim, elapsed: age, loop: false };
        }
        if (sprite.animations[hitAnim] && age < animDuration(sprite.animations[hitAnim])) {
          return { name: hitAnim, elapsed: age, loop: false };
        }
      }
      const idle = idleAnimName(sprite, t);
      return { name: idle, elapsed: sprite === FS.sprites.gf ? t * 1.25 : t, loop: true };
    }

    function roleGroundAnchor(role) {
      const anchor = LAYOUT.roleGround?.[role];
      return {
        x: Number(anchor?.x || 0),
        y: Number(anchor?.y || 0)
      };
    }

    function roleRenderState(role, poseKey, t) {
      const sprite = spriteByRole(role);
      const imageKey = role === "boyfriend" ? "boyfriend" : (role === "girlfriend" ? "gf" : "sans");
      const image = fsState.images[imageKey];
      if (!sprite || !imageReady(image)) return null;
      const animState = spriteAnimState(sprite, poseKey, t);
      const anim = sprite.animations[animState.name] || sprite.animations.idle;
      if (!anim?.frames?.length) return null;
      const frame = frameFromList(anim.frames, animState.elapsed, Number(anim.fps || 24), animState.loop);
      if (!frame) return null;
      const scale = roleBaseScale(role) * Number(sprite.scale || 1);
      const groundAnchor = roleGroundAnchor(role);
      const fw = Number(frame.fw || frame.w || 0);
      const fh = Number(frame.fh || frame.h || 0);
      const fx = Number(frame.fx || 0);
      const fy = Number(frame.fy || 0);
      const currentOffset = animOffset(anim);
      const currentGround = frameGroundPoint(image, frame);
      const pos = {
        x: groundAnchor.x + (fw * 0.5 + fx - currentGround.x - currentOffset.x) * scale,
        y: groundAnchor.y + (fh + fy - currentGround.y - currentOffset.y) * scale
      };
      const flipX = role === "boyfriend" ? false : !!sprite.flipX;
      return {
        role,
        sprite,
        image,
        anim,
        frame,
        scale,
        pos,
        flipX,
        frameHeight: Number(frame.fh || frame.h || 0) * scale
      };
    }

    function drawShadow(x, y, width, alpha = 0.24) {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = "#03040a";
      ctx.beginPath();
      ctx.ellipse(x, y, width * 0.5, width * 0.13, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    function animOffset(anim) {
      const rawOffset = anim?.offset || anim?.offsets || [0, 0];
      return {
        x: Number(rawOffset?.[0] || 0),
        y: Number(rawOffset?.[1] || 0)
      };
    }

    function frameGroundPoint(image, frame) {
      if (!imageReady(image) || !frame) return { x: 0, y: 0 };
      const key = image.src + "|" + (frame.name || [frame.x, frame.y, frame.w, frame.h].join(","));
      if (fsState.groundCache[key]) return fsState.groundCache[key];
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
      const avgX = count ? (sumX / count) : (sw / 2);
      const point = {
        x: Number(frame.fx || 0) + avgX,
        y: Number(frame.fy || 0) + row
      };
      fsState.groundCache[key] = point;
      return point;
    }


    function drawRole(role, poseKey, t) {
      const render = roleRenderState(role, poseKey, t);
      if (!render) return;
      const shadowWidth = Math.max(92, (render.frame.fw || render.frame.w || 240) * render.scale * (role === "opponent" ? 0.48 : 0.42));

      if (role !== "girlfriend") {
        drawShadow(
          render.pos.x,
          render.pos.y + 12,
          shadowWidth,
          role === "boyfriend" ? 0.22 : 0.28
        );
      }

      drawAtlasFrame(render.image, render.frame, render.pos.x, render.pos.y, render.scale, 1, render.flipX);
    }

    function spawnRoleTrail(role, poseKey, t, alpha = 0.6) {
      const render = roleRenderState(role, poseKey, t);
      if (!render) return;
      fallenStarsVfx().trails.push({
        ...render,
        createdAt: t,
        alpha
      });
    }

    function triggerWilterZoom(t, targetZoom) {
      const vfx = fallenStarsVfx();
      vfx.pulses.push({ type: "wilter", createdAt: t, amount: 0.045 + targetZoom * 0.068 });
      if (vfx.blackCount < 3) {
        vfx.blackAlpha = Math.max(vfx.blackAlpha, (vfx.blackCount + 1) * 0.22);
        vfx.blackHoldUntil = t + 0.08;
      }
      vfx.blackCount += 1;
      spawnRoleTrail("boyfriend", "player", t, 0.6);
      spawnRoleTrail("opponent", "sans", t, 1);
    }

    function updateVfxTimeline(t, dt) {
      const vfx = fallenStarsVfx();
      if (vfx.lastTime >= 0 && t + 0.25 < vfx.lastTime) {
        state.fallenStars = resetVfxState();
      }
      vfx.lastTime = t;
      while (vfx.addIndex < FS_ADD_CAMERA_ZOOM_TIMES.length && t >= FS_ADD_CAMERA_ZOOM_TIMES[vfx.addIndex] - 0.001) {
        vfx.pulses.push({ type: "add", createdAt: FS_ADD_CAMERA_ZOOM_TIMES[vfx.addIndex], amount: 0.055 });
        vfx.addIndex += 1;
      }
      while (vfx.wilterIndex < FS_WILTER_CAMERA_ZOOMS.length && t >= FS_WILTER_CAMERA_ZOOMS[vfx.wilterIndex][0] - 0.001) {
        const [eventTime, targetZoom] = FS_WILTER_CAMERA_ZOOMS[vfx.wilterIndex];
        triggerWilterZoom(eventTime, targetZoom);
        vfx.wilterIndex += 1;
      }
      vfx.pulses = vfx.pulses.filter(pulse => {
        const age = t - pulse.createdAt;
        return age >= 0 && age <= (pulse.type === "wilter" ? 0.76 : 0.22);
      });
      vfx.trails = vfx.trails.filter(trail => {
        const age = t - trail.createdAt;
        return age >= 0 && age <= 1.02;
      });
      if (t > vfx.blackHoldUntil) {
        vfx.blackAlpha = Math.max(0, vfx.blackAlpha - Math.max(0.0001, dt) * 1.9);
      }
    }

    function currentVfxZoom(t) {
      let zoom = 0;
      for (const pulse of fallenStarsVfx().pulses) {
        const age = Math.max(0, t - pulse.createdAt);
        if (pulse.type === "add") {
          const p = clamp01(age / 0.22);
          zoom += pulse.amount * (1 - p) * (1 - p);
          continue;
        }
        const p = clamp01(age / 0.76);
        const settle = 1 - p;
        zoom += pulse.amount * (0.22 + 0.78 * settle + Math.sin(p * Math.PI * 3.2) * 0.16 * settle);
      }
      return zoom;
    }

    function drawVfxTrails(t) {
      const vfx = fallenStarsVfx();
      for (const trail of vfx.trails) {
        const age = Math.max(0, t - trail.createdAt);
        const p = clamp01(age / 1);
        const alpha = trail.alpha * (1 - p);
        if (alpha <= 0.001) continue;
        const scaleMul = 1 + 0.35 * p;
        const lift = (trail.frameHeight / 6) * p;
        ctx.save();
        ctx.globalCompositeOperation = "screen";
        ctx.filter = `blur(${(1.5 + p * 2.4).toFixed(1)}px) brightness(${trail.role === "opponent" ? 1.95 : 1.45})`;
        drawAtlasFrame(trail.image, trail.frame, trail.pos.x, trail.pos.y - lift, trail.scale * scaleMul, alpha, trail.flipX);
        ctx.restore();
      }
    }

    function drawVfxBlackOverlay() {
      const alpha = Math.min(0.66, fallenStarsVfx().blackAlpha);
      if (alpha <= 0.001) return;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
    }

    function drawStageBackdrop(t) {
      const stars = fsState.images.stars;
      const space = fsState.images.space;
      const rockLarge = fsState.images.rockLarge;
      const rockSmall = fsState.images.rockSmall;
      const shooting = fsState.images.shooting;

      if (imageReady(stars)) {
        ctx.save();
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.globalAlpha = 0.94;
        ctx.drawImage(
          stars,
          LAYOUT.bgX,
          LAYOUT.bgY,
          FS.stage.imageSize.stars[0] * LAYOUT.starsScale,
          FS.stage.imageSize.stars[1] * LAYOUT.starsScale
        );
        ctx.restore();
      }

      if (imageReady(space)) {
        ctx.save();
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.globalAlpha = 0.98;
        ctx.drawImage(
          space,
          LAYOUT.bgX,
          LAYOUT.bgY,
          FS.stage.imageSize.space[0] * LAYOUT.bgScale,
          FS.stage.imageSize.space[1] * LAYOUT.bgScale
        );
        ctx.restore();
      }

      if (imageReady(rockSmall)) {
        ctx.save();
        ctx.globalAlpha = 0.98;
        ctx.drawImage(
          rockSmall,
          LAYOUT.rockSmallX,
          LAYOUT.rockSmallY,
          rockSmall.naturalWidth * LAYOUT.rockSmallScale,
          rockSmall.naturalHeight * LAYOUT.rockSmallScale
        );
        ctx.restore();
      }

      if (imageReady(rockLarge)) {
        ctx.save();
        ctx.globalAlpha = 0.98;
        ctx.drawImage(
          rockLarge,
          LAYOUT.rockLargeX,
          LAYOUT.rockLargeY,
          rockLarge.naturalWidth * LAYOUT.rockLargeScale,
          rockLarge.naturalHeight * LAYOUT.rockLargeScale
        );
        ctx.restore();
      }

      if (imageReady(shooting) && FS.sprites.shooting.frames?.length) {
        const frame = frameFromList(FS.sprites.shooting.frames, t * 1.15, Number(FS.sprites.shooting.fps || 24), true);
        if (frame) {
          ctx.save();
          ctx.globalAlpha = 0.72;
          drawAtlasTopLeft(
            shooting,
            frame,
            LAYOUT.starzX + Math.sin(t * 0.35) * 18,
            LAYOUT.starzY + Math.cos(t * 0.28) * 7,
            LAYOUT.starzScale
          );
          ctx.restore();
        }
      }
    }

    function drawStageGround() {
      const ground = fsState.images.ground;
      if (!imageReady(ground)) return;
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.globalAlpha = 0.98;
      ctx.drawImage(
        ground,
        LAYOUT.groundX,
        LAYOUT.groundY,
        ground.naturalWidth * LAYOUT.groundScale,
        ground.naturalHeight * LAYOUT.groundScale
      );
      ctx.restore();
    }

    function fallenStarsUsesChallengeNotes() {
      return typeof sportingSpritesReady === "function"
        && sportingSpritesReady()
        && !!window.SPORTING_SPRITES?.notes;
    }

    function drawPlainFallbackSustain(note, headY, tailY, alpha, x = laneX(note.lane)) {
      const top = Math.min(headY, tailY);
      const bottom = Math.max(headY, tailY);
      const cap = 34;
      const bodyTop = top + cap * 0.44;
      const bodyBottom = bottom - cap * 0.44;
      if (bodyBottom > bodyTop) {
        ctx.save();
        ctx.globalAlpha = alpha * 0.7;
        ctx.shadowBlur = 18;
        ctx.shadowColor = COLORS[note.lane];
        ctx.fillStyle = COLORS[note.lane];
        ctx.fillRect(x - 14, bodyTop, 28, bodyBottom - bodyTop);
        ctx.globalAlpha = alpha * 0.4;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(x - 5, bodyTop + 2, 10, Math.max(0, bodyBottom - bodyTop - 4));
        ctx.restore();
      }
      drawSportingNote(note.lane, x, tailY, 0.52, alpha * 0.94);
    }

    function drawFallenStarsSustain(note, headY, tailY, alpha, x = laneX(note.lane)) {
      const hold = DEFAULT_NOTE_HOLD?.[sportingLaneKey(note.lane)];
      const img = fsState.images.defaultNotes;
      if (!hold || !imageReady(img)) return drawPlainFallbackSustain(note, headY, tailY, alpha, x);
      const bodyScale = 0.86;
      const top = Math.min(headY, tailY);
      const bottom = Math.max(headY, tailY);
      const endH = (hold.end.fh || hold.end.h) * bodyScale;
      const bodyW = (hold.piece.fw || hold.piece.w) * bodyScale;
      const bodyTop = top + endH * 0.44;
      const bodyBottom = bottom - endH * 0.44;
      if (bodyBottom > bodyTop) drawAtlasStretchVertical(img, hold.piece, x, bodyTop, bodyW, bodyBottom - bodyTop, alpha * 0.9);
      drawAtlasCentered(img, hold.end, x, tailY, bodyScale, alpha);
    }

    isImportedSong = song => !!song && (song.chartSource === SONG_SOURCE || baseIsImportedSong(song));

    makeChart = song => {
      if (song?.chartSource !== SONG_SOURCE) return baseMakeChart(song);
      return {
        ...clone(FS.chart),
        notes: clone(FS.chart.notes),
        timeline: clone(FS.chart.timeline || [])
      };
    };

    stopExternalAudio = function() {
      const leakedInst = state.audio.inst === state.audio.fallenStarsInst;
      const leakedVoices = state.audio.voices === state.audio.fallenStarsVoices;
      baseStopExternalAudio();
      [state.audio.fallenStarsInst, state.audio.fallenStarsVoices].forEach(track => {
        if (!track) return;
        try {
          track.pause();
          track.currentTime = 0;
        } catch {}
      });
      if (leakedInst) state.audio.inst = null;
      if (leakedVoices) state.audio.voices = null;
    };

    songTime = function() {
      if (state.currentSong?.chartSource === SONG_SOURCE && state.audio.fallenStarsInst) {
        return state.audio.fallenStarsInst.currentTime;
      }
      return baseSongTime();
    };

    function resetSceneState() {
      state.feeds.player.time = -10;
      state.feeds.opp.time = -10;
      Object.values(state.poses).forEach(poseState => {
        if (!poseState) return;
        poseState.time = -10;
        poseState.kind = "hit";
      });
      state.receptorFx.forEach(fx => { fx.time = -10; });
      state.hitGlow.length = 0;
      if (state.camera) {
        state.camera.x = 0;
        state.camera.target = 0;
        state.camera.sideTime = 0;
        state.camera.lastSide = "both";
      }
      state.fallenStars = resetVfxState();
    }

    startSong = function(id = state.selectedSong, options = {}) {
      const song = SONGS[id] || state.currentSong;
      if (song?.chartSource !== SONG_SOURCE) {
        if (state.audio.inst === state.audio.fallenStarsInst) state.audio.inst = null;
        if (state.audio.voices === state.audio.fallenStarsVoices) state.audio.voices = null;
        return baseStartSong(id, options);
      }

      const audioContext = ensureAudio();
      if (audioContext.state === "suspended") audioContext.resume();
      stopExternalAudio();
      initAssets();
      ensureAudioTracks();

      const inst = state.audio.fallenStarsInst;
      const voices = state.audio.fallenStarsVoices;
      const skipReload = !!options.skipReload;
      const onlineStart = Number(options.startAt);
      const isOnlineStart = Number.isFinite(onlineStart);

      if (state.startTimer) clearTimeout(state.startTimer);
      state.startTimer = null;
      if (state.endTimer) clearTimeout(state.endTimer);
      state.endTimer = null;

      state.selectedSong = id;
      state.currentSong = SONGS[id];
      state.mode = options.forceMode || (isOnlineStart ? "online" : (ui.versusToggle?.checked ? "versus" : "solo"));
      rebuildKeyMap();
      state.chart = makeChart(state.currentSong);
      state.chart.notes = state.chart.notes.map((note, index) => ({ ...note, id: note.id == null ? index : note.id }));
      resetStats();
      state.health = 0.65;
      state.playing = true;
      state.songStart = 0;
      state.nextStep = 0;
      state.nextStepTime = 0;

      if (isOnlineStart) {
        const now = typeof serverClockNow === "function" ? serverClockNow() : Date.now();
        state.network.matchStartAt = Number(options.startAt || (now + 8000));
        state.network.pendingStartAt = state.network.matchStartAt;
        state.network.lastTrackSync = 0;
        state.network.ready = { host: false, guest: false };
      }

      resetSceneState();
      ui.songTitle.textContent = state.currentSong.title;
      ui.songSub.textContent = state.currentSong.subtitle;
      ui.timer.textContent = "0:00 / " + formatTime(totalTime());
      ui.modeLabel.textContent = state.mode === "versus" ? "1v1 Versus" : state.mode === "online" ? "Online Match" : "Solo Battle";
      ui.statusText.textContent = isOnlineStart ? "Match syncing" : "Space stage";
      ui.statusSub.textContent = isOnlineStart
        ? "Both players finished loading. The server is holding an 8 second synced countdown before audio starts."
        : "Real Fallen Stars chart timing, stage positions, and audio are active.";
      ui.menu.classList.remove("show");
      ui.settings.classList.remove("show");
      ui.resultsWrap.classList.remove("show");
      if (typeof syncModeUI === "function") syncModeUI();

      inst.pause();
      voices.pause();
      try { inst.currentTime = 0; } catch {}
      try { voices.currentTime = 0; } catch {}
      if (!skipReload) {
        try { inst.load(); } catch {}
        try { voices.load(); } catch {}
      }

      if (state.mode === "online" && state.network?.matchStartAt) {
        if (typeof syncOnlinePlayback === "function") syncOnlinePlayback(true);
      } else {
        inst.play().catch(() => {});
        voices.play().catch(() => {});
      }
    };

    refreshHUD = function(t) {
      baseRefreshHUD(t);
      if (state.selectedSong !== SONG_ID) return;
      ui.timer.textContent = `${formatTime(t)} / ${formatTime(totalTime())}`;
      const section = state.chart?.timeline?.find(entry => t >= entry.startTime && t < entry.endTime);
      if (!section) return;
      ui.statusText.textContent = section.label;
      ui.statusSub.textContent = section.gfSection
        ? "Girlfriend vocal sections use the original Fallen Stars slot instead of a hand-placed screen anchor."
        : "Space stage art, Sans placement, and the original hard chart are active.";
    };

    finish = function(failed = false) {
      if (state.currentSong?.chartSource === SONG_SOURCE) {
        [state.audio.fallenStarsInst, state.audio.fallenStarsVoices].forEach(track => {
          if (!track) return;
          try { track.pause(); } catch {}
        });
      }
      return baseFinish(failed);
    };

    bg = function(song, t) {
      if (state.selectedSong !== SONG_ID) return baseBg(song, t);
      const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
      gradient.addColorStop(0, "#02040f");
      gradient.addColorStop(0.45, "#0d1632");
      gradient.addColorStop(1, "#080913");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const glow = ctx.createRadialGradient(canvas.width * 0.5, 90, 30, canvas.width * 0.5, 90, 520);
      glow.addColorStop(0, "rgba(196,173,255,0.18)");
      glow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    };

    updateCamera = function(t, dt) {
      baseUpdateCamera(t, dt);
      if (state.selectedSong !== SONG_ID) return;
      updateVfxTimeline(t, dt);
      state.camera.zoom += currentVfxZoom(t);
    };

    stage = function(t) {
      if (state.selectedSong !== SONG_ID) return baseStage(t);
      initAssets();
      drawStageBackdrop(t);
      drawStageGround();
      drawVfxTrails(t);
      drawRole("girlfriend", "gf", t);
      drawRole("opponent", "sans", t);
      drawRole("boyfriend", "player", t);
      drawVfxBlackOverlay();
    };

    receptors = function(t) {
      if (state.selectedSong !== SONG_ID || !fallenStarsUsesChallengeNotes()) return baseReceptors(t);
      const y = receptorY();
      ctx.strokeStyle = "rgba(255,255,255,0.1)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(canvas.width * 0.5, 72);
      ctx.lineTo(canvas.width * 0.5, 452);
      ctx.stroke();
      for (let lane = 0; lane < 8; lane++) {
        const x = laneX(lane);
        drawSportingReceptor(lane, x, y);
        ctx.strokeStyle = "rgba(255,255,255,0.06)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x, y + 26);
        ctx.lineTo(x, 448);
        ctx.stroke();
      }
    };

    notes = function(t) {
      if (state.selectedSong !== SONG_ID || !fallenStarsUsesChallengeNotes()) return baseNotes(t);
      if (!state.chart) return;
      const scroll = state.currentSong.scroll;
      for (const note of state.chart.notes) {
        if (note.played && note.hit && (!isHoldNote(note) || note.holdDone)) continue;
        if (note.judged && note.side !== "opp" && (!isHoldNote(note) || note.holdDone || !note.hit)) continue;
        if (note.invisible) continue;
        const diff = note.time - t;
        const x = laneX(note.lane);
        const y = receptorY() + diff * scroll;
        const tailY = receptorY() + (holdEndTime(note) - t) * scroll;
        if (y < -120 && tailY < -120) continue;
        if (y > canvas.height + 120 && tailY > canvas.height + 120) continue;
        const scale = clamp(1 - Math.pow(Math.abs(diff), 0.7) * 0.45, 0.75, 1.12);
        const alpha = note.side === "opp" ? 0.84 : 1;
        if (isHoldNote(note)) drawFallenStarsSustain(note, note.hit ? receptorY() : y, tailY, alpha * (note.hit ? 0.94 : 1), x);
        if (note.hit && isHoldNote(note) && t > note.time) continue;
        drawSportingNote(note.lane, x, y, 0.62 * scale, alpha);
      }
    };

    cameraTargets = function() {

      if (state.selectedSong === SONG_ID) {
        return { oppX: 414, playerX: 880, focusY: canvas.height * 0.47 };
      }
      return baseCameraTargets();
    };

    cameraPanProfile = function() {
      if (state.selectedSong === SONG_ID) {
        return { zoom: 1.16, bias: 1.18, hud: 0.22, hudClamp: 70, speed: 3.6 };
      }
      return baseCameraPanProfile();
    };

    cameraPoseKeys = function() {
      if (state.selectedSong === SONG_ID) return { opp: "sans", player: "player" };
      return baseCameraPoseKeys();
    };

    if (typeof syncOnlinePlayback === "function" && typeof expectedOnlineSongTime === "function") {
      const baseSyncOnlinePlayback = syncOnlinePlayback;
      syncOnlinePlayback = function(force = false) {
        const targetTime = expectedOnlineSongTime();
        const base = baseSyncOnlinePlayback(force);
        if (targetTime == null || state.currentSong?.chartSource !== SONG_SOURCE) return base;
        ensureAudioTracks();
        const now = typeof serverClockNow === "function" ? serverClockNow() : Date.now();
        const shouldPlay = now + 40 >= (state.network?.matchStartAt || 0);
        for (const track of [state.audio.fallenStarsInst, state.audio.fallenStarsVoices]) {
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
    console.error("Fallen Stars mode failed to initialize", error);
  }
})();

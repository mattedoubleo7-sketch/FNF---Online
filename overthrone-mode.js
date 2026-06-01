(() => {
  try {
    const OT = window.OVERTHRONE_DATA;
    if (!OT || typeof SONGS === "undefined") return;

    const DIR = ["left", "down", "up", "right"];
    const STEP_TIME = (OT.chart.spb || (60 / 138)) / 4;
    const SOURCE_STAGE_ZOOM = 0.45;
    const MADNESS_HIT_WINDOW = 0.05;
    const XML_STAGE_POINTS = {
      sans: [-275, 340],
      bf: [985, 502],
      gf: [470, 240],
      spirits: [-628, -466]
    };
    const XML_CAMERA_OFFSETS = {
      sans: [90, 0],
      bf: [-350, -50],
      gf: [-440, 240],
      spirits: [90, 0]
    };
    const clamp01 = value => Math.max(0, Math.min(1, value));
    const lerp = (a, b, t) => a + (b - a) * clamp01(t);
    const easeOut = value => 1 - Math.pow(1 - clamp01(value), 3);
    const eventDuration = steps => Math.max(0, Number(steps || 0) * STEP_TIME);
    const num = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
    function colorFromInt(value, fallback = "#000000") {
      const n = Number(value);
      if (!Number.isFinite(n)) return fallback;
      const rgb = (n >>> 0) & 0xffffff;
      return `#${rgb.toString(16).padStart(6, "0")}`;
    }
    function easeCurve(kind = "linear", dir = "In", value = 0) {
      const p = clamp01(value);
      const base = String(kind || "linear").toLowerCase();
      const direction = String(dir || "In").toLowerCase();
      const inCurve = x => {
        if (base === "quad") return x * x;
        if (base === "quart") return x * x * x * x;
        if (base === "circ") return 1 - Math.sqrt(Math.max(0, 1 - x * x));
        return x;
      };
      if (direction === "out") return 1 - inCurve(1 - p);
      if (direction === "inout") return p < 0.5 ? inCurve(p * 2) / 2 : 1 - inCurve((1 - p) * 2) / 2;
      return inCurve(p);
    }
    function tweenTrack(initial) {
      return { from: initial, to: initial, start: 0, duration: 0, ease: "linear", dir: "In" };
    }
    function trackValue(track, t) {
      if (!track.duration) return track.to;
      return lerp(track.from, track.to, easeCurve(track.ease, track.dir, (t - track.start) / track.duration));
    }
    function setTrack(track, eventTime, target, duration = 0, ease = "linear", dir = "In") {
      const startValue = trackValue(track, eventTime);
      track.from = duration > 0 ? startValue : target;
      track.to = target;
      track.start = eventTime;
      track.duration = duration;
      track.ease = ease || "linear";
      track.dir = dir || "In";
    }
    function seededNoise(seed) {
      const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
      return x - Math.floor(x);
    }
    const over = {
      initialized: false,
      images: {},
      fxCanvas: null,
      fxCtx: null,
      camera: { x: -162, y: 505, zoom: SOURCE_STAGE_ZOOM },
      eventCache: { t: NaN, value: null },
      sansNoteTiming: null,
      lastStatus: "",
      lastLyrics: []
    };

    state.poses.sans = state.poses.sans || { lane: 1, time: -10, kind: "hit" };
    state.poses.gf = state.poses.gf || { lane: 1, time: -10, kind: "hit" };
    state.poses.spirits = state.poses.spirits || { lane: 1, time: -10, kind: "hit" };

    SONGS.overthrone = {
      title: OT.song.title,
      subtitle: "Dustin",
      diff: OT.song.diff,
      tempo: OT.song.bpm,
      root: 38,
      scale: [0, 1, 3, 5, 6, 8, 10],
      prog: [0, 3, 5, 1],
      scroll: 1050,
      seed: 666,
      introBeats: 0,
      outroBeats: 4,
      palette: ["#110306", "#21060a", "#501015", "#0b0204", "#ff5a5d", "#b93b3e"],
      blurb: "Overthrone from Dustin with the original hard chart, throne room stage, Madness notes, anger drain, rocks, trails, and shader event timing.",
      chartSource: "overthrone"
    };

    const baseIsImportedSong = isImportedSong;
    const baseMakeChart = makeChart;
    const baseStartSong = startSong;
    const baseStopExternalAudio = stopExternalAudio;
    const baseSongTime = songTime;
    const baseSongEndTime = songEndTime;
    const baseHandlePress = handlePress;
    const baseHandleMisses = handleMisses;
    const baseUpdateCamera = updateCamera;
    const baseRefreshHUD = refreshHUD;
    const baseFinish = finish;
    const baseBg = bg;
    const baseStage = stage;
    const baseReceptors = receptors;
    const baseNotes = notes;
    const baseApplyDustinBloom = applyDustinBloom;

    function loadImage(key, src) {
      const img = new Image();
      img.decoding = "async";
      img.loading = "eager";
      img.src = src;
      over.images[key] = img;
    }

    function initAssets() {
      if (over.initialized) return;
      over.initialized = true;
      loadImage("rest", OT.stage.rest);
      loadImage("trees", OT.stage.trees);
      loadImage("back", OT.stage.back);
      loadImage("ground", OT.stage.ground);
      loadImage("candles", OT.stage.candles);
      loadImage("shade", OT.stage.shade);
      loadImage("asgore", OT.stage.asgore.image);
      loadImage("rocks", OT.stage.rocks.image);
      loadImage("finalRocks", OT.stage.finalRocks.image);
      loadImage("madnessBar", OT.hud.madnessBar.image);
      loadImage("fellIcon", OT.hud.icon.image);
      loadImage("warning", OT.hud.warning.image);
      loadImage("bf", OT.sprites.boyfriend.image);
      loadImage("gf", OT.sprites.girlfriend.image);
      loadImage("spirits", OT.sprites.spirits.image);
      loadImage("notes", OT.notes.image);
      loadImage("madnessNote", OT.notes.madness.image);
      Object.entries(OT.sprites.sans.images || {}).forEach(([key, src]) => loadImage(`sans:${key}`, src));
      scheduleOverthronePrewarm();
    }

    function imgReady(image) {
      return !!(image && image.complete && image.naturalWidth);
    }

    function coreReady() {
      initAssets();
      return imgReady(over.images.ground) && imgReady(over.images.rest) && imgReady(over.images.notes) && imgReady(over.images["sans:1"]) && imgReady(over.images.bf);
    }

    function decodeImage(image) {
      if (!image) return Promise.resolve();
      if (typeof image.decode === "function") return image.decode().catch(() => {});
      if (imgReady(image)) return Promise.resolve();
      return new Promise(resolve => {
        image.addEventListener("load", resolve, { once: true });
        image.addEventListener("error", resolve, { once: true });
      });
    }

    function warmFrame(task) {
      const image = over.images[task.imageKey];
      const frame = task.frame;
      if (!imgReady(image) || !frame) return;
      if (!over.warmCanvas) {
        over.warmCanvas = document.createElement("canvas");
        over.warmCtx = over.warmCanvas.getContext("2d");
        if (typeof setRenderQuality === "function") setRenderQuality(over.warmCtx);
      }
      const w = Math.max(1, Math.min(384, frame.w || image.naturalWidth));
      const h = Math.max(1, Math.min(384, frame.h || image.naturalHeight));
      if (over.warmCanvas.width !== w || over.warmCanvas.height !== h) {
        over.warmCanvas.width = w;
        over.warmCanvas.height = h;
      }
      over.warmCtx.clearRect(0, 0, w, h);
      over.warmCtx.drawImage(image, frame.x || 0, frame.y || 0, frame.w || image.naturalWidth, frame.h || image.naturalHeight, 0, 0, w, h);
    }

    function queueAnimWarmFrames(queue, anim) {
      const seen = new Set();
      for (const frame of anim?.frames || []) {
        const key = `${frame.image || "main"}:${frame.x}:${frame.y}:${frame.w}:${frame.h}`;
        if (seen.has(key)) continue;
        seen.add(key);
        queue.push({ imageKey: `sans:${frame.image || "1"}`, frame });
      }
    }

    function warmOverthroneEffectBuffers() {
      try {
        const source = ensureFxCanvas();
        fxScaled(source, 0.5, "blur(10px) brightness(1.28) saturate(1.8)");
        fxScaled(source, 0.5, "sepia(1) saturate(7) hue-rotate(310deg)");
      } catch {}
    }

    function scheduleOverthronePrewarm() {
      if (over.prewarmStarted) return;
      over.prewarmStarted = true;
      const idle = callback => {
        if (typeof requestIdleCallback === "function") requestIdleCallback(callback, { timeout: 800 });
        else setTimeout(() => callback({ timeRemaining: () => 8 }), 16);
      };
      setTimeout(() => {
        const imageKeys = [
          "notes",
          "madnessNote",
          "bf",
          "gf",
          "ground",
          "rest",
          "back",
          ...Object.keys(OT.sprites.sans.images || {}).map(key => `sans:${key}`)
        ];
        Promise.all(imageKeys.map(key => decodeImage(over.images[key]))).finally(() => {
          const queue = [];
          ["hell", "bitch", "it", "laugh"].forEach(name => queueAnimWarmFrames(queue, OT.sprites.sans.animations[name]));
          ["notes", "madnessNote", "bf"].forEach(key => {
            const image = over.images[key];
            if (imgReady(image)) queue.push({ imageKey: key, frame: { x: 0, y: 0, w: image.naturalWidth, h: image.naturalHeight } });
          });
          warmOverthroneEffectBuffers();
          const run = deadline => {
            const started = performance.now();
            while (queue.length && (deadline.timeRemaining() > 2 || performance.now() - started < 5)) warmFrame(queue.shift());
            if (queue.length) idle(run);
            else over.prewarmDone = true;
          };
          idle(run);
        });
      }, 0);
    }

    function ensureOverthroneAudio() {
      if (!state.audio.overthroneInst) {
        state.audio.overthroneInst = new Audio(OT.audio.inst);
        state.audio.overthroneInst.preload = "auto";
        state.audio.overthroneInst.volume = 0.92;
      }
      if (!state.audio.overthroneVoices) {
        state.audio.overthroneVoices = new Audio(OT.audio.voices);
        state.audio.overthroneVoices.preload = "auto";
        state.audio.overthroneVoices.volume = 0.84;
      }
      state.audio.overthroneInst.playbackRate = 1;
      state.audio.overthroneVoices.playbackRate = 1;
      return [state.audio.overthroneInst, state.audio.overthroneVoices];
    }
    window.ensureOverthroneAudio = ensureOverthroneAudio;
    window.prepareOverthroneOnlineStart = function() {
      initAssets();
      const tracks = ensureOverthroneAudio();
      tracks.forEach(track => {
        if (!track) return;
        track.pause();
        try { track.currentTime = 0; } catch {}
        try { track.load(); } catch {}
      });
      return tracks;
    };

    function cloneChart() {
      return {
        ...OT.chart,
        notes: OT.chart.notes.map(note => ({ ...note })),
        timeline: (OT.chart.timeline || []).map(section => ({ ...section }))
      };
    }

    function stepTime(step) {
      return step * STEP_TIME;
    }

    function currentStep(t) {
      return t / STEP_TIME;
    }

    function latestEventState(t) {
      const cacheT = Math.round(Number(t || 0) * 1000) / 1000;
      if (over.eventCache.value && over.eventCache.t === cacheT) return over.eventCache.value;
      const zoom = tweenTrack(0.45);
      const vignetteAmount = tweenTrack(0.1);
      const vignetteStrength = tweenTrack(0.1);
      const saturation = tweenTrack(1);
      const contrast = tweenTrack(1);
      const bloom = tweenTrack(1);
      const bars = tweenTrack(0);
      const hudAlpha = tweenTrack(1);
      const scrollSpeed = tweenTrack(Number(OT.song.speed || 2.6));
      const cover = tweenTrack(0);
      const lyrics = [];
      let cameraSide = null;
      let bump = 0;
      let coverColor = "#000000";
      let lyricColor = "#ffffff";
      let lyricSize = 32;
      let sansAnim = null;
      for (const event of OT.events || []) {
        const eventTime = Number(event.time || 0);
        if (eventTime > t) break;
        const p = event.params || [];
        switch (event.name) {
          case "Change Stage Zoom": {
            if (p[0] || p[1]) {
              setTrack(zoom, eventTime, num(p[5], trackValue(zoom, eventTime)), p[4] ? eventDuration(p[6]) : 0, p[7], p[8]);
            }
            break;
          }
          case "Screen Vignette": {
            const duration = p[0] ? eventDuration(p[3]) : 0;
            setTrack(vignetteAmount, eventTime, num(p[1], trackValue(vignetteAmount, eventTime)), duration, p[4], p[5]);
            setTrack(vignetteStrength, eventTime, num(p[2], trackValue(vignetteStrength, eventTime)), duration, p[4], p[5]);
            break;
          }
          case "Saturation Effect":
            setTrack(saturation, eventTime, num(p[1], trackValue(saturation, eventTime)), p[0] ? eventDuration(p[2]) : 0, p[3], p[4]);
            break;
          case "Contrast Effect":
            setTrack(contrast, eventTime, num(p[1], trackValue(contrast, eventTime)), p[0] ? eventDuration(p[2]) : 0, p[3], p[4]);
            break;
          case "Bloom Effect":
            setTrack(bloom, eventTime, num(p[1], trackValue(bloom, eventTime)), p[0] ? eventDuration(p[2]) : 0, p[3], p[4]);
            break;
          case "Cinematic Bars":
            setTrack(bars, eventTime, num(p[1], trackValue(bars, eventTime)), p[0] ? eventDuration(p[2]) : 0, p[3], p[4]);
            break;
          case "Change HUD Alpha":
            setTrack(hudAlpha, eventTime, num(p[1], trackValue(hudAlpha, eventTime)), p[0] ? eventDuration(p[2]) : 0, p[3], p[4]);
            break;
          case "Scroll Speed Change":
          case "Change Scroll Speed":
            setTrack(scrollSpeed, eventTime, num(p[1], trackValue(scrollSpeed, eventTime)), p[0] ? eventDuration(p[2]) : 0, p[3], p[4]);
            break;
          case "Camera Movement":
            cameraSide = Number(p[0] || 0) === 1 ? "player" : "opp";
            break;
          case "Camera Bump": {
            const age = t - eventTime;
            if (age >= 0 && age < 0.34) bump = Math.max(bump, num(p[0], 0.02) * (1 - age / 0.34));
            break;
          }
          case "Screen Coverer": {
            coverColor = colorFromInt(p[1], coverColor);
            setTrack(cover, eventTime, num(p[2], trackValue(cover, eventTime)), p[0] ? eventDuration(p[3]) : 0, p[4], p[5]);
            break;
          }
          case "Lyrics":
            if (p[0] === "Add Text") lyrics.push({ text: String(p[1] || ""), time: eventTime });
            if (p[0] === "Set Color") lyricColor = colorFromInt(p[2], lyricColor);
            if (p[0] === "Set Size") lyricSize = Math.max(20, Math.min(70, num(p[1], lyricSize)));
            if (p[0] === "Force remove all text") lyrics.length = 0;
            break;
          case "Play Animation": {
            const name = String(p[1] || "");
            const anim = OT.sprites.sans.animations[name];
            const duration = anim?.frames?.length ? Math.max(0.5, anim.frames.length / (anim.fps || 24) + 0.12) : 1.4;
            if (Number(p[0] || 0) === 0 && t - eventTime < duration) sansAnim = name;
            break;
          }
        }
      }
      const latestLyric = lyrics[lyrics.length - 1];
      const value = {
        zoomValue: trackValue(zoom, t),
        vignette: Math.max(trackValue(vignetteAmount, t), trackValue(vignetteStrength, t)),
        saturation: trackValue(saturation, t),
        contrast: trackValue(contrast, t),
        bloom: Math.max(0, trackValue(bloom, t) - 1),
        bars: trackValue(bars, t),
        hudAlpha: trackValue(hudAlpha, t),
        scrollSpeed: trackValue(scrollSpeed, t),
        cameraSide,
        bump,
        cover: trackValue(cover, t),
        coverColor,
        lyric: latestLyric && t - latestLyric.time < 2.4 ? latestLyric : null,
        lyricColor,
        lyricSize,
        sansAnim
      };
      over.eventCache = { t: cacheT, value };
      return value;
    }

    function currentScrollPx(t) {
      const speed = latestEventState(t).scrollSpeed || OT.song.speed || 2.6;
      return Math.max(520, Math.min(2450, SONGS.overthrone.scroll * (speed / Math.max(0.1, Number(OT.song.speed || 2.6)))));
    }

    function frameFor(anim, elapsed) {
      if (!anim || !anim.frames || !anim.frames.length) return null;
      return frameFromList(anim.frames, elapsed, anim.fps || 24, anim.loop !== false);
    }

    function overAtlasSub(image, frame, dx, dy, scale) {
      if (!image || !frame || !imgReady(image)) return;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      if (frame.rotated) {
        ctx.save();
        ctx.translate(dx, dy + frame.w * scale);
        ctx.rotate(-Math.PI / 2);
        ctx.drawImage(image, frame.x, frame.y, frame.w, frame.h, 0, 0, frame.w * scale, frame.h * scale);
        ctx.restore();
        return;
      }
      ctx.drawImage(image, frame.x, frame.y, frame.w, frame.h, dx, dy, frame.w * scale, frame.h * scale);
    }

    function drawOverAtlasFrame(image, frame, x, y, scale, alpha = 1, flipX = false, centered = false) {
      if (!frame || !imgReady(image)) return;
      const fw = frame.fw || frame.w;
      const fh = frame.fh || frame.h;
      const fx = frame.fx || 0;
      const fy = frame.fy || 0;
      const dx = -fw * scale / 2 - fx * scale;
      const dy = (centered ? -fh * scale / 2 : -fh * scale) - fy * scale;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(x, y);
      if (flipX) ctx.scale(-1, 1);
      overAtlasSub(image, frame, dx, dy, scale);
      ctx.restore();
    }

    function drawOverAtlasTopLeft(image, frame, x, y, scale, alpha = 1, flipX = false) {
      if (!frame || !imgReady(image)) return;
      const fw = frame.fw || frame.w;
      const fx = frame.fx || 0;
      const fy = frame.fy || 0;
      ctx.save();
      ctx.globalAlpha = alpha;
      if (flipX) {
        ctx.translate(x + fw * scale, y);
        ctx.scale(-1, 1);
        overAtlasSub(image, frame, -fx * scale, -fy * scale, scale);
      } else {
        overAtlasSub(image, frame, x - fx * scale, y - fy * scale, scale);
      }
      ctx.restore();
    }

    function imageForSprite(spriteKey, frame) {
      if (spriteKey === "sans") return over.images[`sans:${frame?.image || "1"}`];
      return over.images[spriteKey];
    }

    function poseAnimName(characterKey, sprite, t, forcedAnim = null) {
      if (forcedAnim && sprite.animations[forcedAnim]) return forcedAnim;
      const poseInfo = state.poses[characterKey] || { lane: 1, time: -10, kind: "hit" };
      const age = performance.now() / 1000 - Number(poseInfo.time || -10);
      if (age < 0.44 && Number.isFinite(poseInfo.lane)) {
        const name = `sing${DIR[poseInfo.lane % 4].toUpperCase()}`;
        const miss = `${name}miss`;
        if (poseInfo.kind === "miss" && sprite.animations[miss]?.frames?.length) return miss;
        if (sprite.animations[name]?.frames?.length) return name;
      }
      return "idle";
    }

    function drawCharacterSprite(spriteKey, characterKey, x, y, scale, t, alpha = 1, forcedAnim = null, extraFlip = null, tint = null) {
      const sprite = OT.sprites[spriteKey === "bf" ? "boyfriend" : spriteKey === "gf" ? "girlfriend" : spriteKey];
      if (!sprite) return;
      const animName = poseAnimName(characterKey, sprite, t, forcedAnim);
      const anim = sprite.animations[animName] || sprite.animations.idle;
      const poseInfo = state.poses[characterKey] || { time: -10 };
      const elapsed = animName === "idle" ? t : performance.now() / 1000 - Number(poseInfo.time || -10);
      const frame = frameFor(anim, elapsed);
      const image = imageForSprite(spriteKey, frame);
      if (!frame || !imgReady(image)) return;
      const off = anim.offset || [0, 0];
      const flip = extraFlip == null ? !!sprite.flipX : !!extraFlip;
      const bob = animName === "idle" ? Math.sin(t * 2.2 + x * 0.01) * 2.5 : 0;
      ctx.save();
      if (tint) {
        ctx.globalCompositeOperation = "source-over";
        ctx.shadowColor = tint;
        ctx.shadowBlur = 18;
      }
      drawOverAtlasFrame(image, frame, x - Number(off[0] || 0) * scale, y - Number(off[1] || 0) * scale + bob, scale, alpha, flip);
      ctx.restore();
    }

    function stageScale() {
      return Number(over.camera?.zoom || SOURCE_STAGE_ZOOM);
    }

    function stagePoint(x, y, scroll = 1) {
      const zoom = stageScale();
      return {
        x: (x - Number(over.camera?.x || 0) * scroll) * zoom + canvas.width * 0.5,
        y: (y - Number(over.camera?.y || 0) * scroll) * zoom + canvas.height * 0.5
      };
    }

    function drawCharacterSpriteAtStage(spriteKey, characterKey, stageX, stageY, t, alpha = 1, forcedAnim = null, extraFlip = null, tint = null, extra = {}) {
      const sprite = OT.sprites[spriteKey === "bf" ? "boyfriend" : spriteKey === "gf" ? "girlfriend" : spriteKey];
      if (!sprite) return;
      const animName = poseAnimName(characterKey, sprite, t, forcedAnim);
      const anim = sprite.animations[animName] || sprite.animations.idle;
      const poseInfo = state.poses[characterKey] || { time: -10 };
      const elapsed = animName === "idle" ? t : performance.now() / 1000 - Number(poseInfo.time || -10);
      const frame = frameFor(anim, elapsed);
      const image = imageForSprite(spriteKey, frame);
      if (!frame || !imgReady(image)) return;
      const off = anim.offset || [0, 0];
      const flip = extraFlip == null ? !!sprite.flipX : !!extraFlip;
      const point = stagePoint(stageX + Number(extra.x || 0), stageY + Number(extra.y || 0));
      point.x += Number(extra.screenX || 0);
      point.y += Number(extra.screenY || 0);
      const scale = Number(sprite.scale || 1) * stageScale() * Number(extra.scale || 1);
      const bob = animName === "idle" ? Math.sin(t * 2.2 + stageX * 0.01) * 2.5 : 0;
      ctx.save();
      if (tint) {
        ctx.globalCompositeOperation = "source-over";
        ctx.shadowColor = tint;
        ctx.shadowBlur = 18;
      }
      drawOverAtlasTopLeft(image, frame, point.x - Number(off[0] || 0) * scale, point.y - Number(off[1] || 0) * scale + bob, scale, alpha, flip);
      ctx.restore();
    }

    function drawStageImage(key, x, y, scale = 1, alpha = 1, scroll = 1, t = 0) {
      const image = over.images[key];
      if (!imgReady(image)) return;
      const sway = Math.sin(t * 0.35 + scroll * 3) * (1 - scroll) * 12;
      const point = stagePoint(x, y, scroll);
      const zoom = stageScale();
      // Flixel scales sprites around their center (origin), not the top-left.
      // Shift the draw back by half the growth so layers land where Dustin places them.
      const originX = (scale - 1) / 2 * image.naturalWidth * zoom;
      const originY = (scale - 1) / 2 * image.naturalHeight * zoom;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(
        image,
        point.x + sway - originX,
        point.y - originY,
        image.naturalWidth * scale * zoom,
        image.naturalHeight * scale * zoom
      );
      ctx.restore();
    }

    function fadeBetween(t, inAt, outAt, inDur, outDur, max = 1) {
      if (t < inAt) return 0;
      if (t < inAt + inDur) return max * easeOut((t - inAt) / inDur);
      if (t < outAt) return max;
      if (t < outAt + outDur) return max * (1 - easeOut((t - outAt) / outDur));
      return 0;
    }

    function rockPulse(t) {
      const beat = Math.floor(t / (OT.chart.spb || 0.4347826087));
      let latest = -Infinity;
      for (let b = 329; b <= 520; b += 4) {
        const bt = b * (OT.chart.spb || 0.4347826087);
        if (bt <= t) latest = bt;
        else break;
      }
      return Math.max(0, 1 - (t - latest) / 0.65);
    }

    function drawStageAnimation(atlas, imageKey, animKey, x, y, scale, t, alpha = 1, loopStart = 0) {
      const anim = atlas.animations[animKey];
      const frame = frameFor(anim, t - loopStart);
      const point = stagePoint(x, y);
      drawOverAtlasTopLeft(over.images[imageKey], frame, point.x, point.y, scale * stageScale(), alpha, false);
    }

    function drawSansTrails(t, forcedAnim) {
      const start = stepTime(1828);
      if (t < start) return;
      const elapsed = t - start;
      const spawn = Math.floor(elapsed / 0.2);
      for (let i = 0; i < 3; i++) {
        const index = spawn - i;
        const age = elapsed - index * 0.2;
        if (index < 0 || age < 0 || age > 0.3) continue;
        const alpha = 0.4 * (1 - age / 0.3);
        const dx = -600 + (seededNoise(index * 2 + 1) * 100 - 50);
        const dy = 200 + (seededNoise(index * 2 + 2) * 100 - 50);
        drawCharacterSpriteAtStage(
          "sans",
          "sans",
          XML_STAGE_POINTS.sans[0],
          XML_STAGE_POINTS.sans[1],
          t - age * 0.08,
          alpha,
          forcedAnim,
          false,
          "rgba(255,56,72,0.6)",
          { x: dx, y: dy }
        );
      }
    }

    function drawOverthroneStage(t) {
      initAssets();
      if (!coreReady()) {
        ctx.fillStyle = "#080203";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        return;
      }
      const fx = latestEventState(t);
      const bump = fx.bump * 120 + rockPulse(t) * 5;
      ctx.save();
      ctx.translate(Math.sin(t * 65) * bump, Math.cos(t * 59) * bump * 0.65);
      drawStageImage("rest", -700, -300, 1.4, 1, 0.2, t);
      drawStageImage("trees", 0, -200, 1.4, 1, 0.4, t);
      drawStageImage("back", -400, -200, 1.4, 1, 0.7, t);

      // SOULSOT spirits render BEHIND the throne (before the ground/throne layer).
      const spiritsAlpha = fadeBetween(t, stepTime(1060), stepTime(1316), 2, 1, 0.7);
      if (spiritsAlpha > 0.01) drawCharacterSpriteAtStage("spirits", "spirits", XML_STAGE_POINTS.spirits[0], XML_STAGE_POINTS.spirits[1], t, spiritsAlpha, null, false, "rgba(255,55,65,0.7)");

      drawStageImage("ground", -980, -500, 1.4, 1, 1, t);

      const asgoreAlpha = fadeBetween(t, stepTime(1060), stepTime(1572), 2, 1, 0.7);
      const stompSteps = [1308, 1324, 1340, 1356, 1372, 1388, 1404, 1420, 1436, 1452, 1468, 1484, 1500, 1516, 1532, 1548];
      const latestStompStep = stompSteps.filter(step => stepTime(step) <= t).pop();
      const stompAge = latestStompStep == null ? Infinity : t - stepTime(latestStompStep);
      const asgoreAnim = stompAge < 0.9 ? "stomp" : "idle";

      if (asgoreAlpha > 0.01) drawStageAnimation(OT.stage.asgore, "asgore", asgoreAnim, -580, -600, 1, t, asgoreAlpha, latestStompStep == null ? 0 : stepTime(latestStompStep));

      const gfAlpha = t >= stepTime(1828) ? Math.min(0.8, ((t - stepTime(1828)) / 3) * 0.8) : 0;
      if (gfAlpha > 0.01) drawCharacterSpriteAtStage("gf", "gf", XML_STAGE_POINTS.gf[0], XML_STAGE_POINTS.gf[1], t, gfAlpha, null, false);
      const forced = fx.sansAnim && OT.sprites.sans.animations[fx.sansAnim] ? fx.sansAnim : null;
      drawSansTrails(t, forced);
      drawCharacterSpriteAtStage("sans", "sans", XML_STAGE_POINTS.sans[0], XML_STAGE_POINTS.sans[1], t, 1, forced, false);
      drawCharacterSpriteAtStage("bf", "player", XML_STAGE_POINTS.bf[0], XML_STAGE_POINTS.bf[1], t, 1, null, false);

      drawStageImage("candles", -575, 625, 1.4, 1, 1, t);

      const latestRock = (() => {
        let result = -Infinity;
        for (let b = 329; b < 521; b += 4) {
          const bt = b * (OT.chart.spb || 0.4347826087);
          if (bt <= t) result = bt;
          else break;
        }
        return result;
      })();
      if (t - latestRock >= 0 && t - latestRock < 1.2) {
        drawStageAnimation(OT.stage.rocks, "rocks", "fall", -1200, -800, 1.1, t, 0.88, latestRock);
      }
      const finalAt = 521 * (OT.chart.spb || 0.4347826087);
      if (t >= finalAt) drawStageAnimation(OT.stage.finalRocks, "finalRocks", "ending", -900, -700, 2, t, 0.95, finalAt);
      ctx.restore();
    }

    function overthroneBg(song, t) {
      const g = ctx.createLinearGradient(0, 0, 0, canvas.height);
      g.addColorStop(0, "#120205");
      g.addColorStop(0.5, "#270509");
      g.addColorStop(1, "#070102");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    function laneDir(lane) {
      return DIR[lane % 4];
    }

    function overthroneLaneX(lane) {
      return lane < 4 ? 228 + lane * 124 : 784 + (lane % 4) * 124;
    }

    function overthroneReceptorY() {
      return 82;
    }

    function drawNoteFrame(frame, image, x, y, scale, alpha, centered = true) {
      drawOverAtlasFrame(image, frame, x, y, scale, alpha, false, centered);
    }

    function drawOverthroneSustain(note, x, topY, tailY, alpha = 1) {
      const skin = OT.notes.dirs[laneDir(note.lane)]?.hold;
      const img = over.images.notes;
      if (!skin?.piece || !skin?.end || !imgReady(img)) {
        ctx.save();
        ctx.globalAlpha = alpha * 0.65;
        ctx.fillStyle = note.specialType === "madness" ? "#ff3344" : COLORS[note.lane];
        ctx.fillRect(x - 12, Math.min(topY, tailY), 24, Math.abs(tailY - topY));
        ctx.restore();
        return;
      }
      const top = Math.min(topY, tailY);
      const bottom = Math.max(topY, tailY);
      const scale = 0.74;
      const endH = (skin.end.fh || skin.end.h) * scale;
      const bodyTop = top + endH * 0.36;
      const bodyBottom = bottom - endH * 0.36;
      if (bodyBottom > bodyTop) {
        const frame = skin.piece;
        const bodyW = (frame.fw || frame.w) * scale;
        ctx.save();
        ctx.globalAlpha = alpha * 0.85;
        const patternHeight = Math.max(12, (frame.fh || frame.h) * scale);
        for (let y = bodyTop; y < bodyBottom; y += patternHeight) {
          drawNoteFrame(frame, img, x, y + patternHeight * 0.5, scale, alpha * 0.85);
        }
        ctx.restore();
      }
      drawNoteFrame(skin.end, img, x, tailY, scale, alpha);
    }

    function drawOverthroneReceptor(lane, x, y, alpha = 1) {
      const dir = laneDir(lane);
      const skin = OT.notes.dirs[dir];
      const img = over.images.notes;
      if (!skin || !imgReady(img)) return arrow(x, y, 48, [Math.PI, Math.PI / 2, -Math.PI / 2, 0][lane % 4], COLORS[lane], "#fff", alpha);
      const fxInfo = state.receptorFx[lane] || { time: -10 };
      const age = performance.now() / 1000 - fxInfo.time;
      let frame = skin.static;
      let scale = 0.62;
      if (age >= 0 && age < 0.16 && skin.confirm?.length) {
        frame = frameFromList(skin.confirm, age, 24, false);
        scale = 0.66 + (0.16 - age) * 0.5;
      } else if (state.keysDown[lane] && skin.press?.length) {
        frame = frameFromList(skin.press, performance.now() / 1000, 24, true);
        scale = 0.62;
      }
      drawNoteFrame(frame, img, x, y, scale, alpha);
    }

    function drawNormalNote(note, x, y, scale, alpha) {
      const skin = OT.notes.dirs[laneDir(note.lane)];
      const frame = skin?.gem || skin?.static;
      if (frame && imgReady(over.images.notes)) drawNoteFrame(frame, over.images.notes, x, y, 0.58 * scale, alpha);
      else arrow(x, y, 42 * scale, [Math.PI, Math.PI / 2, -Math.PI / 2, 0][note.lane % 4], COLORS[note.lane], "#fff", alpha);
    }

    function drawMadnessNote(note, x, y, scale, alpha, t) {
      const frames = OT.notes.madness.anims[laneDir(note.lane)] || OT.notes.madness.anims.down;
      const frame = frameFromList(frames, t * 1.2, 18, true);
      if (!frame || !imgReady(over.images.madnessNote)) return drawNormalNote(note, x, y, scale, alpha);
      ctx.save();
      ctx.shadowColor = "rgba(255,34,50,0.95)";
      ctx.shadowBlur = 24;
      drawNoteFrame(frame, over.images.madnessNote, x + Math.sin(t * 22 + note.lane) * 3, y + Math.cos(t * 18 + note.lane) * 3, 0.52 * scale, alpha);
      ctx.restore();
    }

    function overthroneReceptors(t) {
      if (state.selectedSong !== "overthrone") return baseReceptors(t);
      initAssets();
      const fx = latestEventState(t);
      const y = overthroneReceptorY();
      ctx.save();
      // Online matches: every receptor stays fully visible the whole song
      // (no hudAlpha fade, no sansOpponentNoteAlpha gate on opp lanes).
      const isOnlineMatch = (typeof state !== "undefined" && state.mode === "online");
      ctx.globalAlpha = isOnlineMatch ? 1 : Math.max(0.12, Math.min(1, fx.hudAlpha));
      ctx.strokeStyle = "rgba(255,80,88,0.16)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(724, 20);
      ctx.lineTo(724, 368);
      ctx.stroke();
      for (let lane = 0; lane < 8; lane++) {
        const laneAlpha = isOnlineMatch ? 1 : (lane < 4 ? 0.72 * sansOpponentNoteAlpha(t) : 1);
        if (laneAlpha <= 0.01) continue;
        const x = overthroneLaneX(lane);
        drawOverthroneReceptor(lane, x, y, laneAlpha);
        ctx.strokeStyle = lane < 4 ? `rgba(255,72,84,${(0.06 * laneAlpha).toFixed(3)})` : "rgba(255,72,84,0.08)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x, typeof receptorGuideStartY === "function" ? receptorGuideStartY(y) : y + 26);
        ctx.lineTo(x, typeof receptorGuideEndY === "function" ? receptorGuideEndY(-72) : 376);
        ctx.stroke();
      }
      ctx.restore();
    }

    function sansNoteTiming() {
      if (!over.sansNoteTiming) {
        const animWindow = name => {
          let start = -1;
          for (const e of OT.events || []) {
            if (e.name === "Play Animation" && String((e.params || [])[1]) === name) { start = Number(e.time || 0); break; }
          }
          const anim = OT.sprites.sans.animations[name];
          const duration = anim?.frames?.length ? anim.frames.length / (anim.fps || 24) : 0;
          return { start, end: start < 0 ? -1 : start + duration };
        };
        const hell = animWindow("hell");
        const laugh = animWindow("laugh");
        const bitch = animWindow("bitch");
        const nextOppNote = (OT.chart.notes || []).find(note => note.side === "opp" && note.time > hell.start + 0.5);
        const hellRevealStart = hell.start < 0 ? -1 : Math.max(hell.start, Math.min(hell.end, Number(nextOppNote?.time || hell.end) - 0.5));
        over.sansNoteTiming = {
          hellRevealStart,
          hellRevealDuration: 0.45,
          laughHideStart: laugh.start,
          laughHideDuration: 0.25,
          bitchRevealStart: bitch.end,
          bitchRevealDuration: 0.45
        };
      }
      return over.sansNoteTiming;
    }

    function sansOpponentNoteAlpha(t) {
      const timing = sansNoteTiming();
      if (timing.hellRevealStart >= 0 && t < timing.hellRevealStart) return 0;
      let alpha = timing.hellRevealStart < 0 ? 1 : clamp01((t - timing.hellRevealStart) / timing.hellRevealDuration);
      if (timing.laughHideStart >= 0 && t >= timing.laughHideStart && (timing.bitchRevealStart < 0 || t < timing.bitchRevealStart)) {
        return 1 - clamp01((t - timing.laughHideStart) / timing.laughHideDuration);
      }
      if (timing.bitchRevealStart >= 0 && t >= timing.bitchRevealStart && t < timing.bitchRevealStart + timing.bitchRevealDuration) {
        alpha = clamp01((t - timing.bitchRevealStart) / timing.bitchRevealDuration);
      }
      return alpha;
    }

    function overthroneNoteHidden(note, t) {
      // In online matches every note stays visible (invisible flag ignored).
      try { if (typeof state !== "undefined" && state.mode === "online") return false; } catch (e) {}
      if (!note.invisible) return false;
      return !(note.side === "opp" && sansOpponentNoteAlpha(t) > 0.01);
    }

    function overthroneNotes(t) {
      if (state.selectedSong !== "overthrone") return baseNotes(t);
      if (!state.chart) return;
      initAssets();
      const fx = latestEventState(t);
      const scroll = currentScrollPx(t);
      ctx.save();
      // Online matches: force full HUD alpha so the dim-arrows shader event
      // never hides notes during play.
      const isOnlineMatch = (typeof state !== "undefined" && state.mode === "online");
      ctx.globalAlpha = isOnlineMatch ? 1 : Math.max(0.12, Math.min(1, fx.hudAlpha));
      for (const note of state.chart.notes) {
        if (overthroneNoteHidden(note, t)) continue;
        if (note.played && note.hit && (!isHoldNote(note) || note.holdDone)) continue;
        if (note.judged && note.side !== "opp" && (!isHoldNote(note) || note.holdDone || !note.hit)) continue;
        const diff = note.time - t;
        const x = overthroneLaneX(note.lane);
        const receptor = overthroneReceptorY();
        const y = typeof noteYFromDiff === "function" ? noteYFromDiff(diff, scroll, receptor) : receptor + diff * scroll;
        const tailY = typeof noteYFromDiff === "function" ? noteYFromDiff(holdEndTime(note) - t, scroll, receptor) : receptor + (holdEndTime(note) - t) * scroll;
        if (typeof notePastViewport === "function" ? notePastViewport(y, tailY, -150, canvas.height + 150) : (y < -150 && tailY < -150)) continue;
        if (typeof noteFutureViewport === "function" ? noteFutureViewport(y, tailY, -150, canvas.height + 150) : (y > canvas.height + 150 && tailY > canvas.height + 150)) continue;
        const scale = clamp(1 - Math.pow(Math.abs(diff), 0.7) * 0.45, 0.75, 1.12);
        // Online matches: opponent notes get full alpha (no sansOpponentNoteAlpha fade)
        const alpha = isOnlineMatch ? 1 : (note.side === "opp" ? 0.72 * sansOpponentNoteAlpha(t) : 1);
        if (isHoldNote(note)) drawOverthroneSustain(note, x, note.hit ? receptor : y, tailY, alpha * (note.hit ? 0.94 : 1));
        if (note.hit && isHoldNote(note) && t > note.time) continue;
        if (note.specialType === "madness") drawMadnessNote(note, x, y, scale, alpha, t);
        else drawNormalNote(note, x, y, scale, alpha);
      }
      ctx.restore();
    }

    function angerLevel() {
      return Math.floor(Math.max(0, Math.min(8, Number(state.overthrone?.angry || 0))));
    }

    function healthDrainForAnger(level = angerLevel()) {
      return [0, 0.003, 0.005, 0.008, 0.01, 0.012, 0.014, 0.016, 2][level] || 0;
    }

    function hitMadnessNote(note, lane) {
      note.judged = true;
      note.played = true;
      note.hit = true;
      state.overthrone.angry = Math.min(8, (Number(state.overthrone.angry) || 0) + 0.5);
      state.health = clamp(state.health - 0.1, 0, 1);
      state.receptorFx[lane] = { time: performance.now() / 1000, lane };
      state.hitGlow.push({ time: performance.now() / 1000, lane, color: "#ff3344" });
      if (state.hitGlow.length > 12) state.hitGlow.shift();
      state.shake = { time: performance.now() / 1000, intensity: 12 };
      feed("player", "AVOID", "#ff3344");
      if (angerLevel() >= 8) state.health = 0;
    }

    function overthroneHandlePress(lane) {
      if (state.selectedSong !== "overthrone") return baseHandlePress(lane);
      if (!state.playing || !state.chart) return;
      const t = songTime();
      const side = lane < 4 ? "opp" : "player";
      const controlsSide = typeof localControlsSide === "function"
        ? localControlsSide(side)
        : side === "player" || state.mode === "versus";
      if (!controlsSide) return;
      let best = null;
      let bestDiff = Infinity;
      for (const note of state.chart.notes) {
        if (note.judged || note.side !== side || note.lane !== lane) continue;
        const d = Math.abs(note.time - t);
        if (d < bestDiff) {
          bestDiff = d;
          best = note;
        }
        if (note.time - t > 0.2) break;
      }
      if (best?.specialType === "madness") {
        if (bestDiff <= MADNESS_HIT_WINDOW) hitMadnessNote(best, lane);
        return;
      }
      return baseHandlePress(lane);
    }

    function overthroneHandleMisses(t) {
      if (state.selectedSong !== "overthrone") return baseHandleMisses(t);
      for (const note of state.chart?.notes || []) {
        if (note.judged) continue;
        if (note.side === "opp" && state.mode === "solo" && t >= note.time) {
          note.judged = true;
          note.played = true;
          note.hit = true;
          if (isHoldNote(note)) {
            note.holdActive = true;
            note.holdDone = false;
            note.played = false;
          }
          if (note.character) pose(note.character, note.lane % 4, "hit");
          if (note.character === "sans" && state.health > 0.02) state.health = clamp(state.health - healthDrainForAnger(), 0, 1);
          continue;
        }
        if (state.mode === "online" && typeof localControlsSide === "function" && !localControlsSide(note.side)) continue;
        if (note.specialType === "madness" && t > note.time + 0.16) {
          note.judged = true;
          note.played = true;
          continue;
        }
        if (t > note.time + 0.16) {
          note.judged = true;
          note.played = true;
          judge(note.side, "miss", note.lane, note.character || "player");
        }
      }
    }

    function overthroneActiveSide(t, fx) {
      if (fx.cameraSide) return fx.cameraSide;
      let side = state.camera.lastSide || "both";
      for (const note of state.chart?.notes || []) {
        if (overthroneNoteHidden(note, t) || note.avoid) continue;
        if (note.time > t + 0.08) break;
        const activeHold = isHoldNote(note) && note.hit && !note.holdDone && holdEndTime(note) >= t - 0.02;
        const activeTap = !isHoldNote(note) && t >= note.time - 0.02 && t <= note.time + 0.08;
        if (!activeHold && !activeTap) continue;
        side = note.side || side;
      }
      return side;
    }

    function characterCameraWorld(key) {
      const spriteKey = key === "bf" ? "boyfriend" : key === "gf" ? "girlfriend" : key;
      const sprite = OT.sprites[spriteKey];
      const point = XML_STAGE_POINTS[key];
      const offset = XML_CAMERA_OFFSETS[key] || [0, 0];
      const idle = sprite?.animations?.idle?.frames?.[0];
      const scale = Number(sprite?.scale || 1);
      const width = Number((idle?.fw || idle?.w || 0) * scale);
      const height = Number((idle?.fh || idle?.h || 0) * scale);
      return {
        x: Number(point?.[0] || 0) + width * 0.5 + Number(offset[0] || 0),
        y: Number(point?.[1] || 0) + height * 0.5 + Number(offset[1] || 0) - 100
      };
    }

    function overthroneCameraTarget(side, fx) {
      const sans = characterCameraWorld("sans");
      const bf = characterCameraWorld("bf");
      const gf = characterCameraWorld("gf");
      // Default / resting camera is centered on the THRONE (the throne_room image center),
      // not the character midpoint. Camera Movement events still pan to Sans/BF.
      const groundImg = over.images.ground;
      const throne = groundImg && groundImg.naturalWidth
        ? { x: -980 + groundImg.naturalWidth / 2, y: -500 + groundImg.naturalHeight / 2 }
        : { x: 652, y: 392 };
      const target = side === "opp"
        ? sans
        : side === "player"
          ? bf
          : side === "gf"
            ? gf
            : throne;
      return {
        x: target.x,
        y: target.y,
        zoom: Number(fx.zoomValue || SOURCE_STAGE_ZOOM)
      };
    }

    function overthroneUpdateCamera(t, dt) {
      baseUpdateCamera(t, dt);
      if (state.selectedSong !== "overthrone") return;
      const fx = latestEventState(t);
      const side = overthroneActiveSide(t, fx);
      const target = overthroneCameraTarget(side, fx);
      const rate = 1 - Math.pow(0.0006, Math.max(0, dt || 0.016));
      over.camera.x += (target.x - over.camera.x) * rate;
      over.camera.y += (target.y - over.camera.y) * rate;
      over.camera.zoom += (target.zoom - over.camera.zoom) * rate;
      const angerShake = angerLevel() >= 1 ? Math.min(15, [0, 1, 3, 5, 7, 9, 11, 13, 18][angerLevel()] || 0) : 0;
      const singingShake = (() => {
        const p = state.poses.sans;
        const age = performance.now() / 1000 - Number(p?.time || -10);
        return age >= 0 && age < 0.14 ? 5 * (1 - age / 0.14) : 0;
      })();
      const rockShake = rockPulse(t) * 16 + (t >= 521 * (OT.chart.spb || 0.4347826087) && t < 521 * (OT.chart.spb || 0.4347826087) + 1.5 ? 34 : 0);
      const amount = angerShake * 0.22 + fx.bump * 280 + singingShake + rockShake;
      state.camera.focusX = canvas.width * 0.5;
      state.camera.focusY = canvas.height * 0.5;
      state.camera.zoom = 1;
      state.camera.lastSide = side;
      state.camera.highwayX = amount ? (Math.random() * 2 - 1) * amount : 0;
      state.camera.highwayY = amount ? (Math.random() * 2 - 1) * amount * 0.65 : 0;
    }

    function drawOverthroneHud(t) {
      const fx = latestEventState(t);
      const hudAlpha = Math.max(0.12, Math.min(1, fx.hudAlpha));
      const level = angerLevel();
      const barAnim = level > 0 ? String(Math.min(7, level)) : "idle";
      const barFrame = frameFor(OT.hud.madnessBar.animations[barAnim], t);
      const iconFrame = frameFor(OT.hud.icon.animations[level >= 4 ? "angry" : "idle"], t);
      const warningFrame = frameFor(OT.hud.warning.animations.warn, t);
      const iconShake = level ? (Math.random() * 2 - 1) * [0, 1, 3, 5, 7, 9, 11, 13][Math.min(7, level)] : 0;
      if (barFrame) drawOverAtlasTopLeft(over.images.madnessBar, barFrame, 0, 370, 0.8, hudAlpha, false);
      if (iconFrame) drawOverAtlasTopLeft(over.images.fellIcon, iconFrame, 100 + iconShake, 480 + iconShake * 0.4, 0.9, hudAlpha, false);

      const tutorialAlpha = t < 0.5 ? t / 0.5 : t < stepTime(45) ? 1 : t < stepTime(45) + 0.5 ? 1 - (t - stepTime(45)) / 0.5 : 0;
      if (tutorialAlpha > 0.01) {
        if (imgReady(over.images.shade)) {
          ctx.save();
          ctx.globalAlpha = tutorialAlpha * 0.72;
          ctx.drawImage(over.images.shade, 0, 0, canvas.width, canvas.height);
          ctx.restore();
        }
        if (warningFrame) drawOverAtlasTopLeft(over.images.warning, warningFrame, 800, 250, 1.4, tutorialAlpha, false);
      }

      if (fx.lyric) {
        const age = t - fx.lyric.time;
        const alpha = age < 0.2 ? age / 0.2 : age > 1.9 ? 1 - (age - 1.9) / 0.5 : 1;
        ctx.save();
        ctx.globalAlpha = clamp01(alpha);
        ctx.font = `900 ${fx.lyricSize}px Trebuchet MS, Arial, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.lineWidth = 7;
        ctx.strokeStyle = "rgba(0,0,0,0.8)";
        ctx.fillStyle = fx.lyricColor;
        ctx.strokeText(fx.lyric.text, canvas.width / 2, canvas.height - 108);
        ctx.fillText(fx.lyric.text, canvas.width / 2, canvas.height - 108);
        ctx.restore();
      }
    }

    function ensureFxCanvas() {
      if (!over.fxCanvas) {
        over.fxCanvas = document.createElement("canvas");
        over.fxCtx = over.fxCanvas.getContext("2d");
      }
      if (over.fxCanvas.width !== canvas.width || over.fxCanvas.height !== canvas.height) {
        over.fxCanvas.width = canvas.width;
        over.fxCanvas.height = canvas.height;
        if (typeof setRenderQuality === "function") setRenderQuality(over.fxCtx);
      }
      over.fxCtx.clearRect(0, 0, canvas.width, canvas.height);
      over.fxCtx.drawImage(canvas, 0, 0);
      return over.fxCanvas;
    }

    // Downscaled + filtered copy of `source`. Running the expensive full-screen blur /
    // chromatic passes on a half-res buffer is ~4x cheaper and looks the same once upscaled.
    function fxScaled(source, scale, filter) {
      const w = Math.max(1, Math.round(canvas.width * scale));
      const h = Math.max(1, Math.round(canvas.height * scale));
      if (!over.fxScaledCanvas) {
        over.fxScaledCanvas = document.createElement("canvas");
        over.fxScaledCtx = over.fxScaledCanvas.getContext("2d");
      }
      if (over.fxScaledCanvas.width !== w || over.fxScaledCanvas.height !== h) {
        over.fxScaledCanvas.width = w;
        over.fxScaledCanvas.height = h;
      }
      const c = over.fxScaledCtx;
      c.filter = filter || "none";
      c.clearRect(0, 0, w, h);
      c.drawImage(source, 0, 0, w, h);
      c.filter = "none";
      return over.fxScaledCanvas;
    }

    function drawOverthronePostFx(t) {
      if (state.selectedSong !== "overthrone" || !state.playing) return;
      const fx = latestEventState(t);
      const level = angerLevel();
      const active = Math.abs(fx.saturation - 1) + Math.abs(fx.contrast - 1) + fx.bloom + fx.vignette + fx.bars + fx.cover + level * 0.08 + fx.bump;
      const source = active > 0.01 ? ensureFxCanvas() : null;
      if (source && (Math.abs(fx.saturation - 1) > 0.01 || Math.abs(fx.contrast - 1) > 0.01)) {
        ctx.save();
        ctx.globalAlpha = 0.78;
        ctx.filter = `saturate(${Math.max(0.1, fx.saturation).toFixed(3)}) contrast(${Math.max(0.2, fx.contrast).toFixed(3)})`;
        ctx.drawImage(source, 0, 0);
        ctx.filter = "none";
        ctx.restore();
      }
      if (source && fx.bloom > 0.05) {
        const blurPx = Math.min(24, 5 + fx.bloom * 2.6) * 0.5;
        const bloomBuf = fxScaled(source, 0.5, `blur(${blurPx.toFixed(1)}px) brightness(1.28) saturate(1.8)`);
        ctx.save();
        ctx.globalCompositeOperation = "screen";
        ctx.globalAlpha = Math.min(0.72, 0.12 + fx.bloom * 0.13);
        ctx.drawImage(bloomBuf, 0, 0, canvas.width, canvas.height);
        ctx.fillStyle = `rgba(255,74,82,${Math.min(0.18, fx.bloom * 0.024).toFixed(3)})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.restore();
      }
      const chrom = Math.min(22, fx.bump * 200 + fx.bloom * 2.2 + level * 0.9);
      if (source && chrom > 1.5) {
        ctx.save();
        ctx.globalCompositeOperation = "screen";
        ctx.globalAlpha = Math.min(0.24, 0.05 + chrom * 0.008);
        const ca1 = fxScaled(source, 0.5, "sepia(1) saturate(7) hue-rotate(310deg)");
        ctx.drawImage(ca1, -chrom, 0, canvas.width, canvas.height);
        const ca2 = fxScaled(source, 0.5, "sepia(1) saturate(8) hue-rotate(145deg)");
        ctx.drawImage(ca2, chrom, 0, canvas.width, canvas.height);
        ctx.restore();
      }
      const vignetteAmount = Math.max(0.22, Math.min(0.74, 0.2 + fx.vignette * 0.18 + level * 0.035));
      ctx.save();
      const cx = canvas.width / 2;
      const cy = canvas.height / 2;
      const vignette = ctx.createRadialGradient(cx, cy, canvas.width * 0.18, cx, cy, canvas.width * 0.72);
      vignette.addColorStop(0, "rgba(110,8,14,0)");
      vignette.addColorStop(0.65, `rgba(110,8,14,${Math.min(0.18, vignetteAmount * 0.22).toFixed(3)})`);
      vignette.addColorStop(1, `rgba(0,0,0,${vignetteAmount.toFixed(3)})`);
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
      if (fx.bars > 0.01) {
        const h = Math.min(canvas.height / 2 + 10, ((canvas.height + 20) / 2) * fx.bars);
        ctx.save();
        ctx.fillStyle = `rgba(0,0,0,${Math.min(0.74, 0.28 + fx.bars * 0.15).toFixed(3)})`;
        ctx.fillRect(0, 0, canvas.width, h);
        ctx.fillRect(0, canvas.height - h, canvas.width, h);
        ctx.restore();
      }
      if (fx.cover > 0.01) {
        ctx.save();
        ctx.globalAlpha = Math.min(1, fx.cover);
        ctx.fillStyle = fx.coverColor;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.restore();
      }
      drawOverthroneHud(t);
    }

    isImportedSong = song => !!song && (song.chartSource === "overthrone" || baseIsImportedSong(song));
    makeChart = song => song?.chartSource === "overthrone" ? cloneChart() : baseMakeChart(song);
    songTime = () => state.currentSong?.chartSource === "overthrone" && state.audio.overthroneInst ? state.audio.overthroneInst.currentTime : baseSongTime();
    songEndTime = () => state.currentSong?.chartSource === "overthrone" ? Number(OT.chart.totalTime || 0) : baseSongEndTime();

    stopExternalAudio = function() {
      const leakedInst = state.audio.inst === state.audio.overthroneInst;
      const leakedVoices = state.audio.voices === state.audio.overthroneVoices;
      baseStopExternalAudio();
      [state.audio.overthroneInst, state.audio.overthroneVoices].forEach(track => {
        if (!track) return;
        try {
          track.pause();
          track.currentTime = 0;
        } catch {}
      });
      if (leakedInst) state.audio.inst = null;
      if (leakedVoices) state.audio.voices = null;
    };

    startSong = function(id = state.selectedSong, options = {}) {
      const song = SONGS[id] || state.currentSong;
      if (song?.chartSource !== "overthrone") return baseStartSong(id, options);
      const audioContext = ensureAudio();
      if (audioContext.state === "suspended") audioContext.resume();
      stopExternalAudio();
      initAssets();
      ensureOverthroneAudio();
      const inst = state.audio.overthroneInst;
      const voices = state.audio.overthroneVoices;
      const skipReload = !!options.skipReload;
      const onlineStart = Number(options.startAt);
      const isOnlineStart = Number.isFinite(onlineStart);
      if (state.startTimer) clearTimeout(state.startTimer);
      state.startTimer = null;
      if (state.endTimer) clearTimeout(state.endTimer);
      state.endTimer = null;
      state.audio.inst = inst;
      state.audio.voices = voices;
      state.selectedSong = id;
      state.currentSong = SONGS[id];
      state.mode = options.forceMode || (isOnlineStart ? "online" : (ui.versusToggle?.checked ? "versus" : "solo"));
      ui.modeLabel.textContent = state.mode === "versus" ? "1v1 Versus" : state.mode === "online" ? "Online Match" : "Solo Battle";
      rebuildKeyMap();
      state.chart = makeChart(state.currentSong);
      state.chart.notes = state.chart.notes.map((note, index) => ({ ...note, id: note.id == null ? index : note.id }));
      resetStats();
      state.health = 0.65;
      state.overthrone = { angry: 0 };
      inst.currentTime = 0;
      voices.currentTime = 0;
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
        voices.pause();
        if (!skipReload) {
          try { inst.load(); } catch {}
          try { voices.load(); } catch {}
        }
      } else {
        inst.play().catch(() => {});
        voices.play().catch(() => {});
      }
      state.feeds.player.time = -10;
      state.feeds.opp.time = -10;
      Object.values(state.poses).forEach(poseInfo => { poseInfo.time = -10; poseInfo.kind = "hit"; });
      state.receptorFx.forEach(fxInfo => fxInfo.time = -10);
      state.perseverance = { canDodge: false, prompt: false, dodging: false, dodged: false, resolved: false, dodgeStart: -10, flashTime: -10, gfAlpha: 0 };
      state.camera = { zoom: 1, focusX: canvas.width / 2, focusY: canvas.height * 0.45, sideTime: 0, lastSide: "both", highwayX: 0, highwayY: 0 };
      over.camera = { ...characterCameraWorld("sans"), zoom: SOURCE_STAGE_ZOOM };
      ui.p1Box.style.display = state.mode === "versus" || state.mode === "online" ? "block" : "none";
      ui.songTitle.textContent = state.currentSong.title;
      ui.songSub.textContent = state.currentSong.subtitle;
      ui.statusText.textContent = state.mode === "online" ? "Match syncing" : "Overthrone";
      ui.statusSub.textContent = state.mode === "online"
        ? "Both players finished loading. The server is holding an 8 second synced countdown before audio starts."
        : "Madness notes are avoid notes. Hitting them raises Sans' anger bar and makes his health drain worse.";
      ui.timer.textContent = `0:00 / ${formatTime(songEndTime())}`;
      ui.menu.classList.remove("show");
      ui.settings.classList.remove("show");
      ui.resultsWrap.classList.remove("show");
      if (state.mode === "online") {
        if (typeof syncModeUI === "function") syncModeUI();
        if (typeof syncOnlinePlayback === "function") syncOnlinePlayback(true);
      }
    };

    handlePress = overthroneHandlePress;
    handleMisses = overthroneHandleMisses;
    updateCamera = overthroneUpdateCamera;

    refreshHUD = function(t) {
      baseRefreshHUD(t);
      if (state.selectedSong !== "overthrone") return;
      ui.timer.textContent = `${formatTime(t)} / ${formatTime(songEndTime())}`;
      const level = angerLevel();
      ui.statusText.textContent = level >= 7 ? "RED DEMON" : level >= 4 ? "Sans is furious" : level >= 1 ? "Madness rising" : "Overthrone";
      ui.statusSub.textContent = level
        ? `Anger ${Math.min(7, level)}/7. Sans drains ${(healthDrainForAnger(level) * 100).toFixed(1)}% health per hit.`
        : "Avoid the red Madness notes. Missing them is safe; hitting them feeds the anger bar.";
    };

    finish = function(failed = false) {
      if (state.currentSong?.chartSource === "overthrone") {
        [state.audio.overthroneInst, state.audio.overthroneVoices].forEach(track => {
          if (!track) return;
          try { track.pause(); } catch {}
        });
      }
      return baseFinish(failed);
    };

    if (typeof syncOnlinePlayback === "function" && typeof expectedOnlineSongTime === "function") {
      const baseSyncOnlinePlayback = syncOnlinePlayback;
      syncOnlinePlayback = function(force = false) {
        const targetTime = expectedOnlineSongTime();
        const base = baseSyncOnlinePlayback(force);
        if (targetTime == null || state.currentSong?.chartSource !== "overthrone") return base;
        ensureOverthroneAudio();
        const now = typeof serverClockNow === "function" ? serverClockNow() : Date.now();
        const shouldPlay = now + 40 >= (state.network?.matchStartAt || 0);
        for (const track of [state.audio.overthroneInst, state.audio.overthroneVoices]) {
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
          } else if (!track.paused) track.pause();
        }
        return targetTime;
      };
    }

    bg = function(song, t) {
      if (state.selectedSong === "overthrone") return overthroneBg(song, t);
      return baseBg(song, t);
    };
    stage = function(t) {
      if (state.selectedSong === "overthrone") return drawOverthroneStage(t);
      return baseStage(t);
    };
    receptors = overthroneReceptors;
    notes = overthroneNotes;
    applyDustinBloom = function(t) {
      if (state.selectedSong === "overthrone") {
        drawOverthronePostFx(t);
        return;
      }
      baseApplyDustinBloom(t);
    };

    renderSongs();
  } catch (error) {
    console.error("Overthrone mode failed to initialize", error);
  }
})();

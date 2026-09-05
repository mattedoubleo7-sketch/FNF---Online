(() => {
  try {
    const LIMINAL = window.LIMINAL_LYRICS_DATA;
    if (!LIMINAL || typeof SONGS === "undefined") return;

    const SONG_ID = "liminalLyrics";
    const SONG_SOURCE = "liminalLyrics";
    const DIR = ["left", "down", "up", "right"];
    const DIR_ANIM = ["singLEFT", "singDOWN", "singUP", "singRIGHT"];
    const NOTE_COLORS = ["#c466ff", "#5ec3ff", "#67ff9a", "#ff5870"];
    const SOURCE_W = Number(LIMINAL.stage?.viewport?.[0] || 1280);
    const SOURCE_H = Number(LIMINAL.stage?.viewport?.[1] || 720);
    const scene = {
      initialized: false,
      images: {},
      video: null,
      lastVideoSync: -10,
      ambientBitmaps: {},
      ambientReady: {},
      warmed: false,
      warmCanvas: document.createElement("canvas"),
      videoFrame: document.createElement("canvas"),
      videoFrameCtx: null,
      videoFrameReady: false,
      stageSnapshot: document.createElement("canvas"),
      stageSnapshotCtx: null,
      fleshCanvas: document.createElement("canvas"),
      fleshCtx: null
    };
    scene.stageSnapshot.width = scene.fleshCanvas.width = SOURCE_W;
    scene.stageSnapshot.height = scene.fleshCanvas.height = SOURCE_H;
    scene.stageSnapshotCtx = scene.stageSnapshot.getContext("2d");
    scene.fleshCtx = scene.fleshCanvas.getContext("2d");
    scene.videoFrame.width = SOURCE_W;
    scene.videoFrame.height = SOURCE_H;
    scene.videoFrameCtx = scene.videoFrame.getContext("2d");
    scene.warmCanvas.width = 320;
    scene.warmCanvas.height = 180;
    scene.warmCtx = scene.warmCanvas.getContext("2d");

    SONGS[SONG_ID] = {
      title: LIMINAL.song?.title || "Liminal Lyrics",
      subtitle: LIMINAL.song?.subtitle || "Musical Empire source mod",
      diff: LIMINAL.song?.diff || "Hard (Original Chart)",
      tempo: Number(LIMINAL.song?.bpm || 86),
      root: 40,
      scale: [0, 2, 3, 5, 7, 8, 10],
      prog: [0, 5, 3, 6],
      scroll: 1305,
      seed: 91,
      introBeats: 0,
      outroBeats: 2,
      palette: ["#060606", "#211d18", "#6f6a58", "#020202", "#f1f0da", "#d04949"],
      blurb: "Musical Empire's original hard chart, split audio, Backrooms title sequence, Clark showroom, source in-game video, dinner-table cast, captain finale, camera events, and official VHS, color-adjust, and bulge shaders.",
      chartSource: SONG_SOURCE
    };
    if (typeof NEW_SONGS !== "undefined" && NEW_SONGS?.add) NEW_SONGS.add(SONG_ID);
    state.poses.clarkTable = state.poses.clarkTable || { lane: 1, time: -10, kind: "hit" };
    state.poses.pirate = state.poses.pirate || { lane: 1, time: -10, kind: "hit" };

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
    const baseApplyDustinBloom = typeof applyDustinBloom === "function" ? applyDustinBloom : null;

    const clamp01 = value => Math.max(0, Math.min(1, Number(value || 0)));
    const lerp = (a, b, amount) => Number(a || 0) + (Number(b || 0) - Number(a || 0)) * clamp01(amount);
    const clone = value => JSON.parse(JSON.stringify(value));
    // Sources are HTMLImageElements until warmTextures swaps the heavy ones
    // for ImageBitmaps, which report width/height instead of natural*.
    const imageWidth = image => Number(image?.naturalWidth || image?.width || 0);
    const imageHeight = image => Number(image?.naturalHeight || image?.height || 0);
    const imageReady = image => !!(image && image.complete !== false && imageWidth(image));
    const isLiminal = song => !!song && song.chartSource === SONG_SOURCE;

    function injectStyle() {
      if (document.getElementById("liminalLyricsStyle")) return;
      const style = document.createElement("style");
      style.id = "liminalLyricsStyle";
      style.textContent = `
        body.liminal-lyrics-active .hud .top,
        body.liminal-lyrics-active .hud .bottom,
        body.liminal-lyrics-active #judgments { opacity: 0 !important; pointer-events: none !important; }
        #liminalLyricsVideo { position: fixed; width: 2px; height: 2px; left: -20px; top: -20px; opacity: 0.001; pointer-events: none; }
      `;
      document.head.appendChild(style);
    }

    function loadImage(key, source) {
      if (!source || scene.images[key]) return;
      const image = new Image();
      image.decoding = "async";
      image.src = source;
      if (typeof image.decode === "function") image.decode().catch(() => {});
      scene.images[key] = image;
    }

    function initAssets() {
      if (scene.initialized) return;
      scene.initialized = true;
      injectStyle();
      Object.entries(LIMINAL.stage?.layers || {}).forEach(([key, layer]) => loadImage(key, layer.image));
      Object.entries(LIMINAL.stage?.ambient || {}).forEach(([key, sprite]) => loadImage(key, sprite.image));
      Object.entries(LIMINAL.stage?.characters || {}).forEach(([key, sprite]) => loadImage(key, sprite.image));
      if (window.SPORTING_SPRITES?.notes?.image) loadImage("notes", window.SPORTING_SPRITES.notes.image);
      const video = document.createElement("video");
      video.id = "liminalLyricsVideo";
      video.preload = "auto";
      video.muted = true;
      video.playsInline = true;
      video.disablePictureInPicture = true;
      video.src = LIMINAL.video.source;
      document.body.appendChild(video);
      scene.video = video;
      try { video.load(); } catch {}
      for (const key of Object.keys(LIMINAL.stage?.ambient || {})) prepareAmbientBitmaps(key);
      warmTextures().then(warmPhases);
    }

    // Redirects drawWorldStage away from the visible canvas. Only the warm-up
    // uses it; during play it stays null and the world draws straight to ctx.
    let worldTarget = null;

    async function prepareAmbientBitmaps(key) {
      if (scene.ambientBitmaps[key] || typeof createImageBitmap !== "function") return;
      const sprite = LIMINAL.stage?.ambient?.[key];
      const image = scene.images[key];
      if (!sprite || !image) return;
      const cache = new Map();
      scene.ambientBitmaps[key] = cache;
      try { if (typeof image.decode === "function") await image.decode(); } catch {}
      const unique = new Map();
      for (const frame of sprite.frames || []) unique.set(`${frame.x},${frame.y},${frame.w},${frame.h}`, frame);
      // Sliced one at a time, not through a single Promise.all: bearded_sheet is
      // an 8192x8192 atlas and one rejected slice used to throw the whole batch
      // away, leaving an empty cache that made every frame sample the full
      // atlas instead. A per-slice canvas fallback covers createImageBitmap
      // failing on the large source.
      for (const [region, frame] of unique) {
        try {
          cache.set(region, await createImageBitmap(image, frame.x, frame.y, frame.w, frame.h));
          continue;
        } catch {}
        try {
          const slice = document.createElement("canvas");
          slice.width = frame.w;
          slice.height = frame.h;
          slice.getContext("2d").drawImage(image, frame.x, frame.y, frame.w, frame.h, 0, 0, frame.w, frame.h);
          cache.set(region, slice);
        } catch {}
      }
      scene.ambientReady[key] = cache.size === unique.size;
      if (scene.ambientReady[key]) {
        // Drop the source atlas now that every slice is its own bitmap.
        // Decoded, bearded_sheet is 8192x8192 - about 268MB - which on its own
        // blows the browser's image cache budget and evicts the stage art, so
        // scenes were paying a full re-decode every time a phase changed.
        scene.images[key] = null;
      }
    }

    // Every image is uploaded to the GPU the first time it is drawn. Left alone
    // that lands mid-song as one long frame each time a phase introduces new
    // art - the dinner and finale swaps were the worst of them. Drawing each
    // image once, scaled to fit, forces that work to happen up front instead.
    async function warmTextures() {
      const scratch = scene.warmCanvas;
      const scratchCtx = scene.warmCtx;
      if (!scratchCtx) return;
      const ambientKeys = new Set(Object.keys(LIMINAL.stage?.ambient || {}));
      for (const [key, image] of Object.entries(scene.images)) {
        // Ambient atlases are sliced into per-frame bitmaps and their source is
        // released, so warming them would only re-decode what we throw away.
        if (!image || ambientKeys.has(key)) continue;
        try { if (typeof image.decode === "function") await image.decode(); } catch {}
        if (imageReady(image)) {
          // An HTMLImageElement's decoded form is a cache entry the browser is
          // free to drop; this scene's art adds up to hundreds of megabytes, so
          // it does, and the re-decode lands on the frame a phase changes.
          // chairs.png alone is a 17.8MB source that cost ~58ms to bring back.
          // An ImageBitmap is owned by us, so it stays decoded.
          let pinned = null;
          if (typeof createImageBitmap === "function") {
            try { pinned = await createImageBitmap(image); } catch {}
          }
          if (pinned) scene.images[key] = pinned;
          try {
            scratchCtx.clearRect(0, 0, scratch.width, scratch.height);
            scratchCtx.drawImage(scene.images[key], 0, 0, scratch.width, scratch.height);
          } catch {}
        }
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      scene.warmed = true;
    }

    // Scaling an image into a scratch canvas is not always enough - the driver
    // still pays for the real draw the first time a phase appears, which is why
    // the Clark, dinner and finale swaps each cost one long frame. Rendering
    // one frame of every phase offscreen ahead of time pays that cost during
    // the countdown instead of mid-song.
    // The exact branch boundaries in drawWorldStage, not just a time inside
    // each phase - the first frame of a phase is the one that introduces art.
    const WARM_PHASE_TIMES = [0, 12, 26, 66.98, 68, 78.14, 80, 100, 131.17, 132, 152.04, 153];
    async function warmPhases() {
      if (scene.phasesWarmed) return;
      for (let i = 0; i < 240 && !state.chart; i += 1) await new Promise(resolve => setTimeout(resolve, 25));
      if (!state.chart || !isLiminal(state.currentSong)) return;
      scene.phasesWarmed = true;
      await primeVideoFrame();
      // Warmed on the real canvas, not the offscreen one: the rasterised copies
      // the 2D backend caches are per-target, so priming a different canvas
      // left the visible one to re-rasterise these images at the phase change.
      // The countdown repaints every frame, so the stray frames are wiped.
      scene.suppressVideoSync = true;
      try {
        for (const t of WARM_PHASE_TIMES) {
          // drawSourceWorld, not drawWorldStage: each phase carries different
          // colour-adjust values, and switching them rebuilds the filter the
          // first time each pair is used.
          try { drawSourceWorld(t); applySourceGameShaders(t); } catch {}
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      } finally {
        scene.suppressVideoSync = false;
        try { ctx.clearRect(0, 0, SOURCE_W, SOURCE_H); } catch {}
      }
      // The finale's flesh overlay builds its own 1280x720 layer and hands it to
      // the bulge pass; that first upload is the last long frame in the song.
      // Its result lands on the visible canvas, so wipe it - the next real frame
      // repaints from scratch anyway.
      try { drawFlesh(140); } catch {}
      try { ctx.clearRect(0, 0, SOURCE_W, SOURCE_H); } catch {}
    }

    function ensureAudioTracks() {
      if (!state.audio.liminalInst) {
        state.audio.liminalInst = new Audio(LIMINAL.audio.inst);
        state.audio.liminalInst.preload = "auto";
        state.audio.liminalInst.volume = 0.92;
      }
      if (!state.audio.liminalVoices) {
        state.audio.liminalVoices = new Audio(LIMINAL.audio.voices);
        state.audio.liminalVoices.preload = "auto";
        state.audio.liminalVoices.volume = 0.88;
      }
      return [state.audio.liminalInst, state.audio.liminalVoices];
    }

    window.ensureLiminalLyricsAudio = ensureAudioTracks;
    window.prepareLiminalLyricsOnlineStart = function() {
      const tracks = ensureAudioTracks();
      tracks.forEach(track => {
        track.pause();
        try { track.currentTime = 0; } catch {}
        try { track.load(); } catch {}
      });
      return tracks;
    };

    function totalTime() {
      const chartTime = Number(LIMINAL.chart?.totalTime || 0);
      const durations = ensureAudioTracks()
        .map(track => Number(track.duration || 0))
        .filter(duration => Number.isFinite(duration) && duration > 0);
      return durations.length ? Math.max(chartTime, ...durations) : chartTime;
    }

    function bpmAt(t) {
      const changes = LIMINAL.chart?.bpmChanges || [{ time: 0, bpm: 86 }];
      return Number([...changes].reverse().find(change => t >= Number(change.time || 0))?.bpm || 86);
    }

    function beatAt(t) {
      const changeTime = 131.162790697674;
      if (t <= changeTime) return t / (60 / 86);
      return changeTime / (60 / 86) + (t - changeTime) / (60 / 92);
    }

    function stepSecondsAt(t) {
      return 60 / bpmAt(t) / 4;
    }

    function easeValue(name, amount) {
      const p = clamp01(amount);
      const key = String(name || "linear").toLowerCase();
      if (key.includes("sineout")) return Math.sin(p * Math.PI / 2);
      if (key.includes("sinein")) return 1 - Math.cos(p * Math.PI / 2);
      if (key.includes("quintinout")) return p < 0.5 ? 16 * p ** 5 : 1 - ((-2 * p + 2) ** 5) / 2;
      if (key.includes("quintin")) return p ** 5;
      if (key.includes("quintout")) return 1 - (1 - p) ** 5;
      if (key.includes("quartinout")) return p < 0.5 ? 8 * p ** 4 : 1 - ((-2 * p + 2) ** 4) / 2;
      if (key.includes("quartin")) return p ** 4;
      if (key.includes("quartout")) return 1 - (1 - p) ** 4;
      if (key.includes("cubeinout")) return p < 0.5 ? 4 * p ** 3 : 1 - ((-2 * p + 2) ** 3) / 2;
      if (key.includes("cubein")) return p ** 3;
      if (key.includes("cubeout")) return 1 - (1 - p) ** 3;
      if (key.includes("quadinout")) return p < 0.5 ? 2 * p * p : 1 - ((-2 * p + 2) ** 2) / 2;
      if (key.includes("quadin")) return p * p;
      if (key.includes("quadout")) return 1 - (1 - p) ** 2;
      return p;
    }

    function eventsByName(name) {
      return (LIMINAL.chart?.events || []).filter(event => event.name === name);
    }

    function eventAt(t, name) {
      return [...eventsByName(name)].reverse().find(event => event.time <= t + 0.0001) || null;
    }

    function buildZoomCommands() {
      const source = (LIMINAL.chart?.events || []).filter(event =>
        event.name === "Set Camera Zoom" || event.name === "Tween Camera" || event.name === "Camera Zoom"
      );
      const commands = [];
      const sample = time => {
        const command = [...commands].reverse().find(item => item.time <= time + 0.00001);
        if (!command) return Number(LIMINAL.stage?.defaultZoom || 0.9);
        if (command.duration <= 0 || time >= command.time + command.duration) return command.target;
        return lerp(command.start, command.target, easeValue(command.ease, (time - command.time) / command.duration));
      };
      source.forEach(event => {
        const params = event.params || [];
        let target;
        let duration;
        let ease = "linear";
        if (event.name === "Set Camera Zoom") {
          target = Number(params[0]);
          duration = Math.max(0, Number(params[2] || 0));
          ease = "sineOut";
          if (params[1]) target += sample(event.time);
        } else if (event.name === "Tween Camera") {
          if (String(params[0]) !== "Zoom") return;
          target = Number(String(params[1] || "1").split(",")[0]);
          duration = Math.max(0, Number(params[2] || 0) * stepSecondsAt(event.time));
          ease = `${params[3] || "linear"}${params[4] || ""}`;
        } else {
          target = Number(params[1]);
          duration = Math.max(0, Number(params[3] || 0) * stepSecondsAt(event.time));
          ease = `${params[4] || "linear"}${params[5] || ""}`;
        }
        if (!Number.isFinite(target)) return;
        commands.push({ time: event.time, start: sample(event.time), target, duration, ease });
      });
      return commands;
    }

    const zoomCommands = buildZoomCommands();

    // Codename bops the camera on a repeating interval, and "Camera Modulo
    // Change" retunes that interval and its strength mid-song. The port was
    // only replaying the one-off "Camera Bop" events, so the beat pulse was
    // missing everywhere - most obviously in the finale, which asks for a
    // strength-3 bop every 2 steps.
    function cameraModuloAt(t) {
      let modulo = 4;
      let strength = 1;
      let unit = "BEAT";
      for (const event of eventsByName("Camera Modulo Change")) {
        if (event.time > t) break;
        modulo = Number(event.params?.[0] ?? modulo);
        strength = Number(event.params?.[1] ?? strength);
        unit = String(event.params?.[2] || unit).toUpperCase();
      }
      return { modulo, strength, unit };
    }

    function moduloBopAt(t) {
      const { modulo, strength, unit } = cameraModuloAt(t);
      if (!(modulo > 0) || !strength) return 0;
      const isStep = unit === "STEP";
      const position = isStep ? beatAt(t) * 4 : beatAt(t);
      if (position < 0) return 0;
      const since = position % modulo;
      const decay = Math.min(modulo, isStep ? 2 : 1);
      if (since >= decay) return 0;
      return 0.015 * strength * (1 - since / decay);
    }

    function sourceZoomAt(t) {
      const command = [...zoomCommands].reverse().find(item => item.time <= t + 0.00001);
      let value = Number(LIMINAL.stage?.defaultZoom || 0.9);
      if (command) {
        if (command.duration <= 0 || t >= command.time + command.duration) value = command.target;
        else value = lerp(command.start, command.target, easeValue(command.ease, (t - command.time) / command.duration));
      }
      for (const event of eventsByName("Camera Bop")) {
        const age = t - event.time;
        const duration = stepSecondsAt(event.time) * 2;
        if (age >= 0 && age < duration) value += Number(event.params?.[0] || 0) * (1 - age / duration);
      }
      for (const event of eventsByName("Add Camera Zoom")) {
        const age = t - event.time;
        const duration = stepSecondsAt(event.time) * 2;
        if (age >= 0 && age < duration) value += Number(event.params?.[0] || 0) * (1 - age / duration);
      }
      value += moduloBopAt(t);
      return Math.max(0.45, Math.min(2.8, value));
    }

    function sourceCharacterCameraTarget(characterKey) {
      const sprite = LIMINAL.stage.characters[characterKey];
      const frame = sprite?.animations?.idle?.frames?.[0];
      const stagePosition = sprite?.stage || {};
      // getMidpoint() uses FlxSprite.width, which updateHitbox last set from the
      // character's own scale. The stage scale is applied about the centre
      // afterwards, so it moves the edges but leaves the midpoint where it is -
      // it must not appear here. stage.flipX is only a draw-time mirror, so the
      // player offset comes from Character.isPlayer instead.
      const characterScale = Number(sprite?.scale || 1);
      const isPlayer = !!sprite?.isPlayer;
      const width = Number(frame?.fw || frame?.w || 0) * characterScale;
      const height = Number(frame?.fh || frame?.h || 0) * characterScale;
      return {
        x: Number(stagePosition.x || 0) + width / 2 + (isPlayer ? -100 : 150) + Number(sprite?.position?.[0] || 0) + Number(sprite?.camera?.[0] || 0),
        y: Number(stagePosition.y || 0) + height / 2 - 100 + Number(sprite?.position?.[1] || 0) + Number(sprite?.camera?.[1] || 0)
      };
    }

    const cameraTargetsByLine = {
      0: sourceCharacterCameraTarget("clarkTable"),
      1: sourceCharacterCameraTarget("clarkRoom"),
      2: sourceCharacterCameraTarget("pirate")
    };

    function sourceCameraAt(t) {
      const changes = eventsByName("Camera Movement");
      let current = { x: Number(LIMINAL.stage?.startCamera?.[0] || 500), y: Number(LIMINAL.stage?.startCamera?.[1] || 200) };
      let side = 1;
      for (const event of changes) {
        if (event.time > t) break;
        const nextSide = Number(event.params?.[0] ?? 1);
        const target = cameraTargetsByLine[nextSide] || current;
        const duration = Math.max(0, Number(event.params?.[2] || 0) * stepSecondsAt(event.time));
        const progress = duration <= 0 ? 1 : clamp01((t - event.time) / duration);
        current = { x: lerp(current.x, target.x, easeValue("quartOut", progress)), y: lerp(current.y, target.y, easeValue("quartOut", progress)) };
        side = nextSide;
      }

      if (t >= 73.953488372093) {
        const recent = [...(state.chart?.notes || [])].reverse().find(note => note.side === "player" && note.hit && note.time <= t && t - note.time < stepSecondsAt(t) * 3.5);
        if (recent) {
          const age = t - recent.time;
          const outDuration = stepSecondsAt(t) * 2;
          const returnDuration = stepSecondsAt(t) * 1.5;
          const lane = Number(recent.lane || 0) % 4;
          const offsets = [[10, 0], [0, -10], [0, 10], [-10, 0]][lane];
          let strength;
          if (age <= outDuration) strength = easeValue("quartOut", age / outDuration);
          else strength = 1 - easeValue("quadIn", (age - outDuration) / returnDuration);
          current.x -= offsets[0] * Math.max(0, strength);
          current.y -= offsets[1] * Math.max(0, strength);
        }
      }

      const captain = eventAt(t, "camera_captain");
      const angleAmount = captain?.params?.[0] ? Number(captain.params[1] || 0) : 0;
      const angle = Math.cos((beatAt(t) % 1) * Math.PI * 2) * angleAmount;
      return { ...current, side, zoom: sourceZoomAt(t), angle };
    }

    function filterAt(t) {
      const beat = beatAt(t);
      let brightness = 0;
      let contrast = 1;
      // backroom.hx assigns these uniforms from update() and never restores
      // them, so each window's values keep applying after the window ends -
      // the beat 112-140 pair stays up until cap() replaces it at 131.16s.
      if (beat >= 96) { brightness = -0.2; contrast = 1.35; }
      if (beat >= 112) { brightness = -0.05; contrast = 1.05; }
      if (t >= 131.162790697674) { brightness = -0.06; contrast = 1.2; }
      return { vhs: beat >= 36 && beat < 96, brightness, contrast };
    }

    function drawImageLayer(renderCtx, image, spec, alpha = 1) {
      if (!imageReady(image) || !spec) return;
      const scale = Number(spec.scale || 1);
      const width = imageWidth(image) * scale;
      const height = imageHeight(image) * scale;
      // FlxSprite.origin defaults to the middle of the graphic, so a stage
      // <sprite> with scale != 1 grows outward from its centre while x/y stay
      // the unscaled top-left. Anchoring at the top-left instead shifted every
      // scaled layer - it is why the basement stopped short of the left edge.
      const x = Number(spec.x || 0) - (width - imageWidth(image)) / 2;
      const y = Number(spec.y || 0) - (height - imageHeight(image)) / 2;
      renderCtx.save();
      renderCtx.globalAlpha = alpha;
      renderCtx.drawImage(image, x, y, width, height);
      renderCtx.restore();
    }

    function frameFor(animation, elapsed, forceLoop = null) {
      if (!animation?.frames?.length) return null;
      const fps = Math.max(1, Number(animation.fps || 24));
      const loop = forceLoop == null ? !!animation.loop : !!forceLoop;
      const index = Math.floor(Math.max(0, elapsed) * fps);
      return animation.frames[loop ? index % animation.frames.length : Math.min(animation.frames.length - 1, index)];
    }

    function drawAtlasTopLeft(renderCtx, image, frame, x, y, scale, alpha = 1, flipX = false, angle = 0) {
      if (!imageReady(image) || !frame) return;
      renderCtx.save();
      renderCtx.globalAlpha = alpha;
      renderCtx.translate(x + (flipX ? Number(frame.fw || frame.w) * scale : 0), y);
      if (angle) renderCtx.rotate(angle * Math.PI / 180);
      if (flipX) renderCtx.scale(-1, 1);
      const fx = Number(frame.fx || 0);
      const fy = Number(frame.fy || 0);
      if (frame.rotated) {
        renderCtx.translate(-fx * scale, -fy * scale + frame.w * scale);
        renderCtx.rotate(-Math.PI / 2);
        renderCtx.drawImage(image, frame.x, frame.y, frame.w, frame.h, 0, 0, frame.w * scale, frame.h * scale);
      } else {
        renderCtx.drawImage(image, frame.x, frame.y, frame.w, frame.h, -fx * scale, -fy * scale, frame.w * scale, frame.h * scale);
      }
      renderCtx.restore();
    }

    function altEnabledAt(t, sourceLine) {
      let enabled = false;
      for (const event of eventsByName("Alt Animation Toggle")) {
        if (event.time > t) break;
        if (Number(event.params?.[2] ?? -1) === sourceLine) enabled = !!event.params?.[0];
      }
      return enabled;
    }

    function activeAnimation(characterKey, t) {
      const sprite = LIMINAL.stage.characters[characterKey];
      const poseKey = characterKey === "clarkRoom" ? "player" : characterKey;
      const pose = state.poses[poseKey] || { lane: 1, time: -10, kind: "hit" };
      const held = typeof activeHoldNoteForCharacter === "function" ? activeHoldNoteForCharacter(poseKey, t) : null;
      const age = performance.now() / 1000 - Number(pose.time || -10);
      const sourceLine = characterKey === "clarkRoom" ? 1 : characterKey === "clarkTable" ? 0 : 2;
      const lane = Number((held ? held.lane : pose.lane) || 0) % 4;
      let animationName = DIR_ANIM[lane];
      if (altEnabledAt(t, sourceLine) && sprite.animations[`${animationName}-alt`]) animationName += "-alt";
      const singing = held || age < 0.38;
      const singingAnimation = sprite.animations[animationName];
      if (singing && singingAnimation?.frames?.length) {
        return { animation: singingAnimation, frame: frameFor(singingAnimation, held ? Math.max(0, t - held.time) : age, false) };
      }
      const idle = sprite.animations.idle;
      return { animation: idle, frame: frameFor(idle, t, true) };
    }

    // Characters keep the top-left anchor the stage layers do not: Character
    // calls updateHitbox() after scaling, which re-offsets the sprite so x/y
    // stay its top-left. sourceCharacterCameraTarget assumes the same.
    function drawCharacter(renderCtx, characterKey, t) {
      const sprite = LIMINAL.stage.characters[characterKey];
      const image = scene.images[characterKey];
      if (!sprite || !imageReady(image)) return;
      const active = activeAnimation(characterKey, t);
      if (!active.frame) return;
      const stagePosition = sprite.stage || {};
      const offset = active.animation?.offset || [0, 0];
      const scale = Number(sprite.scale || 1) * Number(stagePosition.scale || 1);
      // Animation offsets are authored in the atlas's own pixels - they track how
      // much wider each pose's frame is than idle - so they have to be scaled by
      // the render scale to cancel that growth. Applied raw they shifted every
      // sing pose by (1 - scale) of the offset, sliding Clark off his seat and
      // dropping the captain out of frame.
      const x = Number(stagePosition.x || 0) + Number(sprite.position?.[0] || 0) - Number(offset[0] || 0) * scale;
      const y = Number(stagePosition.y || 0) + Number(sprite.position?.[1] || 0) - Number(offset[1] || 0) * scale;
      const flipX = !!sprite.flipX !== !!stagePosition.flipX;
      // The character file's own scale is applied with updateHitbox, so it keeps
      // the top-left anchor. The stage tag's scale is applied afterwards without
      // one, so that part grows from the centre like any other stage sprite -
      // which is why Clark floated above the dinner table instead of sitting at
      // it. sourceCharacterCameraTarget follows the same split.
      const stageScale = Number(stagePosition.scale || 1);
      const bodyW = Number(active.frame.fw || active.frame.w || 0) * Number(sprite.scale || 1);
      const bodyH = Number(active.frame.fh || active.frame.h || 0) * Number(sprite.scale || 1);
      const cx = x - bodyW * (stageScale - 1) / 2;
      const cy = y - bodyH * (stageScale - 1) / 2;
      drawAtlasTopLeft(renderCtx, image, active.frame, cx, cy, scale, 1, flipX);
    }

    function drawAmbient(renderCtx, key, t) {
      const sprite = LIMINAL.stage.ambient[key];
      if (!sprite?.frames?.length) return;
      const frame = sprite.frames[Math.floor(Math.max(0, t) * Number(sprite.fps || 24)) % sprite.frames.length];
      const scale = Number(sprite.scale || 1);
      // Same centre origin as the stage layers - these are <sprite> tags too.
      const ax = Number(sprite.x || 0) - Number(frame.fw || frame.w) * (scale - 1) / 2;
      const ay = Number(sprite.y || 0) - Number(frame.fh || frame.h) * (scale - 1) / 2;
      const bitmap = scene.ambientBitmaps[key]?.get(`${frame.x},${frame.y},${frame.w},${frame.h}`);
      if (bitmap) {
        renderCtx.save();
        renderCtx.translate(ax, ay);
        renderCtx.rotate(Number(sprite.angle || 0) * Math.PI / 180);
        renderCtx.drawImage(bitmap, -Number(frame.fx || 0) * Number(sprite.scale || 1), -Number(frame.fy || 0) * Number(sprite.scale || 1), frame.w * Number(sprite.scale || 1), frame.h * Number(sprite.scale || 1));
        renderCtx.restore();
        return;
      }
      const image = scene.images[key];
      if (!imageReady(image)) return;
      drawAtlasTopLeft(renderCtx, image, frame, ax, ay, scale, 1, false, Number(sprite.angle || 0));
    }

    function syncVideo(t) {
      const video = scene.video;
      if (!video || scene.suppressVideoSync) return false;
      const active = t >= LIMINAL.video.start && t < LIMINAL.video.end;
      if (!active) {
        if (!video.paused) video.pause();
        return false;
      }
      const desired = Math.max(0, t - Number(LIMINAL.video.start || 0));
      const drift = Number(video.currentTime || 0) - desired;
      // Seeking drops readyState below 2 for several frames, and every one of
      // those frames used to fall through to the showroom underneath. A 0.09s
      // tolerance made that happen constantly, because ordinary audio/video
      // drift is bigger than that. Correct small drift with playback rate and
      // only seek when the video is genuinely in the wrong place.
      if (video.readyState > 0 && (Math.abs(drift) > 0.35 || t < scene.lastVideoSync)) {
        try { video.currentTime = desired; } catch {}
      } else {
        const rate = Math.abs(drift) < 0.02 ? 1 : (drift > 0 ? 0.96 : 1.04);
        if (video.playbackRate !== rate) { try { video.playbackRate = rate; } catch {} }
      }
      scene.lastVideoSync = t;
      if (state.playing && video.paused) video.play().catch(() => {});
      return videoDrawable(video) || !!scene.videoFrameReady;
    }

    const videoDrawable = video => !!(video && video.readyState >= 2 && !video.seeking && video.videoWidth && video.videoHeight);

    // Puts a real frame in the cache before the song reaches the video, so the
    // very first sync - which is always a seek - has something to fall back to
    // instead of exposing the showroom.
    async function primeVideoFrame() {
      const video = scene.video;
      if (!video || scene.videoFrameReady) return;
      for (let i = 0; i < 200 && video.readyState < 2; i += 1) await new Promise(resolve => setTimeout(resolve, 50));
      if (!videoDrawable(video)) return;
      const frame = scene.videoFrame;
      try {
        frame.width = video.videoWidth;
        frame.height = video.videoHeight;
        scene.videoFrameCtx.drawImage(video, 0, 0, frame.width, frame.height);
        scene.videoFrameReady = true;
      } catch {}
    }

    function drawVideoSource(renderCtx, video) {
      if (videoDrawable(video)) {
        renderCtx.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);
        // Keep the last good frame so a seek never uncovers the stage behind it.
        const frame = scene.videoFrame;
        if (frame) {
          if (frame.width !== video.videoWidth || frame.height !== video.videoHeight) {
            frame.width = video.videoWidth;
            frame.height = video.videoHeight;
          }
          try {
            scene.videoFrameCtx.drawImage(video, 0, 0, frame.width, frame.height);
            scene.videoFrameReady = true;
          } catch {}
        }
        return;
      }
      if (scene.videoFrameReady) renderCtx.drawImage(scene.videoFrame, 0, 0, scene.videoFrame.width, scene.videoFrame.height);
    }

    function drawWorldStage(t) {
      const g = worldTarget || ctx;
      const camera = sourceCameraAt(t);
      g.fillStyle = "#000";
      g.fillRect(0, 0, SOURCE_W, SOURCE_H);
      syncVideo(t);
      g.save();
      g.translate(SOURCE_W / 2, SOURCE_H / 2);
      g.rotate(camera.angle * Math.PI / 180);
      g.scale(camera.zoom, camera.zoom);
      g.translate(-camera.x, -camera.y);
      if (t < 10.4651162790698) {
        drawImageLayer(ctx, scene.images.basement, LIMINAL.stage.layers.basement);
        drawCharacter(ctx, "clarkRoom", t);
        const logoBackAge = t - 2.7906976744186;
        const logoBackAlpha = logoBackAge <= 0 ? 1 : 1 - clamp01(logoBackAge / 4);
        if (logoBackAlpha > 0) drawImageLayer(ctx, scene.images.logoBack, LIMINAL.stage.layers.logoBack, logoBackAlpha);
      } else if (t < LIMINAL.video.start) {
        drawImageLayer(ctx, scene.images.basement, LIMINAL.stage.layers.basement);
        drawCharacter(ctx, "clarkRoom", t);
      } else if (t < 66.9767441860465) {
        drawImageLayer(ctx, scene.images.basement, LIMINAL.stage.layers.basement);
        if (syncVideo(t)) drawVideoSource(ctx, scene.video);
        drawCharacter(ctx, "clarkRoom", t);
      } else if (t >= 66.9767441860465 && t < 78.1395348837209) {
        drawCharacter(ctx, "clarkTable", t);
      } else if (t >= 78.1395348837209) {
        drawImageLayer(ctx, scene.images.kane, LIMINAL.stage.layers.kane);
        drawImageLayer(ctx, scene.images.dinner, LIMINAL.stage.layers.dinner);
        if (t < 131.162790697674) {
          drawAmbient(ctx, "redhead", t);
          drawImageLayer(ctx, scene.images.chairs, LIMINAL.stage.layers.chairs);
          drawCharacter(ctx, "clarkTable", t);
          drawImageLayer(ctx, scene.images.kane, { x: 0, y: 0, scale: 0.05 });
        } else {
          drawCharacter(ctx, "pirate", t);
        }
        drawAmbient(ctx, "bearded", t);
        drawImageLayer(ctx, scene.images.table, LIMINAL.stage.layers.table);
        if (t >= 152.032355915066) drawImageLayer(ctx, scene.images.logoBack, LIMINAL.stage.layers.logoBack);
      }
      g.restore();
    }

    function applySourceGameShaders(t) {
      const filter = filterAt(t);
      if (!filter.vhs) return;
      scene.stageSnapshotCtx.clearRect(0, 0, SOURCE_W, SOURCE_H);
      scene.stageSnapshotCtx.drawImage(canvas, 0, 0, SOURCE_W, SOURCE_H);
      let applied = false;
      if (!window.PERFORMANCE_MODE && !state?.settings?.performance) {
        try {
          applied = !!window.FNF_WEBGL?.drawLiminalPostStack?.(scene.stageSnapshot, { time: t, ...filter });
        } catch {}
      }
      if (applied) return;
      ctx.clearRect(0, 0, SOURCE_W, SOURCE_H);
      ctx.save();
      ctx.filter = `brightness(${Math.max(0, 1 + filter.brightness)}) contrast(${Math.max(0, filter.contrast)})`;
      ctx.drawImage(scene.stageSnapshot, 0, 0, SOURCE_W, SOURCE_H);
      ctx.restore();
      if (filter.vhs && !window.PERFORMANCE_MODE) {
        ctx.save();
        ctx.globalAlpha = 0.1;
        ctx.fillStyle = "#fff";
        const scanOffset = Math.floor((t * 90) % 6);
        for (let y = scanOffset; y < SOURCE_H; y += 6) ctx.fillRect(0, y, SOURCE_W, 1);
        ctx.restore();
      }
    }

    // color_adjust.frag is a per-pixel linear ramp:
    //   out = (rgb + brightness - .5) * contrast + .5  ->  out = rgb * slope + intercept
    // An feComponentTransfer with that slope/intercept reproduces it exactly,
    // in one pass over the finished frame. sRGB interpolation is required or
    // the filter runs in linear light and the result comes out too bright.
    const COLOR_FILTER_ID = "liminalColorAdjust";
    let colorFilterFuncs = null;
    let colorFilterUrlSupported = null;
    let colorFilterState = "";

    function ensureColorFilter() {
      if (colorFilterFuncs) return colorFilterFuncs;
      const NS = "http://www.w3.org/2000/svg";
      const svg = document.createElementNS(NS, "svg");
      svg.setAttribute("width", "0");
      svg.setAttribute("height", "0");
      svg.setAttribute("aria-hidden", "true");
      svg.style.cssText = "position:absolute;width:0;height:0;pointer-events:none";
      const filter = document.createElementNS(NS, "filter");
      filter.setAttribute("id", COLOR_FILTER_ID);
      filter.setAttribute("color-interpolation-filters", "sRGB");
      const transfer = document.createElementNS(NS, "feComponentTransfer");
      colorFilterFuncs = ["feFuncR", "feFuncG", "feFuncB"].map(name => {
        const fn = document.createElementNS(NS, name);
        fn.setAttribute("type", "linear");
        fn.setAttribute("slope", "1");
        fn.setAttribute("intercept", "0");
        transfer.appendChild(fn);
        return fn;
      });
      filter.appendChild(transfer);
      svg.appendChild(filter);
      document.body.appendChild(svg);
      return colorFilterFuncs;
    }

    // Assigning ctx.filter = "url(#id)" succeeds whether or not the filter
    // resolves, so support has to be confirmed by pushing a known colour
    // through it and reading the result back.
    function probeColorFilter() {
      try {
        const funcs = ensureColorFilter();
        for (const fn of funcs) {
          fn.setAttribute("slope", "0");
          fn.setAttribute("intercept", "1");
        }
        colorFilterState = "probe";
        const probe = document.createElement("canvas");
        probe.width = probe.height = 1;
        const probeCtx = probe.getContext("2d", { willReadFrequently: true });
        probeCtx.fillStyle = "#000";
        probeCtx.fillRect(0, 0, 1, 1);
        const source = document.createElement("canvas");
        source.width = source.height = 1;
        const sourceCtx = source.getContext("2d");
        sourceCtx.fillStyle = "#000";
        sourceCtx.fillRect(0, 0, 1, 1);
        probeCtx.filter = `url(#${COLOR_FILTER_ID})`;
        probeCtx.drawImage(source, 0, 0);
        probeCtx.filter = "none";
        // slope 0 / intercept 1 turns black into white. Anything else means the
        // filter reference was ignored.
        return probeCtx.getImageData(0, 0, 1, 1).data[0] > 200;
      } catch {
        return false;
      }
    }

    function colorFilterCss(brightness, contrast) {
      if (colorFilterUrlSupported == null) colorFilterUrlSupported = probeColorFilter();
      if (!colorFilterUrlSupported) {
        // Multiplicative stand-in: matches the shader at white, drifts in the
        // midtones, but never crushes the frame the way an alpha pass would.
        return `brightness(${Math.max(0, 1 + brightness)}) contrast(${Math.max(0, contrast)})`;
      }
      const slope = contrast;
      const intercept = (brightness - 0.5) * contrast + 0.5;
      const key = `${slope},${intercept}`;
      if (key !== colorFilterState) {
        colorFilterState = key;
        for (const fn of ensureColorFilter()) {
          fn.setAttribute("slope", String(slope));
          fn.setAttribute("intercept", String(intercept));
        }
      }
      return `url(#${COLOR_FILTER_ID})`;
    }

    function drawSourceWorld(t) {
      const filter = filterAt(t);
      drawWorldStage(t);
      // The VHS window runs the colour pass inside applySourceGameShaders.
      if (filter.vhs || (filter.brightness === 0 && filter.contrast === 1)) return;
      // One blit of the finished frame. Setting ctx.filter before drawWorldStage
      // instead would re-run the filter for every layer, which is what made the
      // dinner and finale phases expensive.
      scene.stageSnapshotCtx.clearRect(0, 0, SOURCE_W, SOURCE_H);
      scene.stageSnapshotCtx.drawImage(canvas, 0, 0, SOURCE_W, SOURCE_H);
      ctx.save();
      ctx.filter = colorFilterCss(filter.brightness, filter.contrast);
      ctx.drawImage(scene.stageSnapshot, 0, 0, SOURCE_W, SOURCE_H);
      ctx.restore();
    }

    function cinematicDistanceAt(t) {
      let distance = 0;
      for (const event of eventsByName("Cinematics")) {
        if (event.time > t) break;
        const duration = Math.max(0, Number(event.params?.[0] || 0));
        const target = Number(event.params?.[1] || 0) === 0 ? 0 : Math.max(0, Number(event.params?.[1] || 0));
        if (duration <= 0) continue;
        distance = lerp(distance, target, easeValue(target === 0 ? "sineOut" : "quadOut", (t - event.time) / duration));
      }
      return distance;
    }

    function colorFromInt(value) {
      const unsigned = Number(value || 0) >>> 0;
      const a = ((unsigned >>> 24) & 255) / 255;
      const r = (unsigned >>> 16) & 255;
      const g = (unsigned >>> 8) & 255;
      const b = unsigned & 255;
      return { css: `rgb(${r},${g},${b})`, alpha: a || 1 };
    }

    function drawFlashes(t, cameraName) {
      for (const event of eventsByName("Fancy Camera Flash")) {
        const params = event.params || [];
        if (String(params[9] || "camHUD") !== cameraName) continue;
        const fadeIn = Number(params[4] || 0) * stepSecondsAt(event.time);
        const hold = Number(params[5] || 0) * stepSecondsAt(event.time);
        const fadeOut = Number(params[6] || 0) * stepSecondsAt(event.time);
        const age = t - event.time;
        const total = fadeIn + hold + fadeOut;
        if (age < 0 || age > total || params[10]) continue;
        const maxAlpha = Number(params[1] ?? 1);
        let alpha = params[2] ? maxAlpha * easeValue(`${params[7]}${params[8]}`, age / Math.max(0.0001, fadeIn)) : maxAlpha;
        if (age > fadeIn + hold && params[3]) alpha = maxAlpha * (1 - easeValue(`${params[7]}${params[8]}`, (age - fadeIn - hold) / Math.max(0.0001, fadeOut)));
        const color = colorFromInt(params[0]);
        ctx.save();
        ctx.globalAlpha = clamp01(alpha * color.alpha);
        ctx.fillStyle = color.css;
        ctx.fillRect(0, 0, SOURCE_W, SOURCE_H);
        ctx.restore();
      }
    }

    function drawIntroHud(t) {
      if (t >= 10.4651162790698) return;
      const logo = scene.images.logo;
      const spec = LIMINAL.stage.layers.logo;
      if (imageReady(logo)) withSourceHud(() => ctx.drawImage(logo, spec.x, spec.y, imageWidth(logo) * spec.scale, imageHeight(logo) * spec.scale));
    }

    function drawCrack(t) {
      const start = 20.7558139534884;
      const duration = stepSecondsAt(start) * 8;
      const age = t - start;
      if (age < 0 || age > duration) return;
      const image = scene.images.crack;
      if (!imageReady(image)) return;
      withSourceHud(() => {
        ctx.save();
        ctx.globalAlpha = easeValue("quadIn", age / duration);
        ctx.drawImage(image, LIMINAL.stage.layers.crack.x, LIMINAL.stage.layers.crack.y);
        ctx.restore();
      });
    }

    function drawFlesh(t) {
      if (t < 131.162790697674 || t >= 152.032355915066) return;
      const image = scene.images.flesh;
      if (!imageReady(image)) return;
      const spec = LIMINAL.stage.layers.flesh;
      const fleshCtx = scene.fleshCtx;
      fleshCtx.clearRect(0, 0, SOURCE_W, SOURCE_H);
      fleshCtx.save();
      fleshCtx.translate(SOURCE_W / 2, SOURCE_H / 2);
      fleshCtx.scale(SOURCE_HUD_ZOOM, SOURCE_HUD_ZOOM);
      fleshCtx.translate(-SOURCE_W / 2, -SOURCE_H / 2);
      fleshCtx.globalAlpha = Number(spec.alpha || 0.8);
      // flesh() builds a plain FlxSprite and calls scale.set(4.5, 3.0) without
      // updateHitbox, so it grows from its centre like the stage layers do.
      const fleshW = imageWidth(image) * spec.scaleX;
      const fleshH = imageHeight(image) * spec.scaleY;
      fleshCtx.drawImage(image, spec.x - (fleshW - imageWidth(image)) / 2, spec.y - (fleshH - imageHeight(image)) / 2, fleshW, fleshH);
      fleshCtx.restore();
      const beatPhase = beatAt(t) % 1;
      const intensity = 1 + Math.max(0, 1 - beatPhase * 2);
      ctx.save();
      ctx.globalCompositeOperation = "multiply";
      let applied = false;
      if (!window.PERFORMANCE_MODE && !state?.settings?.performance) {
        try { applied = !!window.FNF_WEBGL?.drawLiminalBulgeOverlay?.(scene.fleshCanvas, { time: t, speed: 1, intensity }); } catch {}
      }
      if (!applied) ctx.drawImage(scene.fleshCanvas, 0, 0, SOURCE_W, SOURCE_H);
      ctx.restore();
    }

    // logo_end() also drops the source mod's "MOD BY FLOOFUM" watermark here.
    // Left out at the player's request; the credit stays on the song entry.
    function drawEnding() {}

    const SOURCE_HUD_ZOOM = 0.85;
    function withSourceHud(draw) {
      ctx.save();
      ctx.translate(SOURCE_W / 2, SOURCE_H / 2);
      ctx.scale(SOURCE_HUD_ZOOM, SOURCE_HUD_ZOOM);
      ctx.translate(-SOURCE_W / 2, -SOURCE_H / 2);
      draw();
      ctx.restore();
    }

    function laneX(lane) {
      const sourceX = [866, 978, 1090, 1202][Number(lane || 0) % 4];
      return SOURCE_W / 2 + (sourceX - SOURCE_W / 2) * SOURCE_HUD_ZOOM;
    }

    function sourceReceptorY() {
      const sourceY = typeof isDownScroll === "function" && isDownScroll() ? SOURCE_H - 50 : 50;
      return SOURCE_H / 2 + (sourceY - SOURCE_H / 2) * SOURCE_HUD_ZOOM;
    }

    function drawNoteAtlasFrame(frame, x, y, scale = 0.48, alpha = 1) {
      const image = scene.images.notes;
      if (!imageReady(image) || !frame) return false;
      const fw = Number(frame.fw || frame.w);
      const fh = Number(frame.fh || frame.h);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.drawImage(image, frame.x, frame.y, frame.w, frame.h, x - fw * scale / 2 - Number(frame.fx || 0) * scale, y - fh * scale / 2 - Number(frame.fy || 0) * scale, frame.w * scale, frame.h * scale);
      ctx.restore();
      return true;
    }

    function drawLiminalReceptor(lane, t) {
      const dir = DIR[lane % 4];
      const noteSkin = window.SPORTING_SPRITES?.notes;
      const effect = state.receptorFx[lane] || { time: -10 };
      const age = performance.now() / 1000 - Number(effect.time || -10);
      if (age >= 0 && age < 0.16 && noteSkin?.confirm?.[dir]?.length) {
        const frames = noteSkin.confirm[dir];
        const frame = frames[Math.min(frames.length - 1, Math.floor(age * 24))];
        if (drawNoteAtlasFrame(frame, laneX(lane), sourceReceptorY(), 0.52)) return;
      }
      if (drawNoteAtlasFrame(noteSkin?.static?.[dir], laneX(lane), sourceReceptorY(), 0.595, 0.88)) return;
      const angle = [Math.PI, Math.PI / 2, -Math.PI / 2, 0][lane % 4];
      arrow(laneX(lane), sourceReceptorY(), 40, angle, "rgba(30,30,36,0.8)", "rgba(255,255,255,0.7)", 0.9);
    }

    function drawLiminalTap(lane, x, y, alpha = 1) {
      const dir = DIR[lane % 4];
      if (drawNoteAtlasFrame(window.SPORTING_SPRITES?.notes?.gem?.[dir], x, y, 0.595, alpha)) return;
      const angle = [Math.PI, Math.PI / 2, -Math.PI / 2, 0][lane % 4];
      arrow(x, y, 40, angle, NOTE_COLORS[lane % 4], "rgba(255,255,255,0.86)", alpha);
    }

    function drawLiminalHold(note, x, headY, tailY, alpha) {
      const lane = Number(note.lane || 0) % 4;
      const start = Math.min(headY, tailY);
      const end = Math.max(headY, tailY);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.lineCap = "round";
      ctx.lineWidth = 22;
      ctx.strokeStyle = "rgba(12,12,18,0.84)";
      ctx.beginPath(); ctx.moveTo(x, start); ctx.lineTo(x, end); ctx.stroke();
      ctx.lineWidth = 14;
      ctx.strokeStyle = NOTE_COLORS[lane];
      ctx.beginPath(); ctx.moveTo(x, start); ctx.lineTo(x, end); ctx.stroke();
      ctx.restore();
    }

    function drawLiminalNotes(t) {
      if (!state.chart || t < 4.88372093023256 || t >= 152.032355915066) return;
      const receptor = sourceReceptorY();
      const down = typeof isDownScroll === "function" && isDownScroll();
      const scroll = Number(state.currentSong.scroll || 1305) * SOURCE_HUD_ZOOM;
      for (const note of state.chart.notes) {
        if (note.invisible || note.side !== "player") continue;
        if (note.played && note.hit && (!isHoldNote(note) || note.holdDone)) continue;
        if (note.judged && (!isHoldNote(note) || note.holdDone || !note.hit)) continue;
        const x = laneX(note.lane);
        const y = receptor + (Number(note.time || 0) - t) * scroll * (down ? -1 : 1);
        const endTime = typeof holdEndTime === "function" ? holdEndTime(note) : note.time + Number(note.sLen || 0);
        const tailY = receptor + (endTime - t) * scroll * (down ? -1 : 1);
        const margin = 120;
        if (Math.max(y, tailY) < -margin || Math.min(y, tailY) > SOURCE_H + margin) continue;
        if (isHoldNote(note)) drawLiminalHold(note, x, note.hit ? receptor : y, tailY, note.hit ? 0.9 : 1);
        if (!(note.hit && isHoldNote(note) && t > note.time)) drawLiminalTap(note.lane, x, y, 1);
      }
    }

    function drawCinematicBars(t) {
      const distance = cinematicDistanceAt(t);
      if (distance <= 0.1) return;
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, SOURCE_W, distance);
      ctx.fillRect(0, SOURCE_H - distance, SOURCE_W, distance);
    }

    isImportedSong = song => isLiminal(song) || baseIsImportedSong(song);

    makeChart = function(song) {
      if (!isLiminal(song)) return baseMakeChart(song);
      return { ...clone(LIMINAL.chart), notes: clone(LIMINAL.chart.notes || []), events: clone(LIMINAL.chart.events || []), timeline: clone(LIMINAL.chart.timeline || []) };
    };

    stopExternalAudio = function() {
      const leakedInst = state.audio.inst === state.audio.liminalInst;
      const leakedVoices = state.audio.voices === state.audio.liminalVoices;
      baseStopExternalAudio();
      ensureAudioTracks().forEach(track => {
        try { track.pause(); track.currentTime = 0; } catch {}
      });
      if (scene.video) {
        try { scene.video.pause(); scene.video.currentTime = 0; } catch {}
      }
      if (leakedInst) state.audio.inst = null;
      if (leakedVoices) state.audio.voices = null;
      if (!isLiminal(state.currentSong)) document.body.classList.remove("liminal-lyrics-active");
    };

    songTime = function() {
      if (isLiminal(state.currentSong) && state.audio.liminalInst) return state.audio.liminalInst.currentTime;
      return baseSongTime();
    };

    songEndTime = function() {
      if (isLiminal(state.currentSong)) return totalTime();
      return baseSongEndTime();
    };

    function resetSceneState() {
      scene.lastVideoSync = -10;
      scene.videoFrameReady = false;
      state.feeds.player.time = -10;
      state.feeds.opp.time = -10;
      Object.values(state.poses).forEach(pose => { if (pose) { pose.time = -10; pose.kind = "hit"; } });
      state.receptorFx.forEach(effect => { effect.time = -10; });
      state.hitGlow.length = 0;
      state.camera = { zoom: 1, focusX: SOURCE_W / 2, focusY: SOURCE_H / 2, sideTime: 0, lastSide: "player", highwayX: 0, highwayY: 0 };
    }

    // Start decoding and warming while the player is still on the song list, so
    // the countdown is not the first thing that has to pay for it.
    if (typeof selectSong === "function") {
      const baseSelectSong = selectSong;
      selectSong = function(id) {
        const result = baseSelectSong.apply(this, arguments);
        if (id === SONG_ID) { try { initAssets(); } catch {} }
        return result;
      };
    }

    startSong = function(id = state.selectedSong, options = {}) {
      const song = SONGS[id] || state.currentSong;
      if (!isLiminal(song)) {
        document.body.classList.remove("liminal-lyrics-active");
        return baseStartSong(id, options);
      }
      const audioContext = ensureAudio();
      if (audioContext.state === "suspended") audioContext.resume();
      stopExternalAudio();
      initAssets();
      const tracks = ensureAudioTracks();
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
      document.body.classList.add("liminal-lyrics-active");
      if (!window.PERFORMANCE_MODE && !state?.settings?.performance) {
        try { window.FNF_WEBGL?.warmLiminalPostStack?.(); } catch {}
      }
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
      ui.statusText.textContent = isOnlineStart ? "Match syncing" : "Liminal Lyrics";
      ui.statusSub.textContent = "Musical Empire source chart, stage timeline, video, camera, and shaders are active.";
      ui.menu.classList.remove("show");
      ui.settings.classList.remove("show");
      ui.resultsWrap.classList.remove("show");
      if (typeof syncModeUI === "function") syncModeUI();
      tracks.forEach(track => {
        track.pause();
        try { track.currentTime = 0; } catch {}
        if (!options.skipReload) { try { track.load(); } catch {} }
      });
      if (state.mode === "online" && state.network?.matchStartAt) {
        if (typeof syncOnlinePlayback === "function") syncOnlinePlayback(true);
      } else {
        tracks.forEach(track => track.play().catch(() => {}));
      }
      return null;
    };

    refreshHUD = function(t) {
      baseRefreshHUD(t);
      if (!isLiminal(state.currentSong)) return;
      if (state.audio.liminalVoices) state.audio.liminalVoices.muted = !!state.settings?.muteVoices;
      ui.timer.textContent = `${formatTime(t)} / ${formatTime(totalTime())}`;
      const phase = t < 10.465 ? "Backrooms" : t < LIMINAL.video.start ? "Showroom" : t < LIMINAL.video.end ? "Broadcast" : t < 78.14 ? "Clark" : t < 131.163 ? "Dinner" : "Captain";
      ui.statusText.textContent = phase;
      ui.statusSub.textContent = "Original Musical Empire event timeline and official shader stack.";
    };

    finish = function(failed = false) {
      if (isLiminal(state.currentSong)) {
        ensureAudioTracks().forEach(track => { try { track.pause(); } catch {} });
        if (scene.video) { try { scene.video.pause(); } catch {} }
        document.body.classList.remove("liminal-lyrics-active");
      }
      return baseFinish(failed);
    };

    bg = function(song, t) {
      if (!isLiminal(song)) return baseBg(song, t);
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, SOURCE_W, SOURCE_H);
    };

    updateCamera = function(t, dt) {
      baseUpdateCamera(t, dt);
      if (!isLiminal(state.currentSong)) return;
      const camera = sourceCameraAt(t);
      state.camera.zoom = 1;
      state.camera.focusX = SOURCE_W / 2;
      state.camera.focusY = SOURCE_H / 2;
      state.camera.lastSide = camera.side === 1 ? "player" : "opp";
      state.camera.highwayX = 0;
      state.camera.highwayY = 0;
    };

    stage = function(t) {
      if (!isLiminal(state.currentSong)) return baseStage(t);
      drawWorldStage(t);
    };

    receptors = function(t) {
      if (!isLiminal(state.currentSong)) return baseReceptors(t);
      if (t < 4.88372093023256 || t >= 152.032355915066) return;
      for (let lane = 4; lane < 8; lane += 1) drawLiminalReceptor(lane, t);
    };

    notes = function(t) {
      if (!isLiminal(state.currentSong)) return baseNotes(t);
      drawLiminalNotes(t);
    };

    renderScene = function(songT, previewT) {
      if (!isLiminal(state.currentSong)) return baseRenderScene(songT, previewT);
      const t = state.playing ? songT : 0;
      initAssets();
      drawSourceWorld(t);
      applySourceGameShaders(t);
      drawFlashes(t, "camGame");
      drawIntroHud(t);
      drawCrack(t);
      // camHUD takes twice the bop camGame does, which is what makes the arrows
      // punch on the beat. Applied as a transform so the note layout maths stays
      // at the fixed 0.85 HUD zoom.
      const hudBop = (SOURCE_HUD_ZOOM + moduloBopAt(t) * 2) / SOURCE_HUD_ZOOM;
      ctx.save();
      ctx.translate(SOURCE_W / 2, SOURCE_H / 2);
      ctx.scale(hudBop, hudBop);
      ctx.translate(-SOURCE_W / 2, -SOURCE_H / 2);
      receptors(t);
      notes(t);
      ctx.restore();
      drawFlesh(t);
      drawCinematicBars(t);
      drawFlashes(t, "camHUD");
      drawEnding(t);
      return null;
    };

    if (baseApplyDustinBloom) {
      applyDustinBloom = function(t) {
        if (isLiminal(state.currentSong)) return;
        return baseApplyDustinBloom(t);
      };
    }

    cameraTargets = function() {
      if (isLiminal(state.currentSong)) return { oppX: cameraTargetsByLine[0].x, playerX: cameraTargetsByLine[1].x, focusY: 520 };
      return baseCameraTargets();
    };

    cameraPanProfile = function() {
      if (isLiminal(state.currentSong)) return { zoom: 0.9, bias: 1, hud: 0, hudClamp: 0, speed: 1 };
      return baseCameraPanProfile();
    };

    cameraPoseKeys = function() {
      if (isLiminal(state.currentSong)) return { opp: "clarkTable", player: "player" };
      return baseCameraPoseKeys();
    };

    if (typeof syncOnlinePlayback === "function" && typeof expectedOnlineSongTime === "function") {
      const baseSyncOnlinePlayback = syncOnlinePlayback;
      syncOnlinePlayback = function(force = false) {
        const targetTime = expectedOnlineSongTime();
        const result = baseSyncOnlinePlayback(force);
        if (targetTime == null || !isLiminal(state.currentSong)) return result;
        const now = typeof serverClockNow === "function" ? serverClockNow() : Date.now();
        const shouldPlay = now + 40 >= Number(state.network?.matchStartAt || 0);
        ensureAudioTracks().forEach((track, index) => {
          const duration = Number.isFinite(track.duration) && track.duration > 0 ? track.duration : null;
          const desired = Math.max(0, duration == null ? targetTime : Math.min(targetTime, Math.max(0, duration - 0.05)));
          const tolerance = index === 0 ? 0.05 : 0.12;
          if (force || Math.abs(Number(track.currentTime || 0) - desired) > tolerance) { try { track.currentTime = desired; } catch {} }
          if (shouldPlay) {
            if (track.paused && (duration == null || desired < duration - 0.05)) track.play().catch(() => {});
          } else if (!track.paused) track.pause();
        });
        return targetTime;
      };
    }

    window.LIMINAL_DEBUG = {
      LIMINAL,
      scene,
      sourceCameraAt,
      sourceCharacterCameraTarget,
      cameraTargetsByLine,
      filterAt,
      drawWorldStage,
      drawFlesh,
      drawFlashes,
      drawCinematicBars,
      drawLiminalNotes,
      drawSourceWorld,
      applySourceGameShaders,
      activeAnimation,
      SOURCE_W,
      SOURCE_H
    };

    injectStyle();
    renderSongs();
  } catch (error) {
    console.error("Liminal Lyrics mode failed to initialize", error);
  }
})();

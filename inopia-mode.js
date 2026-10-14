(() => {
  try {
    const I = window.INOPIA_DATA;
    if (!I || typeof SONGS === "undefined") return;

    const SOURCE = "inopia";
    const DIRS = ["left", "down", "up", "right"];
    const DIR_ANIMS = ["singLEFT", "singDOWN", "singUP", "singRIGHT"];
    // The stage XML's .55/.6 values are camera zooms, not an art scale.
    // Source sprites and character positions stay in their original pixels.
    const SOURCE_SCALE = 1;
    const SOURCE_W = 1280;
    const SOURCE_H = 720;
    const SHIFT_STEPS = [1024, 1408, 1536, 1568, 1824, 1888];
    // The original chart changes BPM at steps 1020, 1664, and 2048. Stage
    // scripts fire from Conductor.stepHit(), so converting every step and
    // tween from one fixed BPM makes Papyrus, BF flips, strum shifts, and
    // camera events drift later in the song.
    function buildSourceBpmSegments() {
      const segments = [];
      const changes = (I.chart.bpmChanges || [])
        .map(change => ({ time: Number(change.time), bpm: Number(change.bpm) }))
        .filter(change => Number.isFinite(change.time) && Number.isFinite(change.bpm) && change.bpm > 0)
        .sort((a, b) => a.time - b.time);
      let time = 0;
      let step = 0;
      let bpm = Number(I.chart.bpm || 132);
      for (const change of changes) {
        if (change.time <= time + 0.000001 || change.bpm === bpm) continue;
        const endStep = step + (change.time - time) * bpm / 15;
        segments.push({ time, step, endTime: change.time, endStep, bpm });
        time = change.time;
        step = endStep;
        bpm = change.bpm;
      }
      segments.push({ time, step, endTime: Infinity, endStep: Infinity, bpm });
      return segments;
    }
    const SOURCE_BPM_SEGMENTS = buildSourceBpmSegments();
    function sourceStepTime(stepNumber) {
      const target = Math.max(0, Number(stepNumber) || 0);
      const segment = SOURCE_BPM_SEGMENTS.find(item => target <= item.endStep + 0.000001) || SOURCE_BPM_SEGMENTS[SOURCE_BPM_SEGMENTS.length - 1];
      return segment.time + Math.max(0, target - segment.step) * 15 / segment.bpm;
    }
    function sourceBeatDuration(startTime, beats) {
      let remaining = Math.max(0, Number(beats) || 0);
      let cursor = Math.max(0, Number(startTime) || 0);
      let duration = 0;
      while (remaining > 0.000001) {
        const segment = SOURCE_BPM_SEGMENTS.find(item => cursor >= item.time - 0.000001 && cursor < item.endTime - 0.000001)
          || SOURCE_BPM_SEGMENTS[SOURCE_BPM_SEGMENTS.length - 1];
        const untilChange = segment.endTime === Infinity ? Infinity : Math.max(0, segment.endTime - cursor);
        const availableBeats = untilChange === Infinity ? Infinity : untilChange * segment.bpm / 60;
        const beatsHere = Math.min(remaining, availableBeats);
        duration += beatsHere * 60 / segment.bpm;
        remaining -= beatsHere;
        cursor += beatsHere * 60 / segment.bpm;
        if (availableBeats === Infinity || beatsHere < availableBeats - 0.000001) break;
        cursor = segment.endTime;
      }
      return duration;
    }
    const RED_START = sourceStepTime(1672);
    const RED_CHARACTER_START = Number((I.chart.events || []).find(event => event.name === "Change Character")?.time ?? RED_START);
    const PAPYRUS_APPEAR = sourceStepTime(1008);
    const SHIFT_TIMES = SHIFT_STEPS.map(sourceStepTime);
    // Strum lines live on camHUD in the source mod, so these are screen-space
    // pixels rather than world coordinates that should be scaled with the stage.
    const SHIFT_DISTANCE = 640;
    const THIRD_LINE_OFFSET = -320;
    // Codename Engine's Note.swagWidth is 160 * DEFAULT_NOTE_SCALE. The
    // source engine therefore spaces Inopia's four lanes by 112 pixels;
    // using the unscaled 160px value spreads both note groups incorrectly.
    const SOURCE_STRUM_WIDTH = 160 * 0.7;
    const SOURCE_STRUM_Y = 50 + 56;
    const SOURCE_STRUM_RATIOS = [0.75, 0.25, 0];
    const NOTE_RENDER_SCALE = 0.7;
    const SHIFT_DURATION = 0.5;
    // Codename's default holdTime is four steps, which is one musical beat.
    // Sing animations return to idle after that unless a sustain is active.
    const SOURCE_CHARACTER_HOLD_BEATS = 1;
    // These are the per-character camera offsets from inopia_bg.xml. They
    // are separate from camx/camy in each character XML and must be added
    // after the character midpoint is calculated.
    const SOURCE_STAGE_CAMERA_OFFSETS = {
      sans: [0, -30],
      papyrus: [700, -130],
      player: [-450, 0]
    };
    const scene = {
      initialized: false,
      images: {},
      animals: {},
      events: I.chart.events || [],
      eventCache: {},
      noteCursor: 0,
      sharpenFrame: 0,
      lastPostTime: -Infinity,
      cameraPan: { x: 0, y: 0 },
      overlayCache: {},
      overlayComposite: null,
      layerCache: {},
      effectCanvas: null,
      bloomCanvas: null,
      bloomReady: false,
      // Papyrus's third strumline needs its own confirm flashes; the base
      // engine only has receptorFx[0-7], so lanes 0-3 are shared with Sans.
      papyrusReceptorFx: Array.from({ length: 4 }, () => ({ time: -10, lane: 0 }))
    };

    SONGS.inopia = {
      title: I.meta.title,
      subtitle: I.meta.subtitle,
      diff: "Hard (Original Chart)",
      tempo: I.meta.bpm,
      root: 41,
      scale: [0, 2, 3, 5, 7, 8, 10],
      prog: [0, 5, 3, 6],
      scroll: I.chart.speed * 450,
      seed: 47,
      introBeats: 0,
      outroBeats: 2,
      palette: ["#090b13", "#1b263d", "#43516d", "#08070d", "#d5e1ff", "#a52f35"],
      blurb: "Friday Night Dustin's original Inopia hard chart, split audio, forest stage, Sans/Papyrus/BF characters, red phase, source camera events, real note skin, and stage entrances.",
      chartSource: SOURCE
    };
    if (typeof NEW_SONGS !== "undefined" && NEW_SONGS?.add) NEW_SONGS.add("inopia");

    state.poses.sans = state.poses.sans || { lane: 1, time: -10, kind: "hit" };
    state.poses.papyrus = state.poses.papyrus || { lane: 1, time: -10, kind: "hit" };
    state.poses.player = state.poses.player || { lane: 1, time: -10, kind: "hit" };

    const baseIsImportedSong = isImportedSong;
    const baseMakeChart = makeChart;
    const baseStopExternalAudio = stopExternalAudio;
    const baseSongTime = songTime;
    const baseStartSong = startSong;
    const baseBg = bg;
    const baseStage = stage;
    const baseReceptors = receptors;
    const baseNotes = notes;
    const baseCameraTargets = cameraTargets;
    const baseCameraPoseKeys = cameraPoseKeys;
    const baseUpdateCamera = updateCamera;
    const baseRefreshHUD = refreshHUD;
    const baseRenderScene = renderScene;
    const baseApplyDustinBloom = typeof applyDustinBloom === "function" ? applyDustinBloom : null;

    const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value)));
    const lerp = (a, b, amount) => Number(a || 0) + (Number(b || 0) - Number(a || 0)) * clamp(amount, 0, 1);
    const imageReady = image => !!(image && image.complete && image.naturalWidth);
    const isInopia = song => !!song && song.chartSource === SOURCE;
    const sourceEvents = name => {
      if (!name) return scene.events;
      if (!scene.eventCache[name]) scene.eventCache[name] = scene.events.filter(event => event.name === name);
      return scene.eventCache[name];
    };

    function inopiaMechanic(time) {
      let toggles = 0;
      let lastToggle = -Infinity;
      let flipBF = false;
      let bfOffset = 0;
      for (const start of SHIFT_TIMES) {
        if (start > time) break;
        toggles += 1;
        lastToggle = start;

        // Match inopia_bg.hx exactly. The five regular flipBF() calls keep
        // BF on the same source x; only flipBFMAD() has the -850 red-phase
        // branch, and it is conditional on the live flip state.
        if (SHIFT_STEPS[toggles - 1] === 1888) {
          if (flipBF) {
            flipBF = false;
            bfOffset = 0;
          } else {
            flipBF = true;
            bfOffset = -850;
          }
        } else if (flipBF) {
          flipBF = false;
          bfOffset = 0;
        } else {
          flipBF = true;
          bfOffset = 0;
        }
      }
      const elapsed = time - lastToggle;
      const progress = lastToggle > -Infinity ? clamp(elapsed / SHIFT_DURATION, 0, 1) : 1;
      const eased = 1 - Math.pow(1 - progress, 2); // FlxEase.quadOut from inopia_bg.hx
      const shiftProgress = flipBF ? eased : 1 - eased;
      return {
        toggles,
        shifted: flipBF,
        // Codename's fixChar() inverts player XML flipX at load. The stage
        // script then toggles that runtime state; regular flips keep the
        // source x, while flipBFMAD() owns its one red-phase -850 branch.
        flipBF,
        bfOffset,
        shiftX: SHIFT_DISTANCE * (lastToggle > -Infinity ? clamp(shiftProgress, 0, 1) : 0),
        red: time >= RED_START
      };
    }

    function loadImage(key, source) {
      if (!source || scene.images[key]) return;
      const image = new Image();
      image.decoding = "async";
      image.src = source;
      scene.images[key] = image;
    }

    function initAssets() {
      if (scene.initialized) return;
      scene.initialized = true;
      for (const layer of [...I.stage.layers, ...I.stage.redLayers]) loadImage(layer.image, layer.image);
      loadImage("ui-frame", I.ui.frame);
      loadImage("ui-vignette", I.ui.vignette);
      loadImage("ui-alt-vignette", I.ui.altVignette);
      loadImage("ui-red", I.ui.red);
      loadImage("notes", I.notes.image);
      for (const [key, character] of Object.entries(I.sprites.characters)) loadImage(`character-${key}`, character.image);
      for (const [key, animal] of Object.entries(I.sprites.animals)) {
        loadImage(`animal-${key}`, animal.image);
        scene.animals[key] = { started: false, start: animal.appear };
      }
    }

    function cloneChart() {
      return {
        ...I.chart,
        // The source chart stores notes grouped by strum line. The browser
        // renderer advances one shared cursor, so keep imported notes in
        // song-time order or a future note on Sans can hide Papyrus/BF notes.
        notes: I.chart.notes
          .map(note => ({ ...note }))
          .sort((a, b) => Number(a.time) - Number(b.time)
            || Number(a.sourceLine || 0) - Number(b.sourceLine || 0)
            || Number(a.lane || 0) - Number(b.lane || 0)),
        timeline: I.chart.timeline.map(section => ({ ...section })),
        events: I.chart.events.map(event => ({ ...event, params: event.params.slice() })),
        bpmChanges: I.chart.bpmChanges.map(change => ({ ...change }))
      };
    }

    function sourceCameraSide(time) {
      let side = 1;
      for (const event of sourceEvents("Camera Movement")) {
        if (event.time > time) break;
        side = Number(event.params?.[0] ?? side);
      }
      return side;
    }

    function sourceEase(progress, curve, direction) {
      const p = clamp(progress, 0, 1);
      const name = String(curve || "linear").toLowerCase();
      const mode = String(direction || "").toLowerCase();
      if (name.includes("quad")) {
        if (mode.includes("inout")) return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
        if (mode.includes("out")) return 1 - Math.pow(1 - p, 2);
        return p * p;
      }
      if (name.includes("quart")) {
        if (mode.includes("inout")) return p < 0.5 ? 8 * Math.pow(p, 4) : 1 - Math.pow(-2 * p + 2, 4) / 2;
        if (mode.includes("out")) return 1 - Math.pow(1 - p, 4);
        return Math.pow(p, 4);
      }
      if (name.includes("sine")) {
        if (mode.includes("inout")) return -(Math.cos(Math.PI * p) - 1) / 2;
        if (mode.includes("out")) return Math.sin((p * Math.PI) / 2);
        return 1 - Math.cos((p * Math.PI) / 2);
      }
      return p;
    }

    function sourceTweenValue(name, time, valueIndex, durationIndex, initial, filter) {
      let value = Number(initial || 0);
      let transition = null;
      for (const event of sourceEvents(name)) {
        if (event.time > time) break;
        if (filter && !filter(event)) continue;
        if (transition) {
          const at = clamp((event.time - transition.start) / transition.duration, 0, 1);
          value = transition.from + (transition.to - transition.from) * sourceEase(at, transition.curve, transition.direction);
          transition = null;
        }
        const params = event.params || [];
        const target = Number(params[valueIndex]);
        if (!Number.isFinite(target)) continue;
        if (params[0] === false) {
          value = target;
          continue;
        }
        const duration = sourceBeatDuration(event.time, params[durationIndex]);
        if (duration <= 0) {
          value = target;
          continue;
        }
        transition = {
          start: event.time,
          duration,
          from: value,
          to: target,
          curve: params[durationIndex + 1],
          direction: params[durationIndex + 2]
        };
        const at = clamp((time - transition.start) / transition.duration, 0, 1);
        value = transition.from + (transition.to - transition.from) * sourceEase(at, transition.curve, transition.direction);
        if (at >= 1) transition = null;
      }
      if (transition) {
        const at = clamp((time - transition.start) / transition.duration, 0, 1);
        value = transition.from + (transition.to - transition.from) * sourceEase(at, transition.curve, transition.direction);
      }
      return value;
    }

    function sourceColor(value) {
      const numeric = Number(value);
      if (numeric === -1) return "#ffffff";
      const rgb = (numeric < 0 ? numeric >>> 0 : numeric) & 0xffffff;
      return `#${rgb.toString(16).padStart(6, "0")}`;
    }

    function drawSourceScreenCover(time, camera) {
      const matches = sourceEvents("Screen Coverer").filter(event => String(event.params?.[6] || "camHUD") === camera);
      if (!matches.length) return;
      let color = -16777216;
      let alpha = 0;
      let transition = null;
      for (const event of matches) {
        if (event.time > time) break;
        const params = event.params || [];
        if (params[1] !== undefined) color = params[1];
        if (transition) {
          const at = clamp((event.time - transition.start) / transition.duration, 0, 1);
          alpha = transition.from + (transition.to - transition.from) * sourceEase(at, transition.curve, transition.direction);
          transition = null;
        }
        // The source event writes params[2] immediately when visibility is
        // false. Inopia uses this for its opening and phase-change covers.
        const target = clamp(Number(params[2] ?? 0), 0, 1);
        const duration = sourceBeatDuration(event.time, params[3]);
        if (duration <= 0) {
          alpha = target;
        } else {
          transition = {
            start: event.time,
            duration,
            from: alpha,
            to: target,
            curve: params[4],
            direction: params[5]
          };
          const at = clamp((time - transition.start) / transition.duration, 0, 1);
          alpha = transition.from + (transition.to - transition.from) * sourceEase(at, transition.curve, transition.direction);
          if (at >= 1) transition = null;
        }
      }
      if (transition) {
        const at = clamp((time - transition.start) / transition.duration, 0, 1);
        alpha = transition.from + (transition.to - transition.from) * sourceEase(at, transition.curve, transition.direction);
      }
      if (alpha <= 0.001) return;
      ctx.save();
      ctx.globalAlpha = clamp(alpha, 0, 1);
      ctx.fillStyle = sourceColor(color);
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
    }

    function drawSourceCinematicBars(time) {
      if (!sourceEvents("Cinematic Bars").length) return;
      const amount = sourceTweenValue("Cinematic Bars", time, 1, 2, 0);
      if (amount <= 0.001) return;
      const height = ((canvas.height + 20) / 2) * clamp(amount, 0, 1);
      ctx.save();
      ctx.fillStyle = "#000";
      ctx.fillRect(-2, -2, canvas.width + 4, height + 2);
      ctx.fillRect(-2, canvas.height - height, canvas.width + 4, height + 2);
      ctx.restore();
    }

    // Codename beatHit(): when camZooming, every `camZoomingInterval` beats
    // camGame.zoom += 0.015 * strength and camHUD.zoom += 0.03 * strength,
    // then both lerp back. 'Camera Modulo Change' / 'Camera Bump Modulo' set
    // [interval, strength]. Beats follow the source BPM map, so precompute
    // every bump time once.
    const SOURCE_BUMP_DEFAULT_INTERVAL = 4;
    const SOURCE_BUMP_DECAY = 3; // CoolUtil.fpsLerp(…, 0.05) at 60fps ≈ e^(-3t)
    const SOURCE_BUMPS = (() => {
      const changes = (I.chart.events || [])
        .filter(event => event.name === "Camera Modulo Change" || event.name === "Camera Bump Modulo")
        .map(event => ({ time: Number(event.time), interval: Number(event.params?.[0]), strength: Number(event.params?.[1]) }))
        .filter(change => Number.isFinite(change.time))
        .sort((a, b) => a.time - b.time);
      // camZooming turns on once the first note is hit.
      const firstNote = Math.min(...(I.chart.notes || []).map(note => Number(note.time)).filter(Number.isFinite));
      const start = Number.isFinite(firstNote) ? firstNote : 0;
      const end = Number(I.chart.totalTime || 0) || sourceStepTime(4 * 1000);
      const bumps = [];
      let interval = SOURCE_BUMP_DEFAULT_INTERVAL;
      let strength = 1;
      let cursor = 0;
      for (let beat = 0; ; beat += 1) {
        const time = sourceStepTime(beat * 4);
        if (time > end) break;
        while (cursor < changes.length && changes[cursor].time <= time + 0.002) {
          const change = changes[cursor++];
          if (Number.isFinite(change.interval)) interval = Math.max(1, Math.round(change.interval));
          if (Number.isFinite(change.strength)) strength = change.strength;
        }
        if (time + 0.002 < start || beat % interval !== 0 || strength <= 0) continue;
        bumps.push({ time, strength });
      }
      return bumps;
    })();

    function sourceBeatBump(time) {
      let amount = 0;
      for (let index = SOURCE_BUMPS.length - 1; index >= 0; index -= 1) {
        const bump = SOURCE_BUMPS[index];
        const age = time - bump.time;
        if (age < 0) continue;
        if (age > 2) break;
        amount += bump.strength * Math.exp(-SOURCE_BUMP_DECAY * age);
      }
      return { game: amount * 0.015, hud: amount * 0.03 };
    }

    // Codename's Camera Flash: [reversed, color, time (steps), camera].
    function drawSourceCameraFlash(time, camera) {
      for (const event of sourceEvents("Camera Flash")) {
        if (event.time > time) break;
        const params = event.params || [];
        if (String(params[3] || "camGame") !== camera) continue;
        const duration = Math.max(0.01, sourceBeatDuration(event.time, Math.max(0, Number(params[2]) || 0) / 4));
        const progress = (time - event.time) / duration;
        if (progress < 0 || progress >= 1) continue;
        const alpha = params[0] === true ? progress : 1 - progress;
        if (alpha <= 0.001) continue;
        ctx.save();
        ctx.globalAlpha = clamp(alpha, 0, 1);
        ctx.fillStyle = sourceColor(params[1] ?? -1);
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.restore();
      }
    }

    // Lyrics event: "Set Font" / "Add Text" / "Force remove all text".
    // Text accumulates until removed; the newest phrase pops in.
    function sourceLyricsState(time) {
      let font = "";
      let color = -1;
      let lines = [];
      let lastAdd = -Infinity;
      for (const event of sourceEvents("Lyrics")) {
        if (event.time > time) break;
        const params = event.params || [];
        const action = String(params[0] || "");
        if (action === "Set Font") font = String(params[1] || "");
        else if (action === "Add Text") {
          lines.push(String(params[1] || ""));
          if (Number.isFinite(Number(params[2]))) color = Number(params[2]);
          lastAdd = event.time;
        } else if (action.toLowerCase().includes("remove")) lines = [];
      }
      return { font, color, lines, lastAdd };
    }

    function drawSourceLyrics(time) {
      if (!sourceEvents("Lyrics").length) return;
      const lyrics = sourceLyricsState(time);
      if (!lyrics.lines.length) return;
      const family = lyrics.font.toLowerCase().includes("papyrus")
        ? "Papyrus, \"Comic Sans MS\", fantasy"
        : "\"Comic Sans MS\", sans-serif";
      const size = 40;
      const lineHeight = size * 1.2;
      // Keep the lyrics clear of the strumline (top on upscroll, bottom on downscroll).
      const baseY = isDownScroll() ? canvas.height * 0.3 : canvas.height * 0.72;
      const firstY = baseY - (lyrics.lines.length - 1) * lineHeight * 0.5;
      const popAge = time - lyrics.lastAdd;
      ctx.save();
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineJoin = "round";
      lyrics.lines.forEach((line, index) => {
        const newest = index === lyrics.lines.length - 1;
        const pop = newest ? 1 + 0.18 * Math.max(0, 1 - popAge / 0.12) : 1;
        ctx.save();
        ctx.translate(canvas.width / 2, firstY + index * lineHeight);
        ctx.scale(pop, pop);
        ctx.font = `bold ${size}px ${family}`;
        ctx.lineWidth = 6;
        ctx.strokeStyle = "rgba(0,0,0,0.9)";
        ctx.strokeText(line, 0, 0);
        ctx.fillStyle = sourceColor(lyrics.color);
        ctx.fillText(line, 0, 0);
        ctx.restore();
      });
      ctx.restore();
    }

    function sourceZoom(time) {
      let zoom = Number(I.stage.zoom || 0.55);
      let transition = null;
      for (const event of sourceEvents("Change Stage Zoom")) {
        if (event.time > time) break;
        if (transition) {
          const at = clamp((event.time - transition.start) / transition.duration, 0, 1);
          zoom = transition.from + (transition.to - transition.from) * sourceEase(at, transition.curve, transition.direction);
          transition = null;
        }
        // The first four values select which camera target receives the
        // event. Only the first flag changes defaultCamZoom; BF/Dad/GF-only
        // events must not move the browser's world camera.
        if (event.params?.[0] !== true) continue;
        const target = Number(event.params?.[5]);
        if (!Number.isFinite(target)) continue;
        const durationBeats = Math.max(0, Number(event.params?.[6]) || 0);
        const duration = sourceBeatDuration(event.time, durationBeats);
        if (duration <= 0) {
          zoom = target;
        } else {
          transition = {
            start: event.time,
            duration,
            from: zoom,
            to: target,
            curve: event.params?.[7],
            direction: event.params?.[8]
          };
          const at = clamp((time - transition.start) / transition.duration, 0, 1);
          zoom = transition.from + (transition.to - transition.from) * sourceEase(at, transition.curve, transition.direction);
          if (at >= 1) transition = null;
        }
      }
      // Dustin's custom event writes the target directly to defaultCamZoom;
      // it is not relative to the stage's art scale.
      return clamp(zoom, 0.35, 2.2);
    }

    function activeCharacterSet(time) {
      return time >= RED_CHARACTER_START ? { sans: "sansMad", papyrus: "papyrusMad", player: "playerMad" } : { sans: "sans", papyrus: "papyrus", player: "player" };
    }

    function forcedAnimation(kind, time) {
      const index = kind === "sans" ? 0 : kind === "player" ? 1 : 2;
      let result = null;
      for (const event of sourceEvents("Play Animation")) {
        if (event.time > time) break;
        if (Number(event.params?.[0]) !== index) continue;
        result = {
          name: String(event.params?.[1] || ""),
          start: event.time,
          forced: event.params?.[2] === true
        };
      }
      if (!result) return null;
      const def = I.sprites.characters[activeCharacterSet(time)[kind]];
      const animation = def?.animations?.[result.name];
      result.loop = !!animation?.loop;
      result.duration = animation?.fps && animation?.frames?.length
        ? animation.frames.length / animation.fps
        : 2.4;
      return result;
    }

    function characterFor(kind, time) {
      const key = activeCharacterSet(time)[kind];
      const def = I.sprites.characters[key];
      const forced = forcedAnimation(kind, time);
      const pose = state.poses[kind === "player" ? "player" : kind];
      const held = activeHoldNoteForCharacter(kind === "player" ? "player" : kind, time);
      const lane = held ? held.lane % 4 : pose?.lane || 0;
      const age = held ? Math.max(0, time - held.time) : performance.now() / 1000 - (pose?.time || -10);
      const dir = DIR_ANIMS[lane] || "singLEFT";
      let anim = "idle";
      // Source idle animations are authored at their XML fps. Passing song
      // time directly lets frameFromList apply that fps instead of slowing
      // every idle loop to an arbitrary 0.6x rate.
      let elapsed = time;
      let loop = true;
      const forcedAge = Math.max(0, time - (forced?.start ?? time));
      const forcedActive = forced && def.animations[forced.name]
        && (forced.loop ? true : forcedAge < forced.duration);
      if (forcedActive) {
        anim = forced.name;
        elapsed = forcedAge;
        loop = forced.loop;
      } else if (held && def.animations[dir]) {
        anim = dir;
        elapsed = age;
        loop = false;
      } else if (pose?.kind === "miss" && def.animations[`${dir}miss`]) {
        const miss = def.animations[`${dir}miss`];
        const missDuration = miss.fps && miss.frames?.length ? miss.frames.length / miss.fps : 0.42;
        if (age >= 0 && age < missDuration) {
          anim = `${dir}miss`;
          elapsed = age;
          loop = false;
        }
      } else if (age >= 0 && age < sourceBeatDuration(time, SOURCE_CHARACTER_HOLD_BEATS)
        && def.animations[dir]) {
        anim = dir;
        elapsed = age;
        loop = false;
      }
      const animation = def.animations[anim] || def.animations.idle;
      return { def, animation, elapsed, loop, key };
    }

    function characterPosition(kind, time, frame = null, resolvedCharacter = null) {
      // Reuse the draw call's resolved animation. Calling characterFor twice
      // can cross a hold boundary between reads and anchor one frame with the
      // previous pose's XML offset.
      const data = resolvedCharacter || characterFor(kind, time);
      const base = I.stage.characters[kind];
      const def = data.def || {};
      const mechanic = inopiaMechanic(time);
      const flipOffset = kind === "player" ? mechanic.bfOffset : 0;
      const position = [
        Number(base?.[0] || 0) + Number(def.x || 0) + flipOffset,
        Number(base?.[1] || 0) + Number(def.y || 0)
      ];
      if ((kind === "player" || kind === "papyrus") && frame) {
        // Keep the source foot line explicit for both characters. Their
        // trimmed atlas boxes and animation offsets vary between poses, so
        // anchoring only BF made Papyrus and BF visibly float at different
        // points during sing frames.
        const idleFrame = data.def?.animations?.idle?.frames?.[0];
        // drawAtlasFrame applies the atlas fy trim after the anchor is
        // calculated. The rendered idle bottom is therefore the idle frame
        // height, not height + fy; including idle fy here makes every pose
        // with a non-zero fy float or sink by that trim amount.
        const sourceFeetY = Number(base?.[1] || 0) + Number(def.y || 0)
          + Number(idleFrame?.fh || idleFrame?.h || 0);
        const animationOffset = data.animation?.offset || [0, 0];
        position[1] = sourceFeetY + Number(animationOffset[1] || 0)
          - Number(frame.fh || frame.h || 0);
      }
      return position;
    }

    // Codename Engine's Camera Movement event follows the selected
    // strumline character midpoint, then applies the character's `camx` /
    // `camy` values. Keeping this in source pixels prevents the browser
    // fallback from drifting when the animation frame changes size.
    function characterCameraPosition(kind, time) {
      const data = characterFor(kind, time);
      const def = data.def || {};
      const frame = data.animation?.frames?.length
        ? frameFromList(data.animation.frames, data.elapsed, data.animation.fps || 24, data.loop || data.animation.loop)
        : null;
      const frameWidth = Number(frame?.fw || frame?.w || 0);
      const frameHeight = Number(frame?.fh || frame?.h || 0);
      const stagePosition = I.stage.characters[kind] || [0, 0];
      const characterScale = Number(def.scale || 1);
      // Character.getCameraPosition() in Codename Engine starts from the
      // StageCharPos midpoint, then adds the XML global offset and the
      // engine's -100/+150 side bias. Those biases are source behavior, not
      // arbitrary browser nudges.
      const sideBiasX = kind === "player" ? -100 : 150;
      const midpointX = Number(stagePosition[0] || 0) + (frameWidth * 0.5 + Number(frame?.fx || 0)) * characterScale
        + sideBiasX + Number(def.x || 0);
      const midpointY = Number(stagePosition[1] || 0) + (frameHeight * 0.5 + Number(frame?.fy || 0)) * characterScale
        - 100 + Number(def.y || 0);
      const stageOffset = I.stage.characterCameraOffsets?.[kind] || SOURCE_STAGE_CAMERA_OFFSETS[kind] || [0, 0];
      return {
        x: (midpointX + Number(def.camX || 0) + Number(stageOffset[0] || 0)) * SOURCE_SCALE,
        y: (midpointY + Number(def.camY || 0) + Number(stageOffset[1] || 0)) * SOURCE_SCALE
      };
    }

    // Source character XML positions are the top-left world anchor. The
    // shared atlas helper draws from a bottom-center anchor, so convert the
    // source position with the frame's baked offsets before drawing.
    function sourceFrameAnchor(position, frame, offset, worldScale, renderScale, flipX = false) {
      const fw = Number(frame?.fw || frame?.w || 0);
      const fh = Number(frame?.fh || frame?.h || 0);
      const fx = Number(frame?.fx || 0);
      const fy = Number(frame?.fy || 0);
      const ox = Number(offset?.[0] || 0);
      const oy = Number(offset?.[1] || 0);
      // drawAtlasFrame mirrors around its anchor. Codename's mirrored
      // player path also mirrors the atlas trim offset; using +fx here for a
      // flipped BF adds the trim twice and makes his root slide between
      // frames even though boyfriend.x stays fixed in inopia_bg.hx.
      const frameTrimX = flipX ? -fx : fx;
      return {
        x: (Number(position?.[0] || 0) - ox) * worldScale + (fw * 0.5 + frameTrimX) * renderScale,
        y: (Number(position?.[1] || 0) - oy) * worldScale + (fh + fy) * renderScale
      };
    }

    function drawCharacter(kind, time) {
      if (kind === "papyrus" && time < PAPYRUS_APPEAR) return;
      const data = characterFor(kind, time);
      const character = data.def;
      const animation = data.animation;
      if (!character || !animation || !animation.frames?.length) return;
      const frame = frameFromList(animation.frames, data.elapsed, animation.fps || 24, data.loop || animation.loop);
      if (!frame) return;
      const position = characterPosition(kind, time, frame, data);
      const offset = animation.offset || [0, 0];
      const mechanic = inopiaMechanic(time);
      // Preserve Codename's player inversion: XML flipX=true becomes the
      // initial runtime false, then each stage event XORs the runtime flip.
      const flip = kind === "player"
        ? ((!character.flipX) !== mechanic.flipBF)
        : !!character.flipX;
      // Codename mirrors the player's animation offset with the character
      // when the stage turns BF toward Papyrus. Keeping the raw x offset
      // after mirroring makes sing frames slide away from the same root.
      const drawOffset = kind === "player" && flip
        ? [-Number(offset[0] || 0), Number(offset[1] || 0)]
        : offset;
      const renderScale = SOURCE_SCALE * Number(character.scale || 1);
      const anchor = sourceFrameAnchor(position, frame, drawOffset, SOURCE_SCALE, renderScale, flip);
      drawAtlasFrame(scene.images[`character-${data.key}`], frame, anchor.x, anchor.y, renderScale, 1, flip);
    }

    function drawAnimal(name, time) {
      const item = I.sprites.animals[name];
      const stateItem = scene.animals[name];
      if (!item || !stateItem || time < item.appear) return;
      const image = scene.images[`animal-${name}`];
      if (!imageReady(image)) return;
      const appearing = time < item.appear + (item.animations.appear.length / 24);
      const frames = appearing && item.animations.appear.length ? item.animations.appear : item.animations.idle;
      const frame = frameFromList(frames, appearing ? time - item.appear : time, 24, !appearing);
      if (!frame) return;
      const idleOffset = appearing ? [0, 0] : (item.idleOffset || [0, 0]);
      const scrollX = Number(item.scrollX ?? 1);
      const scrollY = Number(item.scrollY ?? 1);
      const parallaxX = scene.cameraPan.x * (scrollX - 1);
      const parallaxY = scene.cameraPan.y * (scrollY - 1);
      const anchor = sourceFrameAnchor([item.x, item.y], frame, idleOffset, SOURCE_SCALE, SOURCE_SCALE);
      drawAtlasFrame(
        image,
        frame,
        anchor.x + parallaxX,
        anchor.y + parallaxY,
        SOURCE_SCALE,
        1
      );
    }

    function drawLayers(layers) {
      for (const layer of layers) {
        const image = scene.images[layer.image];
        if (!imageReady(image)) continue;
        let cached = scene.layerCache[layer.image];
        if (!cached || cached._sourceWidth !== image.naturalWidth || cached._sourceHeight !== image.naturalHeight) {
          cached = document.createElement("canvas");
          cached.width = Math.max(1, Math.ceil(image.naturalWidth * SOURCE_SCALE));
          cached.height = Math.max(1, Math.ceil(image.naturalHeight * SOURCE_SCALE));
          const cacheCtx = cached.getContext("2d");
          cacheCtx.imageSmoothingEnabled = true;
          cacheCtx.imageSmoothingQuality = "high";
          cacheCtx.drawImage(image, 0, 0, cached.width, cached.height);
          cached._sourceWidth = image.naturalWidth;
          cached._sourceHeight = image.naturalHeight;
          scene.layerCache[layer.image] = cached;
        }
        const scrollX = Number(layer.scrollX ?? 1);
        const scrollY = Number(layer.scrollY ?? 1);
        const parallaxX = scene.cameraPan.x * (scrollX - 1);
        const parallaxY = scene.cameraPan.y * (scrollY - 1);
        ctx.drawImage(cached, layer.x * SOURCE_SCALE + parallaxX, layer.y * SOURCE_SCALE + parallaxY);
      }
    }

    function drawInopiaStage(time) {
      initAssets();
      const red = time >= RED_START;
      const layers = red ? I.stage.redLayers : I.stage.layers;
      // Match inopia_bg.xml's display-list order. Bunny2/cat sit between
      // the rear trees and the BG2/BG1 foreground layers; the other animals
      // are added after the three character strum lines.
      drawLayers(layers.slice(0, 5));
      ["bunny2", "cat"].forEach(name => drawAnimal(name, time));
      drawLayers(layers.slice(5));
      drawCharacter("papyrus", time);
      drawCharacter("sans", time);
      drawCharacter("player", time);
      ["deer", "mouse", "bunny", "bear", "monster"].forEach(name => drawAnimal(name, time));
    }

    function overlayCache(key, image, frame) {
      if (!imageReady(image) || !frame) return null;
      const width = canvas.width;
      const height = canvas.height;
      const cached = scene.overlayCache[key];
      if (cached && cached.width === width && cached.height === height) return cached;
      const layer = document.createElement("canvas");
      layer.width = width;
      layer.height = height;
      const layerCtx = layer.getContext("2d");
      layerCtx.imageSmoothingEnabled = true;
      layerCtx.imageSmoothingQuality = "high";
      // The source XML coordinates are authored for Codename's HUD camera,
      // but this browser renderer's HUD is a 1280x720 canvas. Applying the
      // raw -310/-180 sprite position leaves the source frame ending at
      // x=995 and creates the hard black rectangle seen on the right. Fit
      // the source frame to the HUD viewport while preserving its aspect.
      const sourceWidth = Number(frame.fw || frame.w || width);
      const sourceHeight = Number(frame.fh || frame.h || height);
      const fitScale = Math.max(width / sourceWidth, height / sourceHeight);
      const drawWidth = Number(frame.w || sourceWidth) * fitScale;
      const drawHeight = Number(frame.h || sourceHeight) * fitScale;
      const drawX = (width - sourceWidth * fitScale) * 0.5 + Number(frame.fx || 0) * fitScale;
      const drawY = (height - sourceHeight * fitScale) * 0.5 + Number(frame.fy || 0) * fitScale;
      layerCtx.drawImage(
        image,
        frame.x,
        frame.y,
        frame.w,
        frame.h,
        drawX,
        drawY,
        drawWidth,
        drawHeight
      );
      scene.overlayCache[key] = layer;
      return layer;
    }

    function drawCachedOverlay(key, image, frame, alpha) {
      const layer = overlayCache(key, image, frame);
      if (!layer || alpha <= 0) return;
      ctx.save();
      ctx.globalAlpha = clamp(alpha, 0, 1);
      ctx.drawImage(layer, 0, 0, canvas.width, canvas.height);
      ctx.restore();
    }

    function staticOverlayComposite() {
      const frame = scene.images["ui-frame"];
      const vignette = scene.images["ui-vignette"];
      const altVignette = scene.images["ui-alt-vignette"];
      const frameData = I.ui.frameData;
      const vignetteData = I.ui.vignetteFrame;
      const altVignetteData = I.ui.altVignetteFrame;
      if (!imageReady(frame) || !imageReady(vignette) || !imageReady(altVignette)
        || !frameData || !vignetteData || !altVignetteData) return null;
      const width = canvas.width;
      const height = canvas.height;
      if (scene.overlayComposite && scene.overlayComposite.width === width && scene.overlayComposite.height === height) {
        return scene.overlayComposite;
      }
      const layer = document.createElement("canvas");
      layer.width = width;
      layer.height = height;
      const layerCtx = layer.getContext("2d");
      layerCtx.imageSmoothingEnabled = true;
      layerCtx.imageSmoothingQuality = "high";
      const draw = (image, data, alpha) => {
        const cached = overlayCache(data.name, image, data);
        if (!cached) return;
        layerCtx.globalAlpha = alpha;
        layerCtx.drawImage(cached, 0, 0, width, height);
      };
      draw(frame, frameData, 1);
      draw(vignette, vignetteData, 0.5);
      draw(altVignette, altVignetteData, 0.5);
      layerCtx.globalAlpha = 1;
      scene.overlayComposite = layer;
      return layer;
    }

    function drawInopiaOverlay(time) {
      const staticLayer = staticOverlayComposite();
      if (staticLayer) ctx.drawImage(staticLayer, 0, 0, canvas.width, canvas.height);
      // inopia_bg.hx keeps the red HUD sprite alive for the whole song and
      // drives its alpha from health; it is not limited to the later red BG.
      // The source uses Codename's 0-2 health (alpha = 1 - health); this
      // engine's health is 0-1, so red only appears below half health.
      drawCachedOverlay("red", scene.images["ui-red"], I.ui.redFrame,
        clamp(1 - Number(state.health ?? 1) * 2, 0, 1));
    }

    function inopiaBloomAmount(time) {
      return Math.max(1, sourceTweenValue("Bloom Effect", time, 1, 2, 1));
    }

    // Capture the game layer for bloom before receptors/notes are drawn, so
    // the half-resolution bloom buffer never smears the arrows.
    function captureInopiaBloomSource(time) {
      scene.bloomReady = false;
      if (inopiaBloomAmount(time) <= 1.002) return;
      const width = Math.max(1, Math.round(canvas.width * 0.5));
      const height = Math.max(1, Math.round(canvas.height * 0.5));
      if (!scene.bloomCanvas || scene.bloomCanvas.width !== width || scene.bloomCanvas.height !== height) {
        scene.bloomCanvas = document.createElement("canvas");
        scene.bloomCanvas.width = width;
        scene.bloomCanvas.height = height;
      }
      const bloomCtx = scene.bloomCanvas.getContext("2d");
      bloomCtx.clearRect(0, 0, width, height);
      bloomCtx.drawImage(canvas, 0, 0, width, height);
      scene.bloomReady = true;
    }

    function drawInopiaPostEffects(time) {
      const saturation = clamp(sourceTweenValue("Saturation Effect", time, 1, 2, 1), 0, 4);
      const contrast = clamp(sourceTweenValue("Contrast Effect", time, 1, 2, 1), 0, 4);
      const bloom = inopiaBloomAmount(time);
      const vignetteAmount = Math.max(0, sourceTweenValue("Screen Vignette", time, 1, 3, 0.1));
      const vignetteStrength = Math.max(0.01, sourceTweenValue("Screen Vignette", time, 2, 3, 0.1));
      const needsGrade = Math.abs(saturation - 1) > 0.002 || Math.abs(contrast - 1) > 0.002;
      const needsBloom = bloom > 1.002 && scene.bloomReady;
      if (!needsGrade && !needsBloom && vignetteAmount <= 0.001) return;

      if (needsGrade) {
        // Saturation/contrast is copied at full resolution so receptors and
        // notes stay sharp.
        const effectWidth = canvas.width;
        const effectHeight = canvas.height;
        if (!scene.effectCanvas || scene.effectCanvas.width !== effectWidth || scene.effectCanvas.height !== effectHeight) {
          scene.effectCanvas = document.createElement("canvas");
          scene.effectCanvas.width = effectWidth;
          scene.effectCanvas.height = effectHeight;
        }
        const effectCtx = scene.effectCanvas.getContext("2d");
        effectCtx.clearRect(0, 0, effectWidth, effectHeight);
        effectCtx.drawImage(canvas, 0, 0, effectWidth, effectHeight);
        ctx.save();
        ctx.filter = `saturate(${saturation.toFixed(3)}) contrast(${contrast.toFixed(3)})`;
        ctx.drawImage(scene.effectCanvas, 0, 0, canvas.width, canvas.height);
        ctx.restore();
      }
      if (needsBloom) {
        // The source bloom event changes the bloom shader's size and
        // brightness. A single composited blur keeps that same timing
        // without the 48-texture-sample WebGL pass that caused Inopia's
        // frame spikes in the browser. Browser canvas blur is expensive at
        // full resolution, so the glow comes from the half-resolution
        // game-layer capture taken before the HUD (captureInopiaBloomSource).
        ctx.save();
        ctx.globalCompositeOperation = "screen";
        ctx.globalAlpha = clamp((bloom - 1) * 0.16, 0, 0.52);
        ctx.filter = `blur(${clamp((bloom - 1) * 2.2, 0, 12).toFixed(1)}px) brightness(${clamp(bloom, 1, 3).toFixed(2)}) saturate(${saturation.toFixed(3)}) contrast(${contrast.toFixed(3)})`;
        ctx.drawImage(scene.bloomCanvas, 0, 0, canvas.width, canvas.height);
        ctx.restore();
      }

      if (vignetteAmount > 0.001) {
        const edgeDistance = Math.SQRT1_2;
        const edgeAlpha = clamp(1 - Math.pow(Math.max(0, 1 - vignetteAmount * edgeDistance), vignetteStrength), 0, 0.92);
        if (edgeAlpha > 0.001) {
          const gradient = ctx.createRadialGradient(
            canvas.width * 0.5,
            canvas.height * 0.5,
            Math.min(canvas.width, canvas.height) * 0.18,
            canvas.width * 0.5,
            canvas.height * 0.5,
            Math.max(canvas.width, canvas.height) * 0.72
          );
          gradient.addColorStop(0, "rgba(0,0,0,0)");
          gradient.addColorStop(0.72, "rgba(0,0,0,0)");
          gradient.addColorStop(1, `rgba(0,0,0,${edgeAlpha.toFixed(3)})`);
          ctx.save();
          ctx.fillStyle = gradient;
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.restore();
        }
      }
    }

    function sourceScroll(time) {
      let speed = Number(I.chart.speed || 2.8);
      let transition = null;
      for (const event of sourceEvents("Change Scroll Speed")) {
        if (event.time > time) break;
        if (transition) {
          const at = clamp((event.time - transition.start) / transition.duration, 0, 1);
          speed = transition.from + (transition.to - transition.from) * sourceEase(at, transition.curve, transition.direction);
          transition = null;
        }
        const target = Number(event.params?.[1]);
        if (!Number.isFinite(target)) continue;
        const durationBeats = Math.max(0, Number(event.params?.[2]) || 0);
        const duration = sourceBeatDuration(event.time, durationBeats);
        if (duration <= 0) {
          speed = target;
        } else {
          transition = {
            start: event.time,
            duration,
            from: speed,
            to: target,
            curve: event.params?.[3],
            direction: event.params?.[4]
          };
          const at = clamp((time - transition.start) / transition.duration, 0, 1);
          speed = transition.from + (transition.to - transition.from) * sourceEase(at, transition.curve, transition.direction);
          if (at >= 1) transition = null;
        }
      }
      return speed * 450;
    }

    function drawInopiaReceptor(lane, x, y, fx = state.receptorFx[lane]) {
      const skin = I.notes.skin[DIRS[lane % 4]];
      if (!skin) return;
      const age = performance.now() / 1000 - Number(fx?.time ?? -10);
      const image = scene.images.notes;
      if (age >= 0 && age < 0.16 && skin.confirm?.length) {
        const frame = frameFromList(skin.confirm, age, 26, false);
        if (frame) {
          drawAtlasCentered(image, frame, x, y, NOTE_RENDER_SCALE, 1 - age / 0.16);
          return;
        }
      }
      const frame = state.keysDown[lane] && skin.press?.length ? frameFromList(skin.press, performance.now() / 1000, 24, true) : skin.static;
      if (frame) drawAtlasCentered(image, frame, x, y, NOTE_RENDER_SCALE, 1);
    }

    function drawInopiaSustain(note, x, topY, tailY, alpha) {
      const skin = I.notes.skin[DIRS[note.lane % 4]];
      const image = scene.images.notes;
      if (!skin?.holdPiece || !skin.holdEnd || !imageReady(image)) return;
      const upper = Math.min(topY, tailY);
      const lower = Math.max(topY, tailY);
      const capScale = NOTE_RENDER_SCALE;
      const capHeight = (skin.holdEnd.fh || skin.holdEnd.h) * capScale;
      const bodyWidth = (skin.holdPiece.fw || skin.holdPiece.w) * NOTE_RENDER_SCALE;
      const bodyTop = upper + capHeight * 0.35;
      const bodyBottom = lower - capHeight * 0.35;
      if (bodyBottom > bodyTop) drawAtlasStretchVertical(image, skin.holdPiece, x, bodyTop, bodyWidth, bodyBottom - bodyTop, alpha * 0.92);
      if (isDownScroll()) {
        // Downscroll tails point up: put the end cap on the upper end, flipped.
        ctx.save();
        ctx.translate(x, upper);
        ctx.scale(1, -1);
        drawAtlasCentered(image, skin.holdEnd, 0, 0, capScale, alpha);
        ctx.restore();
      } else {
        drawAtlasCentered(image, skin.holdEnd, x, lower, capScale, alpha);
      }
    }

    function drawInopiaNote(note, x, y, scale, alpha) {
      const skin = I.notes.skin[DIRS[note.lane % 4]];
      const image = scene.images.notes;
      if (!skin?.gem || !imageReady(image)) return;
      drawAtlasCentered(image, skin.gem, x, y, NOTE_RENDER_SCALE * scale, alpha);
    }

    // Codename Engine calculates each line from its HUD X ratio, then spaces
    // four arrows by Note.swagWidth. Inopia deliberately starts Papyrus at
    // ratio 0 and shifts that line another 320px left in postCreate().
    function inopiaStrumX(sourceLine, lane, shiftX) {
      const ratio = SOURCE_STRUM_RATIOS[sourceLine] ?? SOURCE_STRUM_RATIOS[0];
      const start = SOURCE_W * ratio - (SOURCE_STRUM_WIDTH * 1.5 + SOURCE_STRUM_WIDTH * 0.5);
      const thirdLineOffset = sourceLine === 2 ? THIRD_LINE_OFFSET : 0;
      // The source returns a sprite top-left; our atlas helper takes a center.
      return start + SOURCE_STRUM_WIDTH * 0.5 + (lane % 4) * SOURCE_STRUM_WIDTH + thirdLineOffset + shiftX;
    }

    function inopiaStrumY() {
      // Codename mirrors the strumline to the bottom of camHUD on downscroll.
      return isDownScroll() ? canvas.height - SOURCE_STRUM_Y : SOURCE_STRUM_Y;
    }

    function drawInopiaGuide(x, y) {
      ctx.strokeStyle = "rgba(255,255,255,0.06)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x, receptorGuideStartY(y));
      ctx.lineTo(x, receptorGuideEndY());
      ctx.stroke();
    }

    function drawInopiaReceptors(time) {
      const y = inopiaStrumY();
      const shiftX = inopiaMechanic(time).shiftX;
      for (let lane = 0; lane < 8; lane += 1) {
        const x = inopiaStrumX(lane < 4 ? 0 : 1, lane, shiftX);
        drawInopiaReceptor(lane, x, y);
      }
      // The source chart has a third, girlfriend-positioned Papyrus line.
      // It starts 320px left of the normal opponent line and then follows the
      // same 640px strum-line shift events as the other two lines.
      for (let lane = 0; lane < 4; lane += 1) {
        const x = inopiaStrumX(2, lane, shiftX);
        drawInopiaReceptor(lane, x, y, scene.papyrusReceptorFx[lane]);
      }
    }

    function drawInopiaNotes(time) {
      if (!state.chart) return;
      const scroll = sourceScroll(time);
      const notes = state.chart.notes;
      const lowerBound = Math.max(0, time - 3.5);
      let start = scene.noteCursor;
      while (start > 0 && notes[start - 1]?.time >= lowerBound) start -= 1;
      while (start < notes.length && notes[start]?.time < lowerBound) start += 1;
      scene.noteCursor = start;
      const shiftX = inopiaMechanic(time).shiftX;
      for (let index = start; index < notes.length; index += 1) {
        const note = notes[index];
        if (note.played && note.hit && (!isHoldNote(note) || note.holdDone)) continue;
        if (note.judged && note.side !== "opp" && (!isHoldNote(note) || note.holdDone || !note.hit)) continue;
        const diff = note.time - time;
        const sourceLine = Number(note.sourceLine ?? (note.thirdPlayer ? 2 : note.side === "player" ? 1 : 0));
        const lineY = inopiaStrumY(sourceLine);
        const y = noteYFromDiff(diff, scroll, lineY);
        const tailY = noteYFromDiff(holdEndTime(note) - time, scroll, lineY);
        if (notePastViewport(y, tailY)) continue;
        if (noteFutureViewport(y, tailY)) break;
        const x = inopiaStrumX(sourceLine, note.lane, shiftX);
        // Codename keeps note sprites at DEFAULT_NOTE_SCALE while they move;
        // only their position changes with song time.
        const scale = 1;
        const alpha = 1;
        if (isHoldNote(note)) drawInopiaSustain(note, x, note.hit ? lineY : y, tailY, alpha * (note.hit ? 0.94 : 1));
        if (note.hit && isHoldNote(note) && time > note.time) continue;
        drawInopiaNote(note, x, y, scale, alpha);
      }
    }

    isImportedSong = function(song) { return isInopia(song) || baseIsImportedSong(song); };
    makeChart = function(song) {
      if (isInopia(song)) return cloneChart();
      return baseMakeChart(song);
    };

    function ensureInopiaAudio() {
      if (!state.audio.inopiaInst) {
        state.audio.inopiaInst = new Audio(I.audio.inst);
        state.audio.inopiaInst.preload = "auto";
        state.audio.inopiaInst.volume = 0.92;
      }
      if (!state.audio.inopiaVoices) {
        state.audio.inopiaVoices = new Audio(I.audio.voices);
        state.audio.inopiaVoices.preload = "auto";
        state.audio.inopiaVoices.volume = 0.84;
      }
      return [state.audio.inopiaInst, state.audio.inopiaVoices];
    }

    window.ensureInopiaAudio = ensureInopiaAudio;
    window.prepareInopiaOnlineStart = function() {
      initAssets();
      const tracks = ensureInopiaAudio();
      tracks.forEach(track => { try { track.pause(); track.currentTime = 0; track.load(); } catch {} });
      return tracks;
    };

    stopExternalAudio = function() {
      baseStopExternalAudio();
      [state.audio.inopiaInst, state.audio.inopiaVoices].forEach(track => {
        if (!track) return;
        track.pause();
        track.currentTime = 0;
      });
    };

    songTime = function() {
      if (isInopia(state.currentSong) && state.audio.inopiaInst) return state.audio.inopiaInst.currentTime;
      return baseSongTime();
    };

    startSong = function(id = state.selectedSong) {
      if (!isInopia(SONGS[id])) return baseStartSong(id);
      const audioContext = ensureAudio();
      if (audioContext.state === "suspended") audioContext.resume();
      stopExternalAudio();
      state.selectedSong = id;
      state.currentSong = SONGS[id];
      state.mode = ui.versusToggle.checked ? "versus" : "solo";
      ui.modeLabel.textContent = state.mode === "versus" ? "1v1 Versus" : "Solo Battle";
      rebuildKeyMap();
      state.chart = makeChart(state.currentSong);
      state.chart.notes = state.chart.notes.map(note => ({ ...note }));
      scene.noteCursor = 0;
      scene.sharpenFrame = 0;
      scene.lastPostTime = -Infinity;
      resetStats();
      state.health = 0.65;
      state.feeds.player.time = -10;
      state.feeds.opp.time = -10;
      state.receptorFx.forEach(fx => { fx.time = -10; });
      scene.papyrusReceptorFx.forEach(fx => { fx.time = -10; });
      Object.values(state.poses).forEach(poseState => { poseState.time = -10; poseState.kind = "hit"; });
      // Inopia's stage is not a 1.0 zoom stage. The source XML declares a
      // separate player zoom (.6), and the opening camera movement targets
      // the player line. Starting at 1.0 makes the forest, Sans desk, and BF
      // appear dramatically oversized for the first frames of the song.
      const openingZoom = Number(I.stage.playerZoom || 0.6);
      state.camera = { zoom: openingZoom, focusX: canvas.width / 2, focusY: canvas.height * 0.45, sideTime: 0, lastSide: "both", highwayX: 0, highwayY: 0 };
      const tracks = ensureInopiaAudio();
      tracks.forEach(track => { track.currentTime = 0; track.playbackRate = 1; track.play().catch(() => {}); });
      state.songStart = 0;
      state.nextStep = 0;
      state.nextStepTime = 0;
      state.playing = true;
      ui.p1Box.style.display = state.mode === "versus" ? "block" : "none";
      ui.songTitle.textContent = state.currentSong.title;
      ui.songSub.textContent = state.currentSong.subtitle;
      ui.statusText.textContent = "Get ready";
      ui.statusSub.textContent = "Inopia is using the original Dustin chart, split audio, source stage, third-player Papyrus line, and red phase.";
      ui.timer.textContent = `0:00 / ${formatTime(state.chart.totalTime)}`;
      ui.menu.classList.remove("show");
      ui.settings.classList.remove("show");
      ui.resultsWrap.classList.remove("show");
    };

    bg = function(song, time) {
      if (isInopia(song)) {
        ctx.fillStyle = "#03050a";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        return;
      }
      return baseBg(song, time);
    };

    stage = function(time) {
      if (isInopia(state.currentSong)) {
        drawInopiaStage(time);
        return;
      }
      return baseStage(time);
    };

    receptors = function(time) {
      if (isInopia(state.currentSong) && imageReady(scene.images.notes)) {
        drawInopiaReceptors(time);
        return;
      }
      return baseReceptors(time);
    };

    notes = function(time) {
      if (isInopia(state.currentSong) && imageReady(scene.images.notes)) {
        drawInopiaNotes(time);
        return;
      }
      return baseNotes(time);
    };

    cameraTargets = function() {
      if (!isInopia(state.currentSong)) return baseCameraTargets();
      const side = sourceCameraSide(songTime());
      const targetKind = side === 1 ? "player" : side === 2 ? "papyrus" : "sans";
      const target = characterCameraPosition(targetKind, songTime());
      const sans = characterCameraPosition("sans", songTime());
      const player = characterCameraPosition("player", songTime());
      return { oppX: sans.x, playerX: player.x, focusY: target.y };
    };

    cameraPoseKeys = function() {
      if (isInopia(state.currentSong)) return { opp: "sans", player: "player" };
      return baseCameraPoseKeys();
    };

    updateCamera = function(time, dt) {
      if (!isInopia(state.currentSong)) return baseUpdateCamera(time, dt);
      const side = sourceCameraSide(time);
      const targetKind = side === 1 ? "player" : side === 2 ? "papyrus" : "sans";
      const target = characterCameraPosition(targetKind, time);
      const targetX = target.x;
      const targetY = target.y;
      const smoothing = state.settings?.reduceMotion ? 0.18 : clamp((dt || 0.016) * 5.2, 0.05, 0.18);
      state.camera.focusX = lerp(state.camera.focusX, targetX, smoothing);
      state.camera.focusY = lerp(state.camera.focusY, targetY, smoothing);
      state.camera.zoom = lerp(state.camera.zoom, sourceZoom(time), smoothing);
      state.camera.lastSide = side === 1 ? "player" : side === 2 ? "both" : "opp";
      state.camera.highwayX = 0;
      state.camera.highwayY = 0;
    };

    refreshHUD = function(time) {
      const result = baseRefreshHUD(time);
      if (isInopia(state.currentSong)) {
        const red = time >= RED_START;
        ui.statusText.textContent = red ? "Inopia: red phase" : "Inopia: forest phase";
        ui.statusSub.textContent = red ? "Sans, Papyrus, and BF have changed into the source red-phase sprites." : "The original Dustin forest stage and third-player Papyrus chart are active.";
      }
      return result;
    };

    renderScene = function(songTimeValue, previewTime) {
      if (!isInopia(state.currentSong)) return baseRenderScene(songTimeValue, previewTime);
      const t = state.playing ? songTimeValue : previewTime;
      const focusX = Number(state.camera.focusX || canvas.width / 2);
      const focusY = Number(state.camera.focusY || canvas.height / 2);
      const bump = state.playing && !state.settings?.reduceMotion ? sourceBeatBump(t) : { game: 0, hud: 0 };
      const zoom = Number(state.camera.zoom || 1) + bump.game;
      // Keep parallax in source-world pixels. The old values were screen
      // pixels, which made every non-1.0 layer drift to the wrong position.
      const panX = canvas.width / (2 * zoom) - focusX;
      const panY = canvas.height / (2 * zoom) - focusY;
      const applySourceCamera = () => {
        scene.cameraPan.x = panX;
        scene.cameraPan.y = panY;
        ctx.translate(state.camera.highwayX || 0, state.camera.highwayY || 0);
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.scale(zoom, zoom);
        ctx.translate(-focusX, -focusY);
      };

      ctx.save();
      ctx.fillStyle = "#03050a";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      applySourceCamera();
      drawInopiaStage(t);
      ctx.restore();
      drawSourceScreenCover(t, "camGame");
      drawSourceCameraFlash(t, "camGame");
      drawInopiaOverlay(t);
      captureInopiaBloomSource(t);

      // Notes and receptors are camHUD in the source mod. Keep them in screen
      // space so camera pans/zoom only affect the forest and characters; the
      // beat bump scales camHUD around the screen centre.
      ctx.save();
      ctx.translate(state.camera.highwayX || 0, state.camera.highwayY || 0);
      if (bump.hud > 0.0001) {
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.scale(1 + bump.hud, 1 + bump.hud);
        ctx.translate(-canvas.width / 2, -canvas.height / 2);
      }
      if (imageReady(scene.images.notes)) {
        drawInopiaReceptors(t);
        drawInopiaNotes(songTimeValue);
      }
      ctx.restore();
      drawSourceScreenCover(t, "camHUD");
      drawSourceCameraFlash(t, "camHUD");
      drawSourceCinematicBars(t);
      drawInopiaPostEffects(t);
      drawSourceLyrics(t);
      return null;
    };

    // Papyrus (third strumline) shares lanes 0-3 with Sans, so the base
    // engine's receptorFx[lane] write would flash both lines. Redirect his
    // confirm flashes into scene.papyrusReceptorFx.
    function redirectPapyrusReceptorFx(isPapyrus, lane, run) {
      if (!isInopia(state.currentSong) || !isPapyrus || !Number.isInteger(lane) || lane < 0 || lane > 3) return run();
      const before = state.receptorFx[lane];
      const result = run();
      const after = state.receptorFx[lane];
      if (after !== before) {
        scene.papyrusReceptorFx[lane] = after;
        state.receptorFx[lane] = before;
      }
      return result;
    }
    if (typeof judge === "function") {
      const baseJudge = judge;
      judge = function(side, kind, lane, char) {
        return redirectPapyrusReceptorFx(char === "papyrus", lane, () => baseJudge.apply(this, arguments));
      };
    }
    if (typeof sustainTick === "function") {
      const baseSustainTick = sustainTick;
      sustainTick = function(note) {
        return redirectPapyrusReceptorFx(note?.character === "papyrus", note?.lane, () => baseSustainTick.apply(this, arguments));
      };
    }

    if (baseApplyDustinBloom) {
      applyDustinBloom = function(time) {
        if (!isInopia(state.currentSong)) return baseApplyDustinBloom(time);
        // Inopia now applies its source-timed color, vignette, and bloom
        // pass at the end of renderScene. Do not add the old blanket tint on
        // top of it; that was the source of the muddy black/red edge.
        return;
      };
    }

    if (typeof importedTracksForSong === "function") {
      const baseImportedTracksForSong = importedTracksForSong;
      importedTracksForSong = function(songId = state.selectedSong) {
        if (SONGS[songId]?.chartSource === SOURCE) return ensureInopiaAudio();
        return baseImportedTracksForSong(songId);
      };
    }

    state.poses.inopia = state.poses.inopia || { lane: 1, time: -10, kind: "hit" };
    initAssets();
    renderSongs();
  } catch (error) {
    console.error("Inopia mode failed to initialize", error);
  }
})();

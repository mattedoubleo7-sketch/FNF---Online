(() => {
  const BR = window.BROKEN_REALITY_DATA;
  if (
    !BR ||
    typeof renderScene !== "function" ||
    typeof stage !== "function" ||
    typeof bg !== "function" ||
    typeof refreshHUD !== "function" ||
    typeof notes !== "function" ||
    typeof receptors !== "function"
  ) {
    return;
  }

  const firstNoteTime = Number(BR.chart?.notes?.[0]?.time || 0);
  const originalSongTime = songTime;
  const originalLaneX = laneX;
  const originalReceptorY = receptorY;
  const originalStartSong = startSong;
  const originalBg = bg;
  const originalStage = stage;
  const originalNotes = notes;
  const originalReceptors = receptors;
  const originalRenderScene = renderScene;
  const originalRefreshHUD = refreshHUD;
  const originalUpdateCamera = typeof updateCamera === "function" ? updateCamera : null;
  const originalFinish = typeof finish === "function" ? finish : null;
  const SOUL = window.BROKEN_REALITY_SOUL_DATA || {};
  const baseLaneShift = 36;
  const layoutBaseY = originalReceptorY();

  if (typeof window.brDrawOverlays !== "function") {
    window.brDrawOverlays = function() {};
  }

  const stageImages = {};
  const cineImages = {};
  const charImages = {};
  const noteImages = {};
  const cineFlashSurfaceCache = new Map();
  const endingVideoSources = {
    youAre: "you-are-cutscene.mp4",
    uprising: "the-uprising-cutscene.mp4"
  };
  const endingVideos = {};
  const HALL_BEAMS = [
    { x: 0.19, width: 0.118, intensity: 1.05 },
    { x: 0.5, width: 0.132, intensity: 1.22 },
    { x: 0.81, width: 0.118, intensity: 1.05 }
  ];
  const HALL_DUST_STYLE = {
    layers: 15,
    depth: 0.9,
    width: 0.01,
    speed: 0.3,
    startingLayers: 4,
    bright: 10
  };

  function seededUnit(seed) {
    return (Math.sin(seed * 127.1 + 311.7) + 1) * 0.5;
  }

  const HALL_DUST = Array.from({ length: 172 }, (_, i) => ({
    beam: i % HALL_BEAMS.length,
    offsetX: seededUnit(i * 1.73 + 0.13),
    offsetY: seededUnit(i * 2.31 + 0.37),
    speed: 0.35 + seededUnit(i * 0.91 + 0.22) * 1.25,
    size: 0.38 + seededUnit(i * 1.41 + 0.81) * 1.18,
    sway: 0.35 + seededUnit(i * 1.19 + 0.44),
    phase: seededUnit(i * 0.63 + 0.58) * Math.PI * 2,
    alpha: 0.18 + seededUnit(i * 1.07 + 0.29) * 0.42,
    layer: HALL_DUST_STYLE.startingLayers + (i % Math.max(1, HALL_DUST_STYLE.layers - HALL_DUST_STYLE.startingLayers))
  }));

  function loadImage(bucket, key, src) {
    if (!src) {
      return;
    }
    const img = new Image();
    img.src = src;
    bucket[key] = img;
  }

  [
    [stageImages, "back", BR.stage?.images?.back],
    [stageImages, "ground", BR.stage?.images?.ground],
    [stageImages, "light", BR.stage?.images?.light],
    [stageImages, "fg", BR.stage?.images?.fg],
    [stageImages, "papsBg", BR.stage?.images?.papsBg],
    [stageImages, "papsFg", BR.stage?.images?.papsFg],
    [stageImages, "target", BR.stage?.attack?.target],
    [stageImages, "targetChoice", BR.stage?.attack?.choice?.image],
    [cineImages, "pico", "assets/broken-reality-cine/pico.png"],
    [cineImages, "gf", "assets/broken-reality-cine/gf.png"],
    [cineImages, "sans", "assets/broken-reality-cine/sans.png"],
    [cineImages, "paps", "assets/broken-reality-cine/paps.png"],
    [cineImages, "undyne", "assets/broken-reality-cine/undyne.png"],
    [cineImages, "mettaton", "assets/broken-reality-cine/mettaton.png"],
    [cineImages, "dtExtractor", "assets/broken-reality-cine/dt-extractor.png"],
    [cineImages, "flowey", "assets/broken-reality-cine/flowey.png"],
    [charImages, "sans", BR.sprites?.sans?.image],
    [charImages, "sansAlt", BR.sprites?.sansAlt?.image],
    [charImages, "papyrus", BR.sprites?.papyrus?.image],
    [charImages, "papyrusBody", BR.sprites?.papyrusBody?.image],
    [charImages, "papyrusHead", BR.sprites?.papyrusHead?.image],
    [charImages, "boyfriend", BR.sprites?.boyfriend?.image],
    [charImages, "boyfriendRed", BR.sprites?.boyfriendRed?.image],
    [charImages, "bfSoul", SOUL.bfSoul?.image],
    [charImages, "gfSoul", SOUL.gfSoul?.image],
    [noteImages, "default", BR.sprites?.notes?.default?.image],
    [noteImages, "red", BR.sprites?.notes?.red?.image]
  ].forEach(args => loadImage(...args));

  function ready(img) {
    return !!(img && img.complete && img.naturalWidth);
  }

  function getCineFlashSurface(layout, image) {
    if (!layout || !ready(image)) {
      return null;
    }
    const screenScale = canvas.height / CINE_REFERENCE_HEIGHT;
    const maxScale = Number(layout.scale || 1) * 0.84 * screenScale;
    const width = Math.max(1, Math.round(image.naturalWidth * maxScale));
    const height = Math.max(1, Math.round(image.naturalHeight * maxScale));
    const cacheKey = [
      layout.key || "flash",
      canvas.width,
      canvas.height,
      width,
      height
    ].join(":");
    let surface = cineFlashSurfaceCache.get(cacheKey);
    if (!surface) {
      const layer = document.createElement("canvas");
      layer.width = width;
      layer.height = height;
      const layerCtx = layer.getContext("2d");
      if (!layerCtx) {
        return null;
      }
      layerCtx.imageSmoothingEnabled = true;
      layerCtx.imageSmoothingQuality = "medium";
      layerCtx.drawImage(image, 0, 0, width, height);
      surface = { canvas: layer, width, height, screenScale, maxScale };
      cineFlashSurfaceCache.set(cacheKey, surface);
    }
    return surface;
  }

  function primeCineFlashSurfaces() {
    for (let i = 0; i < CINE_FLASH_LAYOUTS.length; i++) {
      const layout = CINE_FLASH_LAYOUTS[i];
      const image = cineImages[layout?.key];
      getCineFlashSurface(layout, image);
    }
  }

  function findEventTime(name, paramIndex, value, fallback) {
    const match = (BR.events || []).find(event => {
      if (event.name !== name) {
        return false;
      }
      return String(event.params?.[paramIndex] || "") === value;
    });
    return Number(match?.time ?? fallback ?? 0);
  }

  function findCharacterTime(targetIndex, id, fallback, afterTime = -Infinity) {
    const match = (BR.events || []).find(event => {
      if (event.name !== "Change Character") {
        return false;
      }
      if (Number(event.params?.[0]) !== targetIndex) {
        return false;
      }
      if (String(event.params?.[1] || "") !== id) {
        return false;
      }
      return Number(event.time || 0) > afterTime;
    });
    return Number(match?.time ?? fallback ?? 0);
  }

  const redSkinTime = findEventTime("Change Strum Skin", 0, "br_red", 144);
  const papyrusDuetStart = findCharacterTime(0, "phantom_paps_br_head", 227.666667);
  const papyrusDuetEnd = findCharacterTime(0, "phantom_paps_br", 255.666667, papyrusDuetStart + 0.001);
  const soulPhaseStart = Math.min(
    findCharacterTime(0, "gf_soul", 342.666667),
    findCharacterTime(1, "bf_soul", 342.666667)
  );
  const soulPhaseEnd = Math.min(
    findCharacterTime(0, "sans_br_alt", 394.666667, soulPhaseStart + 0.001),
    findCharacterTime(1, "bf_itsover", 394.666667, soulPhaseStart + 0.001)
  );
  const skinTimeline = [{ time: 0, id: "default" }].concat(
    (BR.events || [])
      .filter(event => event.name === "Change Strum Skin")
      .map(event => ({
        time: Number(event.time || 0),
        id: String(event.params?.[0] || "br") === "br_red" ? "red" : "default"
      }))
      .sort((a, b) => a.time - b.time)
  );
  const drainAmountTimeline = [{ time: 0, value: 1.2 }].concat(
    (BR.events || [])
      .filter(event => event.name === "HScript Call" && String(event.params?.[0] || "") === "changeDrainAmount")
      .map(event => ({ time: Number(event.time || 0), value: Number(event.params?.[1] || 1.2) }))
      .sort((a, b) => a.time - b.time)
  );
  const drainToggleTimeline = [{ time: 0, enabled: true }].concat(
    (BR.events || [])
      .filter(event => event.name === "HScript Call")
      .map(event => {
        const call = String(event.params?.[0] || "");
        if (call === "enableDrain") return { time: Number(event.time || 0), enabled: true };
        if (call === "disableDrain") return { time: Number(event.time || 0), enabled: false };
        return null;
      })
      .filter(Boolean)
      .sort((a, b) => a.time - b.time)
  );

  function buildCharacterTimeline(targetIndex, initialId, mapping) {
    const timeline = [{ time: 0, id: initialId }];
    let currentId = initialId;
    for (const event of (BR.events || []).filter(e => e.name === "Change Character").sort((a, b) => a.time - b.time)) {
      if (Number(event.params?.[0]) !== targetIndex) {
        continue;
      }
      const mapped = mapping[String(event.params?.[1] || "")];
      if (!mapped || mapped === currentId) {
        continue;
      }
      timeline.push({ time: Number(event.time || 0), id: mapped });
      currentId = mapped;
    }
    return timeline;
  }

  const oppTimeline = buildCharacterTimeline(0, "sans", {
    sans_br: "sans",
    sans_br_alt: "sansAlt",
    phantom_paps_br: "papyrus",
    phantom_paps_br_head: "papyrusHead",
    gf_soul: "gfSoul"
  });

  const playerTimeline = buildCharacterTimeline(1, "boyfriend", {
    bf_itsover: "boyfriend",
    bf_itsover_red: "boyfriendRed",
    bf_soul: "bfSoul"
  });

  const modeEvents = [{ time: 0, mode: "up" }];
  for (const event of (BR.events || []).filter(e => e.name === "HScript Call").sort((a, b) => a.time - b.time)) {
    const call = String(event.params?.[0] || "");
    if (call === "goUpScroll") {
      modeEvents.push({ time: Number(event.time || 0), mode: "up" });
    } else if (call === "goDownScroll") {
      modeEvents.push({ time: Number(event.time || 0), mode: "down" });
    } else if (call === "goLeftScroll") {
      modeEvents.push({ time: Number(event.time || 0), mode: "left" });
    }
  }

  function buildCharacterPhraseWindows(characterIds, maxGap = Number(BR.chart?.spb || (60 / Number(BR.meta?.bpm || 120) || 0.5)) * 1.6) {
    const ids = new Set(characterIds.map(id => String(id || "")));
    const notes = ((BR.chart && BR.chart.notes) || [])
      .filter(note => note.side === "opp" && ids.has(String(note.character || "")))
      .sort((a, b) => Number(a.time || 0) - Number(b.time || 0));
    const windows = [];
    let active = null;
    for (const note of notes) {
      const start = Number(note.time || 0) - 0.045;
      const end = Math.max(Number(note.time || 0), holdEndTime(note)) + 0.18;
      if (!active || start - active.end > maxGap) {
        if (active) {
          windows.push(active);
        }
        active = { start, end };
      } else {
        active.end = Math.max(active.end, end);
      }
    }
    if (active) {
      windows.push(active);
    }
    return windows;
  }

  const sansDrainWindows = buildCharacterPhraseWindows(["sans_br", "sans_br_alt"]);

  function buildOpponentDuetWindows(primaryId, duetId, maxGap = Number(BR.chart?.spb || 0.5) * 2.25) {
    const oppNotes = ((BR.chart && BR.chart.notes) || [])
      .filter(note => note.side === "opp" && (note.character === primaryId || note.character === duetId))
      .sort((a, b) => Number(a.time || 0) - Number(b.time || 0));
    const windows = [];
    let active = null;
    for (const note of oppNotes) {
      const time = Number(note.time || 0);
      const character = String(note.character || "");
      if (!active || time - active.end > maxGap) {
        if (active && active.hasPrimary && active.hasDuet) {
          windows.push({ start: active.start, end: active.end });
        }
        active = {
          start: time,
          end: time,
          hasPrimary: character === primaryId,
          hasDuet: character === duetId
        };
      } else {
        active.end = time;
        active.hasPrimary = active.hasPrimary || character === primaryId;
        active.hasDuet = active.hasDuet || character === duetId;
      }
    }
    if (active && active.hasPrimary && active.hasDuet) {
      windows.push({ start: active.start, end: active.end });
    }
    return windows;
  }

  function buildEventTimeline(name, defaults, mapEvent) {
    const timeline = [{ time: 0, ...defaults }];
    for (const event of (BR.events || []).filter(e => e.name === name).sort((a, b) => a.time - b.time)) {
      const mapped = mapEvent(event, timeline[timeline.length - 1]);
      if (!mapped) {
        continue;
      }
      timeline.push({ time: Number(event.time || 0), ...mapped });
    }
    return timeline;
  }

  function lerp01(a, b, t) {
    return a + (b - a) * clamp(t, 0, 1);
  }

  function easeInOutSine01(t) {
    return 0.5 - Math.cos(clamp(t, 0, 1) * Math.PI) * 0.5;
  }

  function smoothTimelineNumberAt(timeline, t, key, minDuration, maxDuration, perUnit) {
    if (!timeline?.length) {
      return 0;
    }
    let previous = timeline[0];
    let current = timeline[0];
    for (const item of timeline) {
      if (item.time > t) {
        break;
      }
      previous = current;
      current = item;
    }

    const currentValue = Number(current?.[key] ?? 0);
    if (current === previous) {
      return currentValue;
    }

    const previousValue = Number(previous?.[key] ?? currentValue);
    const delta = Math.abs(currentValue - previousValue);
    const duration = clamp(minDuration + delta * perUnit, minDuration, maxDuration);
    const elapsed = t - Number(current.time || 0);
    if (elapsed <= 0) {
      return previousValue;
    }
    if (elapsed >= duration) {
      return currentValue;
    }
    return lerp01(previousValue, currentValue, easeInOutSine01(elapsed / duration));
  }

  function quantizeBrokenRealityScrollSpeed(value) {
    return Math.round(Number(value || 1) * 1000) / 1000;
  }

  function buildCharacterOffsetTimeline(targetIndex) {
    return buildEventTimeline("Change Character Offset", { x: 0, y: 0 }, event => {
      if (Number(event.params?.[1]) !== targetIndex) {
        return null;
      }
      return {
        x: Number(event.params?.[2] || 0),
        y: Number(event.params?.[3] || 0)
      };
    });
  }

  const cameraTargetTimeline = buildEventTimeline("Camera Movement", { target: 1 }, event => ({
    target: Number(event.params?.[0] ?? 1)
  }));
  const cameraSpeedTimeline = buildEventTimeline("Camera Speed", { speed: 0.04 }, event => ({
    speed: Number(event.params?.[0] || 0.04)
  }));
  const stageZoomTimeline = buildEventTimeline("Change Stage Zoom", { zoom: 0.46 }, event => ({
    zoom: Number(event.params?.[5] ?? 0.46)
  }));
  const scrollSpeedTimeline = buildEventTimeline("Scroll Speed Change", { speed: 1 }, event => ({
    speed: Number(event.params?.[1] ?? 1)
  }));
  const oppOffsetTimeline = buildCharacterOffsetTimeline(0);
  const playerOffsetTimeline = buildCharacterOffsetTimeline(1);
  const sansPapyrusDuetWindows = buildOpponentDuetWindows("sans_br", "phantom_paps_br");

  const RED_PHASE_START = 144;
  const PAPYRUS_ORBIT_START = 227.75;
  const PAPYRUS_ORBIT_END = 255.75;
  const RED_PHASE_END = 282.083333;
  const BLACKOUT_START = 344;
  const OPPONENT_HIDE_START = 343;
  const OPPONENT_FADE_BACK_START = 365.333333;
  const OPPONENT_FADE_BACK_END = 370.333333;
  const BLACKOUT_END = 394.666667;
  const TRAIL_PULSES = [
    { start: 86.666667, end: 97.333333, trail: 0.28, gradient: 0.27 },
    { start: 115.333333, end: 118.666667, trail: 0.24, gradient: 0.24 },
    { start: 408.166667, end: 416, trail: 0.34, gradient: 0.28 },
    { start: 437.5, end: 451.166667, trail: 0.4, gradient: 0.32 }
  ];

  const PACKS = {
    sans: { id: "sans", def: BR.sprites?.sans, image: charImages.sans, poseKey: "sans", idleSpeed: 0.55 },
    sansAlt: { id: "sansAlt", def: BR.sprites?.sansAlt, image: charImages.sansAlt, poseKey: "sans", idleSpeed: 0.55 },
    papyrus: { id: "papyrus", def: BR.sprites?.papyrus, image: charImages.papyrus, poseKey: "sans", idleSpeed: 0.6 },
    papyrusBody: { id: "papyrusBody", def: BR.sprites?.papyrusBody, image: charImages.papyrusBody, poseKey: "sans", idleSpeed: 0.6 },
    papyrusHead: { id: "papyrusHead", def: BR.sprites?.papyrusHead, image: charImages.papyrusHead, poseKey: "sans", idleSpeed: 0.6 },
    boyfriend: { id: "boyfriend", def: BR.sprites?.boyfriend, image: charImages.boyfriend, poseKey: "player", idleSpeed: 0.55 },
    boyfriendRed: { id: "boyfriendRed", def: BR.sprites?.boyfriendRed, image: charImages.boyfriendRed, poseKey: "player", idleSpeed: 0.55 },
    bfSoul: { id: "bfSoul", def: SOUL.bfSoul, image: charImages.bfSoul, poseKey: "player", idleSpeed: 0.52 },
    gfSoul: { id: "gfSoul", def: SOUL.gfSoul, image: charImages.gfSoul, poseKey: "sans", idleSpeed: 0.52 }
  };

  const STAGE_LAYOUT = {
    sans: { x: 0.866, y: 0.892, scale: 0.247 },
    sansAlt: { x: 0.866, y: 0.892, scale: 0.247 },
    papyrus: { x: 0.854, y: 0.904, scale: 0.214 },
    papyrusBody: { x: 0.854, y: 0.906, scale: 0.214 },
    papyrusHead: { x: 0.868, y: 0.866, scale: 0.196 },
    boyfriend: { x: 0.134, y: 0.902, scale: 0.291 },
    boyfriendRed: { x: 0.134, y: 0.918, scale: 0.303 },
    bfSoul: { x: 0.18, y: 0.92, scale: 0.158 },
    gfSoul: { x: 0.816, y: 1.018, scale: 0.145 }
  };

  const SOUL_DUET_LAYOUT = {
    bfSoul: { x: 0.474, y: 0.972, scale: 0.17 },
    gfSoul: { x: 0.515, y: 0.74, scale: 0.184 }
  };

  const SANS_PAPYRUS_DUET_LAYOUT = {
    x: STAGE_LAYOUT.sans.x - 0.082,
    y: STAGE_LAYOUT.sans.y + 0.028,
    scale: 0.194
  };

  const CINE_FLASH_LAYOUTS = [
    { key: "pico", anchorX: 0.14, anchorY: 0.2, scale: 0.62, driftX: -22, driftY: -18 },
    { key: "gf", anchorX: 0.82, anchorY: 0.17, scale: 0.62, driftX: 22, driftY: -14 },
    { key: "sans", anchorX: 0.18, anchorY: 0.53, scale: 0.64, driftX: -28, driftY: -10 },
    { key: "paps", anchorX: 0.82, anchorY: 0.5, scale: 0.64, driftX: 26, driftY: -8 },
    { key: "undyne", anchorX: 0.18, anchorY: 0.82, scale: 0.62, driftX: -18, driftY: 14 },
    { key: "mettaton", anchorX: 0.83, anchorY: 0.8, scale: 0.62, driftX: 18, driftY: 12 },
    { key: "dtExtractor", anchorX: 0.5, anchorY: 0.14, scale: 0.58, driftX: 0, driftY: -18 },
    { key: "flowey", anchorX: 0.5, anchorY: 0.86, scale: 0.58, driftX: 0, driftY: 18 }
  ];
  const CINE_FLASH_TIMES = (BR.events || [])
    .filter(event => event.name === "HScript Call" && String(event.params?.[0] || "") === "cineHit")
    .map(event => Number(event.time || 0))
    .slice(0, CINE_FLASH_LAYOUTS.length);
  const CINE_FLASH_DURATION = Math.max(0.2, Number(BR.chart?.spb || 0.5) * 2.5);
  const CINE_REFERENCE_HEIGHT = 720;

  const LAYOUTS = {
    up: { xMult: 0, yMult: 1, y: layoutBaseY },
    down: { xMult: 0, yMult: -1, y: layoutBaseY + 392 },
    left: { xMult: 1, yMult: 0, y: layoutBaseY + 158 }
  };

  function getFixState() {
    if (!state.brFix) {
      state.brFix = {
        startedAt: 0,
        timeOffset: 0,
        lastPerf: performance.now() / 1000,
        currentXMult: 0,
        currentYMult: 1,
        currentY: layoutBaseY,
        attackOpen: 0,
        attackMarker: 0,
        attackSnapshot: null,
        lastDrainPerf: performance.now() / 1000,
        endingActive: false,
        endingDone: false,
        renderTime: 0,
        camX: canvas.width * 0.5,
        camY: canvas.height * 0.45,
        camZoom: 1,
        camHighwayX: 0,
        camHighwayY: 0,
        attackCueStamp: ""
      };
    }
    return state.brFix;
  }

  function timelineValue(timeline, t) {
    let value = timeline[0].id;
    for (const item of timeline) {
      if (item.time > t) {
        break;
      }
      value = item.id;
    }
    return value;
  }

  function currentModeAt(t) {
    let mode = "up";
    for (const event of modeEvents) {
      if (event.time > t) {
        break;
      }
      mode = event.mode;
    }
    return mode;
  }

  function brokenRealityLiveTime() {
    const audioTime = Math.max(
      Number(state.audio?.inst3?.currentTime || 0),
      Number(state.audio?.voices3a?.currentTime || 0),
      Number(state.audio?.voices3b?.currentTime || 0)
    );
    const onlineTime =
      state.mode === "online" && typeof expectedOnlineSongTime === "function"
        ? expectedOnlineSongTime()
        : null;
    if (onlineTime != null) {
      return Math.max(audioTime, onlineTime);
    }
    const fix = getFixState();
    const perfTime = fix.startedAt
      ? Math.max(0, performance.now() / 1000 - fix.startedAt + Number(fix.timeOffset || 0))
      : 0;
    return Math.max(audioTime, perfTime);
  }

  function timelinePropAt(timeline, t, key) {
    let value = timeline[0][key];
    for (const item of timeline) {
      if (item.time > t) {
        break;
      }
      value = item[key];
    }
    return value;
  }

  function currentNoteSkinId(t) {
    return timelinePropAt(skinTimeline, t, "id");
  }

  function currentDrainAmountAt(t) {
    return timelinePropAt(drainAmountTimeline, t, "value");
  }

  function currentDrainEnabledAt(t) {
    return timelinePropAt(drainToggleTimeline, t, "enabled");
  }

  const BROKEN_REALITY_DRAIN_FLOOR = 0.10;

  function isBrokenRealityDrainPackId(id) {
    return id === "sans" || id === "sansAlt";
  }

  function isBrokenRealityDrainCharacter(character) {
    const id = String(character || "");
    return id === "sans_br" || id === "sans_br_alt";
  }

  function activeSansHoldDrain(t) {
    if (!state.chart?.notes) {
      return false;
    }
    for (const note of state.chart.notes) {
      if (note.side !== "opp") {
        continue;
      }
      if (!isBrokenRealityDrainCharacter(note.character)) {
        continue;
      }
      if (!isHoldNote(note)) {
        continue;
      }
      if (t >= note.time - 0.02 && t <= holdEndTime(note) + 0.02) {
        return true;
      }
    }
    return false;
  }

  function activeSansTapDrain(t) {
    if (!state.chart?.notes) {
      return false;
    }
    for (const note of state.chart.notes) {
      if (note.side !== "opp") {
        continue;
      }
      if (!isBrokenRealityDrainCharacter(note.character)) {
        continue;
      }
      if (isHoldNote(note)) {
        continue;
      }
      if (t >= note.time - 0.035 && t <= note.time + 0.18) {
        return true;
      }
    }
    return false;
  }

  function currentSansDrainActive(t) {
    return sansDrainWindows.some(window => t >= window.start && t < window.end);
  }

  function stepManualDrain(t) {
    const fix = getFixState();
    const now = performance.now() / 1000;
    const dt = Math.max(1 / 240, Math.min(0.05, now - Number(fix.lastDrainPerf || now)));
    fix.lastDrainPerf = now;
    if (state.selectedSong !== "brokenReality" || !state.playing || !state.br) {
      return;
    }
    state.br.drainEnabled = currentDrainEnabledAt(t);
    state.br.drainAmount = currentDrainAmountAt(t);
    state.br.sansDrainActive = currentSansDrainActive(t);
    if (!state.br.drainEnabled) {
      state.br.drainTimer = 0;
      return;
    }
    if (!state.br.sansDrainActive) {
      state.br.drainTimer = 0;
      return;
    }
    state.br.drainTimer = 0;
    if (state.health <= BROKEN_REALITY_DRAIN_FLOOR) {
      return;
    }
    const damageScale = Number(state.br.didDamage) ? 0.65 : 1;
    state.health = clamp(
      state.health - 0.05 * (Number(state.br.drainAmount || 1.2) * damageScale) * dt,
      BROKEN_REALITY_DRAIN_FLOOR,
      1
    );
  }

  function currentPack(kind, t) {
    const id = kind === "opp" ? timelineValue(oppTimeline, t) : timelineValue(playerTimeline, t);
    return PACKS[id] || PACKS[kind === "opp" ? "sans" : "boyfriend"];
  }

  function packById(id, fallback) {
    return PACKS[id] || PACKS[fallback];
  }

  function currentNoteSkin(t) {
    return currentNoteSkinId(t) === "red" ? BR.sprites?.notes?.red : BR.sprites?.notes?.default;
  }

  function currentNoteImage(t) {
    return currentNoteSkinId(t) === "red" ? noteImages.red : noteImages.default;
  }

  function papyrusDuetActiveAt(t) {
    return t >= papyrusDuetStart && t < papyrusDuetEnd;
  }

  function sansPapyrusDuetWindowAt(t) {
    return sansPapyrusDuetWindows.find(window => t >= window.start && t < window.end) || null;
  }

  function currentCameraTargetAt(t) {
    return timelinePropAt(cameraTargetTimeline, t, "target");
  }

  function currentCameraSpeedAt(t) {
    return smoothTimelineNumberAt(cameraSpeedTimeline, t, "speed", 0.18, 0.42, 4.5);
  }

  function currentStageZoomAt(t) {
    return timelinePropAt(stageZoomTimeline, t, "zoom");
  }

  function currentScrollSpeedAt(t) {
    return quantizeBrokenRealityScrollSpeed(
      smoothTimelineNumberAt(scrollSpeedTimeline, t, "speed", 0.24, 0.72, 0.18)
    );
  }

  function currentCharacterOffsetAt(kind, t) {
    const timeline = kind === "opp" ? oppOffsetTimeline : playerOffsetTimeline;
    return {
      x: timelinePropAt(timeline, t, "x"),
      y: timelinePropAt(timeline, t, "y")
    };
  }

  function pulseInWindow(t, start, end) {
    if (t < start || t > end) {
      return 0;
    }
    const p = clamp((t - start) / Math.max(0.001, end - start), 0, 1);
    return Math.sin(p * Math.PI);
  }

  function brokenRealityTrailAlphaAt(t) {
    let alpha = t >= RED_PHASE_START && t < RED_PHASE_END ? 0.06 : 0;
    if (t >= PAPYRUS_ORBIT_START && t < PAPYRUS_ORBIT_END) {
      alpha = Math.max(alpha, 0.22 + Math.sin((t - PAPYRUS_ORBIT_START) * 2.4) * 0.04);
    }
    for (const pulse of TRAIL_PULSES) {
      alpha = Math.max(alpha, pulseInWindow(t, pulse.start, pulse.end) * pulse.trail);
    }
    return clamp(alpha, 0, 0.48);
  }

  function brokenRealityGradientAlphaAt(t) {
    let alpha = 0;
    if (t >= RED_PHASE_START && t < RED_PHASE_END) {
      alpha = 0.12;
    }
    if (t >= PAPYRUS_ORBIT_START && t < PAPYRUS_ORBIT_END) {
      alpha = Math.max(alpha, 0.18);
    }
    for (const pulse of TRAIL_PULSES) {
      alpha = Math.max(alpha, pulseInWindow(t, pulse.start, pulse.end) * pulse.gradient);
    }
    return clamp(alpha, 0, 0.38);
  }

  function brokenRealityBlackoutAlphaAt(t) {
    if (t < BLACKOUT_START) {
      return 0;
    }
    if (t < BLACKOUT_START + 0.8) {
      return clamp((t - BLACKOUT_START) / 0.8, 0, 1);
    }
    if (t < BLACKOUT_END) {
      return 1;
    }
    if (t < BLACKOUT_END + 0.85) {
      return 1 - clamp((t - BLACKOUT_END) / 0.85, 0, 1);
    }
    return 0;
  }

  function brokenRealityOpponentAlphaAt(t) {
    if (t < OPPONENT_HIDE_START) {
      return 1;
    }
    if (t < OPPONENT_FADE_BACK_START) {
      return 0;
    }
    if (t < OPPONENT_FADE_BACK_END) {
      return clamp((t - OPPONENT_FADE_BACK_START) / (OPPONENT_FADE_BACK_END - OPPONENT_FADE_BACK_START), 0, 1);
    }
    return 1;
  }

  function currentCameraMoveOffsetAt(t) {
    if (t >= BLACKOUT_START && t < BLACKOUT_END) {
      return 0;
    }
    if (t >= BLACKOUT_END) {
      return 5;
    }
    return 22;
  }

  function currentCameraAngleOffsetAt(t, target) {
    if (t >= BLACKOUT_START && t < BLACKOUT_END) {
      return 0;
    }
    if (target === 0 && t >= RED_PHASE_START && t < RED_PHASE_END) {
      return 0.6;
    }
    return 0.3;
  }

  function brokenRealityZoomScaleAt(t) {
    return clamp(0.88 + currentStageZoomAt(t) * 0.54, 0.96, 1.28);
  }

  function attackVisualState(t) {
    const attack = state.br?.attack;
    const out = {
      active: false,
      prep: false,
      focusX: null,
      focusY: null,
      zoomBoost: 0,
      barsBoost: 0,
      vignetteBoost: 0,
      flashAlpha: 0,
      darkAlpha: 0,
      noiseAlpha: 0,
      chromaAlpha: 0,
      shake: 0
    };
    if (!attack) {
      return out;
    }

    out.active = true;
    if (!attack.resolved && attack.anim !== "attack" && attack.anim !== "back") {
      out.prep = true;
      out.zoomBoost = -0.08;
      out.barsBoost = 0.14;
      out.vignetteBoost = 0.22;
      out.darkAlpha = 0.18;
      return out;
    }

    const age = Math.max(0, t - Number(attack.animStart || attack.triggerTime || t));
    const frame = age * 24;

    if (attack.anim === "attack") {
      out.zoomBoost = 0.04;
      out.barsBoost = 0.08;
      if (frame >= 94 && frame < 96) {
        out.darkAlpha = 0.42;
        out.flashAlpha = frame >= 95 ? 0.34 : 0.18;
        out.noiseAlpha = 0.22;
      }
      if (frame >= 97 && frame < 99) {
        out.zoomBoost = 0.02;
        out.darkAlpha = 0.14;
      }
      if (frame >= 99 && frame < 128) {
        out.zoomBoost = 0.14;
      }
      if (frame >= 103 && frame < 128) {
        out.vignetteBoost = 0.12;
      }
      if (frame >= 107 && frame < 110) {
        out.flashAlpha = 0.9;
        out.chromaAlpha = 0.52;
        out.darkAlpha = 0.34;
        out.shake = 12;
        out.zoomBoost = 0.22;
      } else if (frame >= 110 && frame < 125) {
        out.chromaAlpha = 0.18;
        out.darkAlpha = 0.12;
      }
      if (frame >= 125 && frame < 129) {
        out.noiseAlpha = 0.28;
        out.darkAlpha = 0.22;
      }
      if (frame >= 128 && frame < 141) {
        out.zoomBoost = 0.06;
      }
      return out;
    }

    if (attack.anim === "back") {
      out.zoomBoost = Math.max(0, 0.08 - age * 0.12);
      out.darkAlpha = Math.max(0, 0.14 - age * 0.24);
    }
    return out;
  }

  function cameraDirectionOffsetFor(kind, t, moveOffset) {
    const poseKey = kind === "opp" ? "sans" : "player";
    const pose = state.poses?.[poseKey];
    if (!pose) {
      return { x: 0, y: 0, angle: 0 };
    }
    const age = performance.now() / 1000 - Number(pose.time || -10);
    if (age < 0 || age > 0.3) {
      return { x: 0, y: 0, angle: 0 };
    }
    const lane = Math.abs(Number(pose.lane || 0)) % 4;
    const settle = Math.cos(clamp(age / 0.3, 0, 1) * Math.PI * 0.5);
    const easedMoveOffset = moveOffset * settle;
    const angleOffset = currentCameraAngleOffsetAt(t, kind === "opp" ? 0 : 1);
    if (lane === 0) {
      return { x: -easedMoveOffset, y: 0, angle: -angleOffset * settle };
    }
    if (lane === 1) {
      return { x: 0, y: easedMoveOffset, angle: 0 };
    }
    if (lane === 2) {
      return { x: 0, y: -easedMoveOffset, angle: 0 };
    }
    return { x: easedMoveOffset, y: 0, angle: angleOffset * settle };
  }

  function soulDuetLayoutFor(kind, t) {
    if (!(t >= soulPhaseStart && t < soulPhaseEnd)) {
      return null;
    }
    return kind === "opp" ? SOUL_DUET_LAYOUT.gfSoul : SOUL_DUET_LAYOUT.bfSoul;
  }

  function soulDuetPackFor(kind, t) {
    if (!(t >= soulPhaseStart && t < soulPhaseEnd)) {
      return null;
    }
    return packById(kind === "opp" ? "gfSoul" : "bfSoul", kind === "opp" ? "gfSoul" : "bfSoul");
  }

  function characterFocusPoint(kind, t, forcedPack = null, forcedLayout = null) {
    const duetLayout = forcedLayout || soulDuetLayoutFor(kind, t);
    const duetPack = forcedPack || (duetLayout ? soulDuetPackFor(kind, t) : null);
    const draw = characterDrawState(kind, t, false, duetPack, duetLayout);
    if (!draw) {
      return {
        x: kind === "opp" ? canvas.width * 0.72 : canvas.width * 0.3,
        y: canvas.height * 0.48
      };
    }
    const bounds = visibleFrameBounds(draw);
    const focusLift = String(draw.info.pack.id).startsWith("papyrus")
      ? 0.34
      : String(draw.info.pack.id).includes("Soul")
        ? 0.36
        : kind === "opp"
          ? 0.38
          : 0.44;
    return {
      x: bounds?.centerX ?? draw.x,
      y: bounds ? lerp01(bounds.top, bounds.bottom, focusLift) : draw.y
    };
  }

  function cameraTargetPointAt(t) {
    const target = currentCameraTargetAt(t);
    const moveOffset = currentCameraMoveOffsetAt(t);
    const attackFx = attackVisualState(t);
    const oppDir = cameraDirectionOffsetFor("opp", t, moveOffset);
    const playerDir = cameraDirectionOffsetFor("player", t, moveOffset);
    const oppFocus = characterFocusPoint("opp", t);
    const playerFocus = characterFocusPoint("player", t);
    const opp = {
      x: oppFocus.x + oppDir.x,
      y: oppFocus.y + oppDir.y,
      side: "opp",
      angle: oppDir.angle
    };
    const player = {
      x: playerFocus.x + playerDir.x,
      y: playerFocus.y + playerDir.y,
      side: "player",
      angle: playerDir.angle
    };
    const both = {
      x: lerp01(oppFocus.x, playerFocus.x, 0.5),
      y: lerp01(oppFocus.y, playerFocus.y, 0.5),
      side: "both",
      angle: 0
    };

    let focus = target === 0 ? opp : target === 1 ? player : both;
    if (attackFx.prep) {
      focus = {
        x: both.x,
        y: both.y,
        side: "both",
        angle: 0
      };
    } else if (attackFx.active && target !== 2) {
      focus = {
        x: player.x,
        y: player.y,
        side: "player",
        angle: player.angle
      };
    }
    if (focus.side !== "both") {
      const sidePull = attackFx.active ? 1.3 : 1.22;
      const verticalPull = attackFx.active ? 1.12 : 1.08;
      focus = {
        ...focus,
        x: clamp(lerp01(both.x, focus.x, sidePull), canvas.width * 0.08, canvas.width * 0.92),
        y: clamp(lerp01(both.y, focus.y, verticalPull), canvas.height * 0.18, canvas.height * 0.88)
      };
    }
    return focus;
  }

  function papyrusOrbitLayoutsAt(t) {
    const body = {
      ...STAGE_LAYOUT.papyrusBody,
      x: STAGE_LAYOUT.sans.x - 0.014,
      y: STAGE_LAYOUT.sans.y + 0.01
    };
    const head = {
      ...STAGE_LAYOUT.papyrusHead,
      x: STAGE_LAYOUT.sans.x + 0.002,
      y: STAGE_LAYOUT.sans.y - 0.03
    };
    if (t < PAPYRUS_ORBIT_START || t >= PAPYRUS_ORBIT_END) {
      return { body, head };
    }
    if (t >= PAPYRUS_ORBIT_END - 5) {
      body.x += 0.01;
      head.x += 0.026;
      head.y -= 0.055;
      return { body, head };
    }

    const waveSpeed = (t - PAPYRUS_ORBIT_START) * 3;
    const bobX = Math.sin(waveSpeed) * 50;
    const bobY = Math.cos(waveSpeed * 0.8) * 40 + Math.sin(waveSpeed * 1.5) * 10;
    body.x += bobX / 1920;
    body.y += bobY / 1080;

    const orbitSpeed = (t - PAPYRUS_ORBIT_START) * 1.5 * 1.7;
    let trace = Math.sin(orbitSpeed * 0.8) * 0.5 + 0.5;
    trace += Math.sin(orbitSpeed * 0.5) * 0.15;
    trace += Math.cos(orbitSpeed * 1.7) * 0.1;
    trace = clamp(trace, 0, 1);
    const eased = Math.sin(trace * Math.PI * 0.5);
    const mainArc = Math.sin(trace * Math.PI) * -150 * 1.6;
    const tilt = Math.cos(orbitSpeed * 1.2) * 25;
    const sway = Math.sin(orbitSpeed * 3.5) * 15;
    const pulse = Math.sin(orbitSpeed * 0.5) * 10;
    head.x = lerp01(head.x + 0.012, head.x - 0.095, eased) + (tilt + pulse) / 1920;
    head.y = body.y + (mainArc + sway + pulse + tilt) / 1080 - 0.03;
    return { body, head };
  }

  function drawPapyrusGradient(t, layout) {
    const alpha = brokenRealityGradientAlphaAt(t);
    if (alpha <= 0.01) {
      return;
    }
    const centerX = canvas.width * layout.x;
    const baseY = canvas.height * layout.y;
    const grad = ctx.createLinearGradient(0, baseY - 360, 0, baseY + 24);
    grad.addColorStop(0, "rgba(255,0,0,0)");
    grad.addColorStop(0.18, "rgba(255,22,22," + (alpha * 0.16).toFixed(3) + ")");
    grad.addColorStop(0.56, "rgba(176,14,14," + (alpha * 0.46).toFixed(3) + ")");
    grad.addColorStop(1, "rgba(112,10,10,0)");
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.fillStyle = grad;
    ctx.fillRect(centerX - 280, baseY - 360, 560, 420);
    ctx.restore();
  }

  function drawCharacterTrails(kind, t, trailAlpha, forcedPack = null, forcedLayout = null) {
    if (trailAlpha <= 0.01) {
      return;
    }
    const draw = characterDrawState(kind, t, false, forcedPack, forcedLayout);
    if (!draw) {
      return;
    }
    const copies = 2 + Math.round(trailAlpha * 8);
    for (let i = copies; i >= 1; i--) {
      const ratio = i / copies;
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      ctx.globalAlpha = trailAlpha * 0.22 * ratio;
      ctx.filter = "blur(" + (5 + i * 1.8).toFixed(2) + "px)";
      drawVisibleFrame(
        draw.info.pack.image,
        draw.info.frame,
        draw.x - i * 16,
        draw.y + i * 7,
        draw.scale * (1 + i * 0.014),
        trailAlpha * 0.18 * ratio,
        draw.flipX
      );
      ctx.restore();
    }
  }

  function updateLayoutState(t) {
    const fix = getFixState();
    const now = performance.now() / 1000;
    const dt = Math.max(1 / 240, Math.min(0.05, now - fix.lastPerf));
    fix.lastPerf = now;

    const target = LAYOUTS[currentModeAt(t)] || LAYOUTS.up;
    const ease = Math.min(1, dt * 5.5);
    fix.currentXMult += (target.xMult - fix.currentXMult) * ease;
    fix.currentYMult += (target.yMult - fix.currentYMult) * ease;
    fix.currentY += (target.y - fix.currentY) * ease;

    const attack = state.br?.attack;
    const openTarget = attack ? (attack.resolved ? 0.45 : 1) : 0;
    fix.attackOpen += (openTarget - fix.attackOpen) * Math.min(1, dt * 8);
    const markerTarget = attack ? clamp(Number(attack.choice || 0), 0, 1) : 0;
    fix.attackMarker += (markerTarget - fix.attackMarker) * Math.min(1, dt * 10);
    if (attack) {
      fix.attackSnapshot = {
        color: attack.color || "#ffffff",
        result: attack.result || "PRESS SPACE!",
        resolved: !!attack.resolved
      };
    }

    return fix;
  }

  function poseAnimName(lane) {
    return ["singLEFT", "singDOWN", "singUP", "singRIGHT"][Math.abs(Number(lane || 0)) % 4];
  }

  function missAnimName(lane) {
    return ["singLEFTmiss", "singDOWNmiss", "singUPmiss", "singRIGHTmiss"][Math.abs(Number(lane || 0)) % 4];
  }

  function animDuration(spriteDef, animName, min = 0.15, max = 0.6) {
    const anim = spriteDef?.animations?.[animName];
    if (!anim?.frames?.length) {
      return min;
    }
    return sportingAnimDuration(anim.frames, anim.fps || 24, min, max);
  }

  function animationFrameInfo(kind, t, forcedPack = null) {
    const pack = forcedPack || currentPack(kind, t);
    if (!pack?.def || !ready(pack.image)) {
      return null;
    }

    const pose = state.poses?.[pack.poseKey] || { lane: kind === "opp" ? 1 : 2, time: -10, kind: "hit" };
    const age = performance.now() / 1000 - Number(pose.time || -10);
    const singName = poseAnimName(pose.lane);
    const missName = missAnimName(pose.lane);
    const attack = kind === "player" ? state.br?.attack : null;

    let animName = null;
    let elapsed = 0;
    let loop = false;

    if (attack) {
      if (attack.anim === "attack" && pack.def.animations?.attack) {
        animName = "attack";
        elapsed = Math.max(0, t - Number(attack.animStart || t));
      } else if (attack.anim === "back" && pack.def.animations?.attack_back) {
        animName = "attack_back";
        elapsed = Math.max(0, t - Number(attack.animStart || t));
      } else if (!attack.resolved) {
        const prepAge = Math.max(0, t - Number(attack.triggerTime || t));
        const prepLoop = pack.def.animations?.["attack_prep-loop"];
        animName = prepAge < 0.24 || !prepLoop ? "attack_prep" : "attack_prep-loop";
        elapsed = prepAge;
        loop = animName === "attack_prep-loop";
      }
    }

    if (!animName && pose.kind === "miss" && age >= 0 && age <= animDuration(pack.def, missName, 0.15, 0.55) && pack.def.animations?.[missName]) {
      animName = missName;
      elapsed = age;
    }

    if (!animName && age >= 0 && age <= animDuration(pack.def, singName, 0.15, 0.6) && pack.def.animations?.[singName]) {
      animName = singName;
      elapsed = age;
    }

    if (!animName) {
      animName = pack.def.animations?.idle ? "idle" : singName;
      elapsed = t * pack.idleSpeed;
      loop = true;
    }

    const anim = pack.def.animations?.[animName];
    if (!anim?.frames?.length) {
      return null;
    }
    const frame = frameFromList(anim.frames, elapsed, anim.fps || 24, loop || anim.loop === true);
    if (!frame) {
      return null;
    }

    return {
      pack,
      frame,
      animName,
      anim,
      offset: Array.isArray(anim.offset) ? anim.offset : [0, 0]
    };
  }

  function drawVisibleFrame(image, frame, x, y, scale, alpha = 1, flipX = false) {
    const fw = (frame.fw || (frame.rotated ? frame.h : frame.w)) * scale;
    const fx = (frame.fx || 0) * scale;
    const fh = (frame.fh || (frame.rotated ? frame.w : frame.h)) * scale;
    const fy = (frame.fy || 0) * scale;
    const dx = -fw / 2 - fx;
    const dy = -fh - fy;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    if (flipX) ctx.scale(-1, 1);
    drawAtlasSub(image, frame, dx, dy, scale);
    ctx.restore();
  }

  function visibleFrameBounds(draw) {
    const frame = draw?.info?.frame;
    if (!frame) {
      return null;
    }
    const fullW = Number(frame.fw || (frame.rotated ? frame.h : frame.w) || 0) * draw.scale;
    const fullH = Number(frame.fh || (frame.rotated ? frame.w : frame.h) || 0) * draw.scale;
    const frameW = Number((frame.rotated ? frame.h : frame.w) || 0) * draw.scale;
    const frameH = Number((frame.rotated ? frame.w : frame.h) || 0) * draw.scale;
    const fx = Number(frame.fx || 0) * draw.scale;
    const fy = Number(frame.fy || 0) * draw.scale;
    const localLeft = -fullW / 2 - fx;
    const localTop = -fullH - fy;
    const top = draw.y + localTop;
    let left;
    let right;
    if (draw.flipX) {
      right = draw.x - localLeft;
      left = right - frameW;
    } else {
      left = draw.x + localLeft;
      right = left + frameW;
    }
    return {
      left,
      right,
      top,
      bottom: top + frameH,
      width: frameW,
      height: frameH,
      centerX: (left + right) * 0.5,
      centerY: top + frameH * 0.5
    };
  }

  function visibleAnchorDeltas(info, scale, flipX) {
    const frame = info?.frame;
    if (!frame) {
      return { x: 0, y: 0 };
    }
    const fullW = Number(frame.fw || (frame.rotated ? frame.h : frame.w) || 0) * scale;
    const fullH = Number(frame.fh || (frame.rotated ? frame.w : frame.h) || 0) * scale;
    const frameW = Number((frame.rotated ? frame.h : frame.w) || 0) * scale;
    const frameH = Number((frame.rotated ? frame.w : frame.h) || 0) * scale;
    const fx = Number(frame.fx || 0) * scale;
    const fy = Number(frame.fy || 0) * scale;
    const localLeft = -fullW / 2 - fx;
    const localTop = -fullH - fy;
    return {
      x: flipX ? (-localLeft - frameW / 2) : (localLeft + frameW / 2),
      y: localTop + frameH
    };
  }

  function characterDrawState(kind, t, shadow = false, forcedPack = null, forcedLayout = null) {
    const info = animationFrameInfo(kind, t, forcedPack);
    if (!info) {
      return null;
    }

    const layout = forcedLayout || STAGE_LAYOUT[info.pack.id] || STAGE_LAYOUT[kind === "opp" ? "sans" : "boyfriend"];
    const scale = Number(layout.scale || 0.35);
    const stableFeet = !String(info.pack.id).startsWith("papyrus");
    const baseOffset = Array.isArray(info.pack.def?.baseOffset) ? info.pack.def.baseOffset : [0, 0];
    const offsetX = stableFeet ? 0 : (Number(info.offset?.[0] || 0) + Number(baseOffset[0] || 0) * 0.02) * scale;
    const offsetY = stableFeet ? 0 : (Number(info.offset?.[1] || 0) + Number(baseOffset[1] || 0) * 0.01) * scale;
    const charOffset = currentCharacterOffsetAt(kind, t);
    const flipX = kind === "player" ? !info.pack.def.flipX : !!info.pack.def.flipX;
    const anchor = stableFeet ? visibleAnchorDeltas(info, scale, flipX) : { x: 0, y: 0 };
    const targetX = canvas.width * layout.x - offsetX + charOffset.x * 0.42;
    const targetY = canvas.height * layout.y - offsetY + charOffset.y * 0.36;
    let x = targetX - anchor.x + (shadow ? 16 : 0);
    let y = targetY - anchor.y + (shadow ? 24 : 0);
    const attack = state.br?.attack;
    if (attack && kind === "player") {
      const attackAge = Math.max(0, t - Number(attack.animStart || attack.triggerTime || t));
      const targetX = canvas.width * 0.73;
      const targetY = canvas.height * 0.938;
      if (attack.anim === "attack") {
        if (attackAge >= 0.18 && attackAge < 0.7) {
          x = targetX + (shadow ? 16 : 0);
          y = targetY + (shadow ? 24 : 0);
        }
      } else if (attack.anim === "back" && attackAge < 0.18) {
        const blend = 1 - attackAge / 0.18;
        x = x * (1 - blend) + targetX * blend + (shadow ? 16 : 0);
        y = y * (1 - blend) + targetY * blend + (shadow ? 24 : 0);
      }
    }
    if (attack && kind === "opp" && (info.pack.id === "sans" || info.pack.id === "sansAlt")) {
      const attackAge = Math.max(0, t - Number(attack.animStart || attack.triggerTime || t));
      if (attack.anim === "attack" && attackAge >= 0.26 && attackAge < 0.72) {
        x += 34 + (shadow ? 4 : 0);
        y -= 18;
      } else if (attack.anim === "back" && attackAge < 0.2) {
        const blend = 1 - attackAge / 0.2;
        x += 34 * blend;
        y -= 18 * blend;
      }
    }

    return {
      info,
      x,
      y,
      scale,
      flipX,
      stableFeet
    };
  }

  function characterFocusX(kind, t, forcedPack = null, forcedLayout = null) {
    return characterFocusPoint(kind, t, forcedPack, forcedLayout).x;
  }

  function drawCharacter(kind, t, alpha = 1, shadow = false, forcedPack = null, forcedLayout = null) {
    const draw = characterDrawState(kind, t, shadow, forcedPack, forcedLayout);
    if (!draw) {
      return;
    }

    ctx.save();
    if (shadow) {
      ctx.filter = "blur(10px)";
      ctx.globalAlpha = alpha * 0.22;
    } else if (alpha !== 1) {
      ctx.globalAlpha = alpha;
    }
    drawVisibleFrame(
      draw.info.pack.image,
      draw.info.frame,
      draw.x,
      draw.y,
      draw.scale,
      shadow ? alpha * 0.22 : alpha,
      draw.flipX
    );
    ctx.restore();
  }

  function drawCharacterReflection(kind, t, alpha = 0.1, forcedPack = null, forcedLayout = null) {
    const draw = characterDrawState(kind, t, false, forcedPack, forcedLayout);
    if (!draw) {
      return;
    }

    const frame = draw.info.frame;
    const frameH = (frame.rotated ? frame.w : frame.h) * draw.scale;
    const floorY = draw.y + 4;
    const reflectScaleY = 0.9;
    const clipTop = floorY - 3;
    const clipBottom = Math.min(canvas.height, floorY + frameH * 0.98 + 160);
    if (clipBottom <= clipTop) {
      return;
    }

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, clipTop, canvas.width, clipBottom - clipTop);
    ctx.clip();
    ctx.translate(0, floorY * (1 + reflectScaleY));
    ctx.scale(1, -reflectScaleY);
    ctx.globalCompositeOperation = "source-over";
    ctx.filter = "blur(1.4px) brightness(1.12) saturate(0.94)";
    drawVisibleFrame(
      draw.info.pack.image,
      draw.info.frame,
      draw.x,
      draw.y,
      draw.scale,
      Math.min(0.72, alpha * 2.4),
      draw.flipX
    );
    ctx.globalCompositeOperation = "screen";
    ctx.filter = "blur(7px) brightness(1.28) saturate(0.88)";
    drawVisibleFrame(
      draw.info.pack.image,
      draw.info.frame,
      draw.x,
      draw.y,
      draw.scale,
      Math.min(0.24, alpha * 0.95),
      draw.flipX
    );
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, clipTop, canvas.width, clipBottom - clipTop);
    ctx.clip();
    const fade = ctx.createLinearGradient(0, clipTop, 0, clipBottom);
    fade.addColorStop(0, "rgba(255,255,255,0.95)");
    fade.addColorStop(0.08, "rgba(255,255,255,0.72)");
    fade.addColorStop(0.3, "rgba(255,255,255,0.34)");
    fade.addColorStop(0.7, "rgba(255,255,255,0.1)");
    fade.addColorStop(1, "rgba(255,255,255,0)");
    ctx.globalCompositeOperation = "destination-in";
    ctx.fillStyle = fade;
    ctx.fillRect(0, clipTop, canvas.width, clipBottom - clipTop);
    ctx.restore();
  }

  function hideBrokenRealityOpeningVideo() {
    document.querySelectorAll("video").forEach(video => {
      const src = String(video.currentSrc || video.src || "");
      if (!src.includes("broken-reality-opening.mp4")) {
        return;
      }
      try {
        video.pause();
        video.style.display = "none";
      } catch {}
    });
  }

  function ensureEndingVideos() {
    for (const [key, src] of Object.entries(endingVideoSources)) {
      if (endingVideos[key]) {
        continue;
      }
      const video = document.createElement("video");
      video.src = src;
      video.preload = "auto";
      video.playsInline = true;
      video.controls = false;
      video.style.cssText = "position:fixed;inset:0;width:100vw;height:100vh;object-fit:cover;display:none;pointer-events:none;z-index:20;background:#000;";
      document.body.appendChild(video);
      endingVideos[key] = video;
    }
  }

  function hideEndingVideos() {
    Object.values(endingVideos).forEach(video => {
      if (!video) {
        return;
      }
      try {
        video.pause();
        video.currentTime = 0;
        video.style.display = "none";
      } catch {}
    });
  }

  function playEndingCutscene(kind, onDone) {
    ensureEndingVideos();
    hideEndingVideos();
    const video = endingVideos[kind];
    if (!video) {
      if (typeof onDone === "function") {
        onDone();
      }
      return;
    }
    const done = () => {
      try {
        video.pause();
        video.currentTime = 0;
        video.style.display = "none";
      } catch {}
      if (typeof onDone === "function") {
        onDone();
      }
    };
    video.addEventListener("ended", done, { once: true });
    video.addEventListener("error", done, { once: true });
    try {
      video.style.display = "block";
      video.currentTime = 0;
      const play = video.play();
      if (play && typeof play.catch === "function") {
        play.catch(() => done());
      }
    } catch {
      done();
    }
  }

  function centerPillarRect(image, stageY, stageH) {
    const srcX = Math.floor(image.naturalWidth * 0.74);
    const srcW = Math.max(1, Math.floor(image.naturalWidth * 0.26));
    const scale = stageH / image.naturalHeight;
    const drawW = srcW * scale;
    const drawX = canvas.width * 0.5 - drawW / 2;
    return { srcX, srcW, drawW, drawX, stageY, stageH };
  }

  function drawCenterPillar(image, stageY, stageH) {
    if (!ready(image)) {
      return;
    }
    const rect = centerPillarRect(image, stageY, stageH);
    ctx.drawImage(image, rect.srcX, 0, rect.srcW, image.naturalHeight, rect.drawX, stageY, rect.drawW, stageH);
  }

  function drawCenterPillarReflection(image, stageY, stageH, alpha = 0.08) {
    if (!ready(image)) {
      return;
    }
    const rect = centerPillarRect(image, stageY, stageH);
    const clipTop = stageY + stageH * 0.72;
    const clipBottom = Math.min(canvas.height, stageY + stageH + 110);
    if (clipBottom <= clipTop) {
      return;
    }

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, clipTop, canvas.width, clipBottom - clipTop);
    ctx.clip();
    ctx.translate(0, (stageY + stageH) * 2 - 2);
    ctx.scale(1, -1);
    ctx.filter = "blur(2.2px) saturate(0.9)";
    ctx.globalAlpha = alpha;
    ctx.drawImage(image, rect.srcX, 0, rect.srcW, image.naturalHeight, rect.drawX, stageY, rect.drawW, stageH);
    ctx.restore();

    ctx.save();
    const fade = ctx.createLinearGradient(0, clipTop, 0, clipBottom);
    fade.addColorStop(0, "rgba(10,8,18,0)");
    fade.addColorStop(0.2, "rgba(10,8,18,0.2)");
    fade.addColorStop(0.68, "rgba(10,8,18,0.52)");
    fade.addColorStop(1, "rgba(10,8,18,0.86)");
    ctx.globalCompositeOperation = "multiply";
    ctx.fillStyle = fade;
    ctx.fillRect(0, clipTop, canvas.width, clipBottom - clipTop);
    ctx.restore();
  }

  function drawHallWindowBloom(rect, t, bloom) {
    if (!ready(stageImages.light)) {
      return;
    }
    const boost = Math.max(1, bloom);
    const bright = 1;
    const samples = 96;
    const density = 0.54;
    const weight = (0.16 * bright) + Math.sin(t) * 0.02;
    const sourceX = 0.5 + Math.cos(t + 0.16) * 0.04;
    const sourceY = 0.3 + Math.sin(t * 0.5) * 0.03;
    const anchorX = rect.x + rect.w * sourceX;
    const anchorY = rect.y + rect.h * sourceY;
    const wobbleX = Math.sin(t + rect.y * 0.004) * rect.w * 0.001;
    const wobbleY = Math.cos(t + rect.x * 0.004) * rect.h * 0.001;
    const deltaX = rect.x + rect.w * 0.5 - anchorX;
    const deltaY = rect.y + rect.h * 0.5 - anchorY;
    let decay = 1;

    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = Math.min(0.92, 0.34 + boost * 0.1);
    ctx.filter = "brightness(" + (1.62 + boost * 0.12).toFixed(2) + ") saturate(1.05)";
    ctx.drawImage(stageImages.light, rect.x + wobbleX, rect.y + wobbleY, rect.w, rect.h);

    for (let i = 0; i < samples; i++) {
      const step = (i + 1) / samples;
      const jitter = (seededUnit(i * 2.13 + t * 0.91) - 0.5) * 0.9;
      const scale = 1 + step * density * 0.44;
      const sampleX = rect.x + wobbleX + deltaX * step + jitter;
      const sampleY = rect.y + wobbleY + deltaY * step;
      const drawW = rect.w * scale;
      const drawH = rect.h * scale;
      const drawX = sampleX - (sampleX - rect.x) * scale;
      const drawY = sampleY - (sampleY - rect.y) * scale;
      const blurPx = 0.5 + step * (11 + boost * 6);
      const alpha = Math.min(0.18, Math.max(0.008, decay * weight * (0.84 + boost * 0.1)));
      ctx.globalAlpha = alpha;
      ctx.filter = "blur(" + blurPx.toFixed(2) + "px) brightness(" + (1.12 + boost * 0.08).toFixed(2) + ") saturate(1.01)";
      ctx.drawImage(stageImages.light, drawX, drawY, drawW, drawH);
      decay *= 0.905 * (1 + ((1 - bright) / 20));
    }

    ctx.filter = "none";
    const warmGlow = ctx.createRadialGradient(anchorX, anchorY, rect.w * 0.04, anchorX, anchorY, rect.w * 0.4);
    warmGlow.addColorStop(0, "rgba(255,241,255," + Math.min(0.42, 0.28 + boost * 0.04) + ")");
    warmGlow.addColorStop(0.18, "rgba(248,236,255," + Math.min(0.28, 0.18 + boost * 0.03) + ")");
    warmGlow.addColorStop(0.56, "rgba(195,171,255," + Math.min(0.14, 0.08 + boost * 0.02) + ")");
    warmGlow.addColorStop(1, "rgba(96,68,168,0)");
    ctx.fillStyle = warmGlow;
    ctx.fillRect(anchorX - rect.w * 0.46, anchorY - rect.w * 0.28, rect.w * 0.92, rect.w * 0.7);

    const veil = ctx.createLinearGradient(0, rect.y + rect.h * 0.12, 0, rect.y + rect.h * 0.98);
    veil.addColorStop(0, "rgba(255,244,255," + Math.min(0.16, 0.08 + boost * 0.03) + ")");
    veil.addColorStop(0.28, "rgba(222,204,255," + Math.min(0.1, 0.05 + boost * 0.02) + ")");
    veil.addColorStop(1, "rgba(140,110,214,0)");
    ctx.fillStyle = veil;
    ctx.fillRect(rect.x, rect.y + rect.h * 0.12, rect.w, rect.h * 0.86);
    ctx.restore();
  }

  function drawCineFlashOverlays(t) {
    if (!CINE_FLASH_TIMES.length) {
      return;
    }
    for (let i = 0; i < CINE_FLASH_TIMES.length; i++) {
      const hitTime = CINE_FLASH_TIMES[i];
      const layout = CINE_FLASH_LAYOUTS[i];
      const image = cineImages[layout?.key];
      if (!layout || !ready(image) || t < hitTime || t > hitTime + CINE_FLASH_DURATION) {
        continue;
      }
      const surface = getCineFlashSurface(layout, image);
      if (!surface) {
        continue;
      }
      const p = clamp((t - hitTime) / CINE_FLASH_DURATION, 0, 1);
      const ease = 1 - Math.pow(1 - p, 2);
      const alpha = Math.pow(1 - p, 2);
      const currentScale = Number(layout.scale || 1) * lerp01(0.84, 0.72, ease) * surface.screenScale;
      const drawScale = currentScale / Math.max(0.0001, surface.maxScale);
      const w = surface.width * drawScale;
      const h = surface.height * drawScale;
      const driftX = Number(layout.driftX || 0) * surface.screenScale;
      const driftY = Number(layout.driftY || 0) * surface.screenScale;
      const x = canvas.width * Number(layout.anchorX || 0.5) - w / 2 + lerp01(driftX, 0, ease);
      const y = canvas.height * Number(layout.anchorY || 0.5) - h / 2 + lerp01(driftY + 10 * surface.screenScale, 0, ease);

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.drawImage(surface.canvas, x, y, w, h);
      ctx.restore();
    }
  }

  function drawHallDust(rect, t, bloom) {
    const boost = Math.max(1, bloom);
    const topY = rect.y + rect.h * 0.16;
    const travelH = rect.h * 0.76;
    const floorY = rect.y + rect.h * 0.955;
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.shadowColor = "rgba(242,232,255,0.9)";
    ctx.shadowBlur = 3 + boost * 2.5;
    for (const mote of HALL_DUST) {
      const beam = HALL_BEAMS[mote.beam];
      const layerRatio = clamp((mote.layer - HALL_DUST_STYLE.startingLayers) / Math.max(1, HALL_DUST_STYLE.layers - HALL_DUST_STYLE.startingLayers), 0, 1);
      const beamW = rect.w * beam.width;
      const cx = rect.x + rect.w * beam.x;
      const driftSpeed = (18 + mote.speed * 24) * (0.72 + layerRatio * HALL_DUST_STYLE.speed);
      const y = topY + ((mote.offsetY * travelH) + t * driftSpeed) % travelH;
      const x = cx
        + Math.sin(t * (0.34 + mote.sway * 0.18) + mote.phase + y * 0.018) * beamW * (0.14 + layerRatio * 0.09)
        + (mote.offsetX - 0.5) * beamW * (0.32 + layerRatio * 0.18);
      const pulse = 0.6 + 0.4 * Math.sin(t * (0.8 + mote.speed * 0.22) + mote.phase);
      const alpha = Math.min(0.22, (0.014 + mote.alpha * 0.1 * pulse) * (0.8 + boost * 0.16) * (0.42 + layerRatio * 0.85));
      const size = mote.size * (0.72 + pulse * 0.26) * (0.66 + layerRatio * 0.72);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = mote.beam === 1 ? "#f7f0ff" : "#ede4ff";
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();

      const reflectedY = floorY + (floorY - y) * 0.22;
      if (reflectedY > floorY - 6 && reflectedY < canvas.height) {
        ctx.globalAlpha = alpha * 0.32;
        ctx.beginPath();
        ctx.arc(x, reflectedY, Math.max(0.18, size * 0.72), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function drawAttackBar(t) {
    const fix = getFixState();
    const snap = fix.attackSnapshot;
    if (fix.attackOpen < 0.02 || !snap || !ready(stageImages.target) || !ready(stageImages.targetChoice)) {
      return;
    }

    const open = clamp(fix.attackOpen, 0, 1);
    const barW = 548 * (0.84 + open * 0.16);
    const barH = 117 * (0.86 + open * 0.14);
    const barX = canvas.width / 2 - barW / 2;
    const barY = 588 + (1 - open) * 26;

    ctx.save();
    ctx.globalAlpha = open * 0.96;
    ctx.drawImage(stageImages.target, barX, barY, barW, barH);
    const choiceFrames = BR.stage?.attack?.choice?.idle || [];
    const choiceFrame = choiceFrames[Math.floor(performance.now() / 140) % Math.max(1, choiceFrames.length)];
    if (choiceFrame) {
      const choiceScale = 1.54 + open * 0.24;
      const choiceX = barX + fix.attackMarker * barW - 10;
      drawAtlasTopLeft(stageImages.targetChoice, choiceFrame, choiceX, barY + 18, choiceScale, open);
    }
    ctx.font = "900 24px Trebuchet MS, sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = snap.color || "#ffffff";
    ctx.fillText(snap.result || "PRESS SPACE!", canvas.width / 2, barY - 12 + (1 - open) * 8);
    ctx.restore();
  }

  function drawAtlasStretchHorizontal(image, frame, x, y, width, height, alpha = 1) {
    if (width <= 0) {
      return;
    }
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.drawImage(image, frame.x, frame.y, frame.w, frame.h, x, y - height / 2, width, height);
    ctx.restore();
  }

  function drawReceptor(lane, x, y, t) {
    const skin = currentNoteSkin(t);
    const img = currentNoteImage(t);
    if (!skin || !img) {
      return;
    }
    const dir = DIRS[lane % 4];
    const age = performance.now() / 1000 - (state.receptorFx[lane]?.time || -10);
    const pressed = !!state.keysDown[lane];

    if (age >= 0 && age < 0.16) {
      const frames = skin.confirm?.[dir] || [];
      const frame = frameFromList(frames, age, 24, false);
      if (frame) {
        ctx.save();
        ctx.shadowBlur = 18 + (Number(state.br?.bloom || 1) * 18);
        ctx.shadowColor = COLORS[lane];
        drawAtlasCentered(img, frame, x, y, 0.78 + (0.16 - age) * 0.42, 1 - age / 0.16);
        ctx.restore();
        return;
      }
    }

    const pressFrames = skin.press?.[dir] || [];
    const frame = pressed ? pressFrames[Math.floor(performance.now() / 90) % Math.max(1, pressFrames.length)] : skin.static?.[dir];
    if (!frame) {
      return;
    }

    ctx.save();
    ctx.shadowBlur = pressed ? 18 + (Number(state.br?.bloom || 1) * 16) : 8 + (Number(state.br?.bloom || 1) * 10);
    ctx.shadowColor = COLORS[lane];
    drawAtlasCentered(img, frame, x, y, pressed ? 0.72 : 0.7, lane < 4 ? 0.82 : 1);
    ctx.restore();
  }

  function drawGem(lane, x, y, scale, alpha, t) {
    const skin = currentNoteSkin(t);
    const img = currentNoteImage(t);
    const frame = skin?.gem?.[DIRS[lane % 4]];
    if (!frame || !img) {
      return;
    }
    ctx.save();
    ctx.shadowBlur = 16 + (Number(state.br?.bloom || 1) * 18);
    ctx.shadowColor = COLORS[lane];
    drawAtlasCentered(img, frame, x, y, 0.72 * scale, alpha);
    ctx.restore();
  }

  function drawSustain(note, headX, headY, tailX, tailY, t, alpha = 1) {
    const skin = currentNoteSkin(t);
    const img = currentNoteImage(t);
    const hold = skin?.hold?.[DIRS[note.lane % 4]];
    if (!hold || !img) {
      return;
    }

    const horizontal = Math.abs(tailX - headX) > Math.abs(tailY - headY);
    const bodyScale = 0.84;
    if (horizontal) {
      const left = Math.min(headX, tailX);
      const right = Math.max(headX, tailX);
      const capW = (hold.end.fw || hold.end.w) * bodyScale;
      const bodyH = (hold.piece.fh || hold.piece.h) * bodyScale;
      const bodyLeft = left + capW * 0.45;
      const bodyRight = right - capW * 0.45;
      if (bodyRight > bodyLeft) {
        drawAtlasStretchHorizontal(img, hold.piece, bodyLeft, headY, bodyRight - bodyLeft, bodyH, alpha * 0.86);
      }
      drawAtlasCentered(img, hold.end, tailX, tailY, bodyScale, alpha);
      return;
    }

    const top = Math.min(headY, tailY);
    const bottom = Math.max(headY, tailY);
    const endH = (hold.end.fh || hold.end.h) * bodyScale;
    const bodyW = (hold.piece.fw || hold.piece.w) * bodyScale;
    const bodyTop = top + endH * 0.45;
    const bodyBottom = bottom - endH * 0.45;
    if (bodyBottom > bodyTop) {
      drawAtlasStretchVertical(img, hold.piece, headX, bodyTop, bodyW, bodyBottom - bodyTop, alpha * 0.86);
    }
    drawAtlasCentered(img, hold.end, tailX, tailY, bodyScale, alpha);
  }

  function notePlacement(note, t) {
    const fix = updateLayoutState(t);
    const scrollSpeed = currentScrollSpeedAt(t);
    const baseScrollFactor = 450 * scrollSpeed;
    const travel = (note.time - t) * baseScrollFactor;
    const baseX = laneX(note.lane);
    const x = baseX + travel * fix.currentXMult;
    const y = fix.currentY + travel * fix.currentYMult;
    const tailTravel = (holdEndTime(note) - t) * baseScrollFactor;
    const tailX = baseX + tailTravel * fix.currentXMult;
    const tailY = fix.currentY + tailTravel * fix.currentYMult;
    return { x, y, tailX, tailY };
  }

  function stageRect(image) {
    const scale = canvas.width / image.naturalWidth;
    const w = image.naturalWidth * scale;
    const h = image.naturalHeight * scale;
    return {
      x: (canvas.width - w) / 2,
      y: (canvas.height - h) / 2,
      w,
      h
    };
  }

  songTime = function() {
    if (state.currentSong?.chartSource === "brokenReality" || state.selectedSong === "brokenReality") {
      return brokenRealityLiveTime();
    }
    return originalSongTime();
  };

  updateCamera = function(t, dt) {
    if (state.selectedSong !== "brokenReality") {
      return originalUpdateCamera ? originalUpdateCamera(t, dt) : undefined;
    }

    stepManualDrain(t);
    const fix = getFixState();
    const targetFocus = cameraTargetPointAt(t);
    const focus = {
      x: targetFocus.x,
      y: targetFocus.y,
      side: targetFocus.side
    };
    const follow = clamp(6.4 + currentCameraSpeedAt(t) * 58, 6.4, 17.5);
    const ease = 1 - Math.exp(-Math.max(1 / 240, dt || 1 / 60) * follow);
    const focusEase = Math.min(1, ease * 0.82);
    const zoomEase = Math.min(1, ease * 1.08);
    const attackFx = attackVisualState(t);
    const singerZoomBoost =
      focus.side === "both"
        ? 0
        : focus.side === "player"
          ? ((t >= soulPhaseStart && t < soulPhaseEnd ? 0.34 : 0.62) + (attackFx.active ? 0.2 : 0)) * 1.7
          : ((t >= soulPhaseStart && t < soulPhaseEnd ? 0.22 : 0.38) + (attackFx.active ? 0.14 : 0)) * 1.7;
    const targetZoom = clamp(
      brokenRealityZoomScaleAt(t)
        + singerZoomBoost
        + Math.max(0, Number(state.br?.bloom || 1) - 1) * 0.08
        + attackFx.zoomBoost
        - brokenRealityBlackoutAlphaAt(t) * 0.12,
      0.96,
      2.18
    );

    fix.camX += (focus.x - fix.camX) * focusEase;
    fix.camY += (focus.y - fix.camY) * focusEase;
    fix.camZoom += (targetZoom - fix.camZoom) * zoomEase;
    fix.camHighwayX += (0 - fix.camHighwayX) * focusEase;
    fix.camHighwayY += (0 - fix.camHighwayY) * focusEase;

    state.camera.zoom = fix.camZoom;
    state.camera.focusX = fix.camX;
    state.camera.focusY = fix.camY;
    state.camera.highwayX = brokenRealityBlackoutAlphaAt(t) > 0.92 ? 0 : fix.camHighwayX;
    state.camera.highwayY = brokenRealityBlackoutAlphaAt(t) > 0.92 ? 0 : fix.camHighwayY;
    state.camera.lastSide = focus.side;

    const cueId =
      attackFx.shake > 0
        ? "shake-" + Math.round((t - Number(state.br?.attack?.animStart || t)) * 24)
        : "";
    if (cueId && fix.attackCueStamp !== cueId) {
      fix.attackCueStamp = cueId;
      state.shake = {
        time: performance.now() / 1000,
        intensity: attackFx.shake
      };
    }
  };

  laneX = function(i) {
    if (state.selectedSong === "brokenReality") {
      return originalLaneX((i + 4) % 8);
    }
    return originalLaneX(i);
  };

  receptorY = function() {
    if (state.selectedSong === "brokenReality") {
      return originalReceptorY();
    }
    return originalReceptorY();
  };

  startSong = function(id = state.selectedSong, options) {
    const out = originalStartSong(id, options);
    const song = SONGS[id] || state.currentSong;
    if (song?.chartSource === "brokenReality") {
      const fix = getFixState();
      fix.startedAt = performance.now() / 1000;
      fix.timeOffset = 0;
      fix.lastPerf = performance.now() / 1000;
      fix.currentXMult = 0;
      fix.currentYMult = 1;
      fix.currentY = layoutBaseY;
      fix.attackOpen = 0;
      fix.attackMarker = 0;
      fix.attackSnapshot = null;
      fix.lastDrainPerf = performance.now() / 1000;
      fix.endingActive = false;
      fix.endingDone = false;
      fix.renderTime = 0;
      fix.camX = canvas.width * 0.5;
      fix.camY = canvas.height * 0.45;
      fix.camZoom = 1;
      fix.camHighwayX = 0;
      fix.camHighwayY = 0;
      fix.attackCueStamp = "";
      primeCineFlashSurfaces();
      ensureEndingVideos();
      hideEndingVideos();
    }
    return out;
  };

  bg = function(song, t) {
    if (state.selectedSong === "brokenReality") {
      ctx.fillStyle = "#020208";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      return;
    }
    return originalBg(song, t);
  };

  stage = function(t) {
    if (state.selectedSong !== "brokenReality") {
      return originalStage(t);
    }

    // Let the imported Dustin BR stage logic update its internal mechanics,
    // drain, prompts, and chart event state, but keep its draw pass invisible.
    ctx.save();
    ctx.globalAlpha = 0;
    try {
      originalStage(t);
    } catch {}
    ctx.restore();

    updateLayoutState(t);
    const pack = currentPack("opp", t);
    const playerPack = currentPack("player", t);
    const soulDuet = t >= soulPhaseStart && t < soulPhaseEnd && (pack.id === "gfSoul" || playerPack.id === "bfSoul");
    const oppPackOverride = soulDuet ? packById("gfSoul", "gfSoul") : null;
    const playerPackOverride = soulDuet ? packById("bfSoul", "bfSoul") : null;
    const oppLayoutOverride = soulDuet ? SOUL_DUET_LAYOUT.gfSoul : null;
    const playerLayoutOverride = soulDuet ? SOUL_DUET_LAYOUT.bfSoul : null;

    const usePapyrusStage = pack.id === "papyrus" || pack.id === "papyrusHead";
    const ground = usePapyrusStage ? stageImages.papsBg : stageImages.ground;
    const fg = usePapyrusStage ? stageImages.papsFg : stageImages.fg;
    const base = ready(ground) ? ground : stageImages.back;
    if (!ready(base)) {
      return;
    }

    const rect = stageRect(base);
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    if (ready(stageImages.back)) {
      ctx.drawImage(stageImages.back, rect.x, rect.y, rect.w, rect.h);
    }
    if (ready(ground)) {
      ctx.drawImage(ground, rect.x, rect.y, rect.w, rect.h);
    }
    if (ready(stageImages.light)) {
      const bloom = Number(state.br?.bloom || 1);
      ctx.globalCompositeOperation = "screen";
      ctx.globalAlpha = usePapyrusStage ? 0.16 + bloom * 0.08 : 0.2 + bloom * 0.1;
      ctx.drawImage(stageImages.light, rect.x, rect.y, rect.w, rect.h);
      ctx.globalCompositeOperation = "source-over";
    }
    ctx.restore();

    if (!usePapyrusStage) {
      const bloom = Number(state.br?.bloom || 1);
      drawHallWindowBloom(rect, t, bloom);
      drawHallDust(rect, t, bloom);
    }

    if (soulDuet) {
      ctx.save();
      ctx.fillStyle = "rgba(0,0,0,0.82)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
    }

    const papyrusLayouts = papyrusDuetActiveAt(t) ? papyrusOrbitLayoutsAt(t) : null;
    const sansPapyrusDuet = !papyrusLayouts && !soulDuet ? sansPapyrusDuetWindowAt(t) : null;
    const duetPapPack = sansPapyrusDuet ? packById("papyrus", "papyrus") : null;
    const duetPapLayout = sansPapyrusDuet ? SANS_PAPYRUS_DUET_LAYOUT : null;
    const trailAlpha = brokenRealityTrailAlphaAt(t);

    if (trailAlpha > 0.01) {
      drawCharacterTrails("opp", t, trailAlpha, oppPackOverride, oppLayoutOverride);
      drawCharacterTrails("player", t, trailAlpha * 0.9, playerPackOverride, playerLayoutOverride);
      if (duetPapPack) {
        drawCharacterTrails("opp", t, trailAlpha * 0.78, duetPapPack, duetPapLayout);
      }
      if (papyrusLayouts) {
        drawCharacterTrails("opp", t, trailAlpha * 0.82, packById("papyrusBody", "papyrus"), papyrusLayouts.body);
      }
    }

    drawCharacterReflection("opp", t, soulDuet ? 0.28 : (usePapyrusStage ? 0.2 : 0.42), oppPackOverride, oppLayoutOverride);
    if (duetPapPack) {
      drawCharacterReflection("opp", t, 0.24, duetPapPack, duetPapLayout);
    }
    if (papyrusLayouts) {
      drawCharacterReflection("opp", t, 0.16, packById("papyrusBody", "papyrus"), papyrusLayouts.body);
    }
    drawCharacterReflection("player", t, soulDuet ? 0.34 : (usePapyrusStage ? 0.26 : 0.52), playerPackOverride, playerLayoutOverride);

    drawCharacter("opp", t, 0.22, true, oppPackOverride, oppLayoutOverride);
    if (duetPapPack) {
      drawCharacter("opp", t, 0.18, true, duetPapPack, duetPapLayout);
    }
    if (papyrusLayouts) {
      drawCharacter("opp", t, 0.16, true, packById("papyrusBody", "papyrus"), papyrusLayouts.body);
    }
    drawCharacter("player", t, soulDuet ? 0.24 : 0.2, true, playerPackOverride, playerLayoutOverride);
    drawCharacter("opp", t, soulDuet ? 1 : brokenRealityOpponentAlphaAt(t), false, oppPackOverride, oppLayoutOverride);
    if (duetPapPack) {
      drawCharacter("opp", t, 0.92, false, duetPapPack, duetPapLayout);
    }
    if (papyrusLayouts) {
      drawPapyrusGradient(t, papyrusLayouts.body);
      drawCharacter("opp", t, 1, false, packById("papyrusBody", "papyrus"), papyrusLayouts.body);
    }
    drawCharacter("player", t, 1, false, playerPackOverride, playerLayoutOverride);

    if (ready(fg) && !soulDuet) {
      ctx.save();
      ctx.globalAlpha = 0.08;
      drawCenterPillarReflection(fg, rect.y, rect.h, 0.08);
      ctx.restore();
      ctx.save();
      ctx.globalAlpha = 0.98;
      drawCenterPillar(fg, rect.y, rect.h);
      ctx.restore();
    }

    drawAttackBar(t);
  };

  receptors = function(t) {
    if (state.selectedSong !== "brokenReality") {
      return originalReceptors(t);
    }

    const fix = updateLayoutState(t);
    const verticalWeight = Math.abs(fix.currentYMult);
    const horizontalWeight = Math.abs(fix.currentXMult);

    if (verticalWeight >= horizontalWeight * 0.75) {
      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(canvas.width * 0.5, 72);
      ctx.lineTo(canvas.width * 0.5, 452);
      ctx.stroke();
    }

    for (let lane = 0; lane < 8; lane++) {
      const x = laneX(lane);
      const y = fix.currentY;
      drawReceptor(lane, x, y, t);
      ctx.strokeStyle = "rgba(255,255,255,0.05)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      if (horizontalWeight > verticalWeight) {
        ctx.moveTo(x + 26, y);
        ctx.lineTo(canvas.width - 48, y);
      } else if (fix.currentYMult < 0) {
        ctx.moveTo(x, y - 26);
        ctx.lineTo(x, 96);
      } else {
        ctx.moveTo(x, y + 26);
        ctx.lineTo(x, 448);
      }
      ctx.stroke();
    }
  };

  notes = function(t) {
    if (state.selectedSong !== "brokenReality") {
      return originalNotes(t);
    }
    if (!state.chart) {
      return;
    }

    for (const note of state.chart.notes) {
      if (note.played && note.hit && (!isHoldNote(note) || note.holdDone)) {
        continue;
      }
      if (note.judged && note.side !== "opp" && (!isHoldNote(note) || note.holdDone || !note.hit)) {
        continue;
      }

      const place = notePlacement(note, t);
      if (
        (place.x < -180 && place.tailX < -180) ||
        (place.x > canvas.width + 180 && place.tailX > canvas.width + 180) ||
        (place.y < -180 && place.tailY < -180) ||
        (place.y > canvas.height + 180 && place.tailY > canvas.height + 180)
      ) {
        continue;
      }

      const diff = note.time - t;
      const scale = clamp(1 - Math.pow(Math.abs(diff), 0.7) * 0.45, 0.75, 1.1);
      const alpha = note.side === "opp" ? 0.84 : 1;

      if (isHoldNote(note)) {
        const headX = note.hit ? laneX(note.lane) : place.x;
        const headY = note.hit ? updateLayoutState(t).currentY : place.y;
        drawSustain(note, headX, headY, place.tailX, place.tailY, t, alpha * (note.hit ? 0.94 : 1));
      }
      if (note.hit && isHoldNote(note) && t > note.time) {
        continue;
      }
      drawGem(note.lane, place.x, place.y, scale, alpha, t);
    }
  };

  window.brDrawOverlays = function() {
    if (state.selectedSong !== "brokenReality") {
      return;
    }
    const t = state.playing ? songTime() : Number(getFixState().renderTime || 0);
    const attackFx = attackVisualState(t);
    const blackout = brokenRealityBlackoutAlphaAt(t);
    const soulDuet = t >= soulPhaseStart && t < soulPhaseEnd;
    const bars = clamp(Math.max(Number(state.br?.bars || 0), attackFx.barsBoost), 0, 1.2);
    const vignette = clamp((Number(state.br?.vignette || 0.24) * 0.9) + attackFx.vignetteBoost + blackout * 0.26, 0, 1);
    const rawSaturation = clamp(Number(state.br?.saturation || 1), 0, 1);
    const saturation = 0.72 + rawSaturation * 0.28;
    const bloom = Number(state.br?.bloom || 1);

    drawCineFlashOverlays(t);

    if (bars > 0.001) {
      const barH = canvas.height * 0.18 * Math.min(1.05, bars);
      ctx.save();
      ctx.fillStyle = "rgba(0,0,0,0.96)";
      ctx.fillRect(0, 0, canvas.width, barH);
      ctx.fillRect(0, canvas.height - barH, canvas.width, barH);
      ctx.restore();
    }

    if (vignette > 0.001) {
      const center = ctx.createRadialGradient(
        canvas.width * 0.5,
        canvas.height * 0.52,
        canvas.height * 0.08,
        canvas.width * 0.5,
        canvas.height * 0.52,
        canvas.height * 0.92
      );
      center.addColorStop(0, "rgba(0,0,0,0)");
      center.addColorStop(0.58, "rgba(8,4,20,0)");
      center.addColorStop(1, "rgba(0,0,0," + (vignette * 0.92).toFixed(3) + ")");
      ctx.save();
      ctx.fillStyle = center;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
    }

    if (saturation < 0.98) {
      const desat = clamp(1 - saturation, 0, 1);
      ctx.save();
      ctx.globalCompositeOperation = "multiply";
      ctx.fillStyle = "rgba(90,74,120," + (desat * 0.34).toFixed(3) + ")";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      ctx.fillStyle = "rgba(208,198,255," + (desat * 0.1).toFixed(3) + ")";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
    }

    if (bloom > 1.02) {
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      ctx.fillStyle = "rgba(255,245,255," + Math.min(0.18, (bloom - 1) * 0.26).toFixed(3) + ")";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
    }

    if (attackFx.noiseAlpha > 0.001) {
      ctx.save();
      ctx.globalAlpha = attackFx.noiseAlpha;
      for (let i = 0; i < 22; i++) {
        const y = ((i * 41) + performance.now() * 0.18) % canvas.height;
        const h = 6 + ((i * 13) % 14);
        ctx.fillStyle = i % 2 ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.42)";
        ctx.fillRect(0, y, canvas.width, h);
      }
      ctx.restore();
    }

    if (attackFx.chromaAlpha > 0.001) {
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      ctx.fillStyle = "rgba(255,48,72," + (attackFx.chromaAlpha * 0.22).toFixed(3) + ")";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "rgba(90,140,255," + (attackFx.chromaAlpha * 0.18).toFixed(3) + ")";
      ctx.fillRect(2, 0, canvas.width, canvas.height);
      ctx.restore();
    }

    const blackoutOverlayAlpha = soulDuet ? 0 : blackout * 0.98;
    if (attackFx.darkAlpha > 0.001 || blackoutOverlayAlpha > 0.001) {
      ctx.save();
      ctx.fillStyle = "rgba(0,0,0," + clamp(attackFx.darkAlpha + blackoutOverlayAlpha, 0, 1).toFixed(3) + ")";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
    }

    if (attackFx.flashAlpha > 0.001) {
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      ctx.fillStyle = "rgba(255,255,255," + attackFx.flashAlpha.toFixed(3) + ")";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
    }
  };

  renderScene = function(songT, previewT) {
    let liveT = previewT;
    if (state.selectedSong === "brokenReality") {
      const fix = getFixState();
      state.br = state.br || {};
      liveT = state.playing ? songTime() : previewT;
      fix.renderTime = liveT;
      state.br.drainEnabled = currentDrainEnabledAt(liveT);
      state.br.drainAmount = currentDrainAmountAt(liveT);
      state.br.drainTimer = 0;
    }
    let out;
    if (state.selectedSong === "brokenReality") {
      const fix = getFixState();
      out = originalRenderScene(songT, previewT);
      fix.renderTime = liveT;
    } else {
      out = originalRenderScene(songT, previewT);
    }
    if (state.selectedSong === "brokenReality") {
      liveT = state.playing ? songTime() : previewT;
      state.br = state.br || {};
      state.br.drainEnabled = currentDrainEnabledAt(liveT);
      state.br.drainAmount = currentDrainAmountAt(liveT);
    }
    if (state.selectedSong === "brokenReality" && state.playing && firstNoteTime && songTime() >= firstNoteTime - 0.05) {
      hideBrokenRealityOpeningVideo();
    }
    return out;
  };

  refreshHUD = function(t) {
    const out = originalRefreshHUD(t);
    if (state.selectedSong === "brokenReality" && state.playing && ui?.timer) {
      ui.timer.textContent = `${formatTime(brokenRealityLiveTime())} / ${formatTime(state.chart?.totalTime || 0)}`;
      if (t >= soulPhaseStart && t < soulPhaseEnd && ui?.statusText && ui?.statusSub) {
        ui.statusText.textContent = "Soul duet";
        ui.statusSub.textContent = "BF Soul and GF Soul take over the hall before Sans returns.";
      }
    }
    return out;
  };

  if (originalFinish) {
    finish = function(failed = false) {
      if (state.selectedSong === "brokenReality" && !failed) {
        const fix = getFixState();
        if (fix.endingActive) {
          return;
        }
        if (!fix.endingDone) {
          fix.endingActive = true;
          state.playing = false;
          try {
            state.audio?.inst3?.pause();
            state.audio?.voices3a?.pause();
            state.audio?.voices3b?.pause();
          } catch {}
          hideBrokenRealityOpeningVideo();
          playEndingCutscene(state.br?.didDamage ? "uprising" : "youAre", () => {
            fix.endingActive = false;
            fix.endingDone = true;
            originalFinish(false);
          });
          return;
        }
      }
      return originalFinish(failed);
    };
  }

  setInterval(() => {
    if (state.selectedSong === "brokenReality" && state.playing && ui?.timer) {
      ui.timer.textContent = `${formatTime(brokenRealityLiveTime())} / ${formatTime(state.chart?.totalTime || 0)}`;
    }
  }, 100);
})();





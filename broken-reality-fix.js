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
  const originalFinish = typeof finish === "function" ? finish : null;
  const SOUL = window.BROKEN_REALITY_SOUL_DATA || {};
  const baseLaneShift = 36;
  const layoutBaseY = originalReceptorY() - 8;

  if (typeof window.brDrawOverlays !== "function") {
    window.brDrawOverlays = function() {};
  }

  const stageImages = {};
  const charImages = {};
  const noteImages = {};
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
    alpha: 0.18 + seededUnit(i * 1.07 + 0.29) * 0.42
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

  function findEventTime(name, paramIndex, value, fallback) {
    const match = (BR.events || []).find(event => {
      if (event.name !== name) {
        return false;
      }
      return String(event.params?.[paramIndex] || "") === value;
    });
    return Number(match?.time ?? fallback ?? 0);
  }

  const redSkinTime = findEventTime("Change Strum Skin", 0, "br_red", 144);
  const papyrusDuetStart = 227.666667;
  const papyrusDuetEnd = 255.666667;
  const finalPapyrusDuetStart = Number((BR.chart?.notes || []).find(note => note.character === "phantom_paps_br" && Number(note.time || 0) >= 400)?.time || 408.166667);
  const soulPhaseStart = 342.666667;
  const soulPhaseEnd = 394.666667;
  const manualDrainFixStart = 0;
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
    sans: { x: 0.838, y: 0.93, scale: 0.235 },
    sansAlt: { x: 0.838, y: 0.93, scale: 0.235 },
    papyrus: { x: 0.828, y: 0.898, scale: 0.242 },
    papyrusBody: { x: 0.83, y: 0.936, scale: 0.242 },
    papyrusHead: { x: 0.826, y: 0.902, scale: 0.228 },
    boyfriend: { x: 0.288, y: 0.962, scale: 0.255 },
    boyfriendRed: { x: 0.284, y: 0.965, scale: 0.272 },
    bfSoul: { x: 0.288, y: 0.986, scale: 0.17 },
    gfSoul: { x: 0.816, y: 0.988, scale: 0.145 }
  };

  const SOUL_DUET_LAYOUT = {
    bfSoul: { x: 0.474, y: 0.942, scale: 0.226 },
    gfSoul: { x: 0.515, y: 0.708, scale: 0.184 }
  };

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
        endingDone: false
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

  function isSansDrainPackId(id) {
    return id === "sans" || id === "sansAlt";
  }

  function activeSansHoldDrain(t) {
    if (!state.chart?.notes) {
      return false;
    }
    for (const note of state.chart.notes) {
      if (note.side !== "opp") {
        continue;
      }
      const character = String(note.character || "");
      if (character !== "sans_br" && character !== "sans_br_alt") {
        continue;
      }
      if (!isHoldNote(note) || !note.hit || note.holdDone) {
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
      const character = String(note.character || "");
      if (character !== "sans_br" && character !== "sans_br_alt") {
        continue;
      }
      if (isHoldNote(note) || !note.hit) {
        continue;
      }
      if (t >= note.time - 0.035 && t <= note.time + 0.18) {
        return true;
      }
    }
    return false;
  }

  function currentSansDrainActive(t) {
    const pack = currentPack("opp", t);
    if (!pack?.def || !isSansDrainPackId(pack.id)) {
      return false;
    }
    const pose = state.poses?.sans;
    if (pose && pose.kind !== "miss") {
      const age = performance.now() / 1000 - Number(pose.time || -10);
      const duration = animDuration(pack.def, poseAnimName(pose.lane), 0.15, 0.65);
      if (age >= 0 && age <= duration) {
        return true;
      }
    }
    return activeSansHoldDrain(t) || activeSansTapDrain(t);
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
    if (t < manualDrainFixStart || !state.br.drainEnabled || !state.br.sansDrainActive) {
      return;
    }
    const drainStep = 0.05 * (state.br.drainAmount * (state.br.didDamage ? 0.65 : 1)) * dt;
    state.health = clamp(state.health - drainStep, 0.25, 1);
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
    return (t >= papyrusDuetStart && t < papyrusDuetEnd) || t >= finalPapyrusDuetStart;
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
    const fw = (frame.rotated ? frame.h : frame.w) * scale;
    const fh = (frame.rotated ? frame.w : frame.h) * scale;
    const dx = -fw / 2;
    const dy = -fh;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    if (flipX) ctx.scale(-1, 1);
    drawAtlasSub(image, frame, dx, dy, scale);
    ctx.restore();
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
    let x = canvas.width * layout.x - offsetX + (shadow ? 16 : 0);
    let y = canvas.height * layout.y - offsetY + (shadow ? 24 : 0);
    const flipX = kind === "player" ? !info.pack.def.flipX : !!info.pack.def.flipX;
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
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = Math.min(0.9, 0.42 + boost * 0.24);
    ctx.drawImage(stageImages.light, rect.x, rect.y, rect.w, rect.h);
    ctx.filter = "blur(" + (22 + boost * 24).toFixed(2) + "px) brightness(" + (1.95 + boost * 0.45).toFixed(2) + ")";
    ctx.globalAlpha = Math.min(0.68, 0.26 + boost * 0.16);
    ctx.drawImage(stageImages.light, rect.x, rect.y, rect.w, rect.h);
    ctx.filter = "none";

    for (const beam of HALL_BEAMS) {
      const cx = rect.x + rect.w * beam.x;
      const beamW = rect.w * beam.width;
      const topY = rect.y + rect.h * 0.18;
      const beamBottom = rect.y + rect.h * 0.965;
      const pulse = 0.94 + Math.sin(t * 0.92 + beam.x * 8.4) * 0.06;

      const inner = ctx.createRadialGradient(cx, topY + beamW * 0.04, beamW * 0.04, cx, topY + beamW * 0.1, beamW * 1.14);
      inner.addColorStop(0, "rgba(255,253,255," + Math.min(0.98, 0.9 * beam.intensity * pulse) + ")");
      inner.addColorStop(0.16, "rgba(250,242,255," + Math.min(0.9, 0.7 * beam.intensity * pulse) + ")");
      inner.addColorStop(0.46, "rgba(204,184,255," + Math.min(0.62, 0.36 * beam.intensity * pulse) + ")");
      inner.addColorStop(1, "rgba(110,76,205,0)");
      ctx.fillStyle = inner;
      ctx.fillRect(cx - beamW * 1.42, topY - beamW * 0.68, beamW * 2.84, beamW * 2.56);

      const aura = ctx.createRadialGradient(cx, topY + beamW * 0.12, beamW * 0.24, cx, topY + beamW * 0.12, beamW * 1.92);
      aura.addColorStop(0, "rgba(222,202,255," + Math.min(0.38, 0.22 * beam.intensity * pulse) + ")");
      aura.addColorStop(0.55, "rgba(150,118,235," + Math.min(0.26, 0.12 * beam.intensity * pulse) + ")");
      aura.addColorStop(1, "rgba(84,54,148,0)");
      ctx.fillStyle = aura;
      ctx.fillRect(cx - beamW * 2.1, topY - beamW * 1.05, beamW * 4.2, beamW * 3.1);

      const shaft = ctx.createLinearGradient(0, topY, 0, beamBottom);
      shaft.addColorStop(0, "rgba(255,248,255," + Math.min(0.62, 0.34 * beam.intensity * boost) + ")");
      shaft.addColorStop(0.18, "rgba(244,231,255," + Math.min(0.4, 0.2 * beam.intensity * boost) + ")");
      shaft.addColorStop(0.54, "rgba(184,156,245," + Math.min(0.2, 0.1 * beam.intensity * boost) + ")");
      shaft.addColorStop(1, "rgba(120,90,160,0)");
      ctx.fillStyle = shaft;
      ctx.fillRect(cx - beamW * 0.84, topY, beamW * 1.68, beamBottom - topY);
    }
    ctx.restore();
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
      const beamW = rect.w * beam.width;
      const cx = rect.x + rect.w * beam.x;
      const y = topY + ((mote.offsetY * travelH) + t * (18 + mote.speed * 24)) % travelH;
      const x = cx
        + Math.sin(t * (0.34 + mote.sway * 0.18) + mote.phase + y * 0.018) * beamW * 0.2
        + (mote.offsetX - 0.5) * beamW * 0.48;
      const pulse = 0.6 + 0.4 * Math.sin(t * (0.8 + mote.speed * 0.22) + mote.phase);
      const alpha = Math.min(0.22, (0.02 + mote.alpha * 0.11 * pulse) * (0.82 + boost * 0.14));
      const size = mote.size * (0.82 + pulse * 0.32);
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
    const scrollSpeed = Number(state.br?.scrollSpeed || 1);
    const travel = (note.time - t) * 360 * scrollSpeed;
    const baseX = laneX(note.lane);
    const x = baseX + travel * fix.currentXMult;
    const y = fix.currentY + travel * fix.currentYMult;
    const tailTravel = (holdEndTime(note) - t) * 360 * scrollSpeed;
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

  laneX = function(i) {
    if (state.selectedSong === "brokenReality") {
      const swapped = i < 4 ? i + 4 : i - 4;
      return originalLaneX(swapped) - baseLaneShift;
    }
    return originalLaneX(i);
  };

  receptorY = function() {
    if (state.selectedSong === "brokenReality") {
      return updateLayoutState(songTime()).currentY;
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

    updateLayoutState(t);
    const pack = currentPack("opp", t);
    const playerPack = currentPack("player", t);
    const soulDuet = t >= soulPhaseStart && t < soulPhaseEnd && (pack.id === "gfSoul" || playerPack.id === "bfSoul");
    if (soulDuet) {
      drawCharacterReflection("opp", t, 0.28, packById("gfSoul", "gfSoul"), SOUL_DUET_LAYOUT.gfSoul);
      drawCharacterReflection("player", t, 0.34, packById("bfSoul", "bfSoul"), SOUL_DUET_LAYOUT.bfSoul);
      drawCharacter("opp", t, 0.22, true, packById("gfSoul", "gfSoul"), SOUL_DUET_LAYOUT.gfSoul);
      drawCharacter("player", t, 0.24, true, packById("bfSoul", "bfSoul"), SOUL_DUET_LAYOUT.bfSoul);
      drawCharacter("opp", t, 1, false, packById("gfSoul", "gfSoul"), SOUL_DUET_LAYOUT.gfSoul);
      drawCharacter("player", t, 1, false, packById("bfSoul", "bfSoul"), SOUL_DUET_LAYOUT.bfSoul);
      return;
    }

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

    drawCharacterReflection("opp", t, usePapyrusStage ? 0.26 : 0.42);
    if (papyrusDuetActiveAt(t)) {
      drawCharacterReflection("opp", t, 0.22, packById("papyrusBody", "papyrus"), STAGE_LAYOUT.papyrusBody);
    }
    drawCharacterReflection("player", t, usePapyrusStage ? 0.34 : 0.52);

    drawCharacter("opp", t, 0.22, true);
    if (papyrusDuetActiveAt(t)) {
      drawCharacter("opp", t, 0.18, true, packById("papyrusBody", "papyrus"), STAGE_LAYOUT.papyrusBody);
    }
    drawCharacter("player", t, 0.2, true);
    drawCharacter("opp", t, 1, false);
    if (papyrusDuetActiveAt(t)) {
      drawCharacter("opp", t, 1, false, packById("papyrusBody", "papyrus"), STAGE_LAYOUT.papyrusBody);
    }
    drawCharacter("player", t, 1, false);

    if (ready(fg)) {
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

  renderScene = function(songT, previewT) {
    let liveT = previewT;
    if (state.selectedSong === "brokenReality") {
      state.br = state.br || {};
      liveT = state.playing ? songTime() : previewT;
      state.br.drainEnabled = currentDrainEnabledAt(liveT);
      state.br.drainAmount = currentDrainAmountAt(liveT);
      state.br.drainTimer = 0;
    }
    const out = originalRenderScene(songT, previewT);
    if (state.selectedSong === "brokenReality") {
      liveT = state.playing ? songTime() : previewT;
      state.br = state.br || {};
      state.br.drainEnabled = currentDrainEnabledAt(liveT);
      state.br.drainAmount = currentDrainAmountAt(liveT);
      stepManualDrain(liveT);
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




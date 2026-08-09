(() => {
  try {
    const DATA = window.VSMATT_ORIGINAL_DATA;
    if (!DATA || typeof state === "undefined") return;

    const modeState = {
      images: {},
      noteAtlases: {},
      notePaletteReady: false,
      initialized: false,
      eventSource: null,
      eventIndex: {},
      captureCanvas: document.createElement("canvas"),
      gameCanvas: document.createElement("canvas"),
      hudCanvas: document.createElement("canvas"),
      cameraFollowX: null,
      cameraFollowY: null,
      cameraTargetX: null,
      cameraTargetY: null,
      cameraZoom: DATA.stage.defaultZoom || 0.7,
      hudZoom: 1,
      cameraTime: null,
      cameraSectionIndex: -1,
      cameraZooming: false,
      cameraSpeed: DATA.stage.cameraSpeed || 1,
      cameraOffsetX: 0,
      cameraOffsetY: 0,
      cameraProcessedNotes: new WeakSet(),
      midcutscene: null,
      midcutscenePrimed: false
    };
    const captureCtx = modeState.captureCanvas.getContext("2d");
    const gameCtx = modeState.gameCanvas.getContext("2d");
    const hudCtx = modeState.hudCanvas.getContext("2d");
    const hudRoot = document.querySelector(".hud");
    const judgmentsRoot = document.getElementById("judgments");

    function isOriginalVsMatt() {
      return state.selectedSong === "sporting" || state.selectedSong === "boxingMatch";
    }

    function clamp01(value) {
      return Math.max(0, Math.min(1, Number(value) || 0));
    }

    function lerp(a, b, amount) {
      return a + (b - a) * amount;
    }

    function easeValue(value, ease) {
      const p = clamp01(value);
      if (ease === "cubeIn") return p * p * p;
      if (ease === "cubeOut") return 1 - Math.pow(1 - p, 3);
      if (ease === "cubeInOut") {
        return p < 0.5
          ? 4 * p * p * p
          : 1 - Math.pow(-2 * p + 2, 3) / 2;
      }
      return p;
    }

    function syncCanvasSize(target, context) {
      if (target.width !== canvas.width || target.height !== canvas.height) {
        target.width = canvas.width;
        target.height = canvas.height;
      }
      if (typeof setRenderQuality === "function") setRenderQuality(context);
    }

    function captureMain() {
      syncCanvasSize(modeState.captureCanvas, captureCtx);
      captureCtx.clearRect(0, 0, canvas.width, canvas.height);
      captureCtx.drawImage(canvas, 0, 0, canvas.width, canvas.height);
      return modeState.captureCanvas;
    }

    function saveMainTo(target, context) {
      syncCanvasSize(target, context);
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(canvas, 0, 0, canvas.width, canvas.height);
    }

    function initImages() {
      if (modeState.initialized) return;
      modeState.initialized = true;
      const sources = {
        bg: DATA.stage.images.bg,
        crowd1: DATA.stage.images.crowd1,
        crowd2: DATA.stage.images.crowd2,
        crowd3: DATA.stage.images.crowd3,
        ring: DATA.stage.images.ring,
        matt: DATA.sprites.matt.image,
        boyfriend: DATA.sprites.boyfriend.image,
        sportingMatt: DATA.sprites.sportingMatt.image,
        sportingBoyfriend: DATA.sprites.sportingBoyfriend.image,
        gf: DATA.sprites.gf.image,
        notes: DATA.notes.image
      };
      Object.entries(sources).forEach(([key, source]) => {
        const image = new Image();
        if (key === "notes") {
          image.addEventListener("load", buildCombatNoteAtlases, { once: true });
        }
        image.src = source;
        modeState.images[key] = image;
      });
    }

    function imageReady(image) {
      return !!(image && image.complete && image.naturalWidth);
    }

    function originalImagesReady() {
      initImages();
      if (imageReady(modeState.images.notes) && !modeState.notePaletteReady) {
        buildCombatNoteAtlases();
      }
      return Object.values(modeState.images).every(imageReady);
    }

    function buildCombatNoteAtlases() {
      const source = modeState.images.notes;
      if (!imageReady(source) || modeState.notePaletteReady) return;

      for (const [direction, palette] of Object.entries(DATA.notes.palette || {})) {
        const recolored = document.createElement("canvas");
        recolored.width = source.naturalWidth;
        recolored.height = source.naturalHeight;
        const recolorCtx = recolored.getContext("2d", { willReadFrequently: true });
        recolorCtx.drawImage(source, 0, 0);
        const pixels = recolorCtx.getImageData(0, 0, recolored.width, recolored.height);
        const data = pixels.data;
        const [rr, rg, rb] = palette.r;
        const [gr, gg, gb] = palette.g;
        const [br, bg, bb] = palette.b;
        for (let index = 0; index < data.length; index += 4) {
          const red = data[index];
          const green = data[index + 1];
          const blue = data[index + 2];
          data[index] = Math.min(255, (red * rr + green * gr + blue * br) / 255);
          data[index + 1] = Math.min(255, (red * rg + green * gg + blue * bg) / 255);
          data[index + 2] = Math.min(255, (red * rb + green * gb + blue * bb) / 255);
        }
        recolorCtx.putImageData(pixels, 0, 0);
        modeState.noteAtlases[direction] = recolored;
      }
      modeState.notePaletteReady = true;
      canvas.dataset.vsMattNotePalette = "psych-rgb";
    }

    function combatNoteImage(direction, colored = true) {
      if (colored && modeState.noteAtlases[direction]) {
        return modeState.noteAtlases[direction];
      }
      return modeState.images.notes;
    }

    function songMeta() {
      return DATA.songs[state.selectedSong] || DATA.songs.sporting;
    }

    function stepAtTime(time) {
      return Math.max(0, Number(time) || 0) / (songMeta().spb / 4);
    }

    function rebuildEventIndex() {
      const source = state.chart?.shaderEvents || [];
      if (modeState.eventSource === source) return;
      modeState.eventSource = source;
      modeState.eventIndex = {};
      source.forEach(event => {
        const key = `${event.name}:${event.property}`;
        (modeState.eventIndex[key] ||= []).push(event);
      });
      Object.values(modeState.eventIndex).forEach(events => {
        events.sort((a, b) => a.step - b.step || (a.type === "set" ? -1 : 1));
      });
    }

    function shaderValue(name, property, step, fallback) {
      rebuildEventIndex();
      const events = modeState.eventIndex[`${name}:${property}`] || [];
      let value = fallback;
      for (const event of events) {
        if (event.step > step) break;
        const target = Number(event.value);
        if (!Number.isFinite(target)) continue;
        if (event.type === "set") {
          value = target;
          continue;
        }
        const duration = Math.max(0, Number(event.duration) || 0);
        const start = Number.isFinite(Number(event.startValue))
          ? Number(event.startValue)
          : value;
        if (duration > 0 && step < event.step + duration) {
          value = lerp(
            start,
            target,
            easeValue((step - event.step) / duration, event.ease)
          );
        } else {
          value = target;
        }
      }
      return value;
    }

    function shaderSnapshot(time) {
      const step = stepAtTime(time);
      return {
        step,
        greyscale: clamp01(shaderValue("greyscale", "strength", step, 0)),
        blur: Math.max(0, shaderValue("blur", "strength", step, 0)),
        bloomEffect: Math.max(0, shaderValue("bloom", "effect", step, 0)),
        bloomStrength: Math.max(0, shaderValue("bloom", "strength", step, 0)),
        speed: Math.max(0, shaderValue("speed", "effect", step, 0)),
        bars: clamp01(shaderValue("bars", "effect", step, 0)),
        colorFillFade: clamp01(shaderValue("ColorFill", "fade", step, 1)),
        mirror: {
          zoom: shaderValue("mirror", "zoom", step, 1),
          angle: shaderValue("mirror", "angle", step, 0),
          x: shaderValue("mirror", "x", step, 0),
          y: shaderValue("mirror", "y", step, 0),
          warp: shaderValue("mirror", "warp", step, 0)
        },
        mirrorOther: {
          zoom: shaderValue("mirrorOther", "zoom", step, 1),
          angle: shaderValue("mirrorOther", "angle", step, 0),
          x: shaderValue("mirrorOther", "x", step, 0),
          y: shaderValue("mirrorOther", "y", step, 0),
          warp: shaderValue("mirrorOther", "warp", step, 0)
        },
        mirrorHud: {
          zoom: shaderValue("mirrorHud", "zoom", step, 1),
          angle: shaderValue("mirrorHud", "angle", step, 0),
          x: shaderValue("mirrorHud", "x", step, 0),
          y: shaderValue("mirrorHud", "y", step, 0),
          warp: shaderValue("mirrorHud", "warp", step, 0)
        }
      };
    }

    function mirrorAmount(effect) {
      return Math.max(
        Math.abs(1 - effect.zoom),
        Math.abs(effect.angle) / 180,
        Math.abs(effect.x) * 0.03,
        Math.abs(effect.y) * 0.03,
        Math.abs(effect.warp) * 1.5
      );
    }

    function applyMirror(effect) {
      const amount = mirrorAmount(effect);
      if (amount <= 0.001) return;
      const source = captureMain();
      const usedWebGl = window.FNF_WEBGL?.drawCameraPass(source, {
        zoom: Math.max(0.35, Math.min(2.4, effect.zoom || 1)),
        angle: -effect.angle,
        offsetX: Math.max(-1.5, Math.min(1.5, -effect.x * 0.03)),
        offsetY: Math.max(-1.5, Math.min(1.5, -effect.y * 0.03)),
        warp: Math.max(-1.2, Math.min(1.2, effect.warp)),
        mirror: Math.min(1.4, amount + 0.02)
      });
      if (usedWebGl) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate(-effect.angle * Math.PI / 180);
      ctx.scale(effect.zoom || 1, effect.zoom || 1);
      ctx.translate(
        -canvas.width / 2 - effect.x * 12,
        -canvas.height / 2 - effect.y * 12
      );
      ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
      ctx.restore();
    }

    function applyBaseShaders(effect) {
      const bloom = clamp01(effect.bloomEffect * effect.bloomStrength / 9);
      const needsFilter =
        effect.greyscale > 0.001 ||
        effect.blur > 0.001 ||
        bloom > 0.001;
      if (needsFilter) {
        const source = captureMain();
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.save();
        ctx.filter =
          `blur(${Math.min(8, effect.blur * 1.15).toFixed(2)}px) ` +
          `grayscale(${effect.greyscale.toFixed(4)}) ` +
          `contrast(${(1 + bloom * 0.22).toFixed(3)}) ` +
          `saturate(${(1 + bloom * 0.16 - effect.greyscale * 0.12).toFixed(3)})`;
        ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
        ctx.restore();
      }
      if (bloom > 0.001) {
        const source = captureMain();
        ctx.save();
        ctx.globalCompositeOperation = "screen";
        ctx.globalAlpha = Math.min(0.5, 0.1 + bloom * 0.36);
        ctx.filter = `blur(${(4 + bloom * 13).toFixed(2)}px) brightness(${(1.05 + bloom * 0.5).toFixed(2)})`;
        ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
        ctx.globalAlpha = Math.min(0.24, 0.04 + bloom * 0.16);
        ctx.filter = `blur(${(13 + bloom * 22).toFixed(2)}px)`;
        ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
        ctx.restore();
      }
    }

    function applyColorFill(fade) {
      if (fade >= 0.999) return;
      const source = captureMain();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      ctx.filter = `brightness(${fade.toFixed(4)})`;
      ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
      ctx.restore();
    }

    function applyLayerShaders(time, layer) {
      if (window.PERFORMANCE_MODE) return;
      const effect = shaderSnapshot(time);
      const primaryMirror = layer === "game" ? effect.mirror : effect.mirrorHud;
      const secondaryMirror = layer === "game"
        ? effect.mirrorOther
        : { zoom: 1, angle: 0, x: 0, y: 0, warp: 0 };
      const source = captureMain();
      const usedWebGl = window.FNF_WEBGL?.drawVsMattPostStack(source, {
        time,
        greyscale: effect.greyscale,
        blur: effect.blur,
        bloomEffect: effect.bloomEffect,
        bloomStrength: effect.bloomStrength,
        speed: layer === "game" ? effect.speed : 0,
        bars: layer === "game" ? effect.bars : 0,
        colorFillFade: effect.colorFillFade,
        mirror: primaryMirror,
        mirrorOther: secondaryMirror
      });
      canvas.dataset[layer === "game" ? "vsMattGameRenderer" : "vsMattHudRenderer"] =
        usedWebGl ? "webgl" : "canvas-fallback";
      if (usedWebGl) return;

      applyBaseShaders(effect);
      if (layer === "game") {
        applyMirror(effect.mirror);
        applyMirror(effect.mirrorOther);
        if (effect.speed > 0.001) {
          window.FNF_WEBGL?.drawSpeedLines(
            Math.min(0.25, effect.speed),
            time,
            { centerX: 0.5, centerY: 0.52, alpha: Math.min(1, 0.35 + effect.speed) }
          );
        }
        if (effect.bars > 0.001) {
          const height = canvas.height * Math.min(0.49, effect.bars);
          ctx.save();
          ctx.fillStyle = "#000";
          ctx.fillRect(0, 0, canvas.width, height);
          ctx.fillRect(0, canvas.height - height, canvas.width, height);
          ctx.restore();
        }
      } else {
        applyMirror(effect.mirrorHud);
      }
      applyColorFill(effect.colorFillFade);
    }

    function spriteKeyForKind(kind) {
      if (state.selectedSong === "sporting") {
        if (kind === "matt") return "sportingMatt";
        if (kind === "boyfriend") return "sportingBoyfriend";
      }
      return kind;
    }

    function characterSprite(kind) {
      return DATA.sprites[spriteKeyForKind(kind)];
    }

    function sourceAnimation(kind, animationName) {
      return characterSprite(kind)?.animations?.[animationName] || null;
    }

    function currentCharacterAnimation(kind, time) {
      if (kind === "gf") {
        const beat = Math.floor(time / songMeta().spb);
        const animation = sourceAnimation("gf", beat % 2 ? "danceRight" : "danceLeft");
        return { animation, elapsed: time, loop: true };
      }

      const poseKey = kind === "boyfriend" ? "player" : "matt";
      const pose = state.poses[poseKey] || { lane: 1, time: -10, kind: "hit" };
      const held = typeof activeHoldNoteForCharacter === "function"
        ? activeHoldNoteForCharacter(poseKey, time)
        : null;
      const direction = sportingLaneKey((held ? held.lane : pose.lane) || 0);
      const age = held
        ? Math.max(0, time - held.time)
        : performance.now() / 1000 - pose.time;
      const missName = `${direction}Miss`;
      const activeName =
        !held && pose.kind === "miss" && sourceAnimation(kind, missName)
          ? missName
          : direction;
      const active = sourceAnimation(kind, activeName);
      if (active && age >= 0 && age < sportingAnimDuration(
        active.frames,
        active.fps || 24,
        0.18,
        0.76
      )) {
        return { animation: active, elapsed: age, loop: false };
      }
      const idle = sourceAnimation(kind, "idle");
      return { animation: idle, elapsed: time, loop: true };
    }

    function drawOriginalCharacter(kind, x, y, scale, time) {
      const current = currentCharacterAnimation(kind, time);
      const animation = current.animation;
      if (!animation?.frames?.length) return;
      const frame = frameFromList(
        animation.frames,
        current.elapsed,
        animation.fps || 24,
        current.loop || animation.loop
      );
      if (!frame) return;
      const spriteKey = spriteKeyForKind(kind);
      const sprite = DATA.sprites[spriteKey];
      const idle = sourceAnimation(kind, "idle") || animation;
      const referenceFrame = idle.frames?.[0] || frame;
      const [referenceOffsetX = 0, referenceOffsetY = 0] = idle.offsets || [];
      const [offsetX = 0, offsetY = 0] = animation.offsets || [];
      const spriteScale = scale * (sprite.scale || 1);
      const frameWidth = frame.fw || frame.w;
      const frameHeight = frame.fh || frame.h;
      const referenceWidth = referenceFrame.fw || referenceFrame.w;
      const referenceHeight = referenceFrame.fh || referenceFrame.h;
      const offsetDirection = sprite.flipX ? -1 : 1;
      const anchoredX = x + (
        (frameWidth - referenceWidth) / 2 -
        (offsetX - referenceOffsetX) * offsetDirection
      ) * spriteScale;
      const anchoredY = y + (
        frameHeight - referenceHeight -
        (offsetY - referenceOffsetY)
      ) * spriteScale;
      drawAtlasFrame(
        modeState.images[spriteKey],
        frame,
        anchoredX,
        anchoredY,
        spriteScale,
        1,
        !!sprite.flipX
      );
    }

    function drawCombatReceptors(time) {
      const y = receptorY();
      ctx.save();
      ctx.strokeStyle = "rgba(255,255,255,0.1)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(canvas.width * 0.5, 72);
      ctx.lineTo(canvas.width * 0.5, 452);
      ctx.stroke();
      ctx.restore();

      for (let lane = 0; lane < 8; lane++) {
        const direction = sportingLaneKey(lane);
        const x = laneX(lane);
        const hitAge = performance.now() / 1000 - state.receptorFx[lane].time;
        let frame = DATA.notes.static[direction];
        let scale = 0.72;
        let alpha = lane < 4 ? 0.9 : 1;
        if (hitAge >= 0 && hitAge < 0.16) {
          frame = frameFromList(DATA.notes.confirm[direction], hitAge, 26, false) || frame;
          scale = 0.78 + (0.16 - hitAge) * 0.9;
          alpha = 1;
        } else if (state.keysDown[lane]) {
          frame = frameFromList(DATA.notes.press[direction], time, 24, true) || frame;
        }
        if (frame) {
          drawAtlasCentered(
            combatNoteImage(direction),
            frame,
            x,
            y,
            scale,
            alpha
          );
        }

        ctx.save();
        ctx.strokeStyle = "rgba(255,255,255,0.06)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x, receptorGuideStartY(y));
        ctx.lineTo(x, receptorGuideEndY());
        ctx.stroke();
        ctx.restore();
      }
    }

    function drawCombatSustain(note, x, topY, tailY, alpha) {
      const direction = sportingLaneKey(note.lane);
      const hold = DATA.notes.hold[direction];
      if (!hold?.piece || !hold?.end) return;
      const noteImage = combatNoteImage(direction);
      const scale = 0.72;
      const upperY = Math.min(topY, tailY);
      const lowerY = Math.max(topY, tailY);
      const endHeight = (hold.end.fh || hold.end.h) * scale;
      const bodyWidth = (hold.piece.fw || hold.piece.w) * scale;
      const bodyTop = Math.max(-80, upperY + endHeight * 0.42);
      const bodyBottom = Math.min(canvas.height + 80, lowerY - endHeight * 0.42);
      if (bodyBottom > bodyTop) {
        drawAtlasStretchVertical(
          noteImage,
          hold.piece,
          x,
          bodyTop,
          bodyWidth,
          bodyBottom - bodyTop,
          alpha * 0.9
        );
      }
      drawAtlasCentered(noteImage, hold.end, x, tailY, scale, alpha);
    }

    function drawCombatNotes(time) {
      if (!state.chart) return;
      for (const note of state.chart.notes) {
        if (note.played && note.hit && (!isHoldNote(note) || note.holdDone)) continue;
        if (
          note.judged &&
          note.side !== "opp" &&
          (!isHoldNote(note) || note.holdDone || !note.hit)
        ) continue;
        const diff = note.time - time;
        const y = noteYFromDiff(diff, state.currentSong.scroll);
        const tailY = noteYFromDiff(holdEndTime(note) - time, state.currentSong.scroll);
        if (notePastViewport(y, tailY)) continue;
        if (noteFutureViewport(y, tailY)) break;

        const x = laneX(note.lane);
        const alpha = note.side === "opp" ? 0.84 : 1;
        if (isHoldNote(note)) {
          drawCombatSustain(
            note,
            x,
            note.hit ? receptorY() : y,
            tailY,
            alpha * (note.hit ? 0.94 : 1)
          );
        }
        if (note.hit && isHoldNote(note) && time > note.time) continue;

        const frame = DATA.notes.gem[sportingLaneKey(note.lane)];
        if (!frame) continue;
        const noteScale = Math.max(
          0.75,
          Math.min(1.12, 1 - Math.pow(Math.abs(diff), 0.7) * 0.45)
        );
        ctx.save();
        ctx.shadowBlur = 20;
        ctx.shadowColor = COLORS[note.lane];
        drawAtlasCentered(
          combatNoteImage(sportingLaneKey(note.lane)),
          frame,
          x,
          y,
          0.76 * noteScale,
          alpha
        );
        ctx.restore();
      }
    }

    function sourceSectionAtTime(time) {
      const timeline = state.chart?.timeline || [];
      if (!timeline.length) return { section: null, index: -1 };
      const index = timeline.findIndex(section =>
        time >= section.startTime && time < section.endTime
      );
      const resolvedIndex = index >= 0 ? index : Math.max(
        0,
        Math.min(timeline.length - 1, time < timeline[0].startTime ? 0 : timeline.length - 1)
      );
      return { section: timeline[resolvedIndex], index: resolvedIndex };
    }

    function characterReference(kind) {
      const sprite = characterSprite(kind);
      const animation = kind === "gf"
        ? sourceAnimation("gf", "danceLeft")
        : sourceAnimation(kind, "idle");
      const frame = animation?.frames?.[0];
      const stageKey = kind === "matt"
        ? "opponent"
        : kind === "gf" ? "girlfriend" : "boyfriend";
      const stagePosition = DATA.stage.positions[stageKey] || [0, 0];
      return {
        sprite,
        animation,
        frame,
        x: stagePosition[0] + (sprite.position?.[0] || 0),
        y: stagePosition[1] + (sprite.position?.[1] || 0)
      };
    }

    function sourceCameraTarget(section) {
      const gfSection = !!section?.gfSection;
      const mustHitSection = !!section?.mustHitSection;
      const kind = gfSection ? "gf" : mustHitSection ? "boyfriend" : "matt";
      const reference = characterReference(kind);
      const frameWidth =
        reference.sprite.hitbox?.[0] ||
        reference.frame?.fw ||
        reference.frame?.w ||
        0;
      const frameHeight =
        reference.sprite.hitbox?.[1] ||
        reference.frame?.fh ||
        reference.frame?.h ||
        0;
      const characterCamera = reference.sprite.cameraPosition || [0, 0];
      const stageKey = kind === "matt"
        ? "opponent"
        : kind === "gf" ? "girlfriend" : "boyfriend";
      const stageCamera = DATA.stage.cameraOffsets[stageKey] || [0, 0];
      let x = reference.x + frameWidth / 2;
      let y = reference.y + frameHeight / 2;

      if (kind === "matt") {
        x += 150 + characterCamera[0] + stageCamera[0];
        y += -100 + characterCamera[1] + stageCamera[1];
      } else if (kind === "boyfriend") {
        x += -100 - characterCamera[0] + stageCamera[0];
        y += -100 + characterCamera[1] + stageCamera[1];
      } else {
        x += characterCamera[0] + stageCamera[0];
        y += characterCamera[1] + stageCamera[1];
      }
      return { x: x + 0.5, y: y + 0.5, kind };
    }

    function initialCameraCenter() {
      const reference = characterReference("gf");
      const frameWidth = reference.frame?.fw || reference.frame?.w || 0;
      const frameHeight = reference.frame?.fh || reference.frame?.h || 0;
      const characterCamera = reference.sprite.cameraPosition || [0, 0];
      const stageCamera = DATA.stage.cameraOffsets.girlfriend || [0, 0];
      return {
        x: reference.x + frameWidth / 2 + characterCamera[0] + stageCamera[0] + 0.5,
        y: reference.y + frameHeight / 2 + characterCamera[1] + stageCamera[1] + 0.5
      };
    }

    function updateCameraMovementFromHits(focusKind) {
      for (const note of state.chart?.notes || []) {
        if (modeState.cameraProcessedNotes.has(note) || !note.judged) continue;
        modeState.cameraProcessedNotes.add(note);
        if (!note.hit || note.noteType === "No Animation") continue;

        const focusedHit = note.side === "opp"
          ? focusKind === "matt"
          : focusKind !== "matt";
        if (!focusedHit) continue;

        const direction = ((Number(note.lane) % 4) + 4) % 4;
        const displacement = direction % 2 === 1 ? 9 : -9;
        modeState.cameraOffsetX =
          direction === 0 || direction === 3 ? displacement : 0;
        modeState.cameraOffsetY =
          direction === 1 || direction === 2 ? displacement : 0;
        modeState.cameraSpeed = 2;
      }
    }

    function updateOriginalCamera(time) {
      const now = performance.now() / 1000;
      const elapsed = modeState.cameraTime == null
        ? 0
        : Math.max(1 / 240, Math.min(0.08, now - modeState.cameraTime));
      modeState.cameraTime = now;

      const firstOpponentNote = state.chart?.notes?.find(note => note.side === "opp");
      if (firstOpponentNote && time >= firstOpponentNote.time) {
        modeState.cameraZooming = true;
      }

      const { section, index } = sourceSectionAtTime(time);
      const target = sourceCameraTarget(section);
      if (index !== modeState.cameraSectionIndex) {
        modeState.cameraSpeed = 1;
        if (
          modeState.cameraSectionIndex >= 0 &&
          modeState.cameraZooming &&
          modeState.cameraZoom < 1.35
        ) {
          modeState.cameraZoom += 0.015;
          modeState.hudZoom += 0.03;
        }
        modeState.cameraSectionIndex = index;
      }
      updateCameraMovementFromHits(target.kind);

      const defaultZoom = DATA.stage.defaultZoom || 0.7;
      if (elapsed > 0 && modeState.cameraZooming) {
        const decay = Math.exp(-elapsed * 3.125);
        modeState.cameraZoom = lerp(defaultZoom, modeState.cameraZoom, decay);
        modeState.hudZoom = lerp(1, modeState.hudZoom, decay);
      }

      modeState.cameraTargetX = target.x + modeState.cameraOffsetX;
      modeState.cameraTargetY = target.y + modeState.cameraOffsetY;
      if (modeState.cameraFollowX == null || modeState.cameraFollowY == null) {
        const initial = initialCameraCenter();
        modeState.cameraFollowX = initial.x;
        modeState.cameraFollowY = initial.y;
      } else {
        const followAmount =
          1 - Math.exp(-elapsed * 2.4 * modeState.cameraSpeed);
        modeState.cameraFollowX = lerp(
          modeState.cameraFollowX,
          modeState.cameraTargetX,
          followAmount
        );
        modeState.cameraFollowY = lerp(
          modeState.cameraFollowY,
          modeState.cameraTargetY,
          followAmount
        );
      }

      const zoom = Math.max(0.1, modeState.cameraZoom);
      const camera = {
        followX: modeState.cameraFollowX,
        followY: modeState.cameraFollowY,
        scrollX: modeState.cameraFollowX - canvas.width / 2,
        scrollY: modeState.cameraFollowY - canvas.height / 2,
        viewMarginX: canvas.width * (1 - zoom) / 2,
        viewMarginY: canvas.height * (1 - zoom) / 2,
        targetX: modeState.cameraTargetX,
        targetY: modeState.cameraTargetY,
        side: target.kind,
        zoom
      };
      canvas.dataset.vsMattCameraSide = target.kind;
      canvas.dataset.vsMattCameraTarget =
        `${modeState.cameraTargetX.toFixed(2)},${modeState.cameraTargetY.toFixed(2)}`;
      canvas.dataset.vsMattCameraFollow =
        `${camera.followX.toFixed(2)},${camera.followY.toFixed(2)}`;
      canvas.dataset.vsMattCameraZoom = zoom.toFixed(4);
      canvas.dataset.vsMattCameraOffset =
        `${modeState.cameraOffsetX},${modeState.cameraOffsetY}`;
      return camera;
    }

    function drawStageLayer(image, layer, camera) {
      if (!imageReady(image)) return;
      const x =
        (layer.x - camera.scrollX * layer.scroll) * camera.zoom +
        camera.viewMarginX;
      const y =
        (layer.y - camera.scrollY * layer.scroll) * camera.zoom +
        camera.viewMarginY;
      const width = image.naturalWidth * layer.scale * camera.zoom;
      const height = image.naturalHeight * layer.scale * camera.zoom;
      ctx.drawImage(image, x, y, width, height);
    }

    function characterWorldAnchor(kind) {
      const reference = characterReference(kind);
      const frameWidth = reference.frame?.fw || reference.frame?.w || 0;
      const frameHeight = reference.frame?.fh || reference.frame?.h || 0;
      const [offsetX = 0, offsetY = 0] = reference.animation?.offsets || [];
      return {
        x: reference.x - offsetX + frameWidth / 2,
        y: reference.y - offsetY + frameHeight
      };
    }

    function drawWorldCharacter(kind, camera, time) {
      const anchor = characterWorldAnchor(kind);
      const scrollFactor = kind === "gf" ? 0.95 : 1;
      drawOriginalCharacter(
        kind,
        (anchor.x - camera.scrollX * scrollFactor) * camera.zoom +
          camera.viewMarginX,
        (anchor.y - camera.scrollY * scrollFactor) * camera.zoom +
          camera.viewMarginY,
        camera.zoom,
        time
      );
    }

    function drawOriginalStage(time, camera = updateOriginalCamera(time)) {
      if (!originalImagesReady()) return;
      const images = modeState.images;
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      drawStageLayer(images.bg, DATA.stage.layers.bg, camera);
      drawStageLayer(images.crowd1, DATA.stage.layers.crowd1, camera);
      drawStageLayer(images.crowd2, DATA.stage.layers.crowd2, camera);
      drawStageLayer(images.crowd3, DATA.stage.layers.crowd3, camera);
      drawStageLayer(images.ring, DATA.stage.layers.ring, camera);
      ctx.restore();

      drawWorldCharacter("gf", camera, time);
      drawWorldCharacter("matt", camera, time);
      drawWorldCharacter("boyfriend", camera, time);
    }

    function initMidcutscene() {
      if (modeState.midcutscene) return modeState.midcutscene;
      const video = document.createElement("video");
      video.src = DATA.videos.boxingMidcutscene;
      video.preload = "auto";
      video.playsInline = true;
      video.controls = false;
      video.muted = false;
      video.style.cssText =
        "position:absolute;inset:0;width:100%;height:100%;object-fit:cover;" +
        "display:none;pointer-events:none;z-index:12;background:#000;";
      document.getElementById("app")?.appendChild(video);
      modeState.midcutscene = video;
      return video;
    }

    function primeMidcutscene() {
      const video = initMidcutscene();
      if (modeState.midcutscenePrimed) return;
      modeState.midcutscenePrimed = true;
      try {
        const attempt = video.play();
        if (attempt?.then) {
          attempt.then(() => {
            video.pause();
            video.currentTime = 0;
            video.style.display = "none";
          }).catch(() => {
            video.muted = true;
          });
        }
      } catch {
        video.muted = true;
      }
    }

    function resetMidcutscene() {
      const video = modeState.midcutscene;
      if (video) {
        try {
          video.pause();
          video.currentTime = 0;
          video.style.display = "none";
        } catch {}
      }
      if (hudRoot) hudRoot.style.opacity = "1";
      if (judgmentsRoot) judgmentsRoot.style.opacity = "1";
    }

    function syncMidcutscene(time) {
      const video = initMidcutscene();
      if (state.selectedSong !== "boxingMatch" || !state.playing) {
        if (video.style.display !== "none") resetMidcutscene();
        return false;
      }

      const start = DATA.meta.boxingMidcutsceneStep * songMeta().spb / 4;
      const fallbackDuration =
        (DATA.meta.boxingHudShowBeat - DATA.meta.boxingHudHideBeat) * songMeta().spb;
      const duration =
        Number.isFinite(video.duration) && video.duration > 0
          ? video.duration
          : fallbackDuration;
      const active = time >= start && time < start + duration;
      const hudHideTime = DATA.meta.boxingHudHideBeat * songMeta().spb;
      const hudShowTime = DATA.meta.boxingHudShowBeat * songMeta().spb;
      const hudAlpha = time >= hudHideTime && time < hudShowTime ? 0 : 1;
      if (hudRoot) hudRoot.style.opacity = String(hudAlpha);
      if (judgmentsRoot) judgmentsRoot.style.opacity = String(hudAlpha);

      if (!active) {
        video.style.display = "none";
        if (!video.paused) video.pause();
        return false;
      }

      video.style.display = "block";
      const desired = Math.max(0, Math.min(duration - 0.04, time - start));
      if (Math.abs((video.currentTime || 0) - desired) > 0.18) {
        try { video.currentTime = desired; } catch {}
      }
      if (video.paused) video.play().catch(() => {
        video.muted = true;
        video.play().catch(() => {});
      });
      return true;
    }

    initImages();
    initMidcutscene();

    const originalStage = stage;
    stage = function(time, camera) {
      if (!isOriginalVsMatt()) return originalStage(time);
      drawOriginalStage(time, camera);
    };

    const originalRenderScene = renderScene;
    renderScene = function(songTimeValue, previewTime) {
      if (!isOriginalVsMatt()) return originalRenderScene(songTimeValue, previewTime);
      const time = state.playing ? songTimeValue : previewTime;
      const camera = updateOriginalCamera(time);

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      stage(time, camera);
      applyLayerShaders(time, "game");
      saveMainTo(modeState.gameCanvas, gameCtx);

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      if (Math.abs(modeState.hudZoom - 1) > 0.001) {
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.scale(modeState.hudZoom, modeState.hudZoom);
        ctx.translate(-canvas.width / 2, -canvas.height / 2);
      }
      drawCombatReceptors(time);
      drawCombatNotes(songTimeValue);
      ctx.restore();
      applyLayerShaders(time, "hud");
      saveMainTo(modeState.hudCanvas, hudCtx);

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(modeState.gameCanvas, 0, 0, canvas.width, canvas.height);
      ctx.drawImage(modeState.hudCanvas, 0, 0, canvas.width, canvas.height);
      drawFeed(ui.playerFeed, state.feeds.player, true);
      drawFeed(ui.oppFeed, state.feeds.opp, false);
      syncMidcutscene(Math.max(0, songTimeValue));
    };

    const originalStartSong = startSong;
    startSong = function(id = state.selectedSong, options = {}) {
      if (id === "boxingMatch") primeMidcutscene();
      else resetMidcutscene();
      modeState.eventSource = null;
      modeState.cameraFollowX = null;
      modeState.cameraFollowY = null;
      modeState.cameraTargetX = null;
      modeState.cameraTargetY = null;
      modeState.cameraZoom = DATA.stage.defaultZoom || 0.7;
      modeState.hudZoom = 1;
      modeState.cameraTime = null;
      modeState.cameraSectionIndex = -1;
      modeState.cameraZooming = false;
      modeState.cameraSpeed = DATA.stage.cameraSpeed || 1;
      modeState.cameraOffsetX = 0;
      modeState.cameraOffsetY = 0;
      modeState.cameraProcessedNotes = new WeakSet();
      return originalStartSong(id, options);
    };

    const originalStopExternalAudio = stopExternalAudio;
    stopExternalAudio = function() {
      originalStopExternalAudio();
      resetMidcutscene();
    };

    const originalRefreshHUD = refreshHUD;
    refreshHUD = function(time) {
      originalRefreshHUD(time);
      if (!isOriginalVsMatt()) return;
      ui.timer.textContent = `${formatTime(time)} / ${formatTime(state.chart.totalTime)}`;
      if (state.selectedSong === "sporting") {
        ui.statusText.textContent = "Sporting";
        ui.statusSub.textContent =
          "Original hard chart, boxing sprites and stage, plus the complete 955-event shader timeline.";
      } else {
        ui.statusText.textContent = "Boxing Match";
        ui.statusSub.textContent =
          "Original hard chart, mid-song cutscene, and the complete 819-event shader timeline.";
      }
    };
  } catch (error) {
    console.error("Original Sporting / Boxing Match mode failed to initialize", error);
  }
})();

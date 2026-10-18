(() => {
  try {
    const V = window.VINDICATION_DATA;
    if (!V || typeof SONGS === "undefined") return;

    const SOURCE = "vindication";
    const DIRS = ["left", "down", "up", "right"];
    const ANIMS = ["singLEFT", "singDOWN", "singUP", "singRIGHT"];
    const WORLD_W = Number(V.stage?.viewport?.[0] || 1280);
    const WORLD_H = Number(V.stage?.viewport?.[1] || 720);
    const STEP_TIME = (60 / Number(V.meta?.bpm || 180)) / 4;
    const THERO_NOTES = (V.chart?.notes || [])
      .filter(note => note.character === "thero")
      .sort((a, b) => a.time - b.time);
    const scene = {
      initialized: false,
      images: {},
      noteCursor: 0,
      cameraAngle: 4,
      oldCharacter: false,
      lastBlast: -Infinity,
      flash: { time: -Infinity, color: "#fff" },
      karmaUntil: -Infinity,
      hateAlpha: 0,
      lastMechanicTime: -Infinity,
      mechanicIds: new Set()
    };

    SONGS.vindication = {
      title: V.meta?.title || "Vindication",
      subtitle: V.meta?.subtitle || "Friday Night Dustin hard chart",
      diff: "Hard (Original Chart)",
      tempo: Number(V.meta?.bpm || 180),
      root: 39,
      scale: [0, 2, 3, 5, 7, 8, 10],
      prog: [0, 5, 3, 6],
      scroll: 1080,
      seed: 113,
      introBeats: 0,
      outroBeats: 4,
      palette: ["#080711", "#1e1742", "#5543a5", "#03030a", "#e8e2ff", "#9271fd"],
      previewImage: "assets/vindication/ui/vindication.png",
      blurb: "Dustin's original Vindication chart with split audio, source stage, vin note skin, old-character phase, blaster hits, glitch camera, and the real 180 BPM chart.",
      chartSource: SOURCE
    };
    if (typeof NEW_SONGS !== "undefined" && NEW_SONGS?.add) NEW_SONGS.add("vindication");
    state.poses.sans = state.poses.sans || { lane: 1, time: -10, kind: "hit" };
    state.poses.player = state.poses.player || { lane: 1, time: -10, kind: "hit" };

    const baseIsImportedSong = isImportedSong;
    const baseMakeChart = makeChart;
    const baseStopExternalAudio = stopExternalAudio;
    const baseSongTime = songTime;
    const baseStartSong = startSong;
    const baseRefreshHUD = refreshHUD;
    const baseRenderScene = renderScene;
    const baseBg = bg;
    const baseStage = stage;
    const baseReceptors = receptors;
    const baseNotes = notes;
    const baseCameraTargets = cameraTargets;
    const baseCameraPoseKeys = cameraPoseKeys;
    const baseUpdateCamera = updateCamera;
    const baseHandlePress = handlePress;
    const baseHandleMisses = handleMisses;
    const baseApplyDustinBloom = typeof applyDustinBloom === "function" ? applyDustinBloom : null;

    const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));
    const lerp = (a, b, amount) => Number(a || 0) + (Number(b || 0) - Number(a || 0)) * clamp(amount, 0, 1);
    const imageReady = image => !!(image && image.complete && image.naturalWidth);
    const sourceStep = step => Math.max(0, Number(step) || 0) * STEP_TIME;
    const stepAt = time => Math.floor(Math.max(0, Number(time) || 0) / STEP_TIME + 0.00001);
    const isVindication = song => !!song && song.chartSource === SOURCE;

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
      for (const [key, layer] of Object.entries(V.stage.layers || {})) loadImage(`layer-${key}`, layer.image);
      for (const [key, def] of Object.entries(V.sprites.characters || {})) loadImage(`char-${key}`, def.image);
      loadImage("notes", V.notes?.image);
      for (const [typeId, skin] of Object.entries(V.notes?.typeSkins || {})) loadImage(`notes-type-${typeId}`, skin.image);
      // Warm all small atlases while the menu is still visible. This keeps the
      // first old-character/blaster swap from becoming a mid-song hitch.
      const atlasKeys = Object.keys(V.sprites.atlases || {});
      for (const key of atlasKeys) {
        const layer = Object.values(V.stage.layers || {}).find(item => item.atlas === key);
        if (layer) loadImage(`layer-${key}`, layer.image);
      }
    }

    function cloneChart() {
      const chart = JSON.parse(JSON.stringify(V.chart));
      // Codename's hidden third strum line is not a second opponent lane.
      // Keeping those notes in the browser chart creates impossible arrows
      // and makes the source chart feel harder than the original.
      chart.notes = chart.notes.filter(note => !note.hidden);
      chart.notes.forEach((note, index) => { note.id = index; });
      return chart;
    }

    function sourceEvents(name) {
      return (V.chart.events || []).filter(event => !name || event.name === name);
    }

    function lastEvent(name, time) {
      let result = null;
      for (const event of sourceEvents(name)) {
        if (event.time > time) break;
        result = event;
      }
      return result;
    }

    function easing(progress, name) {
      const p = clamp(progress, 0, 1);
      if (name === "linear") return p;
      if (name === "sine") return 1 - Math.cos(p * Math.PI * 0.5);
      if (name === "quint") return 1 - Math.pow(1 - p, 5);
      return 1 - Math.pow(1 - p, 2);
    }

    function eventValue(name, time, fallback) {
      const event = lastEvent(name, time);
      if (!event) return fallback;
      const params = event.params || [];
      const value = Number(name === "Change Stage Zoom" ? params[5] : params[1]);
      if (!Number.isFinite(value)) return fallback;
      const durationBeats = name === "Change Stage Zoom" ? Number(params[6] || 0) : Number(params[2] || 0);
      if (!durationBeats || event === sourceEvents(name)[sourceEvents(name).length - 1]) return value;
      const next = sourceEvents(name).find(item => item.time > event.time);
      const nextValue = Number(name === "Change Stage Zoom" ? next?.params?.[5] : next?.params?.[1]);
      if (!next || !Number.isFinite(nextValue) || time <= event.time) return value;
      const duration = Math.max(STEP_TIME, durationBeats * STEP_TIME);
      const progress = clamp((time - event.time) / duration, 0, 1);
      return lerp(value, nextValue, easing(progress, params[7]));
    }

    function cameraSide(time) {
      const event = lastEvent("Camera Movement", time);
      const side = Number(event?.params?.[0]);
      return Number.isFinite(side) ? side : 0;
    }

    function sourceCharacterCamera(time, side) {
      const old = phaseFor(time).oldCharacter;
      const isPlayer = side === 1;
      const isThero = side === 2;
      const kind = isPlayer ? "player" : isThero ? "girlfriend" : "sans";
      const key = isPlayer
        ? (old ? "playerOld" : "player")
        : isThero
          ? "thero"
          : (old ? "sansOld" : "sans");
      const def = isThero
        ? { x: 150, y: -320, camX: -200, camY: 130, scale: 1.3 }
        : V.sprites.characters?.[key];
      const base = isThero
        ? (V.stage.characters?.girlfriend || [1100, 949])
        : (V.stage.characters?.[kind] || [0, 0]);
      const idleFrame = isThero
        ? { fw: 712, fh: 536, fx: 0, fy: 0 }
        : def?.animations?.idle?.frames?.[0];
      const scale = Number(def?.scale || 1);
      const width = Number(idleFrame?.fw || idleFrame?.w || 0) * scale;
      const height = Number(idleFrame?.fh || idleFrame?.h || 0) * scale;
      const midpointX = Number(base[0] || 0) + width * 0.5;
      const midpointY = Number(base[1] || 0) + height * 0.5;
      return [
        midpointX + (isPlayer ? -100 : 150) + Number(def?.x || 0) + Number(def?.camX || 0),
        midpointY - 100 + Number(def?.y || 0) + Number(def?.camY || 0)
      ];
    }

    function sourceCameraMovement(time, side, phase) {
      let animationName = "idle";
      if (side === 2) {
        // Thero's strum line is hidden in the source chart, but it still owns
        // the center camera. Use its hidden notes to reproduce the source
        // character animation state without creating a playable lane.
        let low = 0;
        let high = THERO_NOTES.length;
        while (low < high) {
          const middle = (low + high) >> 1;
          if (THERO_NOTES[middle].time <= time) low = middle + 1;
          else high = middle;
        }
        const note = THERO_NOTES[low - 1];
        if (note && time - note.time < 0.42) animationName = ANIMS[note.lane % 4] || "idle";
      } else {
        const data = resolveCharacter(side === 1 ? "player" : "sans", time, phase);
        animationName = data?.animationName || "idle";
      }
      switch (animationName) {
        case "singLEFT": return [-15, 0, -0.3];
        case "singDOWN": return [0, 15, 0];
        case "singUP": return [0, -15, 0];
        case "singRIGHT": return [15, 0, 0.3];
        default: return [0, 0, 0];
      }
    }

    function sourceCameraFor(time, side) {
      const phase = phaseFor(time);
      const base = sourceCharacterCamera(time, side);
      const movement = sourceCameraMovement(time, side, phase);
      return [base[0] + movement[0], base[1] + movement[1]];
    }

    function cameraAngleFor(time) {
      let angle = 4;
      let count = 0;
      for (const step of V.source.turnCamera || []) {
        if (step > stepAt(time)) break;
        count += 1;
      }
      if (count % 2) angle = 184;
      return angle;
    }

    function phaseFor(time) {
      const step = stepAt(time);
      return {
        step,
        legacy: step >= V.source.steps.legacyStart && step < V.source.steps.legacyEnd,
        fade: step >= V.source.steps.fadeOut && step < 1552,
        glitch: (step >= V.source.steps.legacyStart && step < V.source.steps.legacyEnd) || (step >= V.source.steps.glitchStart && step < V.source.steps.glitchEnd) || (step >= V.source.steps.sansesStart && step < V.source.steps.finalGlitchEnd),
        hudGlitch: step >= V.source.steps.sansesStart && step < V.source.steps.finalGlitchEnd,
        sanses: step >= V.source.steps.sansesStart,
        oldCharacter: time >= 65.333 && time < 86.666,
        angle: cameraAngleFor(time)
      };
    }

    function sourceStageAlpha(time) {
      const fadeOutAt = sourceStep(V.source.steps.fadeOut);
      const fadeInAt = sourceStep(V.source.steps.fadeIn);
      const fadeOutDuration = 3;
      const fadeInDuration = 10;
      if (time < fadeOutAt) return 1;
      if (time < fadeOutAt + fadeOutDuration) return 1 - clamp((time - fadeOutAt) / fadeOutDuration, 0, 1);
      if (time < fadeInAt) return 0;
      return clamp((time - fadeInAt) / fadeInDuration, 0, 1);
    }

    function sourceNoteType(note) {
      const id = Number(note?.noteType || 0);
      return id === 1 ? "NOTE_karma" : id === 2 ? "NOTE_hate" : "";
    }

    function updateVindicationMechanics(time) {
      const previous = scene.lastMechanicTime;
      if (Number.isFinite(previous) && time >= previous && time < scene.karmaUntil && state.health > 0.1) {
        state.health = Math.max(0.1, state.health - Math.min(0.1, time - previous) * 0.1);
      }
      scene.lastMechanicTime = time;
      if (scene.hateAlpha > 0) scene.hateAlpha = Math.max(0, scene.hateAlpha - Math.max(0, time - previous) / 2.5);
    }

    function applyVindicationNoteMechanic(note, time) {
      if (!note || scene.mechanicIds.has(note.id)) return;
      const type = sourceNoteType(note);
      if (!type) return;
      scene.mechanicIds.add(note.id);
      if (type === "NOTE_karma") {
        scene.karmaUntil = Math.max(scene.karmaUntil, time + 5);
      } else if (scene.hateAlpha >= 0.999) {
        state.health = 0;
      } else {
        scene.hateAlpha = Math.min(1, scene.hateAlpha + 0.2);
      }
      scene.flash = { time, color: type === "NOTE_hate" ? "#9d68ff" : "#f300ff" };
    }

    function frameForAtlas(key, prefix, elapsed, fps = 24, loop = true) {
      const frames = framesByPrefix(V.sprites.atlases?.[key], prefix);
      return frames?.length ? frameFromList(frames, elapsed, fps, loop) : null;
    }

    function framesByPrefix(frames, prefix) {
      return Array.isArray(frames) ? frames.filter(frame => String(frame.name || "").startsWith(prefix)) : [];
    }

    function drawStaticLayer(key, layer, alpha = 1) {
      const image = scene.images[`layer-${key}`];
      if (!imageReady(image) || alpha <= 0) return;
      const scale = Number(layer.scale || 1);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.drawImage(image, Number(layer.x || 0), Number(layer.y || 0), image.naturalWidth * scale, image.naturalHeight * scale);
      ctx.restore();
    }

    function drawAnimatedLayer(key, layer, time, alpha = 1) {
      const image = scene.images[`layer-${key}`];
      const atlas = V.sprites.atlases?.[layer.atlas];
      if (!imageReady(image) || !atlas?.length || alpha <= 0) return;
      const prefix = layer.atlas === "thero_appear" ? "thero_appear" : layer.atlas;
      const frames = framesByPrefix(atlas, prefix);
      if (!frames.length) return drawStaticLayer(key, layer, alpha);
      const fps = layer.atlas === "thero_appear" ? 24 : 24;
      const loop = layer.atlas !== "thero_appear";
      const elapsed = layer.atlas === "thero_appear" ? Math.max(0, time - sourceStep(1520)) : time;
      const frame = frameFromList(frames, elapsed, fps, loop);
      if (!frame) return;
      drawAtlasTopLeft(image, frame, Number(layer.x || 0), Number(layer.y || 0), Number(layer.scale || 1), alpha);
    }

    function drawWorldStage(time, phase) {
      const layers = V.stage.layers;
      const fade = sourceStageAlpha(time);
      drawStaticLayer("background", layers.background, phase.legacy ? 0 : fade);
      drawStaticLayer("legacy", layers.legacy, phase.legacy ? 1 : 0);
      // The source stage calls this sprite `il_legacy` and keeps it hidden
      // until the legacy cut. Drawing it during the normal phase masks the
      // characters with a full-screen gray rectangle.
      drawStaticLayer("illumination", layers.illumination, phase.legacy ? 1 : 0);
      if (phase.sanses) drawAnimatedLayer("sansesBack", layers.sansesBack, time, 0.95);
      drawStaticLayer("foreground", layers.foreground, phase.legacy ? 0 : fade);
      drawCharacters(time, phase, fade);
      if (phase.sanses) drawAnimatedLayer("sansesFront", layers.sansesFront, time, 0.9);
      if (time >= sourceStep(1520)) drawAnimatedLayer("thero", layers.thero, time, clamp((time - sourceStep(1520)) / 0.7, 0, 1));
    }

    function characterData(kind, phase) {
      const key = kind === "sans"
        ? (phase.oldCharacter ? "sansOld" : "sans")
        : (phase.oldCharacter ? "playerOld" : "player");
      return { key, def: V.sprites.characters?.[key] };
    }

    function forcedAnimation(kind, time, def) {
      const index = kind === "sans" ? 0 : 1;
      let result = null;
      for (const event of sourceEvents("Play Animation")) {
        if (event.time > time) break;
        if (Number(event.params?.[0]) !== index) continue;
        result = { name: String(event.params?.[1] || ""), start: event.time };
      }
      if (!result || !def?.animations?.[result.name]) return null;
      const animation = def.animations[result.name];
      result.animation = animation;
      result.duration = animation.frames.length / Math.max(1, animation.fps || 24);
      return result;
    }

    function resolveCharacter(kind, time, phase) {
      const data = characterData(kind, phase);
      const def = data.def;
      if (!def) return null;
      const forced = forcedAnimation(kind, time, def);
      const pose = state.poses[kind === "sans" ? "sans" : "player"];
      let animationName = "idle";
      let elapsed = time;
      let loop = true;
      const forcedAge = forced ? Math.max(0, time - forced.start) : -1;
      const hold = typeof activeHoldNoteForCharacter === "function" ? activeHoldNoteForCharacter(kind === "sans" ? "sans" : "player", time) : null;
      const age = pose ? Math.max(0, performance.now() / 1000 - Number(pose.time || -10)) : 999;
      const lane = hold ? hold.lane % 4 : Number(pose?.lane || 0) % 4;
      const singName = ANIMS[lane] || "singLEFT";
      if (forced && forcedAge < forced.duration) {
        animationName = forced.name;
        elapsed = forcedAge;
        loop = !!forced.animation.loop;
      } else if (hold && def.animations[singName]) {
        animationName = singName;
        elapsed = Math.max(0, time - hold.time);
        loop = false;
      } else if (age < 0.42 && pose?.kind !== "miss" && def.animations[singName]) {
        animationName = singName;
        elapsed = age;
        loop = false;
      }
      const animation = def.animations[animationName] || def.animations.idle;
      return { key: data.key, def, animation, animationName, elapsed, loop };
    }

    function drawCharacters(time, phase, alpha) {
      for (const kind of ["sans", "player"]) {
        const data = resolveCharacter(kind, time, phase);
        if (!data?.animation?.frames?.length) continue;
        const frame = frameFromList(data.animation.frames, data.elapsed, data.animation.fps || 24, data.loop || data.animation.loop);
        const image = scene.images[`char-${data.key}`];
        if (!frame || !imageReady(image)) continue;
        const base = V.stage.characters[kind] || [0, 0];
        const globalX = Number(data.def.x || 0);
        const globalY = Number(data.def.y || 0);
        const isPlayer = kind === "player";
        // Codename's Character.playAnim applies player global offsets with the
        // opposite horizontal sign. Stage x/y remains the authored sprite
        // origin; convert that origin to drawAtlasFrame's bottom-center anchor.
        const position = [
          Number(base[0] || 0) + globalX,
          Number(base[1] || 0) + globalY
        ];
        const offset = data.animation.offset || [0, 0];
        const frameWidth = Number(frame.fw || frame.w || 0);
        const frameHeight = Number(frame.fh || frame.h || 0);
        // Codename's character position is a root, not the top edge of the
        // active trimmed frame. Preserve the idle foot line, then compensate
        // the actual rendered rectangle (rotated atlases use frame.w as their
        // vertical extent) and XML animation offset so every pose lands on
        // the same ground line for both Sans and BF.
        const idleFrame = data.def.animations?.idle?.frames?.[0];
        const renderedHeight = frame.rotated
          ? Number(frame.w || frame.fh || frame.h || 0)
          : Number(frame.h || frame.fh || 0);
        const idleRenderedHeight = idleFrame?.rotated
          ? Number(idleFrame.w || idleFrame.fh || idleFrame.h || 0)
          : Number(idleFrame?.h || idleFrame?.fh || 0);
        const sourceFeetY = Number(base[1] || 0) + globalY + idleRenderedHeight;
        position[1] = sourceFeetY + Number(offset[1] || 0) - renderedHeight;
        // Codename Engine applies the player-side flip correction after the
        // character XML is loaded (`isPlayer` toggles the declared flipX).
        const flip = isPlayer ? !data.def.flipX : !!data.def.flipX;
        // The source player path mirrors the animation X offset along with
        // the sprite. Keep the authored root fixed while the pose changes.
        const drawOffset = isPlayer && flip
          ? [-Number(offset[0] || 0), Number(offset[1] || 0)]
          : [Number(offset[0] || 0), Number(offset[1] || 0)];
        // drawAtlasFrame expects a bottom-center anchor. Codename's atlas
        // path derives it from the active frame's frameHeight/frameY and the
        // animation offset; using the idle height here made feet drift on
        // singing frames with different trimmed bounds.
        const frameTrimX = flip ? -Number(frame.fx || 0) : Number(frame.fx || 0);
        const anchorX = position[0] - drawOffset[0] + (frameWidth * 0.5 + frameTrimX);
        const anchorY = position[1] - drawOffset[1] + frameHeight + Number(frame.fy || 0);
        const characterAlpha = kind === "sans" ? alpha : 1;
        drawAtlasFrame(image, frame, anchorX, anchorY, Number(data.def.scale || 1), characterAlpha, flip);
      }
    }

    function drawBlaster(time) {
      const latest = (V.source.blasts || []).map(step => sourceStep(step)).filter(start => time >= start && time < start + 1.05).pop();
      if (latest == null) return;
      const layer = V.stage.layers.blaster;
      const image = scene.images["layer-blaster"];
      const frames = framesByPrefix(V.sprites.atlases?.gasterBlaster, "shoot");
      const frame = frameFromList(frames, time - latest, 24, false);
      if (frame && imageReady(image)) drawAtlasTopLeft(image, frame, layer.x, layer.y, layer.scale, 1);
      scene.lastBlast = latest;
    }

    function drawScreenLayers(time, phase) {
      const layers = V.stage.layers;
      const vignette = scene.images["layer-vignette"];
      if (scene.hateAlpha > 0.001 && imageReady(vignette)) {
        ctx.save();
        ctx.globalAlpha = scene.hateAlpha;
        ctx.drawImage(vignette, 0, 0, canvas.width, canvas.height);
        ctx.restore();
      }
      if (phase.hudGlitch && imageReady(vignette)) {
        ctx.save();
        ctx.globalAlpha = 0.28 + Math.sin(time * 7) * 0.04;
        ctx.drawImage(vignette, 0, 0, canvas.width, canvas.height);
        ctx.restore();
      }
      const bars = phase.legacy || (phase.step >= V.source.steps.fadeOut && phase.step < 1552) || time >= sourceStep(2704);
      if (bars) {
        ctx.save();
        ctx.fillStyle = "#000";
        ctx.globalAlpha = phase.fade ? 0.88 : 0.82;
        const h = Math.round(canvas.height * 0.12);
        ctx.fillRect(0, 0, canvas.width, h);
        ctx.fillRect(0, canvas.height - h, canvas.width, h);
        ctx.restore();
      }
      if (imageReady(scene.images["layer-bars"]) && phase.legacy) {
        ctx.save(); ctx.globalAlpha = 0.45; ctx.drawImage(scene.images["layer-bars"], 0, 0, canvas.width, canvas.height); ctx.restore();
      }
      drawBlaster(time);
    }

    function drawVindicationReceptors(time) {
      const image = scene.images.notes;
      if (!imageReady(image)) return baseReceptors(time);
      const y = receptorY();
      for (let lane = 0; lane < 8; lane += 1) {
        const direction = DIRS[lane % 4];
        const skin = V.notes.skin?.[direction];
        const fx = state.receptorFx[lane];
        const age = fx ? performance.now() / 1000 - Number(fx.time || -10) : 999;
        const pressed = !!state.keysDown[lane];
        const frame = age < 0.18 ? frameFromList(skin?.confirm, age, 24, false) : pressed ? frameFromList(skin?.press, 0.05, 24, true) : skin?.static;
        if (frame) drawAtlasCentered(image, frame, laneX(lane), y, 0.52, lane < 4 ? 0.86 : 1);
      }
    }

    function drawVindicationSustain(note, x, headY, tailY, alpha) {
      const skin = V.notes.skin?.[DIRS[note.lane % 4]];
      if (!skin?.piece || !skin?.end) return;
      const top = Math.min(headY, tailY);
      const bottom = Math.max(headY, tailY);
      if (bottom - top > 2) drawAtlasStretchVertical(scene.images.notes, skin.piece, x, top, 30, bottom - top, alpha * 0.88);
      drawAtlasCentered(scene.images.notes, skin.end, x, tailY, 0.52, alpha);
    }

    function drawVindicationNotes(time) {
      if (!state.chart || !imageReady(scene.images.notes)) return;
      const notes = state.chart.notes;
      const lowerBound = Math.max(0, time - 3.4);
      let start = scene.noteCursor;
      while (start > 0 && notes[start - 1]?.time >= lowerBound) start -= 1;
      while (start < notes.length && notes[start]?.time < lowerBound) start += 1;
      scene.noteCursor = start;
      const scroll = Number(state.currentSong.scroll || 1080);
      for (let index = start; index < notes.length; index += 1) {
        const note = notes[index];
        if (note.played && note.hit && (!isHoldNote(note) || note.holdDone)) continue;
        if (note.judged && note.side !== "opp" && (!isHoldNote(note) || note.holdDone || !note.hit)) continue;
        const diff = note.time - time;
        const y = noteYFromDiff(diff, scroll);
        const tailY = noteYFromDiff(holdEndTime(note) - time, scroll);
        if (notePastViewport(y, tailY)) continue;
        if (noteFutureViewport(y, tailY)) break;
        const x = laneX(note.lane);
        const scale = clamp(0.52 * (1 - Math.abs(diff) * 0.06), 0.42, 0.56);
        if (isHoldNote(note)) drawVindicationSustain(note, x, note.hit ? receptorY() : y, tailY, note.side === "opp" ? 0.86 : 1);
        if (note.hit && isHoldNote(note) && time > note.time) continue;
        const typeSkin = V.notes.typeSkins?.[Number(note.noteType || 0)]?.[DIRS[note.lane % 4]];
        const skin = V.notes.skin?.[DIRS[note.lane % 4]];
        const typeImage = scene.images[`notes-type-${note.noteType}`];
        if (typeSkin && imageReady(typeImage)) drawAtlasCentered(typeImage, typeSkin, x, y, scale, note.side === "opp" ? 0.86 : 1);
        else if (skin?.static) drawAtlasCentered(scene.images.notes, skin.static, x, y, scale, note.side === "opp" ? 0.86 : 1);
      }
    }

    function applyVindicationCameraFx(time, phase) {
      if (window.PERFORMANCE_MODE || !phase.glitch) return;
      const first = phase.legacy ? 0.12 : phase.hudGlitch ? 0.2 : 0.08;
      const usedWebGL = window.FNF_WEBGL?.drawCameraPass(canvas, {
        zoom: 1.01 + first * 0.08,
        angle: phase.angle * 0.03,
        offsetX: Math.sin(time * 17) * first * 0.03,
        offsetY: Math.cos(time * 13) * first * 0.025,
        warp: phase.hudGlitch ? 0.12 : 0.045,
        mirror: 0
      });
      if (!usedWebGL) {
        ctx.save();
        ctx.globalAlpha = first * 0.65;
        ctx.globalCompositeOperation = "screen";
        ctx.fillStyle = phase.hudGlitch ? "#8a6cff" : "#ffffff";
        ctx.fillRect(Math.sin(time * 19) * 3, 0, canvas.width, 1 + first * 8);
        ctx.restore();
      }
    }

    isImportedSong = function(song) { return isVindication(song) || baseIsImportedSong(song); };
    makeChart = function(song) { return isVindication(song) ? cloneChart() : baseMakeChart(song); };

    function ensureVindicationAudio() {
      if (!state.audio.vindicationInst) {
        state.audio.vindicationInst = new Audio(V.audio.inst);
        state.audio.vindicationInst.preload = "auto";
        state.audio.vindicationInst.volume = 0.92;
      }
      if (!state.audio.vindicationVoices) {
        state.audio.vindicationVoices = new Audio(V.audio.voices);
        state.audio.vindicationVoices.preload = "auto";
        state.audio.vindicationVoices.volume = 0.84;
      }
      return [state.audio.vindicationInst, state.audio.vindicationVoices];
    }
    window.ensureVindicationAudio = ensureVindicationAudio;

    stopExternalAudio = function() {
      baseStopExternalAudio();
      for (const track of [state.audio.vindicationInst, state.audio.vindicationVoices]) {
        if (!track) continue;
        try { track.pause(); track.currentTime = 0; } catch {}
      }
    };

    songTime = function() {
      if (isVindication(state.currentSong) && state.audio.vindicationInst) return state.audio.vindicationInst.currentTime;
      return baseSongTime();
    };

    startSong = function(id = state.selectedSong) {
      if (!isVindication(SONGS[id])) return baseStartSong(id);
      const audioContext = ensureAudio();
      if (audioContext.state === "suspended") audioContext.resume();
      stopExternalAudio();
      initAssets();
      state.selectedSong = id;
      state.currentSong = SONGS[id];
      state.mode = ui.versusToggle.checked ? "versus" : "solo";
      state.chart = makeChart(state.currentSong);
      resetStats();
      state.health = 0.65;
      scene.noteCursor = 0;
      scene.lastBlast = -Infinity;
      scene.flash.time = -Infinity;
      scene.karmaUntil = -Infinity;
      scene.hateAlpha = 0;
      scene.lastMechanicTime = -Infinity;
      scene.mechanicIds.clear();
      Object.values(state.poses).forEach(pose => { pose.time = -10; pose.kind = "hit"; });
      const initialCamera = sourceCameraFor(0, 0);
      state.camera = {
        zoom: Number(V.stage.zoom || 1.1), focusX: canvas.width * 0.5, focusY: canvas.height * 0.45,
        // stage_cammovement.hx applies the extra -100 intro nudge after the
        // character camera position is calculated.
        worldFocus: { x: initialCamera[0], y: initialCamera[1] - 100 },
        sideTime: 0, lastSide: "opp", highwayX: 0, highwayY: 0, angle: 4
      };
      const tracks = ensureVindicationAudio();
      tracks.forEach(track => { track.currentTime = 0; track.playbackRate = 1; track.play().catch(() => {}); });
      state.songStart = 0;
      state.nextStep = 0;
      state.nextStepTime = 0;
      state.playing = true;
      ui.p1Box.style.display = state.mode === "versus" ? "block" : "none";
      ui.modeLabel.textContent = state.mode === "versus" ? "1v1 Versus" : "Solo Battle";
      ui.songTitle.textContent = state.currentSong.title;
      ui.songSub.textContent = state.currentSong.subtitle;
      ui.statusText.textContent = "Vindication: spacetime phase";
      ui.statusSub.textContent = "Original Dustin chart, vin notes, split audio, source camera turns, blaster hits, old-character phase, and glitch transitions are active.";
      ui.timer.textContent = `0:00 / ${formatTime(state.chart.totalTime)}`;
      ui.menu.classList.remove("show");
      ui.settings.classList.remove("show");
      ui.resultsWrap.classList.remove("show");
    };

    handlePress = function(lane) {
      if (!isVindication(state.currentSong)) return baseHandlePress(lane);
      const t = songTime();
      const candidate = state.chart?.notes?.find(note => !note.judged && note.side === (lane < 4 ? "opp" : "player") && note.lane === lane && Math.abs(note.time - t) <= hitWinBad());
      baseHandlePress(lane);
      if (candidate?.hit) applyVindicationNoteMechanic(candidate, t);
    };

    handleMisses = function(time) {
      if (!isVindication(state.currentSong)) return baseHandleMisses(time);
      const before = new Set((state.chart?.notes || []).filter(note => note.hit).map(note => note.id));
      baseHandleMisses(time);
      for (const note of state.chart?.notes || []) {
        if (note.hit && !before.has(note.id)) applyVindicationNoteMechanic(note, time);
      }
    };

    cameraTargets = function() {
      if (!isVindication(state.currentSong)) return baseCameraTargets();
      const side = cameraSide(songTime());
      const focus = sourceCameraFor(songTime(), side);
      const opp = sourceCameraFor(songTime(), 0);
      const player = sourceCameraFor(songTime(), 1);
      return { oppX: opp[0], playerX: player[0], focusY: focus[1] * (canvas.height / WORLD_H) };
    };
    cameraPoseKeys = function() { return isVindication(state.currentSong) ? { opp: "sans", player: "player" } : baseCameraPoseKeys(); };

    updateCamera = function(time, dt) {
      if (!isVindication(state.currentSong)) return baseUpdateCamera(time, dt);
      const phase = phaseFor(time);
      const side = cameraSide(time);
      const target = sourceCameraFor(time, side);
      const smoothing = state.settings?.reduceMotion ? 0.2 : clamp((dt || 0.016) * 5.4, 0.045, 0.18);
      const focus = state.camera.worldFocus || { x: target[0], y: target[1] };
      focus.x = lerp(focus.x, target[0], smoothing);
      focus.y = lerp(focus.y, target[1], smoothing);
      state.camera.worldFocus = focus;
      state.camera.zoom = lerp(state.camera.zoom || Number(V.stage.zoom || 1.1), eventValue("Change Stage Zoom", time, Number(V.stage.zoom || 1.1)), smoothing);
      const cameraMovement = sourceCameraMovement(time, side, phase);
      const targetAngle = phase.angle + cameraMovement[2];
      state.camera.angle = lerp(state.camera.angle || 4, targetAngle, clamp((dt || 0.016) * 8, 0.04, 0.22));
      state.camera.focusX = focus.x * (canvas.width / WORLD_W);
      state.camera.focusY = focus.y * (canvas.height / WORLD_H);
      state.camera.lastSide = side === 1 ? "player" : side === 2 ? "center" : "opp";
    };

    refreshHUD = function(time) {
      const result = baseRefreshHUD(time);
      if (isVindication(state.currentSong)) {
        const phase = phaseFor(time);
        ui.statusText.textContent = phase.oldCharacter ? "Vindication: legacy break" : phase.hudGlitch ? "Vindication: fractured spacetime" : "Vindication: source phase";
        ui.statusSub.textContent = phase.legacy ? "The legacy cut is active with the source Dustin cinematic bars." : "Original vin stage, source camera angle, character phases, and timed shader hits are running.";
      }
      return result;
    };

    bg = function(song, time) {
      if (!isVindication(song)) return baseBg(song, time);
      ctx.fillStyle = "#03030a";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      return null;
    };
    stage = function(time) { if (!isVindication(state.currentSong)) return baseStage(time); return null; };
    receptors = function(time) { if (isVindication(state.currentSong)) return drawVindicationReceptors(time); return baseReceptors(time); };
    notes = function(time) { if (isVindication(state.currentSong)) return drawVindicationNotes(time); return baseNotes(time); };

    renderScene = function(songTimeValue, previewTime) {
      if (!isVindication(state.currentSong)) return baseRenderScene(songTimeValue, previewTime);
      const t = state.playing ? songTimeValue : previewTime;
      initAssets();
      const phase = phaseFor(t);
      updateVindicationMechanics(t);
      const focus = state.camera?.worldFocus || V.stage.camera.sans;
      const focusX = Number(focus?.x ?? focus?.[0] ?? V.stage.camera.sans[0]);
      const focusY = Number(focus?.y ?? focus?.[1] ?? V.stage.camera.sans[1]);
      const zoom = Number(state.camera?.zoom || V.stage.zoom || 1.1);
      const baseScale = Math.min(canvas.width / WORLD_W, canvas.height / WORLD_H);
      const angle = Number(state.camera?.angle || phase.angle || 4);
      ctx.save();
      ctx.fillStyle = "#03030a";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.translate(canvas.width * 0.5, canvas.height * 0.5);
      ctx.rotate((angle - 4) * Math.PI / 180);
      ctx.scale(baseScale * zoom, baseScale * zoom);
      ctx.translate(-focusX, -focusY);
      drawWorldStage(t, phase);
      ctx.restore();
      drawScreenLayers(t, phase);
      ctx.save();
      receptors(t);
      drawVindicationNotes(songTimeValue);
      ctx.restore();
      applyVindicationCameraFx(t, phase);
      return null;
    };

    if (baseApplyDustinBloom) {
      applyDustinBloom = function(time) {
        if (!isVindication(state.currentSong)) return baseApplyDustinBloom(time);
        return baseApplyDustinBloom(time);
      };
    }
    if (typeof importedTracksForSong === "function") {
      const baseImportedTracksForSong = importedTracksForSong;
      importedTracksForSong = function(songId = state.selectedSong) {
        if (isVindication(SONGS[songId])) return ensureVindicationAudio();
        return baseImportedTracksForSong(songId);
      };
    }

    initAssets();
    renderSongs();
  } catch (error) {
    console.error("Vindication mode failed to initialize", error);
  }
})();

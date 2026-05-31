(function() {
  const SB = window.SILLY_BILLY_DATA;
  if (!SB || !SB.chart || !SB.stage || !SB.sprites) return;

  const DIR_ANIMS = ["singLEFT", "singDOWN", "singUP", "singRIGHT"];
  const NOTE_DIRS = ["left", "down", "up", "right"];
  const STEP_TIME = (Number(SB.chart.spb) || (60 / 173)) / 4;
  const PHASES = {
    pixelIn: 2320 * STEP_TIME,
    pixelOut: 2448 * STEP_TIME,
    voidIn: 3660 * STEP_TIME,
    voidOut: 3850 * STEP_TIME,
    black: 4417 * STEP_TIME
  };
  const silly = {
    initialized: false,
    images: {},
    cameraPan: 0,
    cameraZoom: 1,
    videoIntro: null,
    videoStay: null,
    videoFlashback: null,
    stayStarted: false,
    flashStarted: false,
    warmCanvas: null,
    warmCtx: null
  };

  SONGS.sillyBilly = {
    title: SB.song.title,
    subtitle: SB.song.subtitle,
    diff: SB.song.diff,
    tempo: SB.song.bpm,
    root: 41,
    scale: [0, 2, 3, 5, 7, 8, 10],
    prog: [0, 3, 5, 1],
    scroll: 1050,
    seed: 45,
    introBeats: 0,
    outroBeats: 4,
    palette: ["#06070b", "#22151d", "#5d3c55", "#09080c", "#f7e9ff", "#bfc2ff"],
    blurb: "Silly Billy with the normal chart, normal instrumental, FLP vocals, Remastered stage/characters, custom notes, hurt notes, intro video, and the main pride lyric subtitle only.",
    chartSource: "sillyBilly"
  };

  const baseIsImportedSong = isImportedSong;
  const baseMakeChart = makeChart;
  const baseStartSong = startSong;
  const baseStopExternalAudio = stopExternalAudio;
  const baseSongTime = songTime;
  const baseSongEndTime = songEndTime;
  const baseUpdateCamera = updateCamera;
  const baseRefreshHUD = refreshHUD;
  const baseFinish = finish;
  const baseHandlePress = handlePress;
  const baseHandleMisses = handleMisses;
  const baseBg = bg;
  const baseStage = stage;
  const baseReceptors = receptors;
  const baseNotes = notes;
  const baseApplyDustinBloom = applyDustinBloom;

  function loadImage(key, src) {
    const image = new Image();
    image.decoding = "async";
    image.loading = "eager";
    image.src = src;
    silly.images[key] = image;
  }

  function initAssets() {
    if (silly.initialized) return;
    silly.initialized = true;
    Object.entries(SB.stage).forEach(([key, src]) => {
      if (typeof src === "string") loadImage(`stage:${key}`, src);
    });
    Object.entries(SB.sprites).forEach(([key, sprite]) => loadImage(`sprite:${key}`, sprite.image));
    // NOTE: the lyric spritemap (~80MB decoded) is loaded lazily near its
    // cutscene by ensureLyricSheet(), not here, to avoid holding it all song.
    if (SB.notes?.image) loadImage("notes:main", SB.notes.image);
    if (SB.notes?.pixelImage) loadImage("notes:pixel", SB.notes.pixelImage);
    if (SB.notes?.pixelEndsImage) loadImage("notes:pixelEnds", SB.notes.pixelEndsImage);
    if (SB.notes?.hurtImage) loadImage("notes:hurt", SB.notes.hurtImage);
    schedulePrewarm();
  }

  function imageReady(image) {
    return !!(image && image.complete && image.naturalWidth);
  }

  function decodeImage(image) {
    if (!image) return Promise.resolve();
    if (typeof image.decode === "function") return image.decode().catch(() => {});
    if (imageReady(image)) return Promise.resolve();
    return new Promise(resolve => {
      image.addEventListener("load", resolve, { once: true });
      image.addEventListener("error", resolve, { once: true });
    });
  }

  function warmFrame(imageKey, frame, scale = 1) {
    const image = silly.images[imageKey];
    if (!imageReady(image) || !frame) return;
    if (!silly.warmCanvas) {
      silly.warmCanvas = document.createElement("canvas");
      silly.warmCtx = silly.warmCanvas.getContext("2d");
      if (typeof setRenderQuality === "function") setRenderQuality(silly.warmCtx);
    }
    const w = Math.max(1, Math.min(512, Math.ceil((frame.w || 1) * scale)));
    const h = Math.max(1, Math.min(512, Math.ceil((frame.h || 1) * scale)));
    if (silly.warmCanvas.width !== w || silly.warmCanvas.height !== h) {
      silly.warmCanvas.width = w;
      silly.warmCanvas.height = h;
    }
    silly.warmCtx.clearRect(0, 0, w, h);
    silly.warmCtx.drawImage(image, frame.x, frame.y, frame.w, frame.h, 0, 0, w, h);
  }

  function schedulePrewarm() {
    const idle = callback => {
      if (typeof requestIdleCallback === "function") requestIdleCallback(callback, { timeout: 900 });
      else setTimeout(() => callback({ timeRemaining: () => 8 }), 16);
    };
    setTimeout(() => {
      Promise.all(Object.values(silly.images).map(decodeImage)).finally(() => {
        const queue = [];
        Object.entries(SB.sprites).forEach(([key, sprite]) => {
          Object.values(sprite.animations || {}).forEach(anim => {
            for (const frame of anim.frames || []) queue.push({ imageKey: `sprite:${key}`, frame, scale: 0.5 });
          });
        });
        const run = deadline => {
          const started = performance.now();
          while (queue.length && (deadline.timeRemaining() > 2 || performance.now() - started < 5)) {
            const task = queue.shift();
            warmFrame(task.imageKey, task.frame, task.scale);
          }
          if (queue.length) idle(run);
        };
        idle(run);
      });
    }, 0);
  }

  function cloneChart() {
    return {
      ...SB.chart,
      notes: SB.chart.notes.map(note => ({ ...note })),
      timeline: (SB.chart.timeline || []).map(section => ({ ...section })),
      lyricEvents: (SB.chart.lyricEvents || []).map(event => ({ ...event })),
      commandEvents: (SB.chart.commandEvents || []).map(event => ({ ...event }))
    };
  }

  function ensureSillyBillyAudio() {
    if (!state.audio.sillyBillyInst) {
      state.audio.sillyBillyInst = new Audio(SB.audio.inst);
      state.audio.sillyBillyInst.preload = "auto";
      state.audio.sillyBillyInst.volume = 0.92;
    }
    if (!state.audio.sillyBillyVoices) {
      state.audio.sillyBillyVoices = new Audio(SB.audio.voices);
      state.audio.sillyBillyVoices.preload = "auto";
      state.audio.sillyBillyVoices.volume = 0.88;
    }
    state.audio.sillyBillyInst.playbackRate = 1;
    state.audio.sillyBillyVoices.playbackRate = 1;
    return [state.audio.sillyBillyInst, state.audio.sillyBillyVoices];
  }
  window.ensureSillyBillyAudio = ensureSillyBillyAudio;
  window.prepareSillyBillyOnlineStart = function() {
    initAssets();
    const tracks = ensureSillyBillyAudio();
    ensureSillyBillyVideos();
    tracks.forEach(track => {
      if (!track) return;
      track.pause();
      try { track.currentTime = 0; } catch {}
      try { track.load(); } catch {}
    });
    return tracks;
  };

  function makeVideo(src) {
    if (!src) return null;
    const video = document.createElement("video");
    video.src = src;
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    video.style.display = "none";
    try { video.load(); } catch {}
    return video;
  }

  function ensureSillyBillyVideos() {
    if (!silly.videoIntro) silly.videoIntro = makeVideo(SB.videos?.intro);
    if (!silly.videoStay) silly.videoStay = makeVideo(SB.videos?.stay);
    if (!silly.videoFlashback) silly.videoFlashback = makeVideo("flashback-cutscene.mp4");
    return [silly.videoIntro, silly.videoStay, silly.videoFlashback].filter(Boolean);
  }

  function resetSillyVideos() {
    ensureSillyBillyVideos().forEach(video => {
      try {
        video.pause();
        video.currentTime = 0;
      } catch {}
    });
    silly.stayStarted = false;
    silly.flashStarted = false;
  }

  function frameFromAnimation(anim, elapsed) {
    if (!anim?.frames?.length) return null;
    const fps = Number(anim.fps || 24);
    const raw = Math.floor(Math.max(0, elapsed) * fps);
    const index = anim.loop ? raw % anim.frames.length : Math.min(anim.frames.length - 1, raw);
    return anim.frames[index];
  }

  function singDuration(anim) {
    if (!anim?.frames?.length) return 0.38;
    return Math.min(0.68, Math.max(0.22, anim.frames.length / Number(anim.fps || 24)));
  }

  function currentSpriteAnim(sprite, poseKey, t) {
    const poseInfo = state.poses[poseKey] || { lane: 0, time: -10, kind: "hit" };
    const laneAnim = DIR_ANIMS[poseInfo.lane || 0] || "singLEFT";
    const missAnim = `${laneAnim}miss`;
    let baseAnim = poseInfo.kind === "miss" && sprite.animations[missAnim] ? missAnim : laneAnim;
    // "Alt Animation" chart notes -> use the -alt variant when the sprite has it.
    if (poseInfo.alt && sprite.animations[`${baseAnim}-alt`]) baseAnim = `${baseAnim}-alt`;
    const now = performance.now() / 1000;
    const age = now - Number(poseInfo.time || -10);
    const fallback = sprite.animations.idle || Object.values(sprite.animations || {})[0];
    const anim = sprite.animations[baseAnim] || fallback;
    if (anim && age >= 0 && age < singDuration(anim)) return { name: baseAnim, anim, elapsed: age };
    const idle = sprite.animations.idle || fallback;
    return { name: "idle", anim: idle ? { ...idle, loop: true } : idle, elapsed: t * 1.25 };
  }

  function setPoseAlt(char, alt) {
    const p = state.poses[char || "player"];
    if (p) p.alt = !!alt;
  }

  function isDadRole(value) {
    return ["dad", "opponent"].includes(String(value || "").trim().toLowerCase());
  }

  function dadSpriteKeyFromCharacter(value) {
    const name = String(value || "").trim().toLowerCase();
    if (name === "translookalike") return "smallizeDad";
    if (name === "translookalike2") return "unshrinkDad";
    if (name.startsWith("spikes")) return "spikesBf";
    if (name.startsWith("bf-lookalike")) return "shortDad";
    return "dad";
  }

  function dadVisualAt(t) {
    let visual = { key: "dad", started: 0, animName: null, animStarted: 0 };
    for (const event of SB.chart.commandEvents || []) {
      if (event.time > t) continue;
      if (event.action === "Change Character" && isDadRole(event.value)) {
        const key = dadSpriteKeyFromCharacter(event.value2);
        visual = {
          key,
          started: event.time,
          animName: key === "unshrinkDad" ? "Bigize" : null,
          animStarted: event.time
        };
      }
      if (event.action === "Play Animation" && isDadRole(event.value2) && event.value) {
        const animName = String(event.value || "");
        visual = {
          key: animName.toLowerCase() === "smallize" ? "smallizeDad" : visual.key,
          started: visual.started,
          animName,
          animStarted: event.time
        };
      }
    }
    if (!SB.sprites[visual.key]) visual.key = "dad";
    return visual;
  }

  function dadWorldPosition(spriteKey) {
    const sprite = SB.sprites[spriteKey] || SB.sprites.dad || {};
    return [
      840 + Number(sprite.position?.[0] || 0),
      840 + Number(sprite.position?.[1] || 0)
    ];
  }

  function phaseAt(t) {
    return {
      pixel: t >= PHASES.pixelIn && t < PHASES.pixelOut,
      void: t >= PHASES.voidIn && t < PHASES.voidOut,
      black: t >= PHASES.black,
      lyric: t >= stepTime(3534) && t < stepTime(3928),
      mirrorBroken: t >= stepTime(3612)
    };
  }

  function transformFor(t) {
    const phase = phaseAt(t);
    if (phase.pixel) {
      // Ease the camera in toward the pixel duo over the pixel section.
      const span = Math.max(0.001, PHASES.pixelOut - PHASES.pixelIn);
      const p = Math.min(1, Math.max(0, (t - PHASES.pixelIn) / span));
      const ease = p * p * (3 - 2 * p);
      const s0 = 0.24;
      const scale = s0 + (0.37 - s0) * ease;
      const fx = canvas.width * 0.5;
      const fy = canvas.height * 0.44;
      const x = fx - (fx - (-80)) * (scale / s0);
      const y = fy - (fy - (-620)) * (scale / s0);
      return { scale, x, y, noSmooth: true, pixelCover: true };
    }
    const zoomBoost = phase.lyric ? Math.min(0.1, Math.max(0, (t - stepTime(3534)) / 80)) : 0;
    return { scale: 0.375 * (1 + zoomBoost), x: 40 + silly.cameraPan, y: -38, noSmooth: false };
  }

  function screenX(worldX, transform) {
    return transform.x + worldX * transform.scale;
  }

  function screenY(worldY, transform) {
    return transform.y + worldY * transform.scale;
  }

  function drawWorldImage(key, transform, worldX = 0, worldY = 0, scaleMul = 1, alpha = 1) {
    const image = silly.images[`stage:${key}`];
    if (!imageReady(image)) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.imageSmoothingEnabled = !transform.noSmooth;
    if (!transform.noSmooth) ctx.imageSmoothingQuality = "high";
    ctx.drawImage(
      image,
      screenX(worldX, transform),
      screenY(worldY, transform),
      image.naturalWidth * transform.scale * scaleMul,
      image.naturalHeight * transform.scale * scaleMul
    );
    ctx.restore();
  }

  function drawAtlasTopLeftScaled(image, frame, x, y, scale, alpha = 1, flipX = false, noSmooth = false) {
    if (!imageReady(image) || !frame) return;
    const fw = frame.fw || frame.w;
    const fx = frame.fx || 0;
    const fy = frame.fy || 0;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.imageSmoothingEnabled = !noSmooth;
    if (!noSmooth) ctx.imageSmoothingQuality = "high";
    ctx.translate(x, y);
    if (flipX) {
      ctx.translate(fw * scale, 0);
      ctx.scale(-1, 1);
    }
    if (frame.rotated) {
      ctx.translate(-fx * scale, -fy * scale + frame.w * scale);
      ctx.rotate(-Math.PI / 2);
      ctx.drawImage(image, frame.x, frame.y, frame.w, frame.h, 0, 0, frame.w * scale, frame.h * scale);
    } else {
      ctx.drawImage(image, frame.x, frame.y, frame.w, frame.h, -fx * scale, -fy * scale, frame.w * scale, frame.h * scale);
    }
    ctx.restore();
  }

  function stepTime(step) {
    return step * STEP_TIME;
  }

  function noteDir(lane) {
    return NOTE_DIRS[((lane % 4) + 4) % 4];
  }

  function noteSkin(note, t) {
    const hurt = !!note?.hurt;
    const pixel = !hurt && phaseAt(t).pixel && SB.notes?.pixelImage && SB.notes?.pixelDirs;
    return {
      image: silly.images[hurt ? "notes:hurt" : pixel ? "notes:pixel" : "notes:main"],
      dirs: hurt ? (SB.notes?.hurtDirs || SB.notes?.dirs) : pixel ? SB.notes?.pixelDirs : SB.notes?.dirs,
      pixel
    };
  }

  function noteFrames(noteOrLane, t) {
    const lane = typeof noteOrLane === "number" ? noteOrLane : noteOrLane?.lane || 0;
    const skin = noteSkin(typeof noteOrLane === "number" ? null : noteOrLane, t);
    const dir = skin.dirs?.[noteDir(lane)];
    return { ...skin, dir };
  }

  function sillyPlayerLaneX(lane, t) {
    const base = laneX(lane);
    const middle = canvas.width * 0.5 + (lane - 5.5) * 110;
    const inStart = stepTime(3534);
    const outStart = stepTime(3928);
    const pIn = Math.max(0, Math.min(1, (t - inStart) / 1));
    const pOut = Math.max(0, Math.min(1, (t - outStart) / 1));
    const midBlend = t >= inStart && t < outStart ? pIn : t >= outStart ? 1 - pOut : 0;
    return base + (middle - base) * Math.max(0, Math.min(1, midBlend));
  }

  function sillyLanePoint(lane, t) {
    // Online matches: use the standard 8-lane playfield positions so both
    // players see all notes in the normal place (not on the mirror).
    if (isOnlineMatch()) return { x: laneX(lane), y: receptorY(), onMirror: false };
    if (lane < 4) {
      const transform = transformFor(t);
      return {
        x: screenX(790 + 225 * lane, transform),
        y: screenY(575, transform),
        onMirror: true
      };
    }
    return { x: sillyPlayerLaneX(lane, t), y: receptorY(), onMirror: false };
  }

  function sillyLaneX(lane, t) {
    return sillyLanePoint(lane, t).x;
  }

  function sillyLaneY(lane, t) {
    return sillyLanePoint(lane, t).y;
  }

  // True only when actually in an online match (not just visiting from the
  // online HTML in solo mode).
  function isOnlineMatch() {
    try { return typeof state !== "undefined" && state.mode === "online"; } catch (e) { return false; }
  }

  function sillyLaneAlpha(lane, t) {
    // Online matches: every note stays fully visible the whole song
    // (both opponent and player, no cutscene fade, no mirror hide).
    if (isOnlineMatch()) return 1;
    let alpha = lane < 4 ? 0.5 : 1;
    // Notes on the mirror (behind Silly Billy) vanish once the window cracks.
    if (lane < 4 && phaseAt(t).mirrorBroken) alpha = 0;
    if (lane >= 4 && t > stepTime(3534) && t < stepTime(3928)) alpha = 0;
    if (lane >= 4 && t >= stepTime(4417)) alpha = 0;
    return alpha;
  }

  function lanePassesFilter(lane, filter) {
    if (filter === "opp") return lane < 4;
    if (filter === "player") return lane >= 4;
    return true;
  }

  function drawSillyReceptor(lane, t) {
    const { image, dir } = noteFrames(lane, t);
    const alpha = sillyLaneAlpha(lane, t);
    if (!imageReady(image) || !dir || alpha <= 0.01) return;
    const fx = state.receptorFx[lane];
    const age = performance.now() / 1000 - fx.time;
    let frame = null;
    let scale = dir.pixel ? 6 : 0.72;
    let drawAlpha = alpha;
    if (age < 0.16 && dir.confirm?.length) {
      frame = frameFromList(dir.confirm, age, 26, false);
      scale = dir.pixel ? 6.15 + (0.16 - age) * 1.5 : 0.78 + (0.16 - age) * 0.9;
      drawAlpha *= 1 - age / 0.16;
    } else if (state.keysDown[lane] && dir.press?.length) {
      frame = frameFromList(dir.press, performance.now() / 1000, 24, true);
    } else {
      frame = dir.static;
    }
    if (frame) {
      const point = sillyLanePoint(lane, t);
      if (dir.pixel) {
        ctx.save();
        ctx.imageSmoothingEnabled = false;
      }
      drawAtlasCentered(image, frame, point.x, point.y, scale, drawAlpha);
      if (dir.pixel) ctx.restore();
    }
  }

  function drawSillySustain(note, x, topY, tailY, alpha = 1, t = songTime()) {
    if (!isHoldNote(note)) return;
    const { image, dir } = noteFrames(note, t);
    const hold = dir?.hold;
    if (!imageReady(image) || !hold?.piece || !hold?.end) return drawSportingSustain(note, x, topY, tailY, alpha);
    const pieceImage = hold.piece.imageKey ? silly.images[hold.piece.imageKey] : image;
    const endImage = hold.end.imageKey ? silly.images[hold.end.imageKey] : image;
    if (hold.piece.pixel && (!imageReady(pieceImage) || !imageReady(endImage))) return;
    const bodyScale = hold.piece.pixel ? 6 : note.hurt ? 0.78 : 0.86;
    const top = Math.min(topY, tailY);
    const bottom = Math.max(topY, tailY);
    const endH = (hold.end.fh || hold.end.h) * bodyScale;
    const bodyW = (hold.piece.fw || hold.piece.w) * bodyScale;
    const bodyTop = top + endH * 0.44;
    const bodyBottom = bottom - endH * 0.44;
    ctx.save();
    if (hold.piece.pixel) ctx.imageSmoothingEnabled = false;
    if (bodyBottom > bodyTop) drawAtlasStretchVertical(pieceImage, hold.piece, x, bodyTop, bodyW, bodyBottom - bodyTop, alpha * 0.9);
    drawAtlasCentered(endImage, hold.end, x, tailY, bodyScale, alpha);
    ctx.restore();
  }

  function drawSillyNote(note, x, y, scale, alpha = 1, t = songTime()) {
    const { image, dir } = noteFrames(note, t);
    const frame = dir?.gem;
    if (!imageReady(image) || !frame) return drawSportingNote(note.lane, x, y, 0.76 * scale, alpha);
    const noteScale = dir.pixel ? 6 * scale : 0.76 * scale;
    ctx.save();
    ctx.imageSmoothingEnabled = !dir.pixel;
    ctx.shadowBlur = dir.pixel ? 0 : note.hurt ? 28 : 18;
    ctx.shadowColor = note.hurt ? "#5df5ff" : COLORS[note.lane] || "#fff";
    if (note.hurt) {
      ctx.globalCompositeOperation = "screen";
      drawAtlasCentered(image, frame, x, y, 0.78 * scale, alpha);
      ctx.globalCompositeOperation = "source-over";
      drawAtlasCentered(image, frame, x, y, 0.72 * scale, alpha);
    } else {
      drawAtlasCentered(image, frame, x, y, noteScale, alpha);
    }
    ctx.restore();
  }

  function drawSillyReceptors(t, filter = "all") {
    for (let lane = 0; lane < 8; lane++) {
      if (!lanePassesFilter(lane, filter)) continue;
      drawSillyReceptor(lane, t);
      if (lane < 4) continue;
      const x = sillyLaneX(lane, t);
      const alpha = sillyLaneAlpha(lane, t);
      if (alpha > 0.01) {
        ctx.strokeStyle = `rgba(255,255,255,${(0.05 * alpha).toFixed(3)})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x, receptorY() + 26);
        ctx.lineTo(x, 448);
        ctx.stroke();
      }
    }
  }

  function drawSillyNotes(t, filter = "all") {
    if (!state.chart) return;
    const scroll = state.currentSong.scroll;
    for (const note of state.chart.notes) {
      if (!lanePassesFilter(note.lane, filter)) continue;
      if (note.played && note.hit && (!isHoldNote(note) || note.holdDone)) continue;
      if (note.judged && note.side !== "opp" && (!isHoldNote(note) || note.holdDone || !note.hit)) continue;
      const diff = note.time - t;
      const x = sillyLaneX(note.lane, t);
      const recY = sillyLaneY(note.lane, t);
      const y = recY + diff * scroll;
      const tailY = recY + (holdEndTime(note) - t) * scroll;
      if (y < -140 && tailY < -140) continue;
      if (y > canvas.height + 140 && tailY > canvas.height + 140) continue;
      const alpha = sillyLaneAlpha(note.lane, t) * (note.side === "opp" ? 0.84 : 1);
      if (alpha <= 0.01) continue;
      const scale = Math.max(0.75, Math.min(1.12, 1 - Math.pow(Math.abs(diff), 0.7) * 0.45));
      if (isHoldNote(note)) drawSillySustain(note, x, note.hit ? recY : y, tailY, alpha * (note.hit ? 0.94 : 1), t);
      if (note.hit && isHoldNote(note) && t > note.time) continue;
      drawSillyNote(note, x, y, scale, alpha, t);
    }
  }

  function drawSprite(spriteKey, poseKey, worldX, worldY, t, options = {}) {
    // Spikes-BF idle redirect: when he isn't singing, render the "shrunk
    // yourself" (shortDad / small silly billy) form in his place — still fully
    // darkened — so the resting pose reads as a darkened tiny silly billy.
    // Sing/move animations keep using spikesBf at his (slightly bumped) scale.
    if (spriteKey === "spikesBf" && !options.animName && !options._spikesIdleRedirected) {
      const probeSprite = SB.sprites.spikesBf;
      if (probeSprite && SB.sprites.shortDad) {
        const probePose = currentSpriteAnim(probeSprite, poseKey, t);
        if (probePose && probePose.name === "idle") {
          ctx.save();
          try { ctx.filter = "brightness(0.3)"; } catch {}
          drawSprite("shortDad", poseKey, worldX, worldY, t, { ...options, _spikesIdleRedirected: true });
          try { ctx.restore(); } catch {}
          return;
        }
      }
    }
    const sprite = SB.sprites[spriteKey];
    const image = silly.images[`sprite:${spriteKey}`];
    if (!sprite || !imageReady(image)) return;
    const transform = transformFor(t);
    const forcedAnim = options.animName && sprite.animations?.[options.animName]
      ? { name: options.animName, anim: sprite.animations[options.animName], elapsed: Number(options.elapsed || 0) }
      : null;
    const pose = forcedAnim || currentSpriteAnim(sprite, poseKey, t);
    const frame = frameFromAnimation(pose.anim, pose.elapsed);
    if (!frame) return;
    const localScale = Number(options.scale || sprite.scale || 1);
    const scale = transform.scale * localScale;
    const offset = pose.anim?.offset || [0, 0];
    const x = screenX(worldX - Number(offset[0] || 0) * localScale, transform);
    const y = screenY(worldY - Number(offset[1] || 0) * localScale, transform);
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.beginPath();
    ctx.ellipse(x + (frame.fw || frame.w) * scale * 0.42, y + (frame.fh || frame.h) * scale * 0.94, Math.max(28, (frame.fw || frame.w) * scale * 0.22), Math.max(9, (frame.fh || frame.h) * scale * 0.035), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    const flipX = options.flipX ?? (sprite.renderFlipX ?? !!sprite.flipX);
    if (spriteKey === "spikesBf") { try { ctx.save(); ctx.filter = "brightness(0.3)"; } catch {} }
    drawAtlasTopLeftScaled(image, frame, x, y, scale, Number(options.alpha ?? 1), flipX, transform.noSmooth || sprite.noAntialiasing);
    if (spriteKey === "spikesBf") { try { ctx.restore(); } catch {} }
  }

  function drawDadSprite(t) {
    const visual = dadVisualAt(t);
    const [x, y] = dadWorldPosition(visual.key);
    const options = visual.animName
      ? { animName: visual.animName, elapsed: t - visual.animStarted }
      : {};
    drawSprite(visual.key, "dad", x, y, t, options);
  }

  function drawSchoolAtlas(t, transform) {
    const school = SB.sprites.school;
    const image = silly.images["sprite:school"];
    if (!school || !imageReady(image)) return;
    const frame = frameFromAnimation(school.animations.idle, t);
    if (!frame) return;
    if (transform.pixelCover) {
      const cropX = 145;
      const cropY = 218;
      const cropW = 208;
      const cropH = 117;
      const baseScale = Math.max(canvas.width / cropW, canvas.height / cropH);
      // Zoom the background WITH the characters so the camera actually pushes in,
      // instead of the sprites growing against a static background.
      const zf = transform.scale / 0.24;
      const fx = canvas.width * 0.5;
      const fy = canvas.height * 0.44;
      const w = cropW * baseScale * zf;
      const h = cropH * baseScale * zf;
      const baseX = (canvas.width - cropW * baseScale) * 0.5;
      const baseY = (canvas.height - cropH * baseScale) * 0.5;
      const x = fx + (baseX - fx) * zf;
      const y = fy + (baseY - fy) * zf;
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(image, frame.x + cropX, frame.y + cropY, cropW, cropH, x, y, w, h);
      ctx.restore();
      return;
    }
    drawAtlasTopLeftScaled(image, frame, screenX(50, transform), screenY(0, transform), transform.scale * school.scale, 1, false, true);
  }

  function drawMonika(t, transform) {
    const monika = SB.sprites.monika;
    const image = silly.images["sprite:monika"];
    if (!monika || !imageReady(image)) return;
    const frame = frameFromAnimation(monika.animations.idle, t);
    if (!frame) return;
    drawAtlasTopLeftScaled(image, frame, screenX(SB.stage.positions.monika[0], transform), screenY(SB.stage.positions.monika[1], transform), transform.scale * monika.scale, 0.5, false, true);
  }

  function pixelTransitionAlpha(t) {
    const windows = [
      [stepTime(2312), stepTime(2321)],
      [stepTime(2442), stepTime(2450)]
    ];
    for (const [fadeOut, fadeIn] of windows) {
      const fadeOutEnd = fadeOut + 0.2;
      const fadeInEnd = fadeIn + 0.2;
      if (t >= fadeOut && t < fadeOutEnd) return Math.min(1, (t - fadeOut) / 0.2);
      if (t >= fadeOutEnd && t < fadeIn) return 1;
      if (t >= fadeIn && t < fadeInEnd) return Math.max(0, 1 - (t - fadeIn) / 0.2);
    }
    return 0;
  }

  function drawStageFade(alpha) {
    if (alpha <= 0.01) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
  }

  function isSingingCutscene(t) {
    return t >= stepTime(3534) && t < stepTime(3928);
  }

  function isIllMakeCharacterCutscene(t) {
    // Sprite animation runs first when the lyrics start (step 3534) for its
    // full length (~10.9s); the SO_STAY_FINAL video plays AFTER it (1s later).
    return t >= stepTime(3534) && t < stepTime(3660);
  }

  function drawIllMakeLyricSprite(spriteKey, elapsed, t, alpha = 1) {
    const sprite = SB.sprites[spriteKey];
    const image = silly.images[`sprite:${spriteKey}`];
    const anim = sprite?.animations?.idle;
    if (!sprite || !imageReady(image) || !anim) return 0;
    const frame = frameFromAnimation(anim, elapsed);
    const duration = (anim.frames?.length || 0) / Number(anim.fps || 31);
    if (!frame) return duration;
    const transform = transformFor(t);
    const scale = transform.scale * Number(sprite.scale || 1);
    ctx.save();
    ctx.imageSmoothingEnabled = !sprite.noAntialiasing;
    try { ctx.filter = "brightness(0.45)"; } catch {} // darken the lyric texture
    drawAtlasTopLeftScaled(image, frame, screenX(770, transform), screenY(410, transform), scale, alpha, false, transform.noSmooth || sprite.noAntialiasing);
    ctx.restore();
    return duration;
  }

  // --- Adobe Animate texture-atlas player for the remastered lyric animation ---
  const LYR = window.SILLY_BILLY_LYRIC || null;
  const lyrSymLen = {};
  function lyrTimelineLength(layers) {
    let len = 1;
    for (const layer of layers) { const k = layer[layer.length - 1]; if (k) len = Math.max(len, k[0] + k[1]); }
    return len;
  }
  const lyrMainLen = LYR ? lyrTimelineLength(LYR.main) : 0;
  function lyrKeyframeAt(layer, frame) {
    for (const kf of layer) { if (frame >= kf[0] && frame < kf[0] + kf[1]) return kf; }
    const last = layer[layer.length - 1];
    return last && frame >= last[0] ? last : null;
  }
  function drawLyrSprite(name) {
    const a = LYR.atlas[name];
    const img = silly.images["lyric:sheet"];
    if (!a || !imageReady(img)) return;
    const x = a[0], y = a[1], w = a[2], h = a[3];
    if (a[4]) { ctx.save(); ctx.translate(0, h); ctx.rotate(-Math.PI / 2); ctx.drawImage(img, x, y, h, w, 0, 0, h, w); ctx.restore(); }
    else ctx.drawImage(img, x, y, w, h, 0, 0, w, h);
  }
  function drawLyrTimeline(layers, frame, depth) {
    if (depth > 10) return;
    for (let li = layers.length - 1; li >= 0; li--) {
      const kf = lyrKeyframeAt(layers[li], frame);
      if (!kf) continue;
      for (const el of kf[2]) {
        ctx.save();
        if (el[0] === "a") {
          ctx.transform(el[2], el[3], el[4], el[5], el[6], el[7]);
          drawLyrSprite(el[1]);
        } else {
          const sub = LYR.symbols[el[1]];
          if (sub) {
            const len = lyrSymLen[el[1]] || (lyrSymLen[el[1]] = lyrTimelineLength(sub));
            const ff = el[2], lc = el[3], elapsed = frame - kf[0];
            const sf = lc === 2 ? ff : lc === 1 ? Math.min(len - 1, ff + elapsed) : (((ff + elapsed) % len) + len) % len;
            ctx.transform(el[4], el[5], el[6], el[7], el[8], el[9]);
            drawLyrTimeline(sub, sf, depth + 1);
          }
        }
        ctx.restore();
      }
    }
  }
  const LYR_TUNE = { scale: 0.392, x: 0.5, y: 0.5, ox: 273, oy: 82 };
  function renderLyricFrame(frame, alpha) {
    if (!LYR || !imageReady(silly.images["lyric:sheet"])) return;
    ctx.save();
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    ctx.imageSmoothingEnabled = true;
    ctx.translate(canvas.width * LYR_TUNE.x, canvas.height * LYR_TUNE.y);
    ctx.scale(LYR_TUNE.scale, LYR_TUNE.scale);
    ctx.translate(LYR_TUNE.ox, LYR_TUNE.oy);
    drawLyrTimeline(LYR.main, Math.max(0, Math.min(lyrMainLen - 1, frame)), 0);
    ctx.restore();
  }

  function drawIllMakeLyricAnimation(t) {
    const start = stepTime(3534);
    const end = stepTime(3660);
    if (t < start || t >= end) return;
    const first = SB.sprites.lyricSay?.animations?.idle;
    const firstDuration = first ? (first.frames?.length || 0) / Number(first.fps || 31) : 0;
    const age = t - start;
    const fadeIn = Math.min(1, age / 0.18);
    const fadeOut = Math.min(1, Math.max(0, (end - t) / 0.35));
    const alpha = Math.min(fadeIn, fadeOut);
    if (age < firstDuration) drawIllMakeLyricSprite("lyricSay", age, t, alpha);
    else drawIllMakeLyricSprite("lyricProud", age - firstDuration, t, alpha);
  }

  function ensureLyricSheet(t) {
    // Keep the ~80MB lyric spritemap in memory only around its cutscene
    // (sprite plays ~306-318s). Loaded ~9s early so it's decoded in time.
    const want = t >= stepTime(3424) && t < stepTime(3700);
    if (want) {
      if (!silly.images["lyric:sheet"] && window.SILLY_BILLY_LYRIC?.image)
        loadImage("lyric:sheet", "assets/silly-billy/" + window.SILLY_BILLY_LYRIC.image);
    } else if (silly.images["lyric:sheet"]) {
      silly.images["lyric:sheet"] = null;
    }
  }

  function drawSillyStage(t) {
    initAssets();
    const phase = phaseAt(t);
    if (phase.pixel) {
      const transform = transformFor(t);
      ctx.save();
      ctx.fillStyle = "#05040a";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      drawSchoolAtlas(t, transform);
      drawMonika(t, transform);
      drawSprite("pixelDad", "dad", SB.stage.positions.pixelDad[0], SB.stage.positions.pixelDad[1], t, { scale: 7 });
      drawSprite("pixelPlayer", "player", SB.stage.positions.pixelPlayer[0], SB.stage.positions.pixelPlayer[1], t, { scale: 12 });
      drawStageFade(pixelTransitionAlpha(t));
      ctx.restore();
      return;
    }

    const transform = transformFor(t);
    if (phase.void) {
      ctx.save();
      ctx.fillStyle = "#010104";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      drawWorldImage("void", transform, -440, 120, 1.25, 0.9);
      drawWorldImage("light", transform, SB.stage.positions.light[0], SB.stage.positions.light[1], 1, 1);
      drawSprite("player", "player", SB.stage.positions.player[0], SB.stage.positions.player[1], t);
      ctx.restore();
      return;
    }

    const cloudAlpha = 0.45 + Math.sin(t * 0.7) * 0.35;
    drawWorldImage(phase.mirrorBroken ? "brokenMirror" : "mirror", transform);
    drawSillyReceptors(t, "opp");
    drawSillyNotes(t, "opp");
    drawWorldImage("floor", transform);
    drawWorldImage("pillars1", transform);
    drawWorldImage("clouds", transform, -360, -180, 2, cloudAlpha);
    if (isIllMakeCharacterCutscene(t)) drawIllMakeLyricAnimation(t);
    else drawDadSprite(t);
    drawSprite("player", "player", SB.stage.positions.player[0], SB.stage.positions.player[1], t);
    drawWorldImage("pillars2", transform);
    const vignette = silly.images["stage:vignette"];
    if (imageReady(vignette)) {
      ctx.save();
      ctx.globalAlpha = 0.82;
      ctx.drawImage(vignette, 0, 0, canvas.width, canvas.height);
      ctx.restore();
    }
    if (t < 13) {
      const fade = t < 10.8 ? 1 : Math.max(0, 1 - (t - 10.8) / 2.2);
      ctx.save();
      ctx.globalAlpha = fade * 0.96;
      ctx.fillStyle = "#030305";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
    }
    if (phase.black) {
      ctx.save();
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
    }
    drawStageFade(pixelTransitionAlpha(t));
  }

  function playVideoInSync(video, targetTime) {
    if (!video || targetTime < 0) return;
    try {
      if (Math.abs((video.currentTime || 0) - targetTime) > 0.18) video.currentTime = targetTime;
      if (video.paused && !video.ended) video.play().catch(() => {});
    } catch {}
  }

  function drawCoverVideo(video, alpha = 1) {
    if (!video || video.readyState < 2) return;
    const vw = video.videoWidth || 1280;
    const vh = video.videoHeight || 720;
    if (!vw || !vh) return;
    const scale = Math.max(canvas.width / vw, canvas.height / vh);
    const w = vw * scale;
    const h = vh * scale;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(video, (canvas.width - w) * 0.5, (canvas.height - h) * 0.5, w, h);
    ctx.restore();
  }

  function drawSillyVideos(t) {
    ensureSillyBillyVideos();
    const introDelay = 3;
    if (silly.videoIntro && t >= introDelay && t < introDelay + 11.8) {
      playVideoInSync(silly.videoIntro, t - introDelay);
      drawCoverVideo(silly.videoIntro, Math.min(1, (introDelay + 11.8 - t) / 1.2));
    }
    // SO_STAY_FINAL plays AFTER the lyric sprite animation, delayed 1s. Its
    // last ~16s are replaced by the (muted) flashback cutscene.
    const stayStart = stepTime(3660) + 1;
    const flashStart = stayStart + (34.2 - 16) - 1; // flashback takes over ~1s before the last 16s
    const flashDur = 17.6;                       // full flashback (~17.54s)
    if (silly.videoStay && t >= stayStart && t < flashStart) {
      if (!silly.stayStarted) {
        silly.stayStarted = true;
        try { silly.videoStay.currentTime = 0; } catch {}
      }
      playVideoInSync(silly.videoStay, t - stayStart);
      drawCoverVideo(silly.videoStay, Math.min(1, (t - stayStart) / 0.4));
    } else if (silly.videoFlashback && t >= flashStart && t < flashStart + flashDur) {
      try { if (silly.videoStay && !silly.videoStay.paused) silly.videoStay.pause(); } catch {}
      if (!silly.flashStarted) {
        silly.flashStarted = true;
        try { silly.videoFlashback.currentTime = 0; } catch {}
      }
      silly.videoFlashback.muted = true; // no sound
      playVideoInSync(silly.videoFlashback, t - flashStart);
      drawCoverVideo(silly.videoFlashback, Math.min(1, (t - flashStart) / 0.4));
    }
  }

  function drawTintedStretch(image, x, y, w, h, color, alpha = 1) {
    if (w <= 0 || h <= 0) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    if (imageReady(image)) {
      ctx.drawImage(image, 0, 0, image.naturalWidth, image.naturalHeight, x, y, w, h);
      ctx.globalCompositeOperation = "source-atop";
      ctx.fillStyle = color;
      ctx.fillRect(x, y, w, h);
    } else {
      ctx.fillStyle = color;
      ctx.fillRect(x, y, w, h);
    }
    ctx.restore();
  }

  function drawHealthIcon(image, x, y, flipX = false, alpha = 1) {
    if (!imageReady(image)) return;
    const frameW = Math.min(150, image.naturalWidth);
    const frameH = Math.min(150, image.naturalHeight);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.translate(x, y);
    if (flipX) {
      ctx.translate(frameW, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(image, 0, 0, frameW, frameH, 0, 0, frameW, frameH);
    ctx.restore();
  }

  function drawHudImage(image, x, y, scale = 1, alpha = 1, pixel = false) {
    if (!imageReady(image)) return;
    const cropIcon = pixel && image.naturalWidth >= image.naturalHeight * 2;
    const sw = cropIcon ? image.naturalWidth / 2 : image.naturalWidth;
    const sh = image.naturalHeight;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.imageSmoothingEnabled = !pixel;
    if (!pixel) ctx.imageSmoothingQuality = "high";
    ctx.drawImage(image, 0, 0, sw, sh, x, y, sw * scale, sh * scale);
    ctx.restore();
  }

  function latestIconSwitch(t) {
    let value = "1";
    for (const event of SB.chart.commandEvents || []) {
      if (event.time <= t && event.action === "icon switch") value = String(event.value || "1");
    }
    return value;
  }

  function sillyHudIconState(t) {
    if (phaseAt(t).pixel) {
      return {
        pixel: true,
        opponent: { key: "iconPixelDad", x: 260, y: 565 },
        player: { key: "iconPixelBf", x: 410, y: 545 }
      };
    }
    const opponentMap = {
      "0": { key: "iconAishite3", x: 260, y: 565 },
      "1": { key: "iconAishite4", x: 100, y: 565 },
      "2": { key: "iconAishite5", x: -50, y: 555 },
      "3": { key: "iconAishite6", x: -200, y: 565 },
      "4": { key: "iconAishite7", x: -360, y: 555 }
    };
    return {
      pixel: false,
      opponent: opponentMap[latestIconSwitch(t)] || opponentMap["1"],
      player: state.health < 0.625
        ? { key: "iconAishite1", x: 250, y: 550 }
        : { key: "iconAishite2", x: 410, y: 545 }
    };
  }

  function drawSillyHud(t) {
    const back = silly.images["stage:healthBack"];
    const pixelHud = phaseAt(t).pixel;
    const bar = silly.images[pixelHud ? "stage:healthBarPico" : "stage:healthBar"];
    const fill = silly.images[pixelHud ? "stage:healthFillPico" : "stage:healthFill"];
    const icons = sillyHudIconState(t);
    const sx = canvas.width / 1280;
    const sy = canvas.height / 720;
    const health = Math.max(0, Math.min(1, state.health));
    const psychHealth = health * 2;
    let healthSizeBf = Math.floor(315 * psychHealth / 1.965);
    let healthSizeOpponent = Math.floor(315 * psychHealth / 1.965);
    if (healthSizeBf <= 1) healthSizeBf = 1;
    if (healthSizeOpponent >= 319) healthSizeOpponent = 319;
    const frameX = 0;
    const frameY = 480 * sy;
    const frameW = 800 * sx;
    const frameH = 296 * sy;
    const fillY = 619.5 * sy;
    const fillH = 112 * 0.2 * sy;
    const playerX = 432.5 * sx;
    const playerW = healthSizeBf * sx;
    const oppW = (320 - healthSizeOpponent) * sx;
    ctx.save();
    ctx.globalAlpha = 0.96;
    if (imageReady(back)) ctx.drawImage(back, frameX, frameY, frameW, frameH);
    drawTintedStretch(fill, playerX - oppW, fillY, oppW, fillH, pixelHud ? "#111817" : "#8a0101", 1);
    drawTintedStretch(fill, playerX, fillY, playerW, fillH, pixelHud ? "#62e668" : "#f4f0ff", 1);
    if (imageReady(bar)) ctx.drawImage(bar, frameX, frameY, frameW, frameH);
    drawHudImage(silly.images[`stage:${icons.opponent.key}`], icons.opponent.x * sx, icons.opponent.y * sy, sx, 0.98, icons.pixel);
    drawHudImage(silly.images[`stage:${icons.player.key}`], icons.player.x * sx, icons.player.y * sy, sx, 0.98, icons.pixel);
    ctx.restore();
  }

  function commandValueAt(action, t) {
    let found = null;
    for (const event of SB.chart.commandEvents || []) {
      if (event.time <= t && event.action === action) found = event;
    }
    return found;
  }

  function isBlackedOut(t) {
    // Test of Time "BlackOut" events toggle a full-screen black cover.
    let on = false;
    for (const event of SB.chart.commandEvents || []) {
      if (event.action !== "BlackOut") continue;
      if (event.time > t) break;
      const v = String(event.value).toLowerCase();
      on = v === "true" || v === "1";
    }
    return on;
  }

  function currentLyric(t) {
    let active = null;
    for (const event of SB.chart.lyricEvents || []) {
      if (event.time <= t) active = event;
      else break;
    }
    if (!active) return null;
    const next = (SB.chart.lyricEvents || []).find(event => event.time > active.time);
    const end = next ? next.time + 0.3 : active.time + 2.4;
    if (t > end) return null;
    return active;
  }

  // Anime-style speed lines (radial white streaks scrolling outward from the
  // center) — a JS port of mods/shaders/SpeedEffect.frag. Triggered for 10s
  // right after the "Count Your Seconds!" lyric (283s -> 293s) with quick
  // fade in / out so it punches in and bleeds out.
  const SPEED_LINES = { start: 283.006, dur: 10.0, fadeIn: 0.5, fadeOut: 0.8 };
  function speedLinesIntensity(t) {
    const s = SPEED_LINES.start;
    const e = s + SPEED_LINES.dur;
    if (t < s || t >= e) return 0;
    const inT = (t - s) / SPEED_LINES.fadeIn;
    const outT = (e - t) / SPEED_LINES.fadeOut;
    return Math.max(0, Math.min(1, Math.min(inT, outT)));
  }
  function drawSillySpeedLines(t) {
    if (window.PERFORMANCE_MODE || window.REDUCE_MOTION) return;
    const intensity = speedLinesIntensity(t);
    if (intensity <= 0) return;
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const maxR = Math.hypot(cx, cy);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";

    // Faithful port of mods/shaders/SpeedEffect.frag.
    // The shader runs per pixel; here we sample a dense set of angles around
    // the screen center, replicate its threshold-and-multiply logic, and
    // draw a full-length radial streak everywhere the shader would have lit
    // up the pixel. Same flicker timing (speed=25, 1.2x harmonic), same
    // smoothstep mask (cutoff=0.2), same per-angle gate against the `effect`
    // uniform (driven here by `intensity`).
    const SPEED = 25.0;
    const CUTOFF = 0.2; // smoothstep low edge from shader
    const SMOOTH_TOP = 0.7; // smoothstep high edge
    const N_ANGLES = 360; // one streak per degree
    // Deterministic 2D noise (close-enough port of the shader's noise() for
    // sampling along a single radial direction parameterized by angle).
    function noise2(a, b) {
      const n = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
      return n - Math.floor(n);
    }
    for (let i = 0; i < N_ANGLES; i++) {
      const angle = (i / N_ANGLES) * Math.PI * 2;
      // Shader does dir = normalize(centeredUV) * (size + noise(iTime)); size=50.
      // The direction's magnitude pulses slightly with time. Same idea here.
      const sizePulse = 50 + (Math.sin(t * 1.3 + i * 0.07) * 0.5);
      const dirSeed = angle * sizePulse;
      // amount = noise(dir, iTime*speed) * noise(dir, iTime*speed*1.2)
      const a1 = noise2(dirSeed, t * SPEED);
      const a2 = noise2(dirSeed, t * SPEED * 1.2);
      let amount = a1 * a2;
      // Shader: if (amount > 0.2) amount *= 3; else amount = 0;
      if (amount > 0.2) amount *= 3.0;
      else continue;
      // Shader: if (noise(dir, iTime) > effect) amount = 0. Our `effect` is
      // driven by intensity (higher intensity = more streaks survive).
      const gate = noise2(dirSeed, t);
      if (gate > intensity * 0.9) continue;
      // Draw the lit ray. The shader's smoothstep(0.2, 0.7, dist) makes
      // brightness ramp from 0 at radius 20% to 1 at 70%. We mimic this with
      // a linear gradient stroke from minR outward.
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const r0 = maxR * CUTOFF;
      const r1 = maxR * (SMOOTH_TOP + 0.3); // extend past edges so the streak meets the corner
      const x0 = cx + cos * r0;
      const y0 = cy + sin * r0;
      const x1 = cx + cos * r1;
      const y1 = cy + sin * r1;
      const alpha = Math.min(1, amount) * intensity;
      const grad = ctx.createLinearGradient(x0, y0, x1, y1);
      grad.addColorStop(0, "rgba(255,255,255,0)");
      grad.addColorStop((SMOOTH_TOP - CUTOFF) / (SMOOTH_TOP + 0.3 - CUTOFF), "rgba(255,255,255," + alpha.toFixed(3) + ")");
      grad.addColorStop(1, "rgba(255,255,255," + alpha.toFixed(3) + ")");
      ctx.strokeStyle = grad;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawSillyPostFx(t) {
    const phase = phaseAt(t);
    const lyric = currentLyric(t);
    const zoomEvent = commandValueAt("setZoom", t);
    const addZoom = (SB.chart.commandEvents || []).filter(event => event.action === "Add Camera Zoom" && t >= event.time && t < event.time + 0.18).length;
    const lyricPower = lyric ? 1 : 0;
    const zoomAge = zoomEvent ? t - zoomEvent.time : Infinity;
    const zoomPower = zoomEvent && zoomAge < 1.1
      ? (1 - zoomAge / 1.1) * Math.min(1, Number(zoomEvent.value || 0.5))
      : 0;
    if (phase.lyric || lyricPower || zoomPower || addZoom) {
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      const pulse = 0.08 + Math.sin(t * 8) * 0.03 + zoomPower * 0.05 + Math.min(0.16, addZoom * 0.035);
      const g = ctx.createRadialGradient(canvas.width * 0.5, canvas.height * 0.45, 50, canvas.width * 0.5, canvas.height * 0.45, 680);
      g.addColorStop(0, `rgba(230,210,255,${Math.max(0, pulse).toFixed(3)})`);
      g.addColorStop(0.55, "rgba(138,94,180,0.045)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
    }
    if (phase.lyric || t >= stepTime(3888)) {
      const strength = t >= stepTime(3888) ? 0.18 : 0.08;
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      ctx.globalAlpha = strength;
      ctx.drawImage(canvas, -3, 0);
      ctx.globalAlpha = strength * 0.78;
      ctx.drawImage(canvas, 3, 0);
      ctx.restore();
    }
    if (t >= stepTime(3888) && t < stepTime(4450)) {
      ctx.save();
      ctx.fillStyle = "rgba(35,105,255,0.13)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.globalAlpha = 0.08 + Math.sin(t * 22) * 0.025;
      ctx.fillStyle = "#9fe8ff";
      for (let y = 0; y < canvas.height; y += 4) ctx.fillRect(0, y, canvas.width, 1);
      ctx.restore();
    }
    for (const flashStep of [640, 1552, 1615, 1680, 1824, 1830, 1836, 1856, 1862, 1868]) {
      const age = t - flashStep * STEP_TIME;
      if (age >= 0 && age < 0.16) {
        ctx.save();
        ctx.globalAlpha = (1 - age / 0.16) * (flashStep === 1552 || flashStep === 1680 || flashStep === 1824 || flashStep === 1836 || flashStep === 1862 ? 0.36 : 0.28);
        ctx.fillStyle = flashStep === 1552 || flashStep === 1680 || flashStep === 1824 || flashStep === 1836 || flashStep === 1862 ? "#ff244e" : "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.restore();
        break;
      }
    }
    if (isBlackedOut(t)) {
      ctx.save();
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
    }
    // Black screen during the 1s delay before the SO_STAY video.
    if (t >= stepTime(3660) && t < stepTime(3660) + 1) {
      ctx.save();
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
    }
    // Flashbang when the mirror breaks (step 3612): white flash fading over 0.5s.
    {
      const mb = stepTime(3612);
      if (t >= mb && t < mb + 0.5) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - (t - mb) / 0.5);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.restore();
      }
    }
    if (lyric) {
      const age = Math.max(0, t - lyric.time);
      const alpha = Math.min(1, age / 0.18) * Math.min(1, (2.5 - age) / 0.28);
      ctx.save();
      ctx.globalAlpha = Math.max(0, alpha);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = "900 48px Trebuchet MS, Arial Black, sans-serif";
      ctx.lineWidth = 10;
      ctx.strokeStyle = "rgba(0,0,0,0.86)";
      ctx.fillStyle = lyric.color ? `#${lyric.color}` : "#fff4fb";
      ctx.shadowBlur = 24;
      ctx.shadowColor = lyric.color ? "rgba(0,0,0,0.75)" : "rgba(240,190,255,0.85)";
      const y = canvas.height * 0.78 + Math.sin(t * 5) * 2;
      ctx.strokeText(lyric.text, canvas.width / 2, y);
      ctx.fillText(lyric.text, canvas.width / 2, y);
      ctx.restore();
    }
    drawSillyVideos(t);
    // Speed-lines burst: 10s after "Count Your Seconds!" (283s -> 293s).
    drawSillySpeedLines(t);
    if (isSingingCutscene(t)) {
      drawSillyReceptors(t, "player");
      drawSillyNotes(t, "player");
    }
    drawSillyHud(t);
  }

  function updateSillyCamera(t, dt) {
    baseUpdateCamera(t, dt);
    if (state.selectedSong !== "sillyBilly") return;
    const section = state.chart?.timeline?.find(entry => t >= entry.startTime && t < entry.endTime);
    const turn = section?.turn || "both";
    const camZoomEvent = commandValueAt("Camera Zoom", t);
    const lyricZoom = commandValueAt("zoomin", t);
    const addZoom = (SB.chart.commandEvents || []).filter(event => event.action === "Add Camera Zoom" && t >= event.time && t < event.time + 0.18).length;
    const targetPan = turn === "player" ? -48 : turn === "opp" ? 42 : 0;
    let targetZoom = phaseAt(t).lyric ? 1.055 : 1;
    if (camZoomEvent && t - camZoomEvent.time < 1.4) targetZoom = Math.max(targetZoom, 1 + (Number(camZoomEvent.value || 1) - 1) * 0.18);
    if (lyricZoom && t - lyricZoom.time < 1.2) targetZoom = Math.max(targetZoom, 1 + Number(lyricZoom.value || 0) * 0.38);
    if (addZoom) targetZoom += Math.min(0.08, addZoom * 0.018);
    const lerp = Math.min(1, Math.max(0.04, dt * 4.8));
    silly.cameraPan += (targetPan - silly.cameraPan) * lerp;
    silly.cameraZoom += (targetZoom - silly.cameraZoom) * lerp;
    state.camera.zoom = silly.cameraZoom;
    state.camera.focusX = canvas.width * 0.5;
    state.camera.focusY = canvas.height * 0.5;
    const shakeEvent = commandValueAt("Screen Shake", t);
    const shakeAge = shakeEvent ? t - shakeEvent.time : Infinity;
    if (shakeAge >= 0 && shakeAge < 0.55) {
      const power = (1 - shakeAge / 0.55) * 8;
      state.camera.highwayX = Math.sin(t * 96) * power;
      state.camera.highwayY = Math.cos(t * 82) * power * 0.72;
    }
  }

  function handleSillyPress(lane) {
    if (state.selectedSong !== "sillyBilly") return baseHandlePress(lane);
    if (!state.playing || !state.chart) return;
    const t = songTime();
    const side = lane < 4 ? "opp" : "player";
    // Match the rule the engine + other modes use: solo controls only player,
    // versus controls both sides, online controls whichever side this client
    // is assigned (host -> player, guest -> opp).
    const controlsSide = typeof localControlsSide === "function"
      ? localControlsSide(side)
      : side === "player" || state.mode === "versus";
    if (!controlsSide) return;
    let best = null;
    let bestDiff = Infinity;
    for (const note of state.chart.notes) {
      if (note.judged || note.side !== side || note.lane !== lane) continue;
      const diff = Math.abs(note.time - t);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = note;
      }
      if (note.time - t > 0.2) break;
    }
    if (!best || bestDiff > 0.155) return;
    best.judged = true;
    best.played = true;
    best.hit = true;
    if (best.hurt) {
      state.health = Math.max(0, state.health - 0.24);
      state.shake = { time: performance.now() / 1000, intensity: 7 };
      state.receptorFx[lane] = { time: performance.now() / 1000, lane };
      feed(side, "HURT", "#5df5ff");
      pose(best.character || "player", lane % 4, "miss");
      setPoseAlt(best.character || "player", best.alt);
      return;
    }
    if (isHoldNote(best)) {
      best.holdActive = true;
      best.holdDone = false;
      best.played = false;
    }
    if (bestDiff <= 0.045) judge(side, "perfect", lane, best.character);
    else if (bestDiff <= 0.09) judge(side, "good", lane, best.character);
    else judge(side, "bad", lane, best.character);
    setPoseAlt(best.character || "player", best.alt);
  }

  function sillyLifeDrain(t) {
    // Opponent's passive life drain escalates through the song's lyric beats.
    if (t >= 377)            return { rate: 0.050, floor: 0.00 };  // last ~10s: power-50 finale drain (can kill)
    if (t >= stepTime(3534)) return { rate: 0.030, floor: 0.10 };  // after the ill-make lyrics (strongest)
    if (t >= 283.006)        return { rate: 0.0195, floor: 0.25 }; // after "Count Your Seconds" (~as strong as ours)
    if (t >= 192.832)        return { rate: 0.012, floor: 0.40 };  // after "Your Time Is Over"
    return { rate: 0.006, floor: 0.55 };                           // base
  }

  function handleSillyMisses(t) {
    if (state.selectedSong !== "sillyBilly") return baseHandleMisses(t);
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
        if (note.character) { pose(note.character, note.lane % 4, "hit"); setPoseAlt(note.character, note.alt); }
        const drain = sillyLifeDrain(t);
        if (state.health > drain.floor) state.health = Math.max(drain.floor, state.health - drain.rate);
        continue;
      }
      if (note.hurt && t > note.time + 0.16) {
        note.judged = true;
        note.played = true;
        continue;
      }
      if (note.side === "player" && sillyLaneAlpha(note.lane, t) <= 0.01 && t > note.time + 0.16) {
        note.judged = true;
        note.played = true;
        continue;
      }
      if (t > note.time + 0.16) {
        note.judged = true;
        note.played = true;
        judge(note.side, "miss", note.lane, note.character);
        setPoseAlt(note.character, note.alt);
      }
    }
    // Hold notes keep the sing animation playing for the hold's full duration
    // (applies to every character - dad, shortDad, spikesBf, player, etc).
    for (const note of state.chart?.notes || []) {
      if (!isHoldNote(note) || !note.holdActive || note.holdDone) continue;
      if (t < note.time || t > note.time + (note.sLen || 0)) continue;
      if (note.character) { pose(note.character, note.lane % 4, "hit"); setPoseAlt(note.character, note.alt); }
    }
  }

  isImportedSong = song => !!song && (song.chartSource === "sillyBilly" || baseIsImportedSong(song));
  makeChart = song => song?.chartSource === "sillyBilly" ? cloneChart() : baseMakeChart(song);
  songTime = () => state.currentSong?.chartSource === "sillyBilly" && state.audio.sillyBillyInst ? state.audio.sillyBillyInst.currentTime : baseSongTime();
  songEndTime = () => state.currentSong?.chartSource === "sillyBilly" ? Number(SB.chart.totalTime || 0) : baseSongEndTime();

  stopExternalAudio = function() {
    const leakedInst = state.audio.inst === state.audio.sillyBillyInst;
    const leakedVoices = state.audio.voices === state.audio.sillyBillyVoices;
    baseStopExternalAudio();
    [state.audio.sillyBillyInst, state.audio.sillyBillyVoices].forEach(track => {
      if (!track) return;
      try {
        track.pause();
        track.currentTime = 0;
      } catch {}
    });
    resetSillyVideos();
    if (leakedInst) state.audio.inst = null;
    if (leakedVoices) state.audio.voices = null;
  };

  startSong = function(id = state.selectedSong, options = {}) {
    const song = SONGS[id] || state.currentSong;
    if (song?.chartSource !== "sillyBilly") return baseStartSong(id, options);
    const audioContext = ensureAudio();
    if (audioContext.state === "suspended") audioContext.resume();
    stopExternalAudio();
    initAssets();
    ensureSillyBillyAudio();
    resetSillyVideos();
    const inst = state.audio.sillyBillyInst;
    const voices = state.audio.sillyBillyVoices;
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
    state.health = 1;
    silly.cameraPan = 0;
    silly.cameraZoom = 1;
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
      if (silly.videoIntro) silly.videoIntro.play().catch(() => {});
    }
    state.feeds.player.time = -10;
    state.feeds.opp.time = -10;
    Object.values(state.poses).forEach(poseInfo => { poseInfo.time = -10; poseInfo.kind = "hit"; });
    state.receptorFx.forEach(fxInfo => { fxInfo.time = -10; });
    state.perseverance = { canDodge: false, prompt: false, dodging: false, dodged: false, resolved: false, dodgeStart: -10, flashTime: -10, gfAlpha: 0 };
    state.camera = { zoom: 1, focusX: canvas.width / 2, focusY: canvas.height * 0.5, sideTime: 0, lastSide: "both", highwayX: 0, highwayY: 0 };
    ui.p1Box.style.display = state.mode === "versus" || state.mode === "online" ? "block" : "none";
    ui.songTitle.textContent = state.currentSong.title;
    ui.songSub.textContent = state.currentSong.subtitle;
    ui.statusText.textContent = state.mode === "online" ? "Match syncing" : "Silly Billy";
    ui.statusSub.textContent = state.mode === "online"
      ? "Both players finished loading. The server is holding a synced countdown before audio starts."
      : "Normal chart/audio, FLP vocals, Remastered visuals, custom notes, hurt notes, intro video, and lyric-event shaders are active.";
    ui.timer.textContent = `0:00 / ${formatTime(songEndTime())}`;
    ui.menu.classList.remove("show");
    ui.settings.classList.remove("show");
    ui.resultsWrap.classList.remove("show");
    if (state.mode === "online") {
      if (typeof syncModeUI === "function") syncModeUI();
      if (typeof syncOnlinePlayback === "function") syncOnlinePlayback(true);
    }
  };

  handlePress = handleSillyPress;
  handleMisses = handleSillyMisses;
  updateCamera = updateSillyCamera;
  receptors = function(t) {
    if (state.selectedSong === "sillyBilly") {
      // Online matches draw all 8 lanes through the standard playfield so
      // both players see their notes; solo only draws player lanes (opp goes
      // on the mirror via drawSillyStage).
      const filter = isOnlineMatch() ? "all" : "player";
      return drawSillyReceptors(t, filter);
    }
    return baseReceptors(t);
  };
  notes = function(t) {
    if (state.selectedSong === "sillyBilly") {
      const filter = isOnlineMatch() ? "all" : "player";
      return drawSillyNotes(t, filter);
    }
    return baseNotes(t);
  };

  refreshHUD = function(t) {
    baseRefreshHUD(t);
    if (state.selectedSong !== "sillyBilly") return;
    ui.timer.textContent = `${formatTime(t)} / ${formatTime(songEndTime())}`;
    const phase = phaseAt(t);
    ui.statusText.textContent = phase.pixel ? "Pixel break" : phase.void ? "Finale void" : phase.lyric ? "I'll make..." : "Silly Billy";
    ui.statusSub.textContent = phase.lyric
      ? "The only enabled subtitle line is the pride lyric phrase."
      : "Remastered visuals are running with the Erect vocal track.";
  };

  finish = function(failed = false) {
    if (state.currentSong?.chartSource === "sillyBilly") {
      [state.audio.sillyBillyInst, state.audio.sillyBillyVoices].forEach(track => {
        if (!track) return;
        try { track.pause(); } catch {}
      });
      resetSillyVideos();
    }
    return baseFinish(failed);
  };

  if (typeof syncOnlinePlayback === "function" && typeof expectedOnlineSongTime === "function") {
    const baseSyncOnlinePlayback = syncOnlinePlayback;
    syncOnlinePlayback = function(force = false) {
      const targetTime = expectedOnlineSongTime();
      const base = baseSyncOnlinePlayback(force);
      if (targetTime == null || state.currentSong?.chartSource !== "sillyBilly") return base;
      ensureSillyBillyAudio();
      const now = typeof serverClockNow === "function" ? serverClockNow() : Date.now();
      const shouldPlay = now + 40 >= (state.network?.matchStartAt || 0);
      for (const track of [state.audio.sillyBillyInst, state.audio.sillyBillyVoices]) {
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

  if (typeof importedTracksForSong === "function") {
    const baseImportedTracksForSong = importedTracksForSong;
    importedTracksForSong = function(songId = state.selectedSong) {
      if (SONGS[songId]?.chartSource === "sillyBilly") {
        ensureSillyBillyAudio();
        return [state.audio.sillyBillyInst, state.audio.sillyBillyVoices];
      }
      return baseImportedTracksForSong(songId);
    };
  }

  if (typeof preloadSongForMatch === "function" && typeof waitForTrackReady === "function") {
    const basePreloadSongForMatch = preloadSongForMatch;
    preloadSongForMatch = async function(songId, matchId) {
      if (SONGS[songId]?.chartSource !== "sillyBilly") return basePreloadSongForMatch(songId, matchId);
      state.network.preparing = true;
      state.network.prepareMatchId = matchId;
      state.network.preparedSongId = "";
      state.network.loadingStatus = "Loading song files on your side.";
      if (typeof updateOnlinePanel === "function") updateOnlinePanel();
      const tracks = window.prepareSillyBillyOnlineStart();
      await Promise.all(tracks.filter(Boolean).map(track => waitForTrackReady(track)));
      if (state.network.prepareMatchId !== matchId) return false;
      state.network.preparedSongId = songId;
      state.network.loadingStatus = "Loaded on your side. Waiting for the other player.";
      if (state.network.role === "host") state.network.loaded.host = true;
      if (state.network.role === "guest") state.network.loaded.guest = true;
      if (typeof updateOnlinePanel === "function") updateOnlinePanel();
      if (state.network.socket && state.network.roomId) state.network.socket.emit("game:loaded", { matchId, songId });
      return true;
    };
  }

  bg = function(song, t) {
    if (state.selectedSong === "sillyBilly") {
      ctx.fillStyle = "#050507";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      return;
    }
    return baseBg(song, t);
  };
  stage = function(t) {
    if (state.selectedSong === "sillyBilly") return drawSillyStage(t);
    return baseStage(t);
  };
  applyDustinBloom = function(t) {
    if (state.selectedSong === "sillyBilly") {
      drawSillyPostFx(t);
      return;
    }
    baseApplyDustinBloom(t);
  };

  renderSongs();
})();

(() => {
  try {
    const CE = window.CHALLENGE_EDD_DATA;
    if (!CE || typeof SONGS === "undefined") return;

    const clone = value => JSON.parse(JSON.stringify(value));
    const clamp01 = value => Math.max(0, Math.min(1, value));
    const lerp = (a, b, t) => a + (b - a) * clamp01(t);
    const nowSec = () => performance.now() / 1000;
    const ce = { ready: false, images: {} };
    const tordRenderCache = {
      bg: { key: "", canvas: null, width: 0, height: 0 },
      backdrops: {},
      portrait: { key: "", canvas: null, width: 0, height: 0 }
    };
    const TORD_SIDE_CLIP_WIDTH = 290;
    const TORD_SIDE_BACKDROP_WIDTH = 272;
    CE.stage.layout = {
      skyScale: 0.42,
      patioScale: 0.42,
      fenceScale: 0.4,
      carScale: 0.3,
      tordBgScale: 0.94,
      speakerX: 640,
      speakerY: 534,
      speakerScale: 0.72,
      gfX: 640,
      gfY: 422,
      gfScale: 0.64,
      skyX: -200,
      skyY: -68,
      patioX: -200,
      patioY: 8,
      vallasX: -28,
      vallasY: 238,
      oppX: 302,
      oppY: 616,
      oppScale: 0.44,
      playerX: 990,
      playerY: 626,
      playerScale: 0.72,
      mattX: 1210,
      mattY: 564,
      mattScale: 0.45,
      tordbotX: 910,
      tordbotY: 616,
      tordbotScale: 0.34,
      tomRunX: 1245,
      tomRunY: 614,
      tomRunScale: 0.44,
      toomArponX: 1172,
      toomArponY: 622,
      toomArponScale: 0.44,
      ...(CE.stage.layout || {})
    };
    Object.assign(CE.stage.layout, {
      gfX: 700,
      gfY: 404,
      gfScale: 0.4
    });
    Object.assign(CE.stage.positions || (CE.stage.positions = {}), {
      opponent: [1325, 190],
      boyfriend: [2355, 150]
    });
    const DEFAULT_HOLD = window.PERSEVERANCE_DATA?.sprites?.notes?.default?.hold || null;
    const ROCKET_FRAME = { x: 0, y: 0, w: 314, h: 538, fx: 0, fy: 0, fw: 314, fh: 538, rotated: false };

    ["edd", "eddT", "eddV", "tord", "bft", "bfv", "bfsl", "eddsl", "none"].forEach(key => {
      state.poses[key] = state.poses[key] || { lane: 1, time: -10, kind: "hit" };
    });

    SONGS.challengeEdd = {
      title: "Challenge Edd",
      subtitle: "Challenge Edd fucked chart",
      diff: "Fucked (Original Chart)",
      tempo: Number(CE.song?.bpm || 186),
      root: 45,
      scale: [0, 2, 4, 5, 7, 9, 10],
      prog: [0, 5, 3, 4],
      scroll: 1020,
      seed: 41,
      introBeats: 0,
      outroBeats: 4,
      palette: ["#d2ecff", "#eff7ff", "#7ad26f", "#23421d", "#ffffff", "#ff5c62"],
      blurb: "Imported from the original Challenge Edd fucked chart with the proper backyard stage flow, Tord takeover, and event-based character swaps.",
      chartSource: "challengeEdd"
    };

    const challengeEvents = (CE.events || []).slice().sort((a, b) => Number(a.time || 0) - Number(b.time || 0));
    const playEvents = challengeEvents.filter(event => String(event.name || "").trim().toLowerCase() === "play animation");
    const mattWalkTime = playEvents.find(event => String(event.params?.[0] || "").trim().toLowerCase() === "mattw")?.time ?? Infinity;
    const mattIdleTime = playEvents.find(event => String(event.params?.[0] || "").trim().toLowerCase() === "matti")?.time ?? Infinity;
    const mattReactTime = playEvents.find(event => String(event.params?.[0] || "").trim().toLowerCase() === "matts")?.time ?? Infinity;
    const tomRunTime = playEvents.find(event => String(event.params?.[0] || "").trim().toLowerCase() === "runin")?.time ?? Infinity;
    const tordbotTime = playEvents.find(event => String(event.params?.[0] || "").trim().toLowerCase() === "tordbot")?.time ?? Infinity;
    const boomTime = playEvents.find(event => String(event.params?.[0] || "").trim().toLowerCase() === "boom")?.time ?? Infinity;
    const arponTime = playEvents.find(event => String(event.params?.[0] || "").trim().toLowerCase() === "arpon")?.time ?? Infinity;
    const CE_WORLD = {
      normal: {
        sky: { x: -600, y: -950 },
        patio: { x: -600, y: -770 },
        fence: { x: 85, y: -120 },
        car: { x: -835, y: 800 }
      },
      matt: { startX: 1950, idleX: 1200, reactX: 1300, y: 200, scale: 1.56 },
      tordbot: { x: 1670, startY: 200, endY: -500, scale: 1.56 },
      tomRun: { startX: 2550, endX: 2900, y: 500, scale: 1.56 },
      toomArpon: { x: 2550, y: 500, scale: 1.56 }
    };

    const baseIsImportedSong = isImportedSong;
    const baseMakeChart = makeChart;
    const baseStopExternalAudio = stopExternalAudio;
    const baseSongTime = songTime;
    const baseSongEndTime = songEndTime;
    const baseStartSong = startSong;
    const baseHandleMisses = handleMisses;
    const baseUpdateHoldNotes = updateHoldNotes;
    const baseRefreshHUD = refreshHUD;
    const baseFinish = finish;
    const baseBg = bg;
    const baseStage = stage;
    const baseReceptors = receptors;
    const baseNotes = notes;

    function initAssets() {
      if (ce.ready) return;
      ce.ready = true;
      const sources = {
        sky: CE.stage.images.sky,
        patio: CE.stage.images.patio,
        fence: CE.stage.images.fence,
        vallas: "assets/challenge-edd-vallas.png",
        car: CE.stage.images.car,
        tordBg: CE.stage.images.tordBg,
        edd: CE.sprites.opponent.edd.image,
        eddT: CE.sprites.opponent.eddT.image,
        eddV: CE.sprites.opponent.eddV.image,
        tord: CE.sprites.opponent.tord.image,
        bft: CE.sprites.player.bft.image,
        bfv: CE.sprites.player.bfv.image,
        bfBase: window.CHALLENGE_EDD_BF_DATA?.image,
        defaultNotes: window.PERSEVERANCE_DATA?.sprites?.notes?.default?.image,
        rocket: "assets/challenge-edd-note-rocket.png",
        bfsl: CE.sprites.player.bfsl.image,
        eddsl: CE.sprites.player.eddsl.image,
        matt: CE.sprites.extras.matt.image,
        tordbot: CE.sprites.extras.tordbot.image,
        tomRun: CE.sprites.extras.tomRun.image,
        toomArpon: CE.sprites.extras.toomArpon.image,
        gf: "assets/GF_assets.png"
      };
      if (CE.sprites?.notes?.image) sources.notes = CE.sprites.notes.image;
      Object.entries(sources).forEach(([key, src]) => {
        const img = new Image();
        img.src = src;
        ce.images[key] = img;
      });
      if (typeof initSportingSprites === "function") initSportingSprites();
    }

    function imageReady(image) {
      return !!(image && image.complete && image.naturalWidth);
    }

    function stageImagesReady() {
      initAssets();
      return imageReady(ce.images.sky) && imageReady(ce.images.patio) && (imageReady(ce.images.vallas) || imageReady(ce.images.fence));
    }

    function defaultHoldReady() {
      return !!DEFAULT_HOLD && imageReady(ce.images.defaultNotes);
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

    function drawDefaultHoldSustain(note, headY, tailY, alpha, x = laneX(note.lane)) {
      const hold = DEFAULT_HOLD?.[laneDir(note.lane)];
      const img = ce.images.defaultNotes;
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

    function rocketRotation(lane) {
      return ({ left: -Math.PI / 2, down: Math.PI, up: 0, right: Math.PI / 2 })[laneDir(lane)] || 0;
    }

    function drawRocketNote(note, x, y, scale, alpha) {
      const img = ce.images.rocket;
      if (!imageReady(img)) {
        drawSportingNote(note.lane, x, y, 0.62 * scale, alpha);
        return;
      }
      const drawScale = 0.18 * scale;
      const width = ROCKET_FRAME.fw * drawScale;
      const height = ROCKET_FRAME.fh * drawScale;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(x, y);
      ctx.rotate(rocketRotation(note.lane));
      ctx.shadowBlur = 26;
      ctx.shadowColor = "rgba(255,132,92,0.95)";
      ctx.drawImage(img, ROCKET_FRAME.x, ROCKET_FRAME.y, ROCKET_FRAME.w, ROCKET_FRAME.h, -width / 2, -height / 2, width, height);
      ctx.restore();
    }

    function activeChallengeSection(t) {
      return state.chart?.timeline?.find(entry => t >= entry.startTime && t < entry.endTime) || null;
    }

    function currentChallengeTurn(t) {
      return activeChallengeSection(t)?.turn || "both";
    }

    function challengeTordShake(t, phase = currentState(t)) {
      if (phase.stageMode !== "tord" || phase.opp !== "tord") return { x: 0, y: 0 };
      const pose = state.poses.tord || { time: -10 };
      const age = nowSec() - pose.time;
      if (age < 0 || age > 0.24) return { x: 0, y: 0 };
      const amount = 10 * (1 - age / 0.24);
      return { x: Math.sin(t * 90) * amount, y: Math.cos(t * 66) * amount * 0.58 };
    }

    function atlasFrameKey(frame) {
      if (!frame) return "";
      return [
        frame.x, frame.y, frame.w, frame.h,
        frame.fw || frame.w,
        frame.fh || frame.h,
        frame.fx || 0,
        frame.fy || 0,
        frame.rotated ? 1 : 0
      ].join(",");
    }

    function createLayerCanvas(width, height) {
      const layer = document.createElement("canvas");
      layer.width = Math.max(1, Math.round(width));
      layer.height = Math.max(1, Math.round(height));
      return layer;
    }

    function prepareLayerCanvas(cacheEntry, width, height) {
      if (!cacheEntry.canvas || cacheEntry.canvas.width !== width || cacheEntry.canvas.height !== height) {
        cacheEntry.canvas = createLayerCanvas(width, height);
      }
      const layerCtx = cacheEntry.canvas.getContext("2d");
      layerCtx.setTransform(1, 0, 0, 1, 0, 0);
      layerCtx.clearRect(0, 0, cacheEntry.canvas.width, cacheEntry.canvas.height);
      return layerCtx;
    }

    function drawAtlasSubToContext(layerCtx, image, frame, dx, dy, scale) {
      layerCtx.imageSmoothingEnabled = true;
      layerCtx.imageSmoothingQuality = "high";
      if (frame.rotated) {
        layerCtx.save();
        layerCtx.translate(dx, dy + frame.w * scale);
        layerCtx.rotate(-Math.PI / 2);
        layerCtx.drawImage(image, frame.x, frame.y, frame.w, frame.h, 0, 0, frame.w * scale, frame.h * scale);
        layerCtx.restore();
        return;
      }
      layerCtx.drawImage(image, frame.x, frame.y, frame.w, frame.h, dx, dy, frame.w * scale, frame.h * scale);
    }

    function drawAtlasFrameToContext(layerCtx, image, frame, x, y, scale, alpha = 1, flipX = false) {
      const fw = frame.fw || frame.w;
      const fh = frame.fh || frame.h;
      const fx = frame.fx || 0;
      const fy = frame.fy || 0;
      const dx = -fw * scale / 2 - fx * scale;
      const dy = -fh * scale - fy * scale;
      layerCtx.save();
      layerCtx.globalAlpha = alpha;
      layerCtx.translate(x, y);
      if (flipX) layerCtx.scale(-1, 1);
      drawAtlasSubToContext(layerCtx, image, frame, dx, dy, scale);
      layerCtx.restore();
    }

    function cachedTordBackground(layout) {
      const img = ce.images.tordBg;
      if (!imageReady(img)) return null;
      const width = Math.max(1, Math.round(img.naturalWidth * layout.tordBgScale));
      const height = Math.max(1, Math.round(img.naturalHeight * layout.tordBgScale));
      const key = [img.currentSrc || img.src || "tordBg", width, height].join("|");
      if (tordRenderCache.bg.key !== key || !tordRenderCache.bg.canvas) {
        const layer = createLayerCanvas(width, height);
        const layerCtx = layer.getContext("2d");
        layerCtx.imageSmoothingEnabled = true;
        layerCtx.imageSmoothingQuality = "high";
        layerCtx.drawImage(img, 0, 0, width, height);
        tordRenderCache.bg = { key, canvas: layer, width, height };
      }
      return tordRenderCache.bg;
    }

    function cachedSideBackdrop(side) {
      const height = Math.max(1, canvas.height);
      const key = `${side}|${height}`;
      const current = tordRenderCache.backdrops[side];
      if (current?.key === key && current.canvas) return current.canvas;
      const layer = createLayerCanvas(TORD_SIDE_BACKDROP_WIDTH, height);
      const layerCtx = layer.getContext("2d");
      const grad = layerCtx.createLinearGradient(0, 0, TORD_SIDE_BACKDROP_WIDTH, 0);
      if (side === "left") {
        grad.addColorStop(0, "rgba(145,12,28,0.84)");
        grad.addColorStop(0.75, "rgba(145,12,28,0.36)");
        grad.addColorStop(1, "rgba(145,12,28,0)");
      } else {
        grad.addColorStop(0, "rgba(145,12,28,0)");
        grad.addColorStop(0.25, "rgba(145,12,28,0.36)");
        grad.addColorStop(1, "rgba(145,12,28,0.84)");
      }
      layerCtx.fillStyle = grad;
      layerCtx.fillRect(0, 0, layer.width, layer.height);
      tordRenderCache.backdrops[side] = { key, canvas: layer };
      return layer;
    }

    function drawSidePortraitBackdrop(side) {
      const backdrop = cachedSideBackdrop(side);
      if (!backdrop) return;
      ctx.save();
      ctx.drawImage(backdrop, side === "left" ? 0 : canvas.width - backdrop.width, 0);
      ctx.restore();
    }

    function sidePortraitState(t, key) {
      if (!key || key === "none") return null;
      if (key === "player") return challengeBfSpriteState(t);
      if (CE.sprites.player?.[key]) {
        const sprite = CE.sprites.player[key];
        const image = imageForVariant(key);
        if (!sprite || !imageReady(image)) return null;
        const stateInfo = poseInfoForSprite(sprite, key, t, null);
        return stateInfo ? { state: stateInfo, image, scale: variantScale(key, "player"), flipX: !!sprite.flipX } : null;
      }
      return null;
    }

    function drawTordTurnPortraits(t, phase) {
      if (phase.stageMode !== "tord") return;
      if (!["player", "both"].includes(currentChallengeTurn(t))) return;
      const playerKey = phase.player;
      if (!playerKey || playerKey === "none") return;
      const info = sidePortraitState(t, playerKey);
      if (!info) return;
      const side = playerKey.startsWith("edd") ? "left" : "right";
      const result = animationFrame(info.state.sprite, info.state.animName, info.state.elapsed, info.state.loop);
      if (!result?.frame) return;
      const drawScale = info.scale * (side === "left" ? 1.92 : 1.8);
      const rawOffset = result.anim?.offset || result.anim?.offsets || [0, 0];
      const localX = side === "left" ? 132 : TORD_SIDE_CLIP_WIDTH - 124;
      const localY = side === "left" ? canvas.height - 16 : canvas.height - 12;
      const portraitKey = [
        side,
        canvas.height,
        info.image?.currentSrc || info.image?.src || playerKey,
        info.state.animName,
        atlasFrameKey(result.frame),
        Number(rawOffset?.[0] || 0),
        Number(rawOffset?.[1] || 0),
        drawScale.toFixed(4)
      ].join("|");
      if (tordRenderCache.portrait.key !== portraitKey || !tordRenderCache.portrait.canvas) {
        const layerCtx = prepareLayerCanvas(tordRenderCache.portrait, TORD_SIDE_CLIP_WIDTH, Math.max(1, canvas.height));
        const backdrop = cachedSideBackdrop(side);
        if (backdrop) {
          const backdropX = side === "left" ? 0 : TORD_SIDE_CLIP_WIDTH - backdrop.width;
          layerCtx.drawImage(backdrop, backdropX, 0);
        }
        drawAtlasFrameToContext(
          layerCtx,
          info.image,
          result.frame,
          localX + Number(rawOffset?.[0] || 0) * drawScale,
          localY + Number(rawOffset?.[1] || 0) * drawScale,
          drawScale,
          0.96,
          false
        );
        tordRenderCache.portrait.key = portraitKey;
        tordRenderCache.portrait.width = TORD_SIDE_CLIP_WIDTH;
        tordRenderCache.portrait.height = Math.max(1, canvas.height);
      }
      if (tordRenderCache.portrait.canvas) {
        ctx.drawImage(tordRenderCache.portrait.canvas, side === "left" ? 0 : canvas.width - TORD_SIDE_CLIP_WIDTH, 0);
        return;
      }
      drawSidePortraitBackdrop(side);
      ctx.save();
      if (side === "left") {
        ctx.beginPath();
        ctx.rect(0, 0, TORD_SIDE_CLIP_WIDTH, canvas.height);
        ctx.clip();
        drawSpriteState(info.state, info.image, 132, canvas.height - 16, info.scale * 1.92, false, 0.96);
      } else {
        ctx.beginPath();
        ctx.rect(canvas.width - TORD_SIDE_CLIP_WIDTH, 0, TORD_SIDE_CLIP_WIDTH, canvas.height);
        ctx.clip();
        drawSpriteState(info.state, info.image, canvas.width - 124, canvas.height - 12, info.scale * 1.8, false, 0.96);
      }
      ctx.restore();
    }

    function challengeUsesSportingNotes() {
      return !CE.sprites?.notes
        && typeof sportingSpritesReady === "function"
        && sportingSpritesReady()
        && !!window.SPORTING_SPRITES?.notes
        && imageReady(spriteState.images?.notes);
    }

    function ensureAudioTracks() {
      if (!state.audio.challengeInst) {
        state.audio.challengeInst = new Audio(CE.audio.inst);
        state.audio.challengeInst.preload = "auto";
        state.audio.challengeInst.volume = 0.95;
      }
      if (!state.audio.challengeVoices) {
        state.audio.challengeVoices = new Audio(CE.audio.voices);
        state.audio.challengeVoices.preload = "auto";
        state.audio.challengeVoices.volume = 0.92;
      }
    }
    window.ensureChallengeEddAudio = ensureAudioTracks;
    window.prepareChallengeEddOnlineStart = function() {
      ensureAudioTracks();
      [state.audio.challengeInst, state.audio.challengeVoices].forEach(track => {
        if (!track) return;
        track.pause();
        try { track.currentTime = 0; } catch {}
        try { track.load(); } catch {}
      });
      return [state.audio.challengeInst, state.audio.challengeVoices];
    };

    function noteEndTime() {
      return (CE.chart?.notes || []).reduce((max, note) => Math.max(max, Number(note.time || 0) + Math.max(0, Number(note.sLen || 0))), 0);
    }

    function totalTime() {
      const noteEnd = noteEndTime();
      const durations = [state.audio.challengeInst?.duration, state.audio.challengeVoices?.duration].filter(value => Number.isFinite(value) && value > 0);
      const chartEnd = Math.max(Number(CE.chart?.totalTime || 0), noteEnd + 2);
      return durations.length ? Math.max(chartEnd, ...durations) : chartEnd;
    }

    function valueAt(track, t) {
      let current = track?.[0]?.key;
      for (const entry of track || []) {
        if (Number(entry.time || 0) > t) break;
        current = entry.key;
      }
      return current;
    }

    function laneDir(lane) {
      return DIRS[lane % 4];
    }

    function singAnim(lane) {
      return ({ left: "singLEFT", down: "singDOWN", up: "singUP", right: "singRIGHT" })[laneDir(lane)];
    }

    function missAnim(lane) {
      return ({ left: "singLEFTmiss", down: "singDOWNmiss", up: "singUPmiss", right: "singRIGHTmiss" })[laneDir(lane)];
    }

    function animDuration(anim, fallback = 0.55) {
      if (!anim) return fallback;
      return sportingAnimDuration(anim.frames, anim.fps || 24, 0.18, 0.85);
    }

    function animationFrame(sprite, animName, elapsed, loop = false) {
      const anim = sprite?.animations?.[animName];
      if (!anim) return null;
      const frame = frameFromList(anim.frames, elapsed, anim.fps || 24, loop || anim.loop === true);
      return frame ? { anim, frame } : null;
    }

    function sportingAnimationFrame(sprite, animName, elapsed, fps = 12, loop = true) {
      const frames = sprite?.animations?.[animName];
      if (!frames?.length) return null;
      const frame = frameFromList(frames, elapsed, fps, loop);
      return frame ? { frame } : null;
    }

    function specialOppAnim(t, oppKey) {
      if (oppKey !== "tord") return null;
      const sprite = CE.sprites.opponent.tord;
      for (let index = playEvents.length - 1; index >= 0; index--) {
        const event = playEvents[index];
        if (event.time > t) continue;
        if (String(event.params?.[1] || "").trim().toLowerCase() !== "dad") continue;
        const raw = String(event.params?.[0] || "").trim();
        const animName = raw === "Ha" || raw === "Pissed" || raw === "OhNo" ? raw : null;
        if (!animName || !sprite.animations?.[animName]) continue;
        if (t <= Number(event.time || 0) + animDuration(sprite.animations[animName], 0.65)) {
          return { animName, start: Number(event.time || 0) };
        }
        break;
      }
      return null;
    }

    function poseInfoForSprite(sprite, poseKey, t, special = null) {
      if (!sprite) return null;
      if (special && sprite.animations?.[special.animName]) {
        return { sprite, animName: special.animName, elapsed: Math.max(0, t - special.start), loop: false };
      }
      const pose = state.poses[poseKey] || { lane: 1, time: -10, kind: "hit" };
      const age = nowSec() - pose.time;
      const missName = missAnim(pose.lane || 0);
      if (pose.kind === "miss" && sprite.animations?.[missName] && age >= 0 && age < animDuration(sprite.animations[missName], 0.55)) {
        return { sprite, animName: missName, elapsed: age, loop: false };
      }
      const hitName = singAnim(pose.lane || 0);
      if (sprite.animations?.[hitName] && age >= 0 && age < animDuration(sprite.animations[hitName], 0.6)) {
        return { sprite, animName: hitName, elapsed: age, loop: false };
      }
      const idleName = sprite.animations?.["idle-loop"] ? "idle-loop" : (sprite.animations?.idle ? "idle" : null);
      if (!idleName) return null;
      return { sprite, animName: idleName, elapsed: t * 0.72, loop: true };
    }

    function sportingSpriteState(kind, t) {
      if (!window.SPORTING_SPRITES) return null;
      const sprite = kind === "boyfriend" ? window.SPORTING_SPRITES.boyfriend : window.SPORTING_SPRITES.gf;
      const image = kind === "boyfriend" ? spriteState.images.boyfriend : spriteState.images.gf;
      if (!sprite || !imageReady(image)) return null;
      const pose = sportingPose(kind, t);
      return { sprite, image, animName: pose.anim, elapsed: pose.elapsed, loop: pose.loop, flipX: !!sprite.flipX };
    }

    function challengeBfSpriteState(t) {
      const sprite = window.CHALLENGE_EDD_BF_DATA;
      const image = ce.images.bfBase;
      if (!sprite || !imageReady(image)) return null;
      const stateInfo = poseInfoForSprite(sprite, "player", t, null);
      const world = characterWorldPos("player", sprite);
      return stateInfo ? { state: stateInfo, image, scale: variantScale("player", "player"), worldX: world.x, worldY: world.y, worldScale: Number(sprite.scale || 1), flipX: false } : null;
    }

    function currentState(t) {
      return {
        stageMode: valueAt(CE.stageModes, t),
        opp: valueAt(CE.charChanges.opp, t),
        player: valueAt(CE.charChanges.player, t),
        gf: valueAt(CE.charChanges.gf, t)
      };
    }

    function imageForVariant(key) {
      return ce.images[key];
    }

    function variantScale(key, role = "opp") {
      const base = CE.stage.layout[role === "opp" ? "oppScale" : "playerScale"];
      if (key === "tord") return 0.54;
      if (key === "bfsl") return 0.5;
      if (key === "eddsl") return 0.5;
      if (key === "bft") return 0.72;
      if (key === "bfv") return 0.68;
      if (key === "eddT") return 0.62;
      return base;
    }

    function drawSpriteState(stateInfo, image, x, y, scale, flipX = false, alpha = 1) {
      if (!stateInfo?.sprite || !imageReady(image)) return;
      const result = animationFrame(stateInfo.sprite, stateInfo.animName, stateInfo.elapsed, stateInfo.loop);
      if (!result?.frame) return;
      const rawOffset = result.anim?.offset || result.anim?.offsets || [0, 0];
      const offsetX = Number(rawOffset?.[0] || 0) * scale;
      const offsetY = Number(rawOffset?.[1] || 0) * scale;
      drawAtlasFrame(image, result.frame, x + offsetX, y + offsetY, scale, alpha, flipX);
    }

    function drawSportingSpriteState(sprite, image, animName, elapsed, x, y, scale, fps = 12, loop = true, flipX = false, alpha = 1) {
      if (!sprite || !imageReady(image)) return;
      const result = sportingAnimationFrame(sprite, animName, elapsed, fps, loop);
      if (!result?.frame) return;
      drawAtlasTopLeft(image, result.frame, x, y, scale, alpha, flipX);
    }


    function drawSimpleImage(key, x, y, scale, alpha = 1) {
      const img = ce.images[key];
      if (!imageReady(img)) return;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, x, y, img.naturalWidth * scale, img.naturalHeight * scale);
      ctx.restore();
    }

    function ceWorldScale() {
      return Number(CE.stage.layout.skyScale || 0.42);
    }

    function ceWorldOriginX() {
      return Number(CE.stage.layout.skyX || -200) - CE_WORLD.normal.sky.x * ceWorldScale();
    }

    function ceWorldOriginY() {
      return Number(CE.stage.layout.skyY || -68) - CE_WORLD.normal.sky.y * ceWorldScale();
    }

    function worldToStage(x, y) {
      const scale = ceWorldScale();
      return { x: ceWorldOriginX() + x * scale, y: ceWorldOriginY() + y * scale, scale };
    }

    function roleStageKey(role) {
      return ({ opp: "opponent", opponent: "opponent", player: "boyfriend", boyfriend: "boyfriend", gf: "girlfriend", girlfriend: "girlfriend" })[role] || role;
    }

    function characterWorldPos(role, sprite) {
      const base = CE.stage.positions?.[roleStageKey(role)] || [0, 0];
      const pos = sprite?.position || [0, 0];
      return {
        x: Number(base[0] || 0) + Number(pos[0] || 0),
        y: Number(base[1] || 0) + Number(pos[1] || 0)
      };
    }

    function drawWorldImage(key, worldX, worldY, extraScale = 1, alpha = 1) {
      const point = worldToStage(worldX, worldY);
      drawSimpleImage(key, point.x, point.y, point.scale * extraScale, alpha);
    }

    function drawWorldSpriteState(stateInfo, image, worldX, worldY, scale = 1, flipX = false, alpha = 1) {
      if (!stateInfo?.sprite || !imageReady(image)) return;
      const result = animationFrame(stateInfo.sprite, stateInfo.animName, stateInfo.elapsed, stateInfo.loop);
      if (!result?.frame) return;
      const point = worldToStage(worldX, worldY);
      const drawScale = point.scale * scale;
      const rawOffset = result.anim?.offset || result.anim?.offsets || [0, 0];
      const offsetX = Number(rawOffset?.[0] || 0) * drawScale;
      const offsetY = Number(rawOffset?.[1] || 0) * drawScale;
      drawAtlasTopLeft(image, result.frame, point.x + offsetX, point.y + offsetY, drawScale, alpha, flipX);
    }

    function spriteGroundReference(sprite) {
      if (!sprite?.animations) return null;
      const animName = sprite.animations["idle-loop"] ? "idle-loop" : (sprite.animations.idle ? "idle" : Object.keys(sprite.animations)[0]);
      const anim = animName ? sprite.animations[animName] : null;
      const frame = anim?.frames?.[0];
      if (!frame) return null;
      const rawOffset = anim?.offset || anim?.offsets || [0, 0];
      return {
        frame,
        offsetX: Number(rawOffset?.[0] || 0),
        offsetY: Number(rawOffset?.[1] || 0)
      };
    }

    function groundedWorldAnchor(worldX, worldY, sprite, scale = 1) {
      const reference = spriteGroundReference(sprite);
      if (!reference?.frame) return { x: worldX, y: worldY };
      const spriteScale = Number(scale || 1);
      const frame = reference.frame;
      return {
        x: worldX + (reference.offsetX + ((frame.fw || frame.w) / 2) - Number(frame.fx || 0)) * spriteScale,
        y: worldY + (reference.offsetY + (frame.fh || frame.h) - Number(frame.fy || 0)) * spriteScale
      };
    }

    function drawGroundedSpriteState(stateInfo, image, x, y, scale, flipX = false, alpha = 1) {
      if (!stateInfo?.sprite || !imageReady(image)) return;
      const result = animationFrame(stateInfo.sprite, stateInfo.animName, stateInfo.elapsed, stateInfo.loop);
      if (!result?.frame) return;
      drawAtlasFrame(image, result.frame, x, y, scale, alpha, flipX);
    }

    function drawGroundedWorldSpriteState(stateInfo, image, worldX, worldY, scale = 1, flipX = false, alpha = 1) {
      if (!stateInfo?.sprite || !imageReady(image)) return;
      const anchor = groundedWorldAnchor(worldX, worldY, stateInfo.sprite, scale);
      const point = worldToStage(anchor.x, anchor.y);
      drawGroundedSpriteState(stateInfo, image, point.x, point.y, point.scale * scale, flipX, alpha);
    }

    function drawSpeakerStack() {
      const x = CE.stage.layout.speakerX;
      const y = CE.stage.layout.speakerY;
      const scale = Number(CE.stage.layout.speakerScale || 1);
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(scale, scale);
      ctx.fillStyle = "#3a3d49";
      ctx.strokeStyle = "rgba(15,18,26,0.78)";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.roundRect(-106, -120, 212, 176, 18);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.roundRect(-156, -92, 46, 118, 14);
      ctx.roundRect(110, -92, 46, 118, 14);
      ctx.fill();
      ctx.stroke();
      [[0, -54, 45], [0, 18, 56], [-133, -34, 18], [133, -34, 18]].forEach(([cx, cy, radius], index) => {
        ctx.fillStyle = index < 2 ? "#11141e" : "#161a25";
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.07)";
        ctx.lineWidth = 2.5;
        ctx.stroke();
        ctx.fillStyle = "rgba(255,255,255,0.06)";
        ctx.beginPath();
        ctx.arc(cx, cy, radius * 0.32, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.restore();
    }
    function drawCroppedImage(key, sx, sy, sw, sh, x, y, scale, alpha = 1, flipX = false) {
      const img = ce.images[key];
      if (!imageReady(img)) return;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      if (flipX) {
        ctx.translate(x + sw * scale, y);
        ctx.scale(-1, 1);
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw * scale, sh * scale);
      } else {
        ctx.drawImage(img, sx, sy, sw, sh, x, y, sw * scale, sh * scale);
      }
      ctx.restore();
    }

    function drawChallengeGf(t) {
      const sprite = window.SPORTING_SPRITES?.gf;
      const image = imageReady(spriteState.images.gf) ? spriteState.images.gf : (imageReady(ce.images.gf) ? ce.images.gf : null);
      if (!sprite || !imageReady(image)) return;
      const pose = sportingPose("gf", t);
      drawSportingSpriteState(sprite, image, pose.anim, pose.elapsed, CE.stage.layout.gfX, CE.stage.layout.gfY, CE.stage.layout.gfScale, pose.fps || 12, pose.loop, false, 1);
    }

    function drawChallengeReceptor(lane, x, y) {
      if (!CE.sprites?.notes) return;
      const img = ce.images.notes;
      if (!imageReady(img)) return;
      const fx = state.receptorFx[lane];
      const age = nowSec() - (fx?.time || -10);
      const dir = laneDir(lane);
      if (age < 0.16 && CE.sprites.notes.confirm?.[dir]?.length) {
        const frame = frameFromList(CE.sprites.notes.confirm[dir], age, 24, false);
        if (frame) {
          ctx.save();
          ctx.shadowBlur = 16;
          ctx.shadowColor = COLORS[lane];
          drawAtlasCentered(img, frame, x, y, 0.74 + (0.16 - age) * 0.42, 1 - age / 0.16);
          ctx.restore();
          return;
        }
      }
      const press = CE.sprites.notes.press?.[dir];
      const frame = state.keysDown[lane] && press?.length ? frameFromList(press, nowSec(), 24, true) : CE.sprites.notes.static?.[dir];
      if (!frame) return;
      ctx.save();
      ctx.shadowBlur = state.keysDown[lane] ? 18 : 10;
      ctx.shadowColor = COLORS[lane];
      drawAtlasCentered(img, frame, x, y, state.keysDown[lane] ? 0.72 : 0.7, lane < 4 ? 0.84 : 1);
      ctx.restore();
    }

    function drawChallengeSustain(note, headY, tailY, alpha, x = laneX(note.lane)) {
      if (!CE.sprites?.notes?.hold) return drawDefaultHoldSustain(note, headY, tailY, alpha, x);
      const img = ce.images.notes;
      const hold = CE.sprites.notes.hold?.[laneDir(note.lane)];
      if (!imageReady(img) || !hold) return drawDefaultHoldSustain(note, headY, tailY, alpha, x);
      const bodyScale = 0.82;
      const top = Math.min(headY, tailY);
      const bottom = Math.max(headY, tailY);
      const endH = (hold.end.fh || hold.end.h) * bodyScale;
      const bodyW = (hold.piece.fw || hold.piece.w) * bodyScale;
      const bodyTop = top + endH * 0.45;
      const bodyBottom = bottom - endH * 0.45;
      if (bodyBottom > bodyTop) drawAtlasStretchVertical(img, hold.piece, x, bodyTop, bodyW, bodyBottom - bodyTop, alpha * 0.86);
      drawAtlasCentered(img, hold.end, x, tailY, bodyScale, alpha);
    }

    function drawSportingFallbackSustain(note, headY, tailY, alpha, x = laneX(note.lane)) {
      if (defaultHoldReady()) {
        drawDefaultHoldSustain(note, headY, tailY, alpha, x);
        return;
      }
      drawPlainFallbackSustain(note, headY, tailY, alpha, x);
    }

    function drawChallengeNote(note, x, y, scale, alpha) {
      if (note.rocket) {
        drawRocketNote(note, x, y, scale, alpha);
        return;
      }
      if (!CE.sprites?.notes?.gem) {
        drawSportingNote(note.lane, x, y, 0.62 * scale, alpha);
        return;
      }
      const img = ce.images.notes;
      const frame = CE.sprites.notes.gem?.[laneDir(note.lane)];
      if (!imageReady(img) || !frame) {
        drawSportingNote(note.lane, x, y, 0.62 * scale, alpha);
        return;
      }
      ctx.save();
      ctx.shadowBlur = 16;
      ctx.shadowColor = COLORS[note.lane];
      drawAtlasCentered(img, frame, x, y, 0.74 * scale, alpha);
      ctx.restore();
    }

    function drawNormalStage(t, phase) {
      const fenceKey = imageReady(ce.images.vallas) ? "vallas" : "fence";
      const bot = tordbotState(t, phase.stageMode);
      const matt = mattState(t, phase.stageMode);
      const tom = tomRunState(t, phase.stageMode);
      const arpon = arponState(t, phase.stageMode);
      if (imageReady(ce.images.sky)) drawWorldImage("sky", CE_WORLD.normal.sky.x, CE_WORLD.normal.sky.y);
      if (bot) drawWorldSpriteState(bot.state, ce.images.tordbot, bot.x, bot.y, bot.scale, false, 1);
      if (imageReady(ce.images.patio)) drawWorldImage("patio", CE_WORLD.normal.patio.x, CE_WORLD.normal.patio.y);
      if (matt) drawGroundedWorldSpriteState(matt.state, ce.images.matt, matt.x, matt.y, matt.scale, false, 1);
      drawChallengeGf(t);

      const oppState = opponentSpriteState(t, phase.opp);
      if (oppState) drawGroundedWorldSpriteState(oppState.state, oppState.image, oppState.worldX, oppState.worldY, oppState.worldScale, oppState.flipX, 1);

      const playerState = playerSpriteState(t, phase.player);
      if (playerState) drawGroundedWorldSpriteState(playerState.state, playerState.image, playerState.worldX, playerState.worldY, playerState.worldScale, playerState.flipX, 1);
      if (imageReady(ce.images[fenceKey])) drawWorldImage(fenceKey, CE_WORLD.normal.fence.x, CE_WORLD.normal.fence.y, 1, fenceKey === "vallas" ? 1 : 0.98);
      if (imageReady(ce.images.car)) drawWorldImage("car", CE_WORLD.normal.car.x, CE_WORLD.normal.car.y);
      if (tom) drawGroundedWorldSpriteState(tom.state, ce.images.tomRun, tom.x, tom.y, tom.scale, false, 1);
      if (arpon) drawGroundedWorldSpriteState(arpon.state, ce.images.toomArpon, arpon.x, arpon.y, arpon.scale, false, 1);
    }

    function drawTordStage(t, phase) {
      const layout = CE.stage.layout;
      const bgCache = cachedTordBackground(layout);
      if (!bgCache?.canvas) {
        drawNormalStage(t, phase);
        return;
      }
      const shake = challengeTordShake(t, phase);
      const width = bgCache.width;
      const height = bgCache.height;
      const x = (canvas.width - width) / 2;
      const y = (canvas.height - height) / 2;
      ctx.save();
      ctx.translate(shake.x, shake.y);
      ctx.drawImage(bgCache.canvas, x, y);
      const oppState = opponentSpriteState(t, phase.opp);
      if (oppState) drawGroundedSpriteState(oppState.state, oppState.image, canvas.width * 0.5, 654, oppState.scale * 1.18, oppState.flipX, 1);
      ctx.restore();
      drawTordTurnPortraits(t, phase);
    }

    function opponentSpriteState(t, oppKey) {
      if (!oppKey || oppKey === "none") return null;
      const sprite = CE.sprites.opponent[oppKey];
      const image = imageForVariant(oppKey);
      if (!sprite || !imageReady(image)) return null;
      const stateInfo = poseInfoForSprite(sprite, oppKey, t, specialOppAnim(t, oppKey));
      const world = characterWorldPos("opp", sprite);
      return stateInfo ? { state: stateInfo, image, scale: variantScale(oppKey, "opp"), worldX: world.x, worldY: world.y, worldScale: Number(sprite.scale || 1), flipX: !!sprite.flipX } : null;
    }

    function playerSpriteState(t, playerKey) {
      if (!playerKey || playerKey === "none") return null;
      if (playerKey === "player") return challengeBfSpriteState(t);
      const sprite = CE.sprites.player[playerKey];
      const image = imageForVariant(playerKey);
      if (!sprite || !imageReady(image)) return null;
      const stateInfo = poseInfoForSprite(sprite, playerKey, t, null);
      const world = characterWorldPos("player", sprite);
      return stateInfo ? { state: stateInfo, image, scale: variantScale(playerKey, "player"), worldX: world.x, worldY: world.y, worldScale: Number(sprite.scale || 1), flipX: playerKey.startsWith("bf") ? false : !!sprite.flipX } : null;
    }

    function mattState(t, stageMode) {
      if (!Number.isFinite(mattWalkTime) || t < mattWalkTime || stageMode === "tord") return null;
      const sprite = CE.sprites.extras.matt;
      if (t >= mattReactTime) {
        return { state: { sprite, animName: "react", elapsed: t - mattReactTime, loop: false }, x: lerp(CE_WORLD.matt.idleX, CE_WORLD.matt.reactX, (t - mattReactTime) / 0.1), y: CE_WORLD.matt.y, scale: CE_WORLD.matt.scale };
      }
      if (t >= mattIdleTime) {
        return { state: { sprite, animName: "idle", elapsed: t - mattIdleTime, loop: true }, x: CE_WORLD.matt.idleX, y: CE_WORLD.matt.y, scale: CE_WORLD.matt.scale };
      }
      return { state: { sprite, animName: "enter", elapsed: t - mattWalkTime, loop: true }, x: lerp(CE_WORLD.matt.startX, CE_WORLD.matt.idleX, (t - mattWalkTime) / 8), y: CE_WORLD.matt.y, scale: CE_WORLD.matt.scale };
    }

    function tordbotState(t, stageMode) {
      if (!Number.isFinite(tordbotTime) || t < tordbotTime) return null;
      const sprite = CE.sprites.extras.tordbot;
      if (stageMode === "tord" && t < boomTime) return null;
      if (Number.isFinite(boomTime) && t >= boomTime) {
        return { state: { sprite, animName: "boom", elapsed: t - boomTime, loop: false }, x: CE_WORLD.tordbot.x, y: CE_WORLD.tordbot.endY, scale: CE_WORLD.tordbot.scale };
      }
      const rise = clamp01((t - tordbotTime) / 3);
      return { state: { sprite, animName: "enter", elapsed: t - tordbotTime, loop: true }, x: CE_WORLD.tordbot.x, y: lerp(CE_WORLD.tordbot.startY, CE_WORLD.tordbot.endY, rise), scale: CE_WORLD.tordbot.scale };
    }

    function tomRunState(t, stageMode) {
      if (!Number.isFinite(tomRunTime) || t < tomRunTime || stageMode === "tord") return null;
      const sprite = CE.sprites.extras.tomRun;
      return { state: { sprite, animName: "enter", elapsed: t - tomRunTime, loop: false }, x: lerp(CE_WORLD.tomRun.startX, CE_WORLD.tomRun.endX, (t - tomRunTime) / 3), y: CE_WORLD.tomRun.y, scale: CE_WORLD.tomRun.scale };
    }

    function arponState(t, stageMode) {
      if (!Number.isFinite(arponTime) || t < arponTime || stageMode === "tord") return null;
      const sprite = CE.sprites.extras.toomArpon;
      return { state: { sprite, animName: "enter", elapsed: t - arponTime, loop: true }, x: CE_WORLD.toomArpon.x, y: CE_WORLD.toomArpon.y, scale: CE_WORLD.toomArpon.scale };
    }

    isImportedSong = song => !!song && (song.chartSource === "challengeEdd" || baseIsImportedSong(song));
    makeChart = song => {
      if (song?.chartSource !== "challengeEdd") return baseMakeChart(song);
      const chart = { ...clone(CE.chart), notes: clone(CE.chart.notes), timeline: clone(CE.chart.timeline || []) };
      const bpm = Number(CE.song?.bpm || SONGS.challengeEdd?.tempo || 186);
      const spb = 60 / bpm;
      const noteEnd = chart.notes.reduce((max, note) => Math.max(max, Number(note.time || 0) + Math.max(0, Number(note.sLen || 0))), 0);
      const noteBeatEnd = chart.notes.reduce((max, note) => Math.max(max, Number(note.beat || 0) + (Math.max(0, Number(note.sLen || 0)) / spb)), 0);
      const timelineEndTime = chart.timeline.reduce((max, section) => Math.max(max, Number(section.endTime || 0)), 0);
      const timelineEndBeat = chart.timeline.reduce((max, section) => Math.max(max, Number(section.endBeat || 0)), 0);
      chart.timeline = chart.timeline.map(section => {
        const startTime = Number.isFinite(Number(section.startTime)) ? Number(section.startTime) : Number(section.startBeat || 0) * spb;
        const endTime = Number.isFinite(Number(section.endTime)) ? Number(section.endTime) : Number(section.endBeat || 0) * spb;
        let opp = 0;
        let player = 0;
        for (const note of chart.notes) {
          const time = Number(note.time || 0);
          if (time < startTime || time >= endTime) continue;
          if (note.side === "opp") opp++;
          if (note.side === "player") player++;
        }
        const turn = opp && player ? "both" : player ? "player" : opp ? "opp" : "both";
        return { ...section, startTime, endTime, turn };
      });
      chart.spb = spb;
      chart.totalBeats = Math.max(timelineEndBeat, noteBeatEnd + 4, Math.ceil(Math.max(Number(chart.totalTime || 0), timelineEndTime, noteEnd + 2) / spb));
      chart.totalTime = Math.max(Number(chart.totalTime || 0), timelineEndTime, noteEnd + 2, chart.totalBeats * spb);
      return chart;
    };

    stopExternalAudio = function() {
      const leakedInst = state.audio.inst === state.audio.challengeInst;
      const leakedVoices = state.audio.voices === state.audio.challengeVoices;
      baseStopExternalAudio();
      [state.audio.challengeInst, state.audio.challengeVoices].forEach(track => {
        if (!track) return;
        try {
          track.pause();
          track.currentTime = 0;
        } catch {}
      });
      if (leakedInst) state.audio.inst = null;
      if (leakedVoices) state.audio.voices = null;
    };

    songTime = () => state.currentSong?.chartSource === "challengeEdd" && state.audio.challengeInst ? state.audio.challengeInst.currentTime : baseSongTime();
    songEndTime = () => state.currentSong?.chartSource === "challengeEdd" ? totalTime() : baseSongEndTime();

    startSong = function(id = state.selectedSong, options = {}) {
      const song = SONGS[id] || state.currentSong;
      if (song?.chartSource !== "challengeEdd") {
        if (state.audio.inst === state.audio.challengeInst) state.audio.inst = null;
        if (state.audio.voices === state.audio.challengeVoices) state.audio.voices = null;
        return baseStartSong(id, options);
      }
      const audioContext = ensureAudio();
      if (audioContext.state === "suspended") audioContext.resume();
      stopExternalAudio();
      initAssets();
      ensureAudioTracks();
      const inst = state.audio.challengeInst;
      const voices = state.audio.challengeVoices;
      const skipReload = !!options.skipReload;
      if (typeof initSportingSprites === "function") initSportingSprites();
      state.selectedSong = id;
      state.currentSong = SONGS[id];
      state.mode = options.forceMode || (ui.versusToggle?.checked ? "versus" : "solo");
      ui.modeLabel.textContent = state.mode === "versus" ? "1v1 Versus" : "Solo Battle";
      rebuildKeyMap();
      state.chart = makeChart(state.currentSong);
      state.chart.notes = state.chart.notes.map(note => ({ ...note }));
      resetStats();
      state.health = 0.65;
      inst.currentTime = 0;
      voices.currentTime = 0;
      state.songStart = 0;
      state.nextStep = 0;
      state.nextStepTime = 0;
      state.playing = true;
      if (state.mode === "online" && state.network?.matchStartAt) {
        inst.pause();
        voices.pause();
        if (!skipReload) {
          inst.load();
          voices.load();
        }
      } else {
        inst.play().catch(() => {});
        voices.play().catch(() => {});
      }
      state.feeds.player.time = -10;
      state.feeds.opp.time = -10;
      Object.values(state.poses).forEach(pose => { pose.time = -10; pose.kind = "hit"; });
      state.receptorFx.forEach(fx => fx.time = -10);
      state.perseverance = { canDodge: false, prompt: false, dodging: false, dodged: false, resolved: false, dodgeStart: -10, flashTime: -10, gfAlpha: 0 };
      state.camera = { zoom: 1, focusX: canvas.width / 2, focusY: canvas.height * 0.45, sideTime: 0, lastSide: "both", highwayX: 0, highwayY: 0 };
      ui.p1Box.style.display = state.mode === "versus" ? "block" : "none";
      ui.songTitle.textContent = state.currentSong.title;
      ui.songSub.textContent = state.currentSong.subtitle;
      ui.statusText.textContent = "Challenge Edd";
      ui.statusSub.textContent = "Fucked chart events, Tord notes, and the proper backyard stage are active.";
      ui.timer.textContent = `0:00 / ${formatTime(totalTime())}`;
      ui.menu.classList.remove("show");
      ui.settings.classList.remove("show");
      ui.resultsWrap.classList.remove("show");
    };

    handleMisses = function(t) {
      if (state.selectedSong !== "challengeEdd") return baseHandleMisses(t);
      for (const note of state.chart?.notes || []) {
        if (note.judged) continue;
        if (note.rocket && t > note.time + 0.16) {
          note.judged = true;
          note.played = true;
          judge(note.side, "miss", note.lane, note.character);
          state.health = 0;
          continue;
        }
      }
      return baseHandleMisses(t);
    };

    updateHoldNotes = function(t) {
      if (state.selectedSong !== "challengeEdd") return baseUpdateHoldNotes(t);
      return baseUpdateHoldNotes(t);
    };

    refreshHUD = function(t) {
      baseRefreshHUD(t);
      if (state.selectedSong !== "challengeEdd") return;
      ui.timer.textContent = `${formatTime(t)} / ${formatTime(totalTime())}`;
      const section = state.chart?.timeline?.find(entry => t >= entry.startTime && t < entry.endTime);
      if (section) {
        ui.statusText.textContent = section.label;
        ui.statusSub.textContent = valueAt(CE.stageModes, t) === "tord"
          ? "Tord is active and the fucked difficulty event chain is running."
          : "Classic backyard layout with the real fucked chart routing is active.";
      }
    };

    finish = function(failed = false) {
      if (state.currentSong?.chartSource === "challengeEdd") {
        [state.audio.challengeInst, state.audio.challengeVoices].forEach(track => {
          if (!track) return;
          try { track.pause(); } catch {}
        });
      }
      return baseFinish(failed);
    };

    bg = function(song, t) {
      if (state.selectedSong === "challengeEdd") {
        const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
        gradient.addColorStop(0, "#cce8ff");
        gradient.addColorStop(0.55, "#b6deff");
        gradient.addColorStop(1, "#8bd06c");
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        return;
      }
      return baseBg(song, t);
    };

    stage = function(t) {
      if (state.selectedSong !== "challengeEdd") return baseStage(t);
      initAssets();
      if (!stageImagesReady()) return;
      const phase = currentState(t);
      if (phase.stageMode === "tord") drawTordStage(t, phase);
      else drawNormalStage(t, phase);
    };

    receptors = function(t) {
      if (state.selectedSong !== "challengeEdd") return baseReceptors(t);
      initAssets();
      const phase = currentState(t);
      const shake = challengeTordShake(t, phase);
      const y = receptorY() + shake.y;
      if (challengeUsesSportingNotes()) {
        ctx.strokeStyle = "rgba(255,255,255,0.1)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(canvas.width * .5 + shake.x, 72 + shake.y);
        ctx.lineTo(canvas.width * .5 + shake.x, 452 + shake.y);
        ctx.stroke();
        for (let lane = 0; lane < 8; lane++) {
          const x = laneX(lane) + shake.x;
          drawSportingReceptor(lane, x, y);
          ctx.strokeStyle = "rgba(255,255,255,0.06)";
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(x, y + 26);
          ctx.lineTo(x, 448 + shake.y);
          ctx.stroke();
        }
        return;
      }
      if (!CE.sprites?.notes || !imageReady(ce.images.notes)) return baseReceptors(t);
      ctx.strokeStyle = "rgba(255,255,255,0.1)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(canvas.width * .5 + shake.x, 72 + shake.y);
      ctx.lineTo(canvas.width * .5 + shake.x, 452 + shake.y);
      ctx.stroke();
      for (let lane = 0; lane < 8; lane++) {
        const x = laneX(lane) + shake.x;
        drawChallengeReceptor(lane, x, y);
        ctx.strokeStyle = "rgba(255,255,255,0.06)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x, y + 26);
        ctx.lineTo(x, 448 + shake.y);
        ctx.stroke();
      }
    };

    notes = function(t) {
      if (state.selectedSong !== "challengeEdd") return baseNotes(t);
      if (!state.chart) return;
      initAssets();
      const phase = currentState(t);
      const shake = challengeTordShake(t, phase);
      if (challengeUsesSportingNotes()) {
        const scroll = state.currentSong.scroll;
        for (const note of state.chart.notes) {
          if (note.played && note.hit && (!isHoldNote(note) || note.holdDone)) continue;
          if (note.judged && note.side !== "opp" && (!isHoldNote(note) || note.holdDone || !note.hit)) continue;
          if (note.invisible) continue;
          const diff = note.time - t;
          const x = laneX(note.lane) + shake.x;
          const y = receptorY() + diff * scroll + shake.y;
          const tailY = receptorY() + (holdEndTime(note) - t) * scroll + shake.y;
          if (y < -120 && tailY < -120) continue;
          if (y > canvas.height + 120 && tailY > canvas.height + 120) continue;
          const scale = clamp(1 - Math.pow(Math.abs(diff), 0.7) * .45, .75, 1.12);
          const alpha = note.side === "opp" ? .84 : 1;
          if (isHoldNote(note)) drawSportingFallbackSustain(note, note.hit ? receptorY() + shake.y : y, tailY, alpha * (note.hit ? 0.94 : 1), x);
          if (note.hit && isHoldNote(note) && t > note.time) continue;
          if (note.rocket) drawRocketNote(note, x, y, scale, alpha);
          else drawSportingNote(note.lane, x, y, 0.62 * scale, alpha);
        }
        return;
      }
      if (!CE.sprites?.notes || !imageReady(ce.images.notes)) return baseNotes(t);
      const scroll = state.currentSong.scroll;
      for (const note of state.chart.notes) {
        if (note.played && note.hit && (!isHoldNote(note) || note.holdDone)) continue;
        if (note.judged && note.side !== "opp" && (!isHoldNote(note) || note.holdDone || !note.hit)) continue;
        if (note.invisible) continue;
        const diff = note.time - t;
        const x = laneX(note.lane) + shake.x;
        const y = receptorY() + diff * scroll + shake.y;
        const tailY = receptorY() + (holdEndTime(note) - t) * scroll + shake.y;
        if (y < -120 && tailY < -120) continue;
        if (y > canvas.height + 120 && tailY > canvas.height + 120) continue;
        const scale = clamp(1 - Math.pow(Math.abs(diff), 0.7) * .45, .75, 1.12);
        const alpha = note.side === "opp" ? .84 : 1;
        if (isHoldNote(note)) drawChallengeSustain(note, note.hit ? receptorY() + shake.y : y, tailY, alpha * (note.hit ? 0.94 : 1), x);
        if (note.hit && isHoldNote(note) && t > note.time) continue;
        drawChallengeNote(note, x, y, scale, alpha);
      }
    };

    if (typeof syncOnlinePlayback === "function" && typeof expectedOnlineSongTime === "function") {
      const baseSyncOnlinePlayback = syncOnlinePlayback;
      syncOnlinePlayback = function(force = false) {
        const targetTime = expectedOnlineSongTime();
        const base = baseSyncOnlinePlayback(force);
        if (targetTime == null || state.currentSong?.chartSource !== "challengeEdd") return base;
        ensureAudioTracks();
        const now = typeof serverClockNow === "function" ? serverClockNow() : Date.now();
        const shouldPlay = now + 40 >= (state.network?.matchStartAt || 0);
        for (const track of [state.audio.challengeInst, state.audio.challengeVoices]) {
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
    console.error("Challenge Edd mode failed to initialize", error);
  }
})();


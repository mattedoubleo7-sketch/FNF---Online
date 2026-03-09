(() => {
  try {
    const CE = window.CHALLENGE_EDD_DATA;
    if (!CE || typeof SONGS === "undefined") return;

    const clone = value => JSON.parse(JSON.stringify(value));
    const clamp01 = value => Math.max(0, Math.min(1, value));
    const lerp = (a, b, t) => a + (b - a) * clamp01(t);
    const nowSec = () => performance.now() / 1000;
    const ce = { ready: false, images: {} };

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

    const baseIsImportedSong = isImportedSong;
    const baseMakeChart = makeChart;
    const baseStopExternalAudio = stopExternalAudio;
    const baseSongTime = songTime;
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
        car: CE.stage.images.car,
        tordBg: CE.stage.images.tordBg,
        edd: CE.sprites.opponent.edd.image,
        eddT: CE.sprites.opponent.eddT.image,
        eddV: CE.sprites.opponent.eddV.image,
        tord: CE.sprites.opponent.tord.image,
        bft: CE.sprites.player.bft.image,
        bfv: CE.sprites.player.bfv.image,
        bfBase: window.CHALLENGE_EDD_BF_DATA?.image,
        bfsl: CE.sprites.player.bfsl.image,
        eddsl: CE.sprites.player.eddsl.image,
        matt: CE.sprites.extras.matt.image,
        tordbot: CE.sprites.extras.tordbot.image,
        tomRun: CE.sprites.extras.tomRun.image,
        toomArpon: CE.sprites.extras.toomArpon.image
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
      return imageReady(ce.images.sky) && imageReady(ce.images.patio) && imageReady(ce.images.fence);
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

    function noteEndTime() {
      return (CE.chart?.notes || []).reduce((max, note) => Math.max(max, Number(note.time || 0) + Math.max(0, Number(note.sLen || 0))), 0);
    }

    function totalTime() {
      const noteEnd = noteEndTime();
      const timelineEnd = (CE.chart?.timeline || []).reduce((max, section) => Math.max(max, Number(section.endTime || 0)), 0);
      const durations = [state.audio.challengeInst?.duration, state.audio.challengeVoices?.duration].filter(value => Number.isFinite(value) && value > 0);
      const chartEnd = Math.max(Number(CE.chart?.totalTime || 0), timelineEnd, noteEnd + 2);
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
      return stateInfo ? { state: stateInfo, image, scale: variantScale("player", "player"), flipX: !!sprite.flipX } : null;
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
      if (key === "tord") return 0.34;
      if (key === "bfsl") return 0.42;
      if (key === "eddsl") return 0.42;
      if (key === "bft") return 0.62;
      if (key === "bfv") return 0.64;
      return base;
    }

    function drawSpriteState(stateInfo, image, x, y, scale, flipX = false, alpha = 1) {
      if (!stateInfo?.sprite || !imageReady(image)) return;
      const result = animationFrame(stateInfo.sprite, stateInfo.animName, stateInfo.elapsed, stateInfo.loop);
      if (!result?.frame) return;
      drawAtlasFrame(image, result.frame, x, y, scale, alpha, flipX);
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

    function drawSpeakerStack() {
      const x = CE.stage.layout.speakerX;
      const y = CE.stage.layout.speakerY;
      ctx.save();
      ctx.translate(x, y);
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

    function drawChallengeSustain(note, headY, tailY, alpha) {
      if (!CE.sprites?.notes?.hold) return;
      const img = ce.images.notes;
      const hold = CE.sprites.notes.hold?.[laneDir(note.lane)];
      if (!imageReady(img) || !hold) return;
      const bodyScale = 0.82;
      const top = Math.min(headY, tailY);
      const bottom = Math.max(headY, tailY);
      const endH = (hold.end.fh || hold.end.h) * bodyScale;
      const bodyW = (hold.piece.fw || hold.piece.w) * bodyScale;
      const bodyTop = top + endH * 0.45;
      const bodyBottom = bottom - endH * 0.45;
      if (bodyBottom > bodyTop) drawAtlasStretchVertical(img, hold.piece, laneX(note.lane), bodyTop, bodyW, bodyBottom - bodyTop, alpha * 0.86);
      drawAtlasCentered(img, hold.end, laneX(note.lane), tailY, bodyScale, alpha);
    }

    function drawSportingFallbackSustain(note, headY, tailY, alpha) {
      const x = laneX(note.lane);
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
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x - 5, bodyTop + 2, 10, Math.max(0, bodyBottom - bodyTop - 4));
        ctx.restore();
      }
      drawSportingNote(note.lane, x, tailY, 0.52, alpha * 0.94);
    }

    function drawChallengeNote(note, x, y, scale, alpha) {
      if (!CE.sprites?.notes?.gem) return;
      const img = ce.images.notes;
      const frame = CE.sprites.notes.gem?.[laneDir(note.lane)];
      if (!imageReady(img) || !frame) return;
      ctx.save();
      ctx.shadowBlur = note.rocket ? 26 : 16;
      ctx.shadowColor = note.rocket ? "#ff5c38" : COLORS[note.lane];
      if (note.rocket) ctx.filter = "saturate(1.35) hue-rotate(-28deg)";
      drawAtlasCentered(img, frame, x, y, 0.74 * scale, alpha);
      if (note.rocket) {
        ctx.filter = "none";
        ctx.strokeStyle = "rgba(255,160,120,0.95)";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(x, y, 24 * scale, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }

    function drawNormalStage(t, phase) {
      const layout = CE.stage.layout;
      const sky = ce.images.sky;
      const patio = ce.images.patio;
      const fence = ce.images.fence;
      if (imageReady(sky)) {
        const skyW = sky.naturalWidth * layout.skyScale;
        const skyX = (canvas.width - skyW) / 2;
        drawSimpleImage("sky", skyX, -122, layout.skyScale);
      }
      if (imageReady(patio)) {
        const patioW = patio.naturalWidth * layout.patioScale;
        const patioX = (canvas.width - patioW) / 2;
        drawSimpleImage("patio", patioX, 8, layout.patioScale);
      }
      if (imageReady(fence)) {
        const fenceW = fence.naturalWidth * layout.fenceScale;
        const fenceX = (canvas.width - fenceW) / 2;
        drawSimpleImage("fence", fenceX, 254, layout.fenceScale, 0.98);
      }

      if (phase.gf !== "none") {
        const gfState = sportingSpriteState("gf", t);
        drawSpriteState(gfState, spriteState.images.gf, layout.gfX, layout.gfY, layout.gfScale, false, 1);
      }

      const bot = tordbotState(t, phase.stageMode);
      if (bot) drawSpriteState(bot.state, ce.images.tordbot, bot.x, bot.y, bot.scale, false, 1);

      const matt = mattState(t, phase.stageMode);
      if (matt) drawSpriteState(matt.state, ce.images.matt, matt.x, matt.y, matt.scale, false, 1);

      const oppState = opponentSpriteState(t, phase.opp);
      if (oppState) drawSpriteState(oppState.state, oppState.image, layout.oppX, layout.oppY, oppState.scale, oppState.flipX, 1);

      const playerState = playerSpriteState(t, phase.player);
      if (playerState) drawSpriteState(playerState.state, playerState.image, layout.playerX, layout.playerY, playerState.scale, playerState.flipX, 1);

      const tom = tomRunState(t, phase.stageMode);
      if (tom) drawSpriteState(tom.state, ce.images.tomRun, tom.x, tom.y, tom.scale, false, 1);
      const arpon = arponState(t, phase.stageMode);
      if (arpon) drawSpriteState(arpon.state, ce.images.toomArpon, arpon.x, arpon.y, arpon.scale, false, 1);
    }

    function drawTordStage(t, phase) {
      const layout = CE.stage.layout;
      const img = ce.images.tordBg;
      if (!imageReady(img)) {
        drawNormalStage(t, phase);
        return;
      }
      const width = img.naturalWidth * layout.tordBgScale;
      const height = img.naturalHeight * layout.tordBgScale;
      const x = (canvas.width - width) / 2;
      const y = (canvas.height - height) / 2;
      drawSimpleImage("tordBg", x, y, layout.tordBgScale);
      const oppState = opponentSpriteState(t, phase.opp);
      if (oppState) drawSpriteState(oppState.state, oppState.image, canvas.width * 0.5, 632, oppState.scale, oppState.flipX, 1);
    }

    function opponentSpriteState(t, oppKey) {
      if (!oppKey || oppKey === "none") return null;
      const sprite = CE.sprites.opponent[oppKey];
      const image = imageForVariant(oppKey);
      if (!sprite || !imageReady(image)) return null;
      const stateInfo = poseInfoForSprite(sprite, oppKey, t, specialOppAnim(t, oppKey));
      return stateInfo ? { state: stateInfo, image, scale: variantScale(oppKey, "opp"), flipX: !!sprite.flipX } : null;
    }

    function playerSpriteState(t, playerKey) {
      if (!playerKey || playerKey === "none") return null;
      if (playerKey === "player") return challengeBfSpriteState(t);
      const sprite = CE.sprites.player[playerKey];
      const image = imageForVariant(playerKey);
      if (!sprite || !imageReady(image)) return null;
      const stateInfo = poseInfoForSprite(sprite, playerKey, t, null);
      return stateInfo ? { state: stateInfo, image, scale: variantScale(playerKey, "player"), flipX: !!sprite.flipX } : null;
    }

    function mattState(t, stageMode) {
      if (!Number.isFinite(mattWalkTime) || t < mattWalkTime || stageMode === "tord") return null;
      const sprite = CE.sprites.extras.matt;
      if (t >= mattReactTime) {
        return { state: { sprite, animName: "react", elapsed: t - mattReactTime, loop: false }, x: lerp(CE.stage.layout.mattX + 70, CE.stage.layout.mattX, (t - mattReactTime) / 0.12), y: CE.stage.layout.mattY, scale: CE.stage.layout.mattScale };
      }
      if (t >= mattIdleTime) {
        return { state: { sprite, animName: "idle", elapsed: t - mattIdleTime, loop: true }, x: CE.stage.layout.mattX, y: CE.stage.layout.mattY, scale: CE.stage.layout.mattScale };
      }
      return { state: { sprite, animName: "enter", elapsed: t - mattWalkTime, loop: true }, x: lerp(canvas.width + 200, CE.stage.layout.mattX, (t - mattWalkTime) / 8), y: CE.stage.layout.mattY, scale: CE.stage.layout.mattScale };
    }

    function tordbotState(t, stageMode) {
      if (!Number.isFinite(tordbotTime) || t < tordbotTime) return null;
      const sprite = CE.sprites.extras.tordbot;
      if (stageMode === "tord" && t < boomTime) return null;
      if (Number.isFinite(boomTime) && t >= boomTime) {
        return { state: { sprite, animName: "boom", elapsed: t - boomTime, loop: false }, x: CE.stage.layout.tordbotX, y: CE.stage.layout.tordbotY - 232, scale: CE.stage.layout.tordbotScale };
      }
      const rise = clamp01((t - tordbotTime) / 3);
      return { state: { sprite, animName: "enter", elapsed: t - tordbotTime, loop: true }, x: CE.stage.layout.tordbotX, y: lerp(CE.stage.layout.tordbotY + 220, CE.stage.layout.tordbotY - 232, rise), scale: CE.stage.layout.tordbotScale };
    }

    function tomRunState(t, stageMode) {
      if (!Number.isFinite(tomRunTime) || t < tomRunTime || stageMode === "tord") return null;
      const sprite = CE.sprites.extras.tomRun;
      return { state: { sprite, animName: "enter", elapsed: t - tomRunTime, loop: false }, x: lerp(canvas.width + 220, -80, (t - tomRunTime) / 3), y: CE.stage.layout.tomRunY, scale: CE.stage.layout.tomRunScale };
    }

    function arponState(t, stageMode) {
      if (!Number.isFinite(arponTime) || t < arponTime || stageMode === "tord") return null;
      const sprite = CE.sprites.extras.toomArpon;
      return { state: { sprite, animName: "enter", elapsed: t - arponTime, loop: true }, x: CE.stage.layout.toomArponX, y: CE.stage.layout.toomArponY, scale: CE.stage.layout.toomArponScale };
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
        inst.load();
        voices.load();
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
      const y = receptorY();
      if (challengeUsesSportingNotes()) {
        ctx.strokeStyle = "rgba(255,255,255,0.1)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(canvas.width * .5, 72);
        ctx.lineTo(canvas.width * .5, 452);
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
        return;
      }
      if (!CE.sprites?.notes || !imageReady(ce.images.notes)) return baseReceptors(t);
      ctx.strokeStyle = "rgba(255,255,255,0.1)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(canvas.width * .5, 72);
      ctx.lineTo(canvas.width * .5, 452);
      ctx.stroke();
      for (let lane = 0; lane < 8; lane++) {
        const x = laneX(lane);
        drawChallengeReceptor(lane, x, y);
        ctx.strokeStyle = "rgba(255,255,255,0.06)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x, y + 26);
        ctx.lineTo(x, 448);
        ctx.stroke();
      }
    };

    notes = function(t) {
      if (state.selectedSong !== "challengeEdd") return baseNotes(t);
      if (!state.chart) return;
      initAssets();
      if (challengeUsesSportingNotes()) {
        const scroll = state.currentSong.scroll;
        for (const note of state.chart.notes) {
          if (note.played && note.hit && (!isHoldNote(note) || note.holdDone)) continue;
          if (note.judged && note.side !== "opp" && (!isHoldNote(note) || note.holdDone || !note.hit)) continue;
          if (note.invisible) continue;
          const diff = note.time - t;
          const y = receptorY() + diff * scroll;
          const tailY = receptorY() + (holdEndTime(note) - t) * scroll;
          if (y < -120 && tailY < -120) continue;
          if (y > canvas.height + 120 && tailY > canvas.height + 120) continue;
          const scale = clamp(1 - Math.pow(Math.abs(diff), 0.7) * .45, .75, 1.12);
          const alpha = note.side === "opp" ? .84 : 1;
          if (isHoldNote(note)) drawSportingFallbackSustain(note, note.hit ? receptorY() : y, tailY, alpha * (note.hit ? 0.94 : 1));
          if (note.hit && isHoldNote(note) && t > note.time) continue;
          drawSportingNote(note.lane, laneX(note.lane), y, 0.62 * scale, alpha);
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
        const y = receptorY() + diff * scroll;
        const tailY = receptorY() + (holdEndTime(note) - t) * scroll;
        if (y < -120 && tailY < -120) continue;
        if (y > canvas.height + 120 && tailY > canvas.height + 120) continue;
        const scale = clamp(1 - Math.pow(Math.abs(diff), 0.7) * .45, .75, 1.12);
        const alpha = note.side === "opp" ? .84 : 1;
        if (isHoldNote(note)) drawChallengeSustain(note, note.hit ? receptorY() : y, tailY, alpha * (note.hit ? 0.94 : 1));
        if (note.hit && isHoldNote(note) && t > note.time) continue;
        drawChallengeNote(note, laneX(note.lane), y, scale, alpha);
      }
    };

    if (typeof syncOnlinePlayback === "function" && typeof expectedOnlineSongTime === "function") {
      const baseSyncOnlinePlayback = syncOnlinePlayback;
      syncOnlinePlayback = function(force = false) {
        const targetTime = expectedOnlineSongTime();
        const base = baseSyncOnlinePlayback(force);
        if (targetTime == null || state.currentSong?.chartSource !== "challengeEdd") return base;
        ensureAudioTracks();
        const shouldPlay = Date.now() + 40 >= (state.network?.matchStartAt || 0);
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

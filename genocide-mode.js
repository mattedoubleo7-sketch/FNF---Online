(() => {
  try {
    const G = window.GENOCIDE_DATA;
    if (!G || typeof SONGS === "undefined") return;

    // Tabi Revival overlay - if loaded, replaces sprites, stage layers, and
    // character positions to match the actual VS Tabi Revival mod's
    // restaurant-fire stage. When absent (older deployments), we fall back to
    // the original VS Tabi Rework data so nothing breaks.
    const REVIVAL = window.GENOCIDE_REVIVAL || null;
    const USING_REVIVAL = !!REVIVAL;
    if (USING_REVIVAL) {
      // Splice the Revival sprite tables onto G.sprites so all downstream
      // helpers (animOffset, frameFromList, etc.) keep working unchanged.
      G.sprites.tabi = Object.assign({}, G.sprites.tabi, REVIVAL.sprites.tabi);
      G.sprites.boyfriend = Object.assign({}, G.sprites.boyfriend, REVIVAL.sprites.boyfriend);
      G.sprites.gf = Object.assign({}, G.sprites.gf, REVIVAL.sprites.gf);
      // Swap the chart + audio so we're actually playing the Revival song,
      // not the Rework chart with Revival sprites.
      G.chart = Object.assign({}, G.chart, REVIVAL.chart);
      G.audio = Object.assign({}, G.audio, REVIVAL.audio);
      G.song = Object.assign({}, G.song, REVIVAL.song);
    }

    // ============================================================
    // LOW-SPEC / CONSOLE MODE
    //
    // Microsoft Edge on Xbox falls off a cliff the moment we hit
    // canvas filter("blur(...)") or compound globalCompositeOperation
    // passes. Detect "we're on a console browser" (Xbox/PlayStation/Switch
    // UA, or low-DPI fullscreen TV-resolution browser with a controller
    // attached) and skip the bloom/halo/vignette-image/afterimage passes.
    //
    // The mode is also reachable via ?lowspec=1 for testing on desktop.
    // ============================================================
    const IS_CONSOLE = (() => {
      try {
        const ua = (navigator.userAgent || "").toLowerCase();
        if (/xbox|playstation|nintendo|playstation 4|playstation 5|ps4|ps5|switch/.test(ua)) return true;
        const params = new URLSearchParams(location.search);
        if (params.get("lowspec") === "1" || params.get("console") === "1") return true;
        // Heuristic: TV-resolution viewport + a connected gamepad usually
        // means living-room playback even when the UA hides it.
        const isTvRes = (screen.width >= 1920 && screen.height >= 1080 && devicePixelRatio === 1);
        const hasPads = (navigator.getGamepads?.() || []).some(p => p && p.connected);
        if (isTvRes && hasPads) return true;
      } catch {}
      return false;
    })();
    const LOWSPEC = IS_CONSOLE;

    const SONG_ID = "genocide";
    const SONG_SOURCE = "genocide";
    const genState = { ready: false, images: {}, groundCache: {}, referenceCache: {}, afterimages: { opponent: [], boyfriend: [] }, clockStart: 0, cacheKey: USING_REVIVAL ? "genocide-revival-v3" : "genocide-v10" };
    const clamp01 = value => Math.max(0, Math.min(1, value));
    const DIR_TO_ANIM = {
      left: "singLEFT",
      down: "singDOWN",
      up: "singUP",
      right: "singRIGHT"
    };
    // ============================================================
    // LAYOUT
    //
    // Two profiles live here:
    //   - The original Tabi-Rework layout (kept verbatim as a fallback so
    //     nothing breaks if `genocide-revival-data.js` ever fails to load).
    //   - The Tabi-Revival layout, derived from `restaurant-fire.json`
    //     (defaultZoom 0.7, stage anchors at opponent[-200,100],
     //    girlfriend[400,130], boyfriend[970,100]) + the per-character
    //     position deltas from {tabi,bf,gf}-genocide.json.
    //
    // The Revival source ships positions in a flixel coordinate system that
    // assumes a 1280×720 stage with the camera scaled to defaultZoom (0.7).
    // We map those to our 1280×720 canvas via `SX = (origX + offset.x) * 0.7
    // + 640` (centring the stage). The y math is the same but with 360 as
    // the centre and an extra +90px bias so the floor sits where we draw it.
    // ============================================================
    const LAYOUT_REWORK = {
      stageScale: 0.5,
      stageX: 0,
      stageY: 10,
      destroyedAlpha: 0.32,
      fireX: 640,
      fireY: 718,
      fireScale: 1.05,
      fireAlpha: 0.72,
      fireGlowAlpha: 0.30,
      sideFireScale: 0.72,
      sideFireAlpha: 0.58,
      sideFireGlowAlpha: 0.22,
      sideFireLeftX: 165,
      sideFireRightX: 1115,
      sideFireY: 700,
      stageGlowAlpha: 0.46,
      stageGlowPulse: 0.34,
      speakerX: 650,
      speakerY: 594,
      speakerScale: 0.5,
      vignetteAlpha: 0.42,
      roleScale: { opponent: 0.82, girlfriend: 0.58, boyfriend: 0.76 },
      roleAnchor: {
        opponent: { x: 222, y: 678, mode: "fixed" },
        boyfriend: { x: 858, y: 638, mode: "fixed" },
        girlfriend: { x: 654, y: 462, mode: "fixed" }
      },
      camera: {
        opponent: { x: 425, y: 488 },
        boyfriend: { x: 808, y: 504 }
      }
    };

    // VS Tabi Revival stage coordinate transform.
    // Source positions are in a flixel 1280x720 space with origin (0,0) at
    // the top-left; the camera renders at defaultZoom=0.7. We render straight
    // to our 1280x720 canvas. We translate the whole stage so the floor
    // lines up with the camera focus point.
    const REVIVAL_STAGE_SCALE = 0.7;         // restaurant-fire defaultZoom
    const REVIVAL_X_OFFSET = 0;              // already centred horizontally
    const REVIVAL_Y_OFFSET = 80;             // nudge stage down so floor reads
    function rvX(srcX) { return srcX * REVIVAL_STAGE_SCALE + REVIVAL_X_OFFSET; }
    function rvY(srcY) { return srcY * REVIVAL_STAGE_SCALE + REVIVAL_Y_OFFSET; }
    function rvS(srcScale) { return (srcScale || 1) * REVIVAL_STAGE_SCALE; }

    // Build character anchor from stage + character.json position. Psych
    // stages add the character.position to the stage anchor to get the
    // top-left of the rendered idle frame.
    function revivalAnchor(stageXY, charXY, charScale = 1) {
      const x = stageXY[0] + (charXY?.[0] || 0);
      const y = stageXY[1] + (charXY?.[1] || 0);
      return { x: rvX(x), y: rvY(y), scale: rvS(charScale), mode: "psych" };
    }

    const LAYOUT_REVIVAL = (() => {
      if (!USING_REVIVAL) return null;
      // The Revival source positions assume a 1280x720 flixel stage that the
      // camera renders at defaultZoom 0.7. Mapping them straight through
      // makes the characters float because Psych positions are the
      // TOP-LEFT of the visible frame, and the source character.json puts
      // tabi at -50 and bf at +200 relative to the floor anchor, which
      // means they're at *different floor lines* in the source mod. Our
      // canvas is 1280x720 already, so feet have to plant on the same
      // restaurant floor (around canvas Y ~ 600). Use calibrated canvas-
      // space ground anchors, not the literal psych coordinates.
      return {
        revival: true,
        defaultZoom: REVIVAL.stage.defaultZoom,
        // Frame display scale on our canvas. Source `scale` was 0.9 for
        // tabi/bf and 1.2 for gf, times the stage's 0.7 zoom = 0.63 / 0.84.
        // We render slightly bigger so the characters read on a TV-distance
        // viewport without spilling off-screen.
        roleScale: {
          opponent: 0.70 * Number(REVIVAL.sprites.tabi.scale || 0.9),
          girlfriend: 0.62 * Number(REVIVAL.sprites.gf.scale || 1.2),
          boyfriend: 0.70 * Number(REVIVAL.sprites.boyfriend.scale || 0.9)
        },
        // FEET-PLANTED ground anchors. Tabi on the left side of the
        // restaurant, GF on the speaker behind the floor, BF on the right.
        // All three at the same floor line (y ≈ 620 in canvas space) so
        // nothing floats.
        roleAnchor: {
          opponent:   { x: 305, y: 612, mode: "ground" },
          girlfriend: { x: 632, y: 478, mode: "ground" },
          boyfriend:  { x: 935, y: 620, mode: "ground" }
        },
        // Camera focus points - x is well to one side so a side-pan during
        // singing actually swings noticeably toward the singer instead of
        // hovering near the centre.
        camera: {
          opponent:   { x: 410, y: 502 },
          girlfriend: { x: 640, y: 470 },
          boyfriend:  { x: 870, y: 510 }
        },
        vignetteAlpha: REVIVAL.stage.layers.vignette?.alpha ?? 0.4,
        stageGlowPulse: 0.28,
        // Legacy fire helpers - unused in revival path but kept so any
        // accidental call doesn't NaN.
        fireAlpha: 0, fireGlowAlpha: 0, sideFireAlpha: 0, sideFireGlowAlpha: 0,
        fireScale: 1, sideFireScale: 1,
        fireX: 640, fireY: 718, sideFireLeftX: 0, sideFireRightX: 1280, sideFireY: 720,
        destroyedAlpha: 0
      };
    })();

    const LAYOUT = LAYOUT_REVIVAL || LAYOUT_REWORK;
    const COMMAND_EVENT_SCALE = [0.18, 0.4, 0.72, 1];

    state.poses.tabi = state.poses.tabi || { lane: 1, time: -10, kind: "hit" };
    state.poses.gf = state.poses.gf || { lane: 1, time: -10, kind: "hit" };

    SONGS[SONG_ID] = {
      title: G.song.title,
      subtitle: G.song.subtitle,
      diff: G.song.diff,
      tempo: Number(G.song.bpm || (USING_REVIVAL ? 200 : 213)),
      root: 38,
      scale: [0, 2, 3, 5, 7, 8, 10],
      prog: [0, 5, 3, 6],
      scroll: USING_REVIVAL ? 990 : 1080,
      seed: 59,
      introBeats: 0,
      outroBeats: 4,
      palette: ["#0e0508", "#28090f", "#4d141e", "#090406", "#ff9a73", "#ffd2b3"],
      blurb: USING_REVIVAL
        ? "VS Tabi Revival: the full Revival genocide chart at 200 BPM, the actual restaurant-fire stage with bloom-shaded flames, and the reworked tabi/bf/gf-genocide sprites."
        : "Imported from VS Tabi Rework with the original Genocide hard chart, angry Tabi sprites, post-exp BF/GF, Genocide note skin, and the fire stage audio.",
      chartSource: SONG_SOURCE
    };

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
    const baseUpdateCamera = typeof updateCamera === "function" ? updateCamera : null;
    const baseCameraTargets = typeof cameraTargets === "function" ? cameraTargets : null;
    const baseCameraPanProfile = typeof cameraPanProfile === "function" ? cameraPanProfile : null;
    const baseCameraPoseKeys = typeof cameraPoseKeys === "function" ? cameraPoseKeys : null;

    function clone(value) {
      return JSON.parse(JSON.stringify(value));
    }

    function commandPulseAt(t) {
      const commands = window.GENOCIDE_COMMANDS || [];
      if (!commands.length) return 0;
      let strength = 0;
      for (let i = 0; i < commands.length; i++) {
        const event = commands[i];
        const age = t - Number(event[0] || 0);
        if (age < -0.06) break;
        if (age > 0.32) continue;
        const kind = Math.max(0, Math.min(COMMAND_EVENT_SCALE.length - 1, Number(event[1] || 0)));
        const weight = COMMAND_EVENT_SCALE[kind];
        if (age < 0) {
          strength += weight * Math.max(0, 1 - Math.abs(age) / 0.06) * 0.55;
        } else {
          strength += weight * Math.max(0, 1 - age / 0.32);
        }
      }
      return Math.min(1.35, strength);
    }

    function genocideFxProfile(t) {
      const beat = genocideBeatPulse(t, 0.2);
      const command = commandPulseAt(t);
      return {
        beat,
        command,
        total: Math.min(1.5, beat * 0.55 + command)
      };
    }

    function assetUrl(src) {
      if (!src) return src;
      const text = String(src);
      return text.includes("?") ? text : `${text}?v=${genState.cacheKey}`;
    }

    function initAssets() {
      if (genState.ready) return;
      genState.ready = true;
      const sources = {
        back: G.stage.images.back,
        fire: G.stage.images.fire,
        glow: G.stage.images.glow,
        furniture: G.stage.images.furniture,
        sticks: G.stage.images.sticks,
        boombox: G.stage.images.boombox,
        destroyed: G.stage.images.destroyed,
        vignette: "assets/genocide-vignette.png",
        tabi: G.sprites.tabi.image,
        boyfriend: G.sprites.boyfriend.image,
        gf: G.sprites.gf.image,
        notes: G.sprites.notes.image
      };
      if (USING_REVIVAL) {
        // restaurant-fire.lua stage layers
        Object.assign(sources, {
          rvBg: REVIVAL.stage.images.bg,
          rvTables: REVIVAL.stage.images.tables,
          rvGlow: REVIVAL.stage.images.glow,
          rvBackFlames: REVIVAL.stage.images.backFlames,
          rvFrontFlameLeft: REVIVAL.stage.images.frontFlameLeft,
          rvFrontFlameRight: REVIVAL.stage.images.frontFlameRight
        });
      }
      Object.entries(sources).forEach(([key, src]) => {
        if (!src) return;
        const image = new Image();
        image.src = assetUrl(src);
        genState.images[key] = image;
      });
    }

    function imageReady(image) {
      return !!(image && image.complete && image.naturalWidth);
    }

    function ensureAudioTracks() {
      if (!state.audio.genocideInst) {
        state.audio.genocideInst = new Audio(assetUrl(G.audio.inst));
        state.audio.genocideInst.preload = "auto";
        state.audio.genocideInst.volume = 0.92;
      }
      if (!state.audio.genocideVoices) {
        state.audio.genocideVoices = new Audio(assetUrl(G.audio.voices));
        state.audio.genocideVoices.preload = "auto";
        state.audio.genocideVoices.volume = 0.88;
      }
    }

    window.ensureGenocideAudio = ensureAudioTracks;
    window.prepareGenocideOnlineStart = function() {
      ensureAudioTracks();
      [state.audio.genocideInst, state.audio.genocideVoices].forEach(track => {
        if (!track) return;
        track.pause();
        try { track.currentTime = 0; } catch {}
        try { track.load(); } catch {}
      });
      return [state.audio.genocideInst, state.audio.genocideVoices];
    };

    function noteEndTime() {
      return (G.chart?.notes || []).reduce((max, note) => Math.max(max, Number(note.time || 0) + Math.max(0, Number(note.sLen || 0))), 0);
    }

    function totalTime() {
      ensureAudioTracks();
      const durations = [state.audio.genocideInst, state.audio.genocideVoices]
        .filter(Boolean)
        .map(track => Number(track.duration || 0))
        .filter(duration => Number.isFinite(duration) && duration > 0);
      const chartEnd = Math.max(noteEndTime() + 2, Number(G.chart?.songEndTime || 0));
      return durations.length ? Math.max(chartEnd, ...durations) : chartEnd;
    }

    function spriteByRole(role) {
      if (role === "opponent") return G.sprites.tabi;
      if (role === "girlfriend") return G.sprites.gf;
      return G.sprites.boyfriend;
    }

    function roleImageKey(role) {
      if (role === "opponent") return "tabi";
      if (role === "girlfriend") return "gf";
      return "boyfriend";
    }

    function animDuration(anim) {
      if (!anim?.frames?.length) return 0.24;
      return anim.frames.length / Math.max(1, Number(anim.fps || 24));
    }

    function animOffset(anim) {
      const rawOffset = anim?.offset || anim?.offsets || [0, 0];
      return {
        x: Number(rawOffset?.[0] || 0),
        y: Number(rawOffset?.[1] || 0)
      };
    }

    function missAnimName(sprite, hitAnim) {
      const lower = hitAnim + "miss";
      const upper = hitAnim + "Miss";
      if (sprite.animations[lower]) return lower;
      if (sprite.animations[upper]) return upper;
      return null;
    }

    function idleAnimName(sprite, role, t) {
      if (role === "girlfriend") {
        const beat = t / Math.max(0.001, Number(G.chart?.spb || 0.5));
        return Math.floor(beat) % 2 === 0 ? "danceLeft" : "danceRight";
      }
      return sprite.animations.idle ? "idle" : Object.keys(sprite.animations)[0];
    }

    function spriteAnimState(sprite, role, poseKey, t) {
      const pose = state.poses[poseKey] || { lane: 1, time: -10, kind: "hit" };
      const dir = DIRS[(pose.lane || 0) % 4] || "left";
      const hitAnim = DIR_TO_ANIM[dir];
      const missAnim = missAnimName(sprite, hitAnim);
      const age = performance.now() / 1000 - Number(pose.time || -10);
      if (age >= 0) {
        if (pose.kind === "miss" && missAnim && age < animDuration(sprite.animations[missAnim])) {
          return { name: missAnim, elapsed: age, loop: false };
        }
        if (sprite.animations[hitAnim] && age < animDuration(sprite.animations[hitAnim])) {
          return { name: hitAnim, elapsed: age, loop: false };
        }
      }
      const idle = idleAnimName(sprite, role, t);
      return { name: idle, elapsed: role === "girlfriend" ? t * 1.1 : t * 0.8, loop: true };
    }

    function frameGroundPoint(image, frame) {
      if (!imageReady(image) || !frame) return { x: 0, y: 0 };
      const key = image.src + "|" + (frame.name || [frame.x, frame.y, frame.w, frame.h].join(","));
      if (genState.groundCache[key]) return genState.groundCache[key];
      if (!frameGroundPoint.canvas) frameGroundPoint.canvas = document.createElement("canvas");
      const sample = frameGroundPoint.canvas;
      const sw = Math.max(1, Number(frame.w || frame.fw || 1));
      const sh = Math.max(1, Number(frame.h || frame.fh || 1));
      sample.width = sw;
      sample.height = sh;
      const sampleCtx = sample.getContext("2d", { willReadFrequently: true });
      sampleCtx.clearRect(0, 0, sw, sh);
      sampleCtx.drawImage(image, frame.x, frame.y, frame.w, frame.h, 0, 0, sw, sh);
      const pixels = sampleCtx.getImageData(0, 0, sw, sh).data;
      let row = sh - 1;
      for (; row >= 0; row--) {
        let found = false;
        for (let x = 0; x < sw; x++) {
          if (pixels[(row * sw + x) * 4 + 3] > 10) {
            found = true;
            break;
          }
        }
        if (found) break;
      }
      if (row < 0) row = sh - 1;
      let sumX = 0;
      let count = 0;
      for (let y = Math.max(0, row - 2); y <= row; y++) {
        for (let x = 0; x < sw; x++) {
          if (pixels[(y * sw + x) * 4 + 3] > 10) {
            sumX += x;
            count += 1;
          }
        }
      }
      const point = {
        x: Number(frame.fx || 0) + (count ? sumX / count : sw / 2),
        y: Number(frame.fy || 0) + row
      };
      genState.groundCache[key] = point;
      return point;
    }

    function roleAnchor(role) {
      const anchor = LAYOUT.roleAnchor?.[role];
      return {
        x: Number(anchor?.x || 0),
        y: Number(anchor?.y || 0),
        mode: anchor?.mode || "ground"
      };
    }

    function referenceAnimName(sprite, role) {
      if (role === "girlfriend" && sprite.animations?.danceLeft) return "danceLeft";
      if (sprite.animations?.idle) return "idle";
      return Object.keys(sprite.animations || {})[0];
    }

    function spriteReference(role) {
      if (genState.referenceCache[role]) return genState.referenceCache[role];
      const sprite = spriteByRole(role);
      const image = genState.images[roleImageKey(role)];
      if (!sprite || !imageReady(image)) return null;
      const animName = referenceAnimName(sprite, role);
      const anim = sprite.animations?.[animName];
      const frame = anim?.frames?.[0];
      if (!anim || !frame) return null;
      const reference = {
        anim,
        frame,
        offset: animOffset(anim),
        ground: frameGroundPoint(image, frame)
      };
      genState.referenceCache[role] = reference;
      return reference;
    }

    function roleRenderState(role, poseKey, t) {
      const sprite = spriteByRole(role);
      const image = genState.images[roleImageKey(role)];
      if (!sprite || !imageReady(image)) return null;
      const animState = spriteAnimState(sprite, role, poseKey, t);
      const anim = sprite.animations[animState.name] || sprite.animations.idle || Object.values(sprite.animations)[0];
      if (!anim?.frames?.length) return null;
      const frame = frameFromList(anim.frames, animState.elapsed, Number(anim.fps || 24), animState.loop);
      if (!frame) return null;
      const anchor = LAYOUT.roleAnchor?.[role] || { x: 0, y: 0, mode: "fixed" };
      const scale = Number((anchor.mode === "psych" ? anchor.scale : LAYOUT.roleScale[role]) || 1) * (anchor.mode === "psych" ? 1 : Number(sprite.scale || 1));
      let pos;
      if (anchor.mode === "fixed") {
        pos = { x: anchor.x, y: anchor.y };
      } else if (anchor.mode === "psych") {
        // Psych Engine semantics: anchor is the TOP-LEFT of the rendered
        // idle frame, and per-anim offsets are SUBTRACTED to shift the
        // current frame relative to idle. drawAtlasFrame expects the
        // bottom-centre point of the frame (matches drawAtlasBottomCentered
        // used throughout this file). So we convert.
        const currentOffset = animOffset(anim);
        const fw = Number(frame.fw || frame.w || 0);
        const fh = Number(frame.fh || frame.h || 0);
        // Top-left of this frame: anchor + (idle.offset - this.offset). We
        // don't have the idle offset precomputed for the Revival data
        // because every anim's "offset" is already relative-to-idle in the
        // source character.json. So just subtract the current offset.
        const topLeftX = anchor.x - currentOffset.x * scale;
        const topLeftY = anchor.y - currentOffset.y * scale;
        pos = {
          x: topLeftX + fw * scale * 0.5,
          y: topLeftY + fh * scale
        };
      } else {
        const currentOffset = animOffset(anim);
        const ground = frameGroundPoint(image, frame);
        pos = {
          x: anchor.x + (Number(frame.fw || frame.w || 0) * 0.5 + Number(frame.fx || 0) - ground.x - currentOffset.x) * scale,
          y: anchor.y + (Number(frame.fh || frame.h || 0) + Number(frame.fy || 0) - ground.y - currentOffset.y) * scale
        };
      }
      // Revival BF has flipX: true in the JSON (he faces left in the atlas,
      // and the engine flips him to face right). The legacy code force-set
      // boyfriend flipX=false; respect the sprite metadata in Revival mode.
      const flipX = USING_REVIVAL
        ? !!sprite.flipX
        : (role === "boyfriend" ? false : !!sprite.flipX);
      return { image, frame, scale, pos, flipX };
    }

    function drawShadow(x, y, width, alpha = 0.24) {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = "#060102";
      ctx.beginPath();
      ctx.ellipse(x, y, width * 0.5, width * 0.13, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    function drawRoleRender(role, render, alpha = 1) {
      if (!render) return;
      if (role !== "girlfriend") {
        const shadowWidth = Math.max(88, (render.frame.fw || render.frame.w || 240) * render.scale * 0.44);
        drawShadow(render.pos.x, render.pos.y + 12, shadowWidth, (role === "opponent" ? 0.3 : 0.22) * alpha);
      }
      drawAtlasFrame(render.image, render.frame, render.pos.x, render.pos.y, render.scale, alpha, render.flipX);
    }

    function drawRole(role, poseKey, t) {
      const render = roleRenderState(role, poseKey, t);
      if (!render) return null;
      drawRoleRender(role, render);
      return render;
    }

    function poseAge(poseKey) {
      return performance.now() / 1000 - Number(state.poses[poseKey]?.time || -10);
    }

    function trailPoseKey(role) {
      return role === "opponent" ? "tabi" : "player";
    }

    function cleanupAfterimages(role, now) {
      const list = genState.afterimages[role];
      if (!list) return;
      while (list.length && now - list[0].time > 0.11) list.shift();
    }

    function recordAfterimage(role, render) {
      const poseKey = trailPoseKey(role);
      if (!render || poseAge(poseKey) > 0.16) return;
      const now = performance.now() / 1000;
      cleanupAfterimages(role, now);
      const list = genState.afterimages[role];
      if (list.length && now - list[list.length - 1].time < 0.024) return;
      list.push({
        time: now,
        frame: render.frame,
        pos: { x: render.pos.x, y: render.pos.y },
        scale: render.scale,
        flipX: render.flipX,
        frameHeight: Number(render.frame?.fh || render.frame?.h || 0)
      });
      while (list.length > 3) list.shift();
    }

    function drawAfterimages(role, t) {
      if (LOWSPEC) return; // skip the trail composite passes entirely
      const list = genState.afterimages[role];
      if (!list?.length) return;
      const now = performance.now() / 1000;
      cleanupAfterimages(role, now);
      const image = genState.images[role === "opponent" ? "tabi" : "boyfriend"];
      if (!imageReady(image)) return;
      const purpleTint = role === "opponent" ? "#c36fff" : "#9d83ff";
      const offsetDir = role === "opponent" ? -1 : 1;
      const commandBoost = genocideFxProfile(t).command;
      for (const echo of list.slice(-3)) {
        const age = now - echo.time;
        const p = clamp01(age / 0.11);
        const alpha = ((role === "opponent" ? 0.85 : 0.62) + commandBoost * 0.18) * (1 - p);
        if (alpha <= 0.02) continue;
        const lift = (echo.frameHeight / 14) * p;
        const offsetX = offsetDir * (3.5 + p * 1.5 + commandBoost * 1.4);
        const offsetY = -(1.5 + p * 1.2 + commandBoost * 0.8) - lift * 0.25;
        ctx.save();
        ctx.globalCompositeOperation = "screen";
        ctx.filter = `blur(${(0.35 + p * 0.45 + commandBoost * 0.7).toFixed(1)}px) brightness(${(1.18 + commandBoost * 0.08).toFixed(2)})`;
        drawAtlasFrameSilhouette(image, echo.frame, echo.pos.x + offsetX, echo.pos.y + offsetY, echo.scale, alpha * (0.34 + commandBoost * 0.08), echo.flipX, purpleTint);
        ctx.restore();
        ctx.save();
        ctx.globalCompositeOperation = "screen";
        ctx.filter = `blur(${(0.5 + p * 0.9 + commandBoost * 0.8).toFixed(1)}px) brightness(${(role === "opponent" ? 1.42 : 1.18) + commandBoost * 0.16})`;
        drawAtlasFrame(image, echo.frame, echo.pos.x, echo.pos.y - lift, echo.scale, alpha, echo.flipX);
        ctx.restore();
      }
    }

    function drawBackdropLayer(image, scale, yOffset = 0, alpha = 1, composite = "source-over") {
      if (!imageReady(image)) return;
      const width = image.naturalWidth * scale;
      const height = image.naturalHeight * scale;
      const x = (canvas.width - width) / 2 + Number(LAYOUT.stageX || 0);
      const y = Number(LAYOUT.stageY || 0) + yOffset;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.globalCompositeOperation = composite;
      ctx.drawImage(image, x, y, width, height);
      ctx.restore();
    }

    function drawAtlasBottomCentered(image, frame, x, y, scale, alpha = 1, flipX = false, composite = "source-over") {
      if (!imageReady(image) || !frame) return;
      const fw = Number(frame.fw || frame.w || 0);
      const fh = Number(frame.fh || frame.h || 0);
      const fx = Number(frame.fx || 0);
      const fy = Number(frame.fy || 0);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.globalCompositeOperation = composite;
      ctx.translate(x, y);
      if (flipX) ctx.scale(-1, 1);
      if (frame.rotated) {
        ctx.rotate(-Math.PI / 2);
        ctx.drawImage(image, frame.x, frame.y, frame.w, frame.h, -fh * scale / 2 - fx * scale, -fw * scale - fy * scale, fh * scale, fw * scale);
      } else {
        ctx.drawImage(image, frame.x, frame.y, frame.w, frame.h, -fw * scale / 2 - fx * scale, -fh * scale - fy * scale, fw * scale, fh * scale);
      }
      ctx.restore();
    }

    function genocideBeatPulse(t, sharpness = 0.22) {
      const spb = Math.max(0.001, Number(G.chart?.spb || 60 / Number(G.song?.bpm || 213)));
      const phase = (t / spb) % 1;
      return phase <= sharpness ? Math.pow(1 - phase / sharpness, 2.35) : 0;
    }

    // VS Tabi Genocide has a much harder beat-driven camera bump than the
    // engine default - at 213 BPM the camera punches in ~5% on every beat
    // and snaps back fast. This bump shape is wider than the visual-only
    // pulse so the camera feels like it lands and recovers cleanly per beat
    // rather than chattering.
    function genocideCameraBump(t) {
      const spb = Math.max(0.001, Number(G.chart?.spb || 60 / Number(G.song?.bpm || 213)));
      const phase = (t / spb) % 1;
      const sharpness = 0.42;
      const bump = phase <= sharpness ? Math.pow(1 - phase / sharpness, 1.6) : 0;
      return 1 + bump * 0.055;
    }

    function drawBottomCenteredImage(image, x, y, scale, alpha = 1, composite = "source-over") {
      if (!imageReady(image)) return;
      const width = image.naturalWidth * scale;
      const height = image.naturalHeight * scale;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.globalCompositeOperation = composite;
      ctx.drawImage(image, x - width / 2, y - height, width, height);
      ctx.restore();
    }

    function drawStageBackdrop(t) {
      const fx = genocideFxProfile(t);
      const pulse = fx.beat;
      drawBackdropLayer(genState.images.back, LAYOUT.stageScale, 0, 1);
      drawBackdropLayer(genState.images.glow, LAYOUT.stageScale, 0, LAYOUT.stageGlowAlpha + pulse * LAYOUT.stageGlowPulse + fx.command * 0.28 + Math.sin(t * 2.4) * 0.03, "screen");
      drawBackdropLayer(genState.images.destroyed, LAYOUT.stageScale, 0, LAYOUT.destroyedAlpha + pulse * 0.08 + fx.command * 0.1, "screen");
      drawBackdropLayer(genState.images.furniture, LAYOUT.stageScale, 0, 0.96);
    }

    // ============================================================
    // Tabi Revival restaurant-fire stage drawing
    //
    // Layer order (matches restaurant-fire.lua):
    //   1. bg                         (fixed, scale 0.825)
    //   2. backmost flames            (animated, scale 1.3, alpha 0.55, overlay shader)
    //   3. tables (a.k.a. bg2)        (fixed, scale 0.825)        - on top of back flames
    //   4. glow                       (scrollFactor 0.1, alpha 0.75)
    //   5. characters
    //   6. front flame right          (scrollFactor 1.3, alpha 0.55, overlay shader)
    //   7. front flame left           (scrollFactor 1.3, alpha 0.55, overlay shader)
    //   8. vignette (camHUD, alpha 0.4, blend ADD)
    // ============================================================

    // Cheap approximation of bbpanzu's bloom+overlay shader: an orange
    // glow halo drawn behind the sprite using a blurred recolour, plus a
    // softlight pass with the source flame on top. The exact shader is a
    // 16-direction gaussian blur with overlay-blend orange (#ff8000) tint —
    // a Canvas2D filter("blur") into a screen-blend orange tint is close
    // enough for game-frame work without a WebGL fragment pass.
    function drawFlameOverlayed(image, frame, x, y, scale, alpha) {
      if (!imageReady(image) || !frame) return;
      // Layer A: orange-tinted halo behind the flame
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      ctx.filter = "blur(6px)";
      ctx.globalAlpha = alpha * 0.55;
      drawAtlasBottomCentered(image, frame, x, y, scale * 1.04, 1);
      ctx.restore();
      // Layer B: the flame itself, slightly orange-warmed via colour-burn
      ctx.save();
      ctx.globalAlpha = alpha;
      drawAtlasBottomCentered(image, frame, x, y, scale, 1);
      ctx.restore();
      // Layer C: overlay-blend orange wash to mimic the shader's tint
      ctx.save();
      ctx.globalCompositeOperation = "overlay";
      ctx.globalAlpha = alpha * 0.50;
      ctx.filter = "blur(2px)";
      drawAtlasBottomCentered(image, frame, x, y, scale, 1, false, "source-over");
      // tint pass
      ctx.globalCompositeOperation = "source-atop";
      ctx.fillStyle = "rgba(255, 128, 0, 0.55)";
      const fw = Number(frame.fw || frame.w || 0) * scale;
      const fh = Number(frame.fh || frame.h || 0) * scale;
      ctx.fillRect(x - fw, y - fh, fw * 2, fh);
      ctx.restore();
    }

    function drawTopLeftLayer(image, srcX, srcY, srcScale = 1, alpha = 1, composite = "source-over") {
      if (!imageReady(image)) return;
      const w = image.naturalWidth * rvS(srcScale);
      const h = image.naturalHeight * rvS(srcScale);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.globalCompositeOperation = composite;
      ctx.drawImage(image, rvX(srcX), rvY(srcY), w, h);
      ctx.restore();
    }

    function drawTopLeftAtlas(image, frame, srcX, srcY, srcScale = 1, alpha = 1, composite = "source-over") {
      if (!imageReady(image) || !frame) return;
      const fw = Number(frame.fw || frame.w || 0);
      const fh = Number(frame.fh || frame.h || 0);
      const fx = Number(frame.fx || 0);
      const fy = Number(frame.fy || 0);
      const targetScale = rvS(srcScale);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.globalCompositeOperation = composite;
      ctx.translate(rvX(srcX), rvY(srcY));
      if (frame.rotated) {
        ctx.rotate(-Math.PI / 2);
        ctx.drawImage(image, frame.x, frame.y, frame.w, frame.h,
          -frame.h * targetScale - fx * targetScale, -frame.w * targetScale - fy * targetScale,
          frame.h * targetScale, frame.w * targetScale);
      } else {
        ctx.drawImage(image, frame.x, frame.y, frame.w, frame.h,
          fx * targetScale, fy * targetScale,
          frame.w * targetScale, frame.h * targetScale);
      }
      ctx.restore();
    }

    function drawTopLeftAtlasOverlay(image, frame, srcX, srcY, srcScale = 1, alpha = 1) {
      if (!imageReady(image) || !frame) return;
      if (LOWSPEC) {
        // Console / Edge: skip the canvas filter("blur") passes entirely -
        // those alone can drop us from 60fps to 12fps on an Xbox Series S.
        // Use a single screen-composite draw with a brighter alpha so the
        // flames still pop without GPU compositing thrash.
        ctx.save();
        ctx.globalCompositeOperation = "screen";
        ctx.globalAlpha = alpha * 0.85;
        drawTopLeftAtlas(image, frame, srcX, srcY, srcScale, 1);
        ctx.restore();
        return;
      }
      // Orange-tinted blurred bloom underneath
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      ctx.filter = "blur(6px) saturate(1.4)";
      ctx.globalAlpha = alpha * 0.70;
      drawTopLeftAtlas(image, frame, srcX, srcY, srcScale, 1);
      ctx.restore();
      // The flame itself
      drawTopLeftAtlas(image, frame, srcX, srcY, srcScale, alpha);
      // Overlay-blend orange tint to approximate vec4(1.0, 0.5, 0.0, 1.0)
      ctx.save();
      ctx.globalCompositeOperation = "overlay";
      ctx.globalAlpha = alpha * 0.60;
      ctx.filter = "blur(1.5px)";
      drawTopLeftAtlas(image, frame, srcX, srcY, srcScale, 1);
      ctx.restore();
    }

    function drawRevivalBackdrop(t) {
      const fx = genocideFxProfile(t);
      const pulse = fx.beat;
      const layers = REVIVAL.stage.layers;
      // 1. bg
      drawTopLeftLayer(genState.images.rvBg, layers.bg.x, layers.bg.y, layers.bg.scale, 1);
      // 2. backmost flames (animated, overlay shader)
      const backFr = frameFromList(REVIVAL.stage.backFlameFrames, t * 0.85, 24, true);
      if (backFr) {
        // ALPHA pulses on beat: base 0.55 + a beat bump so the room flickers
        const aBack = (layers.backFlames.alpha + pulse * 0.18 + fx.command * 0.10);
        ctx.save();
        ctx.globalAlpha = aBack;
        drawTopLeftAtlasOverlay(genState.images.rvBackFlames, backFr, layers.backFlames.x, layers.backFlames.y, layers.backFlames.scale, 1);
        ctx.restore();
      }
      // 3. tables (bg2)
      drawTopLeftLayer(genState.images.rvTables, layers.tables.x, layers.tables.y, layers.tables.scale, 1);
      // 4. glow (low parallax)
      drawTopLeftLayer(genState.images.rvGlow, layers.glow.x, layers.glow.y, 1, (layers.glow.alpha + pulse * 0.12 + fx.command * 0.18), "screen");
    }

    function drawRevivalForeground(t) {
      const fx = genocideFxProfile(t);
      const pulse = fx.beat;
      const layers = REVIVAL.stage.layers;
      const frR = frameFromList(REVIVAL.stage.frontFlameRightFrames, (t + 0.12) * 0.92, 24, true);
      const frL = frameFromList(REVIVAL.stage.frontFlameLeftFrames, (t + 0.31) * 0.97, 24, true);
      const aFront = (layers.frontFlameRight.alpha + pulse * 0.16 + fx.command * 0.08);
      if (frR) {
        ctx.save();
        ctx.globalAlpha = aFront;
        drawTopLeftAtlasOverlay(genState.images.rvFrontFlameRight, frR, layers.frontFlameRight.x, layers.frontFlameRight.y, 1, 1);
        ctx.restore();
      }
      if (frL) {
        ctx.save();
        ctx.globalAlpha = aFront;
        drawTopLeftAtlasOverlay(genState.images.rvFrontFlameLeft, frL, layers.frontFlameLeft.x, layers.frontFlameLeft.y, 1, 1);
        ctx.restore();
      }
    }

    function drawRevivalPostFX(t) {
      const fx = genocideFxProfile(t);
      const pulse = fx.beat;
      const a = (LAYOUT.vignetteAlpha + pulse * 0.10 + fx.command * 0.08);
      if (LOWSPEC) {
        // Console: skip the additive vignette image entirely and use a
        // cached cheap radial overlay. No compound composites.
        if (!drawRevivalPostFX._cachedVig || drawRevivalPostFX._cachedVigSize !== canvas.width + "x" + canvas.height) {
          const off = document.createElement("canvas");
          off.width = canvas.width; off.height = canvas.height;
          const octx = off.getContext("2d");
          const grad = octx.createRadialGradient(canvas.width / 2, canvas.height / 2, canvas.height * 0.30, canvas.width / 2, canvas.height / 2, canvas.height * 0.75);
          grad.addColorStop(0, "rgba(0,0,0,0)");
          grad.addColorStop(1, "rgba(0,0,0,0.78)");
          octx.fillStyle = grad;
          octx.fillRect(0, 0, off.width, off.height);
          drawRevivalPostFX._cachedVig = off;
          drawRevivalPostFX._cachedVigSize = canvas.width + "x" + canvas.height;
        }
        ctx.save();
        ctx.globalAlpha = Math.min(1, a * 0.9);
        ctx.drawImage(drawRevivalPostFX._cachedVig, 0, 0);
        ctx.restore();
        return;
      }
      // camHUD vignette (blend ADD = "lighter"). The Lua lerps alpha to 0.4
      // every update; we mirror that with a beat-driven push above 0.4.
      if (imageReady(genState.images.vignette)) {
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = Math.min(1, a);
        ctx.drawImage(genState.images.vignette, 0, 0, canvas.width, canvas.height);
        ctx.restore();
      } else {
        ctx.save();
        ctx.globalAlpha = Math.min(1, a * 0.8);
        const grad = ctx.createRadialGradient(canvas.width / 2, canvas.height / 2, canvas.height * 0.32, canvas.width / 2, canvas.height / 2, canvas.height * 0.72);
        grad.addColorStop(0, "rgba(0,0,0,0)");
        grad.addColorStop(1, "rgba(0,0,0,0.85)");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.restore();
      }
      if (fx.command > 0.04) {
        ctx.save();
        ctx.globalCompositeOperation = "screen";
        ctx.globalAlpha = Math.min(0.16, fx.command * 0.14);
        ctx.fillStyle = "#ff5d2a";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.restore();
      }
    }

    function drawStageFire(t) {
      const frames = G.stage.fireFrames || [];
      if (!frames.length || !imageReady(genState.images.fire)) return;
      const fx = genocideFxProfile(t);
      const pulse = fx.beat;

      // Two side fire instances at the room corners. Each uses its own time
      // offset so the flicker doesn't sync up - that would read as duplicates.
      // Drawn BEFORE the main fire so the centre one sits on top.
      const leftFrame = frameFromList(frames, (t + 0.31) * 0.62, 24, true);
      const rightFrame = frameFromList(frames, (t + 0.83) * 0.68, 24, true);
      const sideAlpha = LAYOUT.sideFireAlpha + pulse * 0.10;
      if (leftFrame) {
        drawAtlasBottomCentered(genState.images.fire, leftFrame, LAYOUT.sideFireLeftX, LAYOUT.sideFireY, LAYOUT.sideFireScale, sideAlpha);
        ctx.save();
        ctx.globalCompositeOperation = "screen";
        ctx.globalAlpha = LAYOUT.sideFireGlowAlpha + pulse * 0.12 + fx.command * 0.10;
        drawAtlasBottomCentered(genState.images.fire, leftFrame, LAYOUT.sideFireLeftX, LAYOUT.sideFireY, LAYOUT.sideFireScale * 1.05, 1);
        ctx.restore();
      }
      if (rightFrame) {
        drawAtlasBottomCentered(genState.images.fire, rightFrame, LAYOUT.sideFireRightX, LAYOUT.sideFireY, LAYOUT.sideFireScale, sideAlpha);
        ctx.save();
        ctx.globalCompositeOperation = "screen";
        ctx.globalAlpha = LAYOUT.sideFireGlowAlpha + pulse * 0.12 + fx.command * 0.10;
        drawAtlasBottomCentered(genState.images.fire, rightFrame, LAYOUT.sideFireRightX, LAYOUT.sideFireY, LAYOUT.sideFireScale * 1.05, 1);
        ctx.restore();
      }

      // Main centre fire
      const centreFrame = frameFromList(frames, t * 0.7, 24, true);
      if (!centreFrame) return;
      const fireAlpha = LAYOUT.fireAlpha + pulse * 0.14;
      drawAtlasBottomCentered(genState.images.fire, centreFrame, LAYOUT.fireX, LAYOUT.fireY, LAYOUT.fireScale, fireAlpha);
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      ctx.globalAlpha = LAYOUT.fireGlowAlpha + pulse * 0.20 + fx.command * 0.22 + Math.sin(t * 3.6) * 0.030;
      drawAtlasBottomCentered(genState.images.fire, centreFrame, LAYOUT.fireX, LAYOUT.fireY, LAYOUT.fireScale * (1.04 + fx.command * 0.04), 1);
      ctx.restore();

      // Warm floor-light wash that intensifies on beat - sells the heat
      // coming from the three fires combined.
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      const wash = ctx.createRadialGradient(canvas.width * 0.5, canvas.height * 0.88, 60, canvas.width * 0.5, canvas.height * 0.88, canvas.width * 0.62);
      wash.addColorStop(0, "rgba(255,124,52," + (0.18 + pulse * 0.10).toFixed(3) + ")");
      wash.addColorStop(0.55, "rgba(255,80,30," + (0.08 + pulse * 0.05).toFixed(3) + ")");
      wash.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = wash;
      ctx.fillRect(0, canvas.height * 0.45, canvas.width, canvas.height * 0.55);
      ctx.restore();
    }

    function drawStageForeground() {
      drawBottomCenteredImage(genState.images.boombox, LAYOUT.speakerX, LAYOUT.speakerY, LAYOUT.speakerScale, 1);
    }

    function drawStagePostFX(t) {
      const fx = genocideFxProfile(t);
      const pulse = fx.beat;
      drawBackdropLayer(genState.images.sticks, LAYOUT.stageScale, 0, 0.82 + pulse * 0.08 + fx.command * 0.12, "screen");
      if (imageReady(genState.images.vignette)) {
        ctx.save();
        ctx.globalAlpha = LAYOUT.vignetteAlpha + pulse * 0.1 + fx.command * 0.08;
        ctx.drawImage(genState.images.vignette, 0, 0, canvas.width, canvas.height);
        ctx.restore();
      }
      if (fx.command > 0.04) {
        ctx.save();
        ctx.globalCompositeOperation = "screen";
        ctx.globalAlpha = Math.min(0.18, fx.command * 0.16);
        ctx.fillStyle = "#b55dff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.restore();
      }
    }

    function currentNoteSkin() {
      return G.sprites.notes;
    }

    function drawGenocideReceptor(lane, x, y) {
      const notes = currentNoteSkin();
      const dir = sportingLaneKey(lane);
      const fx = state.receptorFx[lane];
      const age = performance.now() / 1000 - fx.time;
      const image = genState.images.notes;
      if (age < 0.16 && notes.confirm[dir]?.length) {
        const frame = frameFromList(notes.confirm[dir], age, 24, false);
        if (frame) {
          ctx.save();
          ctx.shadowBlur = 18;
          ctx.shadowColor = COLORS[lane];
          drawAtlasCentered(image, frame, x, y, 0.78 + (0.16 - age) * 0.58, 1 - age / 0.16);
          ctx.restore();
          return;
        }
      }
      const pressed = !!state.keysDown[lane];
      const pressFrames = notes.press[dir] || [];
      const frame = pressed && pressFrames.length ? frameFromList(pressFrames, performance.now() / 1000, 24, true) : notes.static[dir];
      if (!frame) return;
      ctx.save();
      ctx.shadowBlur = pressed ? 18 : 10;
      ctx.shadowColor = COLORS[lane];
      drawAtlasCentered(image, frame, x, y, pressed ? 0.76 : 0.72, lane < 4 ? 0.88 : 1);
      ctx.restore();
    }

    function drawGenocideNote(lane, x, y, scale, alpha = 1) {
      const frame = currentNoteSkin().gem[sportingLaneKey(lane)];
      if (!frame || !imageReady(genState.images.notes)) return;
      ctx.save();
      ctx.shadowBlur = 18;
      ctx.shadowColor = COLORS[lane];
      drawAtlasCentered(genState.images.notes, frame, x, y, 0.72 * scale, alpha);
      ctx.restore();
    }

    function drawGenocideSustain(note, headY, tailY, alpha = 1, x = laneX(note.lane)) {
      const hold = currentNoteSkin().hold[sportingLaneKey(note.lane)];
      if (!hold?.piece || !hold?.end || !imageReady(genState.images.notes)) return;
      const bodyScale = 0.84;
      const top = Math.min(headY, tailY);
      const bottom = Math.max(headY, tailY);
      const endH = (hold.end.fh || hold.end.h) * bodyScale;
      const bodyW = (hold.piece.fw || hold.piece.w) * bodyScale;
      const bodyTop = top + endH * 0.44;
      const bodyBottom = bottom - endH * 0.44;
      if (bodyBottom > bodyTop) drawAtlasStretchVertical(genState.images.notes, hold.piece, x, bodyTop, bodyW, bodyBottom - bodyTop, alpha * 0.88);
      drawAtlasCentered(genState.images.notes, hold.end, x, tailY, bodyScale, alpha);
    }

    isImportedSong = function(song) {
      return !!song && (song.chartSource === SONG_SOURCE || baseIsImportedSong(song));
    };

    makeChart = function(song) {
      if (song?.chartSource === SONG_SOURCE) return clone(G.chart);
      return baseMakeChart(song);
    };

    stopExternalAudio = function() {
      baseStopExternalAudio();
      [state.audio.genocideInst, state.audio.genocideVoices].forEach(track => {
        if (!track) return;
        try {
          track.pause();
          track.currentTime = 0;
        } catch {}
      });
    };

    songTime = function() {
      if (state.currentSong?.chartSource === SONG_SOURCE && state.audio.genocideInst) {
        const trackTime = Number(state.audio.genocideInst.currentTime || 0);
        if (!state.playing) return trackTime;
        const fallback = Math.max(0, performance.now() / 1000 - Number(genState.clockStart || 0));
        return Math.max(trackTime, fallback);
      }
      return baseSongTime();
    };

    songEndTime = function() {
      if (state.currentSong?.chartSource === SONG_SOURCE) return totalTime();
      return baseSongEndTime();
    };

    startSong = function(id = state.selectedSong, options = {}) {
      const song = SONGS[id] || state.currentSong;
      if (song?.chartSource !== SONG_SOURCE) return baseStartSong(id, options);
      const audioContext = ensureAudio();
      if (audioContext.state === "suspended") audioContext.resume();
      const skipReload = !!options.skipReload;
      stopExternalAudio();
      initAssets();
      ensureAudioTracks();
      state.selectedSong = id;
      state.currentSong = SONGS[id];
      state.mode = options.forceMode || (ui.versusToggle?.checked ? "versus" : "solo");
      ui.modeLabel.textContent = state.mode === "versus" ? "1v1 Versus" : "Solo Battle";
      rebuildKeyMap();
      state.chart = makeChart(state.currentSong);
      state.chart.notes = state.chart.notes.map(note => ({ ...note }));
      resetStats();
      state.health = 0.65;
      genState.clockStart = performance.now() / 1000;
      state.audio.genocideInst.currentTime = 0;
      state.audio.genocideVoices.currentTime = 0;
      state.songStart = 0;
      state.nextStep = 0;
      state.nextStepTime = 0;
      state.playing = true;
      if (state.mode === "online" && state.network?.matchStartAt) {
        state.audio.genocideInst.pause();
        state.audio.genocideVoices.pause();
        if (!skipReload) {
          state.audio.genocideInst.load();
          state.audio.genocideVoices.load();
        }
      } else {
        state.audio.genocideInst.play().catch(() => {});
        state.audio.genocideVoices.play().catch(() => {});
      }
      state.feeds.player.time = -10;
      state.feeds.opp.time = -10;
      genState.afterimages.opponent = [];
      genState.afterimages.boyfriend = [];
      Object.values(state.poses).forEach(pose => {
        pose.time = -10;
        pose.kind = "hit";
      });
      state.receptorFx.forEach(fx => fx.time = -10);
      state.camera = { zoom: 1, focusX: canvas.width / 2, focusY: canvas.height * 0.48, sideTime: 0, lastSide: "both", highwayX: 0, highwayY: 0 };
      ui.p1Box.style.display = state.mode === "versus" ? "block" : "none";
      ui.songTitle.textContent = state.currentSong.title;
      ui.songSub.textContent = state.currentSong.subtitle;
      ui.statusText.textContent = "Genocide";
      ui.statusSub.textContent = "Angry Tabi, post-exp BF/GF, the Genocide note skin, and the fire stage are active.";
      ui.timer.textContent = `0:00 / ${formatTime(totalTime())}`;
      ui.menu.classList.remove("show");
      ui.settings.classList.remove("show");
      ui.resultsWrap.classList.remove("show");
    };

    refreshHUD = function(t) {
      baseRefreshHUD(t);
      if (state.selectedSong !== SONG_ID) return;
      ui.timer.textContent = `${formatTime(t)} / ${formatTime(totalTime())}`;
      ui.statusText.textContent = t < 16 ? "Genocide intro" : "Genocide";
      ui.statusSub.textContent = t < 16
        ? "The original VS Tabi intro lead-in is still running before the note wall starts."
        : "Angry Tabi, the Genocide chart, and the Tabi noteskin are running from the original mod files.";
    };

    finish = function(failed = false) {
      if (state.currentSong?.chartSource === SONG_SOURCE) {
        [state.audio.genocideInst, state.audio.genocideVoices].forEach(track => {
          if (!track) return;
          try { track.pause(); } catch {}
        });
      }
      return baseFinish(failed);
    };

    bg = function(song, t) {
      if (state.selectedSong !== SONG_ID) return baseBg(song, t);
      if (LOWSPEC) {
        // Single flat fill - the stage layers fully cover the canvas
        // anyway, so the gradient + radial haze are pure waste on console.
        ctx.fillStyle = "#0a0306";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        return;
      }
      const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
      gradient.addColorStop(0, "#030002");
      gradient.addColorStop(0.56, "#140306");
      gradient.addColorStop(1, "#090102");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const haze = ctx.createRadialGradient(canvas.width * 0.5, canvas.height * 0.34, 48, canvas.width * 0.5, canvas.height * 0.34, 560);
      haze.addColorStop(0, "rgba(255,144,88,0.12)");
      haze.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = haze;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    };

    stage = function(t) {
      if (state.selectedSong !== SONG_ID) return baseStage(t);
      initAssets();
      if (USING_REVIVAL) {
        drawRevivalBackdrop(t);
        const gfRender = roleRenderState("girlfriend", "gf", t);
        const oppRender = roleRenderState("opponent", "tabi", t);
        const bfRender = roleRenderState("boyfriend", "player", t);
        recordAfterimage("opponent", oppRender);
        recordAfterimage("boyfriend", bfRender);
        drawRoleRender("girlfriend", gfRender);
        drawAfterimages("opponent", t);
        drawRoleRender("opponent", oppRender);
        drawAfterimages("boyfriend", t);
        drawRoleRender("boyfriend", bfRender);
        drawRevivalForeground(t);
        drawRevivalPostFX(t);
        return;
      }
      drawStageBackdrop(t);
      drawStageFire(t);
      drawStageForeground();
      const gfRender = roleRenderState("girlfriend", "gf", t);
      const oppRender = roleRenderState("opponent", "tabi", t);
      const bfRender = roleRenderState("boyfriend", "player", t);
      recordAfterimage("opponent", oppRender);
      recordAfterimage("boyfriend", bfRender);
      drawRoleRender("girlfriend", gfRender);
      drawAfterimages("opponent", t);
      drawRoleRender("opponent", oppRender);
      drawAfterimages("boyfriend", t);
      drawRoleRender("boyfriend", bfRender);
      drawStagePostFX(t);
    };

    // VS Tabi Genocide camera. Two regimes:
    //   - Revival (Smooth Camera.lua port): camBetterFollowLerp = 0.1 +
    //     per-sing camera displacement (left=-20x, right=+20x, etc.). Base
    //     zoom is the stage defaultZoom (0.7), but the camHUD-level beat
    //     bump scales it up by ~5.5% on each beat to mirror the original's
    //     beatHit -> camGame.zoom += 0.015 behaviour.
    //   - Rework (legacy): aggressive side-switch close-ups.
    updateCamera = function(t, dt) {
      if (baseUpdateCamera) baseUpdateCamera.apply(this, arguments);
      if (state.selectedSong !== SONG_ID) return;
      const bump = genocideCameraBump(t);
      const side = state.camera?.lastSide || "both";
      const camCfg = LAYOUT.camera;
      const dtc = Math.max(0, dt || 0.016);

      if (USING_REVIVAL) {
        // Pick the focus character. The mustHitSection-driven "side" gives
        // us opp/player/both. We extend "both" to mean "look at GF" so the
        // camera actually goes somewhere on instrumental breaks instead of
        // hovering in dead centre.
        let focus;
        if (side === "opp") focus = "opponent";
        else if (side === "player") focus = "boyfriend";
        else focus = "girlfriend";
        let targetX = camCfg[focus].x;
        let targetY = camCfg[focus].y;
        // Per-sing displacement (Smooth Camera.lua getDisplacement), now a
        // much bigger nudge so the camera visibly leans into each note.
        const focusPose = focus === "opponent" ? state.poses.tabi : (focus === "boyfriend" ? state.poses.player : null);
        if (focusPose && performance.now() / 1000 - Number(focusPose.time || -10) < 0.22 && focusPose.kind === "hit") {
          const lane = Number(focusPose.lane || 0) % 4;
          const D = 36;
          if (lane === 0) targetX -= D;       // singLEFT
          else if (lane === 1) targetY += D;  // singDOWN
          else if (lane === 2) targetY -= D;  // singUP
          else if (lane === 3) targetX += D;  // singRIGHT
        }
        // Zoom levels: defaultZoom 0.7 already shrinks everything, so we
        // multiply BACK UP to fill the screen, then add a beat bump on top.
        // Opp / BF sides zoom in tighter; the GF / both side stays wider.
        const tightZoom = REVIVAL.stage.defaultZoom * 1.60;   // 1.12 effective
        const wideZoom  = REVIVAL.stage.defaultZoom * 1.42;   // 0.994 effective
        const baseZoom = focus === "girlfriend" ? wideZoom : tightZoom;
        const targetZoom = baseZoom * bump;
        // Snappier pan so side switches read instantly (mustHitSection is
        // the only camera signal we get from the chart events).
        const panLerp = 1 - Math.pow(0.012, dtc);
        const zoomLerp = 1 - Math.pow(0.025, dtc);
        state.camera.focusX += (targetX - state.camera.focusX) * panLerp;
        state.camera.focusY += (targetY - state.camera.focusY) * panLerp;
        state.camera.zoom += (targetZoom - state.camera.zoom) * zoomLerp;
        return;
      }

      // Legacy Rework behaviour
      let targetX, targetY, baseZoom;
      if (side === "opp") {
        targetX = camCfg.opponent.x;
        targetY = camCfg.opponent.y;
        baseZoom = 1.14;
      } else if (side === "player") {
        targetX = camCfg.boyfriend.x;
        targetY = camCfg.boyfriend.y;
        baseZoom = 1.14;
      } else {
        targetX = canvas.width / 2;
        targetY = canvas.height * 0.48;
        baseZoom = 1.00;
      }
      const targetZoom = baseZoom * bump;
      const panLerp = 1 - Math.pow(0.04, dtc);
      const zoomLerp = 1 - Math.pow(0.005, dtc);
      state.camera.focusX += (targetX - state.camera.focusX) * panLerp;
      state.camera.focusY += (targetY - state.camera.focusY) * panLerp;
      state.camera.zoom += (targetZoom - state.camera.zoom) * zoomLerp;
    };

    receptors = function(t) {
      if (state.selectedSong !== SONG_ID || !imageReady(genState.images.notes)) return baseReceptors(t);
      const y = receptorY();
      ctx.strokeStyle = "rgba(255,255,255,0.09)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(canvas.width * 0.5, 72);
      ctx.lineTo(canvas.width * 0.5, 452);
      ctx.stroke();
      for (let lane = 0; lane < 8; lane++) {
        const x = laneX(lane);
        drawGenocideReceptor(lane, x, y);
        ctx.strokeStyle = "rgba(255,255,255,0.055)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x, y + 26);
        ctx.lineTo(x, 448);
        ctx.stroke();
      }
    };

    notes = function(t) {
      if (state.selectedSong !== SONG_ID || !imageReady(genState.images.notes)) return baseNotes(t);
      if (!state.chart) return;
      const scroll = state.currentSong.scroll;
      for (const note of state.chart.notes) {
        if (note.played && note.hit && (!isHoldNote(note) || note.holdDone)) continue;
        if (note.judged && note.side !== "opp" && (!isHoldNote(note) || note.holdDone || !note.hit)) continue;
        const diff = note.time - t;
        const x = laneX(note.lane);
        const y = receptorY() + diff * scroll;
        const tailY = receptorY() + (holdEndTime(note) - t) * scroll;
        if (y < -120 && tailY < -120) continue;
        if (y > canvas.height + 120 && tailY > canvas.height + 120) continue;
        const scale = clamp(1 - Math.pow(Math.abs(diff), 0.7) * 0.45, 0.75, 1.12);
        const alpha = note.side === "opp" ? 0.84 : 1;
        if (isHoldNote(note)) drawGenocideSustain(note, note.hit ? receptorY() : y, tailY, alpha * (note.hit ? 0.94 : 1), x);
        if (note.hit && isHoldNote(note) && t > note.time) continue;
        drawGenocideNote(note.lane, x, y, scale, alpha);
      }
    };

    if (baseCameraTargets) {
      cameraTargets = function() {
        if (state.selectedSong === SONG_ID) {
          return {
            oppX: Number(LAYOUT.camera.opponent.x || 405),
            playerX: Number(LAYOUT.camera.boyfriend.x || 820),
            focusY: Number(LAYOUT.camera.boyfriend.y || 500)
          };
        }
        return baseCameraTargets();
      };
    }

    if (baseCameraPanProfile) {
      cameraPanProfile = function() {
        if (state.selectedSong === SONG_ID) {
          // Bias > 1 amplifies the X-offset between opp and player focus so
          // the side switch is unmistakable on a TV at couch distance.
          return USING_REVIVAL
            ? { zoom: 1.00, bias: 1.45, hud: 0.22, hudClamp: 80, speed: 3.8 }
            : { zoom: 1.04, bias: 1.15, hud: 0.18, hudClamp: 58, speed: 3.4 };
        }
        return baseCameraPanProfile();
      };
    }

    if (baseCameraPoseKeys) {
      cameraPoseKeys = function() {
        if (state.selectedSong === SONG_ID) return { opp: "tabi", player: "player" };
        return baseCameraPoseKeys();
      };
    }

    if (typeof syncOnlinePlayback === "function" && typeof expectedOnlineSongTime === "function") {
      const baseSyncOnlinePlayback = syncOnlinePlayback;
      syncOnlinePlayback = function(force = false) {
        const targetTime = expectedOnlineSongTime();
        const base = baseSyncOnlinePlayback(force);
        if (targetTime == null || state.currentSong?.chartSource !== SONG_SOURCE) return base;
        ensureAudioTracks();
        const now = typeof serverClockNow === "function" ? serverClockNow() : Date.now();
        const shouldPlay = now + 40 >= (state.network?.matchStartAt || 0);
        for (const track of [state.audio.genocideInst, state.audio.genocideVoices]) {
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
    console.error("Genocide mode failed to initialize", error);
  }
})();

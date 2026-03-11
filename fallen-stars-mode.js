(() => {
  try {
    const FS = window.FALLEN_STARS_DATA;
    if (!FS || typeof SONGS === "undefined") return;

    const SONG_ID = "ourBrokenConstellations";
    const SONG_SOURCE = "ourBrokenConstellations";
    const fsState = { ready: false, images: {} };
    const nowSec = () => performance.now() / 1000;
    const DIR_TO_ANIM = {
      left: "singLEFT",
      down: "singDOWN",
      up: "singUP",
      right: "singRIGHT"
    };
    const LAYOUT = {
      bgX: 58,
      bgY: 8,
      bgScale: 0.44,
      starsScale: 0.44,
      starzX: 236,
      starzY: 34,
      starzScale: 0.72,
      worldX: 242,
      worldY: 84,
      worldScale: 0.58,
      sansScale: 0.44,
      bfScale: 0.36,
      gfScale: 0.38
    };

    state.poses.sans = state.poses.sans || { lane: 1, time: -10, kind: "hit" };
    state.poses.gf = state.poses.gf || { lane: 1, time: -10, kind: "hit" };

    SONGS[SONG_ID] = {
      title: FS.song.title,
      subtitle: FS.song.subtitle,
      diff: FS.song.diff,
      tempo: Number(FS.song.bpm || 122),
      root: 45,
      scale: [0, 2, 3, 5, 7, 8, 10],
      prog: [0, 5, 3, 6],
      scroll: 1180,
      seed: 53,
      introBeats: 0,
      outroBeats: 4,
      palette: ["#040715", "#151d3a", "#2f2d52", "#070811", "#bba8ff", "#f3d3ff"],
      blurb: "Imported from FNF x Fallen Stars with the original Our Broken Constellations hard chart, space stage, Sans/BF/GF atlases, and the original song audio.",
      chartSource: SONG_SOURCE
    };

    const baseIsImportedSong = isImportedSong;
    const baseMakeChart = makeChart;
    const baseStopExternalAudio = stopExternalAudio;
    const baseSongTime = songTime;
    const baseStartSong = startSong;
    const baseRefreshHUD = refreshHUD;
    const baseFinish = finish;
    const baseBg = bg;
    const baseStage = stage;
    const baseCameraTargets = cameraTargets;
    const baseCameraPanProfile = cameraPanProfile;
    const baseCameraPoseKeys = cameraPoseKeys;

    function clone(value) {
      return JSON.parse(JSON.stringify(value));
    }

    function imageReady(image) {
      return !!(image && image.complete && image.naturalWidth);
    }

    function spriteByRole(role) {
      if (role === "opponent") return FS.sprites.sans;
      if (role === "girlfriend") return FS.sprites.gf;
      return FS.sprites.boyfriend;
    }

    function roleBaseScale(role) {
      if (role === "opponent") return LAYOUT.sansScale;
      if (role === "girlfriend") return LAYOUT.gfScale;
      return LAYOUT.bfScale;
    }

    function initAssets() {
      if (fsState.ready) return;
      fsState.ready = true;
      const sources = {
        stars: FS.stage.images.stars,
        space: FS.stage.images.space,
        shooting: FS.sprites.shooting.image,
        sans: FS.sprites.sans.image,
        boyfriend: FS.sprites.boyfriend.image,
        gf: FS.sprites.gf.image
      };
      Object.entries(sources).forEach(([key, src]) => {
        const image = new Image();
        image.src = src;
        fsState.images[key] = image;
      });
    }

    function ensureAudioTracks() {
      if (!state.audio.fallenStarsInst) {
        state.audio.fallenStarsInst = new Audio(FS.audio.inst);
        state.audio.fallenStarsInst.preload = "auto";
        state.audio.fallenStarsInst.volume = 0.95;
      }
      if (!state.audio.fallenStarsVoices) {
        state.audio.fallenStarsVoices = new Audio(FS.audio.voices);
        state.audio.fallenStarsVoices.preload = "auto";
        state.audio.fallenStarsVoices.volume = 0.92;
      }
    }

    window.ensureFallenStarsAudio = ensureAudioTracks;
    window.prepareFallenStarsOnlineStart = function() {
      ensureAudioTracks();
      [state.audio.fallenStarsInst, state.audio.fallenStarsVoices].forEach(track => {
        if (!track) return;
        track.pause();
        try { track.currentTime = 0; } catch {}
        try { track.load(); } catch {}
      });
      return [state.audio.fallenStarsInst, state.audio.fallenStarsVoices];
    };

    function totalTime() {
      ensureAudioTracks();
      const tracks = [state.audio.fallenStarsInst, state.audio.fallenStarsVoices].filter(Boolean);
      const durations = tracks
        .map(track => Number(track.duration || 0))
        .filter(duration => Number.isFinite(duration) && duration > 0);
      return durations.length ? Math.max(Number(FS.chart.totalTime || 0), ...durations) : Number(FS.chart.totalTime || 0);
    }

    function animDuration(anim) {
      if (!anim?.frames?.length) return 0.25;
      return anim.frames.length / Math.max(1, Number(anim.fps || 24));
    }

    function missAnimName(sprite, hitAnim) {
      const lower = hitAnim + "miss";
      const upper = hitAnim + "Miss";
      if (sprite.animations[lower]) return lower;
      if (sprite.animations[upper]) return upper;
      return null;
    }

    function idleAnimName(sprite, t) {
      if (sprite === FS.sprites.gf) {
        const beat = t / Math.max(0.001, Number(FS.chart.spb || 0.5));
        return Math.floor(beat) % 2 === 0 ? "danceLeft" : "danceRight";
      }
      return "idle";
    }

    function spriteAnimState(sprite, poseKey, t) {
      const pose = state.poses[poseKey] || { lane: 1, time: -10, kind: "hit" };
      const dir = DIRS[(pose.lane || 0) % 4] || "left";
      const hitAnim = DIR_TO_ANIM[dir];
      const missAnim = missAnimName(sprite, hitAnim);
      const age = nowSec() - Number(pose.time || -10);
      if (age >= 0) {
        if (pose.kind === "miss" && missAnim && age < animDuration(sprite.animations[missAnim])) {
          return { name: missAnim, elapsed: age, loop: false };
        }
        if (sprite.animations[hitAnim] && age < animDuration(sprite.animations[hitAnim])) {
          return { name: hitAnim, elapsed: age, loop: false };
        }
      }
      const idle = idleAnimName(sprite, t);
      return { name: idle, elapsed: sprite === FS.sprites.gf ? t * 1.25 : t, loop: true };
    }

    function roleWorldPosition(role) {
      const sprite = spriteByRole(role);
      const slot = FS.stage.positions[role];
      const offset = sprite.position || [0, 0];
      return {
        x: Number(slot[0] || 0) + Number(offset[0] || 0),
        y: Number(slot[1] || 0) + Number(offset[1] || 0)
      };
    }

    function worldToStage(x, y) {
      return {
        x: LAYOUT.worldX + x * LAYOUT.worldScale,
        y: LAYOUT.worldY + y * LAYOUT.worldScale
      };
    }

    function drawShadow(x, y, width, alpha = 0.24) {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = "#03040a";
      ctx.beginPath();
      ctx.ellipse(x, y, width * 0.5, width * 0.13, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    function drawRole(role, poseKey, t) {
      const sprite = spriteByRole(role);
      const imageKey = role === "boyfriend" ? "boyfriend" : (role === "girlfriend" ? "gf" : "sans");
      const image = fsState.images[imageKey];
      if (!sprite || !imageReady(image)) return;
      const animState = spriteAnimState(sprite, poseKey, t);
      const anim = sprite.animations[animState.name] || sprite.animations.idle;
      if (!anim?.frames?.length) return;
      const frame = frameFromList(anim.frames, animState.elapsed, Number(anim.fps || 24), animState.loop);
      if (!frame) return;
      const world = roleWorldPosition(role);
      const pos = worldToStage(world.x, world.y);
      const scale = roleBaseScale(role) * Number(sprite.scale || 1);
      const animOffset = Array.isArray(anim.offset) ? anim.offset : [0, 0];
      const drawX = pos.x + Number(animOffset[0] || 0) * scale;
      const drawY = pos.y + Number(animOffset[1] || 0) * scale;
      const shadowWidth = Math.max(92, (frame.fw || frame.w || 240) * scale * (role === "opponent" ? 0.48 : 0.42));

      if (role !== "girlfriend") {
        drawShadow(
          drawX + ((frame.fw || frame.w || 0) * scale) * 0.5,
          drawY + (frame.fh || frame.h || 0) * scale + 12,
          shadowWidth,
          role === "boyfriend" ? 0.22 : 0.28
        );
      }

      drawAtlasTopLeft(image, frame, drawX, drawY, scale, 1, !!sprite.flipX);
    }

    function drawStageBackdrop(t) {
      const stars = fsState.images.stars;
      const space = fsState.images.space;
      const shooting = fsState.images.shooting;
      const floatX = Math.sin(t * 0.11) * 14;
      const floatY = Math.cos(t * 0.09) * 8;

      if (imageReady(stars)) {
        ctx.save();
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.globalAlpha = 0.94;
        ctx.drawImage(
          stars,
          LAYOUT.bgX - 14 + floatX * 0.4,
          LAYOUT.bgY - 6 + floatY * 0.25,
          FS.stage.imageSize.stars[0] * LAYOUT.starsScale,
          FS.stage.imageSize.stars[1] * LAYOUT.starsScale
        );
        ctx.restore();
      }

      if (imageReady(space)) {
        ctx.save();
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.globalAlpha = 0.98;
        ctx.drawImage(
          space,
          LAYOUT.bgX + floatX,
          LAYOUT.bgY + floatY,
          FS.stage.imageSize.space[0] * LAYOUT.bgScale,
          FS.stage.imageSize.space[1] * LAYOUT.bgScale
        );
        ctx.restore();
      }

      if (imageReady(shooting) && FS.sprites.shooting.frames?.length) {
        const frame = frameFromList(FS.sprites.shooting.frames, t * 1.15, Number(FS.sprites.shooting.fps || 24), true);
        if (frame) {
          ctx.save();
          ctx.globalAlpha = 0.72;
          drawAtlasTopLeft(
            shooting,
            frame,
            LAYOUT.starzX + Math.sin(t * 0.35) * 22,
            LAYOUT.starzY + Math.cos(t * 0.28) * 8,
            LAYOUT.starzScale
          );
          ctx.restore();
        }
      }
    }

    isImportedSong = song => !!song && (song.chartSource === SONG_SOURCE || baseIsImportedSong(song));

    makeChart = song => {
      if (song?.chartSource !== SONG_SOURCE) return baseMakeChart(song);
      return {
        ...clone(FS.chart),
        notes: clone(FS.chart.notes),
        timeline: clone(FS.chart.timeline || [])
      };
    };

    stopExternalAudio = function() {
      const leakedInst = state.audio.inst === state.audio.fallenStarsInst;
      const leakedVoices = state.audio.voices === state.audio.fallenStarsVoices;
      baseStopExternalAudio();
      [state.audio.fallenStarsInst, state.audio.fallenStarsVoices].forEach(track => {
        if (!track) return;
        try {
          track.pause();
          track.currentTime = 0;
        } catch {}
      });
      if (leakedInst) state.audio.inst = null;
      if (leakedVoices) state.audio.voices = null;
    };

    songTime = function() {
      if (state.currentSong?.chartSource === SONG_SOURCE && state.audio.fallenStarsInst) {
        return state.audio.fallenStarsInst.currentTime;
      }
      return baseSongTime();
    };

    function resetSceneState() {
      state.feeds.player.time = -10;
      state.feeds.opp.time = -10;
      Object.values(state.poses).forEach(poseState => {
        if (!poseState) return;
        poseState.time = -10;
        poseState.kind = "hit";
      });
      state.receptorFx.forEach(fx => { fx.time = -10; });
      state.hitGlow.length = 0;
      if (state.camera) {
        state.camera.x = 0;
        state.camera.target = 0;
        state.camera.sideTime = 0;
        state.camera.lastSide = "both";
      }
    }

    startSong = function(id = state.selectedSong, options = {}) {
      const song = SONGS[id] || state.currentSong;
      if (song?.chartSource !== SONG_SOURCE) {
        if (state.audio.inst === state.audio.fallenStarsInst) state.audio.inst = null;
        if (state.audio.voices === state.audio.fallenStarsVoices) state.audio.voices = null;
        return baseStartSong(id, options);
      }

      const audioContext = ensureAudio();
      if (audioContext.state === "suspended") audioContext.resume();
      stopExternalAudio();
      initAssets();
      ensureAudioTracks();

      const inst = state.audio.fallenStarsInst;
      const voices = state.audio.fallenStarsVoices;
      const skipReload = !!options.skipReload;
      const onlineStart = Number(options.startAt);
      const isOnlineStart = Number.isFinite(onlineStart);

      if (state.startTimer) clearTimeout(state.startTimer);
      state.startTimer = null;
      if (state.endTimer) clearTimeout(state.endTimer);
      state.endTimer = null;

      state.selectedSong = id;
      state.currentSong = SONGS[id];
      state.mode = options.forceMode || (isOnlineStart ? "online" : (ui.versusToggle?.checked ? "versus" : "solo"));
      rebuildKeyMap();
      state.chart = makeChart(state.currentSong);
      state.chart.notes = state.chart.notes.map((note, index) => ({ ...note, id: note.id == null ? index : note.id }));
      resetStats();
      state.health = 0.65;
      state.playing = true;
      state.songStart = 0;
      state.nextStep = 0;
      state.nextStepTime = 0;

      if (isOnlineStart) {
        const now = typeof serverClockNow === "function" ? serverClockNow() : Date.now();
        state.network.matchStartAt = Number(options.startAt || (now + 8000));
        state.network.pendingStartAt = state.network.matchStartAt;
        state.network.lastTrackSync = 0;
        state.network.ready = { host: false, guest: false };
      }

      resetSceneState();
      ui.songTitle.textContent = state.currentSong.title;
      ui.songSub.textContent = state.currentSong.subtitle;
      ui.timer.textContent = "0:00 / " + formatTime(totalTime());
      ui.modeLabel.textContent = state.mode === "versus" ? "1v1 Versus" : state.mode === "online" ? "Online Match" : "Solo Battle";
      ui.statusText.textContent = isOnlineStart ? "Match syncing" : "Space stage";
      ui.statusSub.textContent = isOnlineStart
        ? "Both players finished loading. The server is holding an 8 second synced countdown before audio starts."
        : "Real Fallen Stars chart timing, stage positions, and audio are active.";
      ui.menu.classList.remove("show");
      ui.settings.classList.remove("show");
      ui.resultsWrap.classList.remove("show");
      if (typeof syncModeUI === "function") syncModeUI();

      inst.pause();
      voices.pause();
      try { inst.currentTime = 0; } catch {}
      try { voices.currentTime = 0; } catch {}
      if (!skipReload) {
        try { inst.load(); } catch {}
        try { voices.load(); } catch {}
      }

      if (state.mode === "online" && state.network?.matchStartAt) {
        if (typeof syncOnlinePlayback === "function") syncOnlinePlayback(true);
      } else {
        inst.play().catch(() => {});
        voices.play().catch(() => {});
      }
    };

    refreshHUD = function(t) {
      baseRefreshHUD(t);
      if (state.selectedSong !== SONG_ID) return;
      ui.timer.textContent = `${formatTime(t)} / ${formatTime(totalTime())}`;
      const section = state.chart?.timeline?.find(entry => t >= entry.startTime && t < entry.endTime);
      if (!section) return;
      ui.statusText.textContent = section.label;
      ui.statusSub.textContent = section.gfSection
        ? "Girlfriend vocal sections use the original Fallen Stars slot instead of a hand-placed screen anchor."
        : "Space stage art, Sans placement, and the original hard chart are active.";
    };

    finish = function(failed = false) {
      if (state.currentSong?.chartSource === SONG_SOURCE) {
        [state.audio.fallenStarsInst, state.audio.fallenStarsVoices].forEach(track => {
          if (!track) return;
          try { track.pause(); } catch {}
        });
      }
      return baseFinish(failed);
    };

    bg = function(song, t) {
      if (state.selectedSong !== SONG_ID) return baseBg(song, t);
      const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
      gradient.addColorStop(0, "#02040f");
      gradient.addColorStop(0.45, "#0d1632");
      gradient.addColorStop(1, "#080913");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const glow = ctx.createRadialGradient(canvas.width * 0.5, 90, 30, canvas.width * 0.5, 90, 520);
      glow.addColorStop(0, "rgba(196,173,255,0.18)");
      glow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    };

    stage = function(t) {
      if (state.selectedSong !== SONG_ID) return baseStage(t);
      initAssets();
      drawStageBackdrop(t);
      drawRole("girlfriend", "gf", t);
      drawRole("opponent", "sans", t);
      drawRole("boyfriend", "player", t);
    };

    cameraTargets = function() {
      if (state.selectedSong === SONG_ID) {
        return { oppX: 414, playerX: 880, focusY: canvas.height * 0.47 };
      }
      return baseCameraTargets();
    };

    cameraPanProfile = function() {
      if (state.selectedSong === SONG_ID) {
        return { zoom: 1.16, bias: 1.18, hud: 0.22, hudClamp: 70, speed: 3.6 };
      }
      return baseCameraPanProfile();
    };

    cameraPoseKeys = function() {
      if (state.selectedSong === SONG_ID) return { opp: "sans", player: "player" };
      return baseCameraPoseKeys();
    };

    if (typeof syncOnlinePlayback === "function" && typeof expectedOnlineSongTime === "function") {
      const baseSyncOnlinePlayback = syncOnlinePlayback;
      syncOnlinePlayback = function(force = false) {
        const targetTime = expectedOnlineSongTime();
        const base = baseSyncOnlinePlayback(force);
        if (targetTime == null || state.currentSong?.chartSource !== SONG_SOURCE) return base;
        ensureAudioTracks();
        const now = typeof serverClockNow === "function" ? serverClockNow() : Date.now();
        const shouldPlay = now + 40 >= (state.network?.matchStartAt || 0);
        for (const track of [state.audio.fallenStarsInst, state.audio.fallenStarsVoices]) {
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
    console.error("Fallen Stars mode failed to initialize", error);
  }
})();

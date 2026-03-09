(() => {
  try {
    const CE = window.CHALLENGE_EDD_DATA;
    if (!CE || typeof SONGS === "undefined") return;

    const clone = value => JSON.parse(JSON.stringify(value));
    const sortByTime = (a, b) => Number(a.time || 0) - Number(b.time || 0);
    const clamp01 = value => Math.max(0, Math.min(1, value));
    const ce = { ready: false, images: {} };

    state.poses.edd = state.poses.edd || { lane: 1, time: -10, kind: "hit" };
    state.poses.eduardo = state.poses.eduardo || { lane: 1, time: -10, kind: "hit" };

    SONGS.challengeEdd = {
      title: "Challenge Edd",
      subtitle: "Challenge Edd hard chart",
      diff: "Hard (Original Chart)",
      tempo: Number(CE.song?.bpm || 186),
      root: 45,
      scale: [0, 2, 4, 5, 7, 9, 10],
      prog: [0, 5, 3, 4],
      scroll: 980,
      seed: 41,
      introBeats: 0,
      outroBeats: 4,
      palette: ["#bfe7ff", "#c8f1ff", "#8fcb74", "#2f4120", "#ffffff", "#ff5a5a"],
      blurb: "Imported from Challenge Edd with the original hard chart, stage sprites, event cast, and note-type character swaps.",
      chartSource: "challengeEdd"
    };

    const playEvents = (CE.events || []).filter(event => event.name === "Play Animation").sort(sortByTime);
    const zoomEvents = [{ time: 0, zoom: Number(CE.stage?.defaultZoom || 0.6) }]
      .concat((CE.events || [])
        .filter(event => event.name === "Set Cam Zoom")
        .map(event => ({ time: Number(event.time || 0), zoom: Number(event.params?.[0] || CE.stage?.defaultZoom || 0.6) })))
      .sort(sortByTime);
    const oppSwapTime = (() => {
      const hit = (CE.events || []).find(event => event.name === "Change Character" && String(event.params?.[1] || "").toLowerCase() === "eddside");
      return hit ? Number(hit.time || 0) : Infinity;
    })();
    const mattWalkTime = (() => {
      const hit = playEvents.find(event => String(event.params?.[0] || "").toLowerCase() === "mattw");
      return hit ? Number(hit.time || 0) : Infinity;
    })();
    const mattIdleTime = (() => {
      const hit = playEvents.find(event => String(event.params?.[0] || "").toLowerCase() === "matti");
      return hit ? Number(hit.time || 0) : Infinity;
    })();
    const mattPissedTime = (() => {
      const hit = playEvents.find(event => String(event.params?.[0] || "").toLowerCase() === "mattp");
      return hit ? Number(hit.time || 0) : Infinity;
    })();
    const tomWalkTime = (() => {
      const hit = playEvents.find(event => String(event.params?.[1] || "").toLowerCase() === "tomw");
      return hit ? Number(hit.time || 0) : Infinity;
    })();
    const tomIdleTime = (() => {
      const hit = playEvents.find(event => String(event.params?.[1] || "").toLowerCase() === "tomi");
      return hit ? Number(hit.time || 0) : Infinity;
    })();
    const eduardoWellTime = (() => {
      const hit = playEvents.find(event => String(event.params?.[0] || "").toLowerCase() === "ricardowell");
      return hit ? Number(hit.time || 0) : Infinity;
    })();

    function initAssets() {
      if (ce.ready) return;
      ce.ready = true;
      const sources = {
        sky: CE.stage.world.sky.image,
        patio: CE.stage.world.patio.image,
        fence: CE.stage.world.fence.image,
        car: CE.stage.world.car.image,
        notes: CE.notes.image,
        player: CE.sprites.player.image,
        eduardo: CE.sprites.eduardo.image,
        edd: CE.sprites.opponent.edd.image,
        eddSide: CE.sprites.opponent.eddSide.image,
        mark: CE.sprites.mark.image,
        john: CE.sprites.john.image,
        matt: CE.sprites.matt.image,
        tom: CE.sprites.tom.image
      };
      Object.entries(sources).forEach(([key, src]) => {
        const image = new Image();
        image.src = src;
        ce.images[key] = image;
      });
    }

    function imageReady(image) {
      return !!(image && image.complete && image.naturalWidth);
    }

    function spritesReady() {
      initAssets();
      return Object.values(ce.images).every(imageReady);
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
        state.audio.challengeVoices.volume = 0.9;
      }
    }
    window.ensureChallengeEddAudio = ensureAudioTracks;

    function totalTime() {
      const durations = [state.audio.challengeInst?.duration, state.audio.challengeVoices?.duration].filter(value => Number.isFinite(value) && value > 0);
      return durations.length ? Math.max(Number(CE.chart?.totalTime || 0), ...durations) : Number(CE.chart?.totalTime || 0);
    }

    function currentZoom(t) {
      let zoom = Number(CE.stage?.defaultZoom || 0.6);
      for (const event of zoomEvents) {
        if (event.time > t) break;
        zoom = event.zoom;
      }
      return zoom;
    }

    function stageX(worldX) {
      return canvas.width / 2 + (Number(worldX || 0) - 950) * 0.34;
    }

    function stageY(worldY) {
      return 590 + (Number(worldY || 0) - 150) * 0.36;
    }

    function frameAt(anim, elapsed, loop = false) {
      return anim ? frameFromList(anim.frames, elapsed, anim.fps || 24, loop || anim.loop === true) : null;
    }

    function animFor(sprite, name) {
      return sprite?.animations?.[name] || null;
    }

    function dirAnim(lane) {
      return ({ left: "singLEFT", down: "singDOWN", up: "singUP", right: "singRIGHT" })[DIRS[lane % 4]];
    }

    function missAnim(lane) {
      return ({ left: "singLEFTmiss", down: "singDOWNmiss", up: "singUPmiss", right: "singRIGHTmiss" })[DIRS[lane % 4]];
    }

    function charState(sprite, poseKey, t, idleSpeed = 0.76) {
      const pose = state.poses[poseKey] || { lane: 1, time: -10, kind: "hit" };
      const age = performance.now() / 1000 - pose.time;
      const miss = pose.kind === "miss" ? animFor(sprite, missAnim(pose.lane || 0)) : null;
      if (miss && age >= 0 && age < sportingAnimDuration(miss.frames, miss.fps || 24, 0.18, 0.62)) return { anim: miss, elapsed: age, loop: false };
      const sing = animFor(sprite, dirAnim(pose.lane || 0));
      if (sing && age >= 0 && age < sportingAnimDuration(sing.frames, sing.fps || 24, 0.18, 0.62)) return { anim: sing, elapsed: age, loop: false };
      const idle = animFor(sprite, "idle") || sing;
      return idle ? { anim: idle, elapsed: t * idleSpeed, loop: true } : null;
    }

    function drawAnim(sprite, image, x, y, scale, stateInfo) {
      if (!sprite || !imageReady(image) || !stateInfo?.anim) return;
      const frame = frameAt(stateInfo.anim, stateInfo.elapsed, stateInfo.loop);
      if (!frame) return;
      drawAtlasFrame(image, frame, x, y, scale, 1, !!sprite.flipX);
    }

    function currentOpponentSprite(t) {
      return t >= oppSwapTime ? CE.sprites.opponent.eddSide : CE.sprites.opponent.edd;
    }

    function currentOpponentImage(t) {
      return t >= oppSwapTime ? ce.images.eddSide : ce.images.edd;
    }

    function extraAnim(name, t) {
      if (name === "matt") {
        if (t >= mattPissedTime) return { name: "pissed", elapsed: t - mattPissedTime, loop: true };
        if (t >= mattIdleTime) return { name: "idle", elapsed: t - mattIdleTime, loop: true };
        if (t >= mattWalkTime) return { name: "enter", elapsed: t - mattWalkTime, loop: true };
      }
      if (name === "tom") {
        if (t >= tomIdleTime) return { name: "idle", elapsed: t - tomIdleTime, loop: true };
        if (t >= tomWalkTime) return { name: "enter", elapsed: t - tomWalkTime, loop: true };
      }
      if (name === "eduardo" && t >= eduardoWellTime && t < eduardoWellTime + 1.1) {
        return { name: "EduardoWell", elapsed: t - eduardoWellTime, loop: false };
      }
      return null;
    }

    function mattX(t) {
      if (t < mattWalkTime) return stageX(2740);
      const from = stageX(2740);
      const to = stageX(Number(CE.stage?.extras?.mattTweenToX || 1200));
      const duration = Number(CE.stage?.extras?.mattTweenDuration || 7);
      return t < mattWalkTime + duration ? from + (to - from) * clamp01((t - mattWalkTime) / duration) : to;
    }

    function tomX(t) {
      const base = stageX(Number(CE.stage?.positions?.tom?.[0] || 1980));
      if (t < tomWalkTime) return base;
      const from = stageX(Number(CE.stage?.extras?.tomTweenToX || 2570));
      const duration = Number(CE.stage?.extras?.tomTweenDuration || 4);
      return t < tomWalkTime + duration ? from + (base - from) * clamp01((t - tomWalkTime) / duration) : base;
    }

    function drawStage(t) {
      if (!spritesReady()) return;

      const zoom = 1 + (currentZoom(t) - Number(CE.stage?.defaultZoom || 0.6)) * 0.55;
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.translate(canvas.width * (1 - zoom) / 2, canvas.height * (1 - zoom) / 2);
      ctx.scale(zoom, zoom);

      ctx.drawImage(ce.images.sky, stageX(CE.stage.world.sky.x), -36, ce.images.sky.naturalWidth * 0.34, ce.images.sky.naturalHeight * 0.34);
      ctx.drawImage(ce.images.patio, stageX(CE.stage.world.patio.x), 10, ce.images.patio.naturalWidth * 0.34, ce.images.patio.naturalHeight * 0.34);
      ctx.drawImage(ce.images.car, stageX(CE.stage.world.car.x), 478, ce.images.car.naturalWidth * 0.34, ce.images.car.naturalHeight * 0.34);

      drawAnim(CE.sprites.john, ce.images.john, stageX(CE.stage.positions.john[0]), stageY(CE.stage.positions.john[1]), 0.54, { anim: animFor(CE.sprites.john, "idle"), elapsed: t * 0.8, loop: true });
      drawAnim(CE.sprites.mark, ce.images.mark, stageX(CE.stage.positions.mark[0]), stageY(CE.stage.positions.mark[1]), 0.54, { anim: animFor(CE.sprites.mark, "idle"), elapsed: t * 0.82, loop: true });

      const eduardoEvent = extraAnim("eduardo", t);
      drawAnim(CE.sprites.eduardo, ce.images.eduardo, stageX(CE.stage.positions.girlfriend[0]), stageY(CE.stage.positions.girlfriend[1]), 0.58, eduardoEvent ? { anim: animFor(CE.sprites.eduardo, eduardoEvent.name), elapsed: eduardoEvent.elapsed, loop: eduardoEvent.loop } : charState(CE.sprites.eduardo, "eduardo", t, 0.82));

      const opponent = currentOpponentSprite(t);
      drawAnim(opponent, currentOpponentImage(t), stageX(CE.stage.positions.opponent[0]), stageY(CE.stage.positions.opponent[1]), t >= oppSwapTime ? 0.66 : 0.7, charState(opponent, "edd", t, 0.78));
      drawAnim(CE.sprites.player, ce.images.player, stageX(CE.stage.positions.boyfriend[0]), stageY(CE.stage.positions.boyfriend[1]), 0.7, charState(CE.sprites.player, "player", t, 0.78));

      const mattState = extraAnim("matt", t);
      if (mattState) drawAnim(CE.sprites.matt, ce.images.matt, mattX(t), stageY(CE.stage.positions.matt[1]), 0.56, { anim: animFor(CE.sprites.matt, mattState.name), elapsed: mattState.elapsed, loop: mattState.loop });
      const tomState = extraAnim("tom", t);
      if (tomState) drawAnim(CE.sprites.tom, ce.images.tom, tomX(t), stageY(CE.stage.positions.tom[1]), 0.52, { anim: animFor(CE.sprites.tom, tomState.name), elapsed: tomState.elapsed, loop: tomState.loop });

      ctx.drawImage(ce.images.fence, stageX(CE.stage.world.fence.x), 118, ce.images.fence.naturalWidth * 0.34, ce.images.fence.naturalHeight * 0.34);
      ctx.restore();
    }

    function noteImage() {
      return ce.images.notes;
    }

    function drawReceptor(lane, x, y) {
      const img = noteImage();
      const dir = DIRS[lane % 4];
      if (!imageReady(img)) return;
      const age = performance.now() / 1000 - (state.receptorFx[lane]?.time || -10);
      if (age >= 0 && age < 0.16 && CE.notes.confirm?.[dir]?.length) {
        const frame = frameFromList(CE.notes.confirm[dir], age, 24, false);
        if (frame) {
          ctx.save();
          ctx.shadowBlur = 16;
          ctx.shadowColor = COLORS[lane];
          drawAtlasCentered(img, frame, x, y, 0.74 + (0.16 - age) * 0.42, 1 - age / 0.16);
          ctx.restore();
          return;
        }
      }
      const press = CE.notes.press?.[dir];
      const frame = state.keysDown[lane] && press?.length ? frameFromList(press, performance.now() / 1000, 24, true) : CE.notes.static?.[dir];
      if (!frame) return;
      ctx.save();
      ctx.shadowBlur = state.keysDown[lane] ? 18 : 10;
      ctx.shadowColor = COLORS[lane];
      drawAtlasCentered(img, frame, x, y, state.keysDown[lane] ? 0.72 : 0.7, lane < 4 ? 0.84 : 1);
      ctx.restore();
    }

    function drawSustain(note, headY, tailY, alpha) {
      const img = noteImage();
      const hold = CE.notes.hold?.[DIRS[note.lane % 4]];
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

    function drawNote(lane, x, y, scale, alpha) {
      const img = noteImage();
      const frame = CE.notes.gem?.[DIRS[lane % 4]];
      if (!imageReady(img) || !frame) return;
      ctx.save();
      ctx.shadowBlur = 16;
      ctx.shadowColor = COLORS[lane];
      drawAtlasCentered(img, frame, x, y, 0.74 * scale, alpha);
      ctx.restore();
    }

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

    isImportedSong = song => !!song && (song.chartSource === "challengeEdd" || baseIsImportedSong(song));
    makeChart = song => song?.chartSource === "challengeEdd" ? { ...clone(CE.chart), notes: clone(CE.chart.notes), timeline: clone(CE.chart.timeline || []) } : baseMakeChart(song);
    stopExternalAudio = function() {
      baseStopExternalAudio();
      [state.audio.challengeInst, state.audio.challengeVoices].forEach(track => {
        if (!track) return;
        try {
          track.pause();
          track.currentTime = 0;
        } catch {}
      });
    };
    songTime = () => state.currentSong?.chartSource === "challengeEdd" && state.audio.challengeInst ? state.audio.challengeInst.currentTime : baseSongTime();

    startSong = function(id = state.selectedSong, options = {}) {
      const song = SONGS[id] || state.currentSong;
      if (song?.chartSource !== "challengeEdd") return baseStartSong(id, options);
      const audioContext = ensureAudio();
      if (audioContext.state === "suspended") audioContext.resume();
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
      state.audio.challengeInst.currentTime = 0;
      state.audio.challengeVoices.currentTime = 0;
      state.songStart = 0;
      state.nextStep = 0;
      state.nextStepTime = 0;
      state.playing = true;
      if (state.mode === "online" && state.network?.matchStartAt) {
        state.audio.challengeInst.pause();
        state.audio.challengeVoices.pause();
        state.audio.challengeInst.load();
        state.audio.challengeVoices.load();
      } else {
        state.audio.challengeInst.play().catch(() => {});
        state.audio.challengeVoices.play().catch(() => {});
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
      ui.statusSub.textContent = "Original chart, stage cast events, and Edd or Eduardo animation swaps are active.";
      ui.timer.textContent = `0:00 / ${formatTime(totalTime())}`;
      ui.menu.classList.remove("show");
      ui.settings.classList.remove("show");
      ui.resultsWrap.classList.remove("show");
    };

    handleMisses = function(t) {
      if (state.selectedSong !== "challengeEdd") return baseHandleMisses(t);
      for (const note of state.chart?.notes || []) {
        if (!note.judged && note.ignoreMiss && t > note.time + 0.16) {
          note.judged = true;
          note.played = true;
          note.hit = true;
          if (isHoldNote(note)) {
            note.holdActive = false;
            note.holdDone = true;
          }
        }
      }
      return baseHandleMisses(t);
    };

    updateHoldNotes = function(t) {
      if (state.selectedSong !== "challengeEdd") return baseUpdateHoldNotes(t);
      for (const note of state.chart?.notes || []) {
        if (note.ignoreMiss && note.holdActive && isHoldNote(note) && t >= holdEndTime(note) - 0.02) {
          note.holdDone = true;
          note.played = true;
        }
      }
      return baseUpdateHoldNotes(t);
    };

    refreshHUD = function(t) {
      baseRefreshHUD(t);
      if (state.selectedSong !== "challengeEdd") return;
      ui.timer.textContent = `${formatTime(t)} / ${formatTime(totalTime())}`;
      const section = state.chart?.timeline?.find(entry => t >= entry.startTime && t < entry.endTime);
      if (section) {
        ui.statusText.textContent = section.label;
        ui.statusSub.textContent = t >= oppSwapTime
          ? "Edd Side is active and the late-stage cast events are live."
          : "Original Challenge Edd stage art, chart audio, and note-type swaps are active.";
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
        gradient.addColorStop(0, "#c9ecff");
        gradient.addColorStop(0.58, "#a7d7ff");
        gradient.addColorStop(1, "#8ec96e");
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        return;
      }
      return baseBg(song, t);
    };

    stage = (t) => state.selectedSong === "challengeEdd" ? drawStage(t) : baseStage(t);
    receptors = function(t) {
      if (state.selectedSong !== "challengeEdd") return baseReceptors(t);
      const y = receptorY();
      ctx.strokeStyle = "rgba(255,255,255,0.1)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(canvas.width * 0.5, 72);
      ctx.lineTo(canvas.width * 0.5, 452);
      ctx.stroke();
      for (let lane = 0; lane < 8; lane++) {
        const x = laneX(lane);
        drawReceptor(lane, x, y);
        ctx.strokeStyle = "rgba(255,255,255,0.05)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x, y + 26);
        ctx.lineTo(x, 448);
        ctx.stroke();
      }
    };
    notes = function(t) {
      if (state.selectedSong !== "challengeEdd") return baseNotes(t);
      for (const note of state.chart?.notes || []) {
        if (note.invisible) continue;
        if (note.played && note.hit && (!isHoldNote(note) || note.holdDone)) continue;
        if (note.judged && note.side !== "opp" && (!isHoldNote(note) || note.holdDone || !note.hit)) continue;
        const diff = note.time - t;
        const y = receptorY() + diff * state.currentSong.scroll;
        const tailY = receptorY() + (holdEndTime(note) - t) * state.currentSong.scroll;
        if (y < -120 && tailY < -120) continue;
        if (y > canvas.height + 120 && tailY > canvas.height + 120) continue;
        const scale = clamp(1 - Math.pow(Math.abs(diff), 0.7) * 0.45, 0.75, 1.12);
        const alpha = note.side === "opp" ? 0.84 : 1;
        if (isHoldNote(note)) drawSustain(note, note.hit ? receptorY() : y, tailY, alpha * (note.hit ? 0.94 : 1));
        if (note.hit && isHoldNote(note) && t > note.time) continue;
        drawNote(note.lane, laneX(note.lane), y, scale, alpha);
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

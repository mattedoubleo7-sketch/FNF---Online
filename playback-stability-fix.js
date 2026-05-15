(() => {
  try {
    if (typeof state === "undefined" || typeof songTime !== "function") return;

    const originalSongTime = songTime;
    const IMMEDIATE_SYNC_COOLDOWN_MS = 120;
    const HARD_SYNC_TOLERANCE_GOOD = 0.006;
    const HARD_SYNC_TOLERANCE_BAD = 0.002;

    function currentChartSource(song = state.currentSong) {
      return String(song?.chartSource || "");
    }

    function importedTrackGroup(song = state.currentSong) {
      switch (currentChartSource(song)) {
        case "sporting":
          return [state.audio.inst, state.audio.voices];
        case "boxingMatch":
          return [state.audio.boxingInst, state.audio.boxingVoices];
        case "boxingMatchWg":
          return [state.audio.boxingWgInst, state.audio.boxingWgVoices];
        case "combat":
          return [state.audio.combatInst, state.audio.combatVoices];
        case "perseverance":
          return [state.audio.inst2, state.audio.voices2a, state.audio.voices2b];
        case "brokenReality":
          return [state.audio.inst3, state.audio.voices3a, state.audio.voices3b];
        case "challengeEdd":
          return [state.audio.challengeInst, state.audio.challengeVoices];
        case "ourBrokenConstellations":
          return [state.audio.fallenStarsInst, state.audio.fallenStarsVoices];
        case "genocide":
          return [state.audio.genocideInst, state.audio.genocideVoices];
        case "sansational":
          return [state.audio.sansationalInst, state.audio.sansationalVoices];
        case "lastReel":
          return [state.audio.lastReelInst, state.audio.lastReelVoices];
        default:
          return [];
      }
    }

    function importedPlaybackRate(song = state.currentSong) {
      if (typeof window.getImportedSongPlaybackRate === "function") {
        const rate = Number(window.getImportedSongPlaybackRate(song));
        if (Number.isFinite(rate) && rate > 0) return rate;
      }
      return 1;
    }

    function nativeEngineSongTime() {
      const ctxTime = Number(state.audio?.ctx?.currentTime || 0);
      const songStart = Number(state.songStart || 0);
      if (!Number.isFinite(ctxTime) || !Number.isFinite(songStart) || !state.playing || !ctxTime) return null;
      return Math.max(0, ctxTime - songStart);
    }

    function syncTone(chartMs, trackMs = 0) {
      if (chartMs <= 22 && trackMs <= 38) return "good";
      if (chartMs <= 55 && trackMs <= 90) return "warn";
      return "bad";
    }

    function syncPalette(tone) {
      if (tone === "good") return {
        border: "rgba(108, 255, 188, 0.42)",
        glow: "rgba(82, 255, 176, 0.24)",
        text: "#dffff3"
      };
      if (tone === "warn") return {
        border: "rgba(255, 209, 92, 0.44)",
        glow: "rgba(255, 209, 92, 0.22)",
        text: "#fff4d0"
      };
      return {
        border: "rgba(255, 116, 141, 0.46)",
        glow: "rgba(255, 116, 141, 0.24)",
        text: "#ffe1e7"
      };
    }

    function roundMs(value) {
      return Math.max(0, Math.round(Number(value || 0)));
    }

    function syncNowMs() {
      if (typeof performance !== "undefined" && typeof performance.now === "function") {
        const value = Number(performance.now());
        if (Number.isFinite(value)) return value;
      }
      return Date.now();
    }

    function importedSyncState() {
      if (!state.__immediateSyncState) {
        state.__immediateSyncState = {
          lastSnapAt: -Infinity,
          lastTone: "good",
          lastSource: ""
        };
      }
      return state.__immediateSyncState;
    }

    function clampTrackTime(track, time) {
      const duration = Number.isFinite(track?.duration) && track.duration > 0 ? track.duration : null;
      return Math.max(0, duration == null ? time : Math.min(time, Math.max(0, duration - 0.05)));
    }

    function measureTrackGroupSync(targetTime, song = state.currentSong) {
      const tracks = importedTrackGroup(song).filter(Boolean);
      const rate = importedPlaybackRate(song);
      if (!tracks.length) {
        return {
          tracks,
          rate,
          masterDriftMs: 0,
          trackDriftMs: 0,
          tone: "good"
        };
      }
      let masterDriftMs = 0;
      let trackDriftMs = 0;
      tracks.forEach((track, index) => {
        const driftMs = Math.abs((Number(track?.currentTime || 0) - targetTime) * rate * 1000);
        if (index === 0) masterDriftMs = driftMs;
        else trackDriftMs = Math.max(trackDriftMs, driftMs);
      });
      return {
        tracks,
        rate,
        masterDriftMs,
        trackDriftMs,
        tone: syncTone(masterDriftMs, trackDriftMs)
      };
    }

    function syncTrackGroupToTime(targetTime, options = {}) {
      const song = options.song || state.currentSong;
      const tracks = (options.tracks || importedTrackGroup(song)).filter(Boolean);
      if (!tracks.length) return null;
      const shouldPlay = !!options.shouldPlay;
      const force = !!options.force;
      const masterTolerance = Number.isFinite(options.masterTolerance)
        ? options.masterTolerance
        : (Number.isFinite(options.tolerance) ? options.tolerance : 0.02);
      const secondaryTolerance = Number.isFinite(options.secondaryTolerance)
        ? options.secondaryTolerance
        : Math.max(masterTolerance * 3, shouldPlay ? 0.09 : 0.05);
      const forceTolerance = Number.isFinite(options.forceTolerance)
        ? Math.max(0, Number(options.forceTolerance))
        : (force ? HARD_SYNC_TOLERANCE_GOOD : Infinity);
      tracks.forEach((track, index) => {
        if (!track) return;
        const desired = clampTrackTime(track, targetTime);
        const tolerance = index === 0 ? masterTolerance : secondaryTolerance;
        const delta = Math.abs(Number(track.currentTime || 0) - desired);
        if (delta > tolerance || (force && delta > forceTolerance)) {
          try { track.currentTime = desired; } catch {}
        }
        if (shouldPlay) {
          const duration = Number.isFinite(track.duration) && track.duration > 0 ? track.duration : null;
          if (track.paused && (duration == null || desired < duration - 0.05)) {
            try { track.play().catch(() => {}); } catch {}
          }
        } else if (!track.paused) {
          try { track.pause(); } catch {}
        }
      });
      return targetTime;
    }

    function applyImmediateImportedResync(targetTime, options = {}) {
      const source = currentChartSource(options.song || state.currentSong);
      const metrics = measureTrackGroupSync(targetTime, options.song || state.currentSong);
      const syncState = importedSyncState();
      if (syncState.lastSource !== source) {
        syncState.lastSource = source;
        syncState.lastSnapAt = -Infinity;
      }
      syncState.lastTone = metrics.tone;
      if (metrics.tone === "good") return metrics;
      const now = syncNowMs();
      const cooldown = metrics.tone === "bad" ? 0 : IMMEDIATE_SYNC_COOLDOWN_MS;
      if (now - syncState.lastSnapAt < cooldown) return metrics;
      syncState.lastSnapAt = now;
      syncTrackGroupToTime(targetTime, {
        ...options,
        force: true,
        forceTolerance: metrics.tone === "bad" ? HARD_SYNC_TOLERANCE_BAD : HARD_SYNC_TOLERANCE_GOOD,
        masterTolerance: metrics.tone === "bad" ? 0.01 : 0.016,
        secondaryTolerance: metrics.tone === "bad" ? 0.012 : 0.02
      });
      return measureTrackGroupSync(targetTime, options.song || state.currentSong);
    }

    function offlineImportedSongTime() {
      const tracks = importedTrackGroup().filter(Boolean);
      const master = tracks[0];
      if (!master) return null;
      const targetTime = Number(master.currentTime || 0);
      syncTrackGroupToTime(targetTime, {
        song: state.currentSong,
        shouldPlay: !!state.playing,
        masterTolerance: 0.02,
        secondaryTolerance: 0.09
      });
      applyImmediateImportedResync(targetTime, {
        song: state.currentSong,
        shouldPlay: !!state.playing
      });
      return targetTime * importedPlaybackRate();
    }

    function onlineImportedSongTime() {
      if (state.mode !== "online" || typeof expectedOnlineSongTime !== "function") return null;
      const targetTime = expectedOnlineSongTime();
      if (targetTime == null) return null;
      const shouldPlay = typeof serverClockNow === "function"
        ? serverClockNow() + 40 >= Number(state.network?.matchStartAt || 0)
        : true;
      syncTrackGroupToTime(targetTime, {
        song: state.currentSong,
        shouldPlay,
        masterTolerance: shouldPlay ? 0.04 : 0.02,
        secondaryTolerance: shouldPlay ? 0.12 : 0.06
      });
      applyImmediateImportedResync(targetTime, {
        song: state.currentSong,
        shouldPlay
      });
      return targetTime * importedPlaybackRate();
    }

    songTime = function() {
      const source = currentChartSource();
      if (source) {
        const onlineTime = onlineImportedSongTime();
        if (onlineTime != null) return onlineTime;
        const offlineTime = offlineImportedSongTime();
        if (offlineTime != null) return offlineTime;
      }
      return originalSongTime.apply(this, arguments);
    };

    function collectSyncDiagnostics(song = state.currentSong) {
      if (!song) {
        return { label: "SYNC CHECKER", detail: "No song selected", tone: "warn" };
      }
      if (!state.playing) {
        return { label: "SYNC CHECKER", detail: "Ready for the next song", tone: "good" };
      }
      const source = currentChartSource(song);
      const chartTime = Number(songTime() || 0);
      if (source) {
        const metrics = measureTrackGroupSync(chartTime / Math.max(importedPlaybackRate(song), 0.0001), song);
        const tracks = metrics.tracks;
        const master = tracks[0];
        const rate = metrics.rate;
        if (!master) {
          return { label: "DESYNC", detail: "Missing master audio track", tone: "bad" };
        }
        const masterTime = Number(master.currentTime || 0) * rate;
        const chartMs = Math.max(metrics.masterDriftMs, Math.abs(chartTime - masterTime) * 1000);
        const trackMs = metrics.trackDriftMs;
        const tone = syncTone(chartMs, trackMs);
        const label = tone === "good" ? "SYNC OK" : (tone === "warn" ? "SYNC DRIFT" : "DESYNC");
        return {
          label,
          detail: `chart ${roundMs(chartMs)}ms | tracks ${roundMs(trackMs)}ms`,
          tone
        };
      }
      const engineTime = nativeEngineSongTime();
      if (engineTime == null) {
        return { label: "SYNC WAIT", detail: "Audio engine not locked yet", tone: "warn" };
      }
      const chartMs = Math.abs(chartTime - engineTime) * 1000;
      const tone = syncTone(chartMs, 0);
      const label = tone === "good" ? "SYNC OK" : (tone === "warn" ? "SYNC DRIFT" : "DESYNC");
      return {
        label,
        detail: `engine ${roundMs(chartMs)}ms`,
        tone
      };
    }

    function ensureSyncChecker() {
      if (typeof document === "undefined" || !document.body) return null;
      let el = document.getElementById("syncChecker");
      if (el) return el;
      el = document.createElement("div");
      el.id = "syncChecker";
      Object.assign(el.style, {
        position: "fixed",
        right: "18px",
        bottom: "58px",
        zIndex: "70",
        minWidth: "164px",
        padding: "10px 12px",
        borderRadius: "14px",
        border: "1px solid rgba(108,255,188,0.35)",
        background: "rgba(8, 13, 25, 0.82)",
        boxShadow: "0 0 0 1px rgba(255,255,255,0.03), 0 10px 24px rgba(0,0,0,0.28)",
        backdropFilter: "blur(10px)",
        color: "#eef7ff",
        fontFamily: "\"Trebuchet MS\", Arial, sans-serif",
        fontSize: "12px",
        letterSpacing: "0.03em",
        pointerEvents: "none",
        userSelect: "none",
        textAlign: "right",
        whiteSpace: "nowrap"
      });
      document.body.appendChild(el);
      return el;
    }

    function updateSyncChecker() {
      const el = ensureSyncChecker();
      if (el) {
        const diag = collectSyncDiagnostics();
        const palette = syncPalette(diag.tone);
        el.innerHTML = `<div style="font-weight:900; font-size:12px; margin-bottom:2px;">${diag.label}</div><div style="opacity:0.82; font-size:11px;">${diag.detail}</div>`;
        el.style.borderColor = palette.border;
        el.style.boxShadow = `0 0 0 1px rgba(255,255,255,0.03), 0 0 28px ${palette.glow}, 0 10px 24px rgba(0,0,0,0.28)`;
        el.style.color = palette.text;
      }
      if (typeof requestAnimationFrame === "function") requestAnimationFrame(updateSyncChecker);
    }

    window.getSongSyncDiagnostics = collectSyncDiagnostics;
    window.getStableImportedTrackGroup = importedTrackGroup;
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(updateSyncChecker);
  } catch (error) {
    console.error("Playback stability fix failed to initialize", error);
  }
})();

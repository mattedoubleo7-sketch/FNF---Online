(() => {
  try {
    if (typeof state === "undefined" || typeof songTime !== "function") return;

    const originalSongTime = songTime;

    function currentChartSource(song = state.currentSong) {
      return String(song?.chartSource || "");
    }

    function importedTrackGroup(song = state.currentSong) {
      switch (currentChartSource(song)) {
        case "sporting":
          return [state.audio.inst, state.audio.voices];
        case "boxingMatch":
          return [state.audio.boxingInst, state.audio.boxingVoices];
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

    function clampTrackTime(track, time) {
      const duration = Number.isFinite(track?.duration) && track.duration > 0 ? track.duration : null;
      return Math.max(0, duration == null ? time : Math.min(time, Math.max(0, duration - 0.05)));
    }

    function syncTrackGroupToTime(targetTime, options = {}) {
      const tracks = importedTrackGroup().filter(Boolean);
      if (!tracks.length) return null;
      const shouldPlay = !!options.shouldPlay;
      const tolerance = Number.isFinite(options.tolerance) ? options.tolerance : 0.018;
      for (const track of tracks) {
        if (!track) continue;
        if (track.readyState === 0) {
          try { track.load(); } catch {}
        }
        const desired = clampTrackTime(track, targetTime);
        if (Math.abs(Number(track.currentTime || 0) - desired) > tolerance) {
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
      }
      return targetTime;
    }

    function offlineImportedSongTime() {
      const tracks = importedTrackGroup().filter(Boolean);
      const master = tracks[0];
      if (!master) return null;
      const targetTime = Number(master.currentTime || 0);
      syncTrackGroupToTime(targetTime, {
        shouldPlay: !!state.playing && !master.paused,
        tolerance: 0.014
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
        shouldPlay,
        tolerance: shouldPlay ? 0.028 : 0.016
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

    window.getStableImportedTrackGroup = importedTrackGroup;
  } catch (error) {
    console.error("Playback stability fix failed to initialize", error);
  }
})();

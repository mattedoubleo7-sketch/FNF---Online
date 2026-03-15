(() => {
  try {
    if (typeof ensureAudio !== "function" || typeof startSong !== "function" || typeof state === "undefined") return;

    async function unlockAudioContext() {
      const audioContext = ensureAudio();
      if (audioContext?.state === "suspended") {
        try { await audioContext.resume(); } catch {}
      }
      return audioContext;
    }

    function importedTracksForSong(song = state.currentSong) {
      if (typeof window.getStableImportedTrackGroup === "function") {
        const stableTracks = window.getStableImportedTrackGroup(song).filter(Boolean);
        if (stableTracks.length) return stableTracks;
      }
      const chartSource = String(song?.chartSource || "");
      if (chartSource === "sporting") return [state.audio.inst, state.audio.voices];
      if (chartSource === "boxingMatch") return [state.audio.boxingInst, state.audio.boxingVoices];
      if (chartSource === "perseverance") return [state.audio.inst2, state.audio.voices2a, state.audio.voices2b];
      if (chartSource === "brokenReality") return [state.audio.inst3, state.audio.voices3a, state.audio.voices3b];
      if (chartSource === "challengeEdd") return [state.audio.challengeInst, state.audio.challengeVoices];
      if (chartSource === "ourBrokenConstellations") return [state.audio.fallenStarsInst, state.audio.fallenStarsVoices];
      if (chartSource === "genocide") return [state.audio.genocideInst, state.audio.genocideVoices];
      return [];
    }

    async function attemptTrackPlayback(track) {
      if (!track) return false;
      try {
        if (track.readyState === 0) {
          try { track.load(); } catch {}
        }
        const playAttempt = track.play();
        if (playAttempt && typeof playAttempt.then === "function") {
          await Promise.race([
            playAttempt.catch(() => {}),
            new Promise(resolve => setTimeout(resolve, 900))
          ]);
        }
      } catch {}
      return !track.paused;
    }

    async function nudgeImportedPlayback(song = state.currentSong) {
      const tracks = importedTracksForSong(song).filter(Boolean);
      if (!tracks.length) return false;
      await unlockAudioContext();
      await Promise.allSettled(tracks.map(track => attemptTrackPlayback(track)));
      return tracks.some(track => !track.paused);
    }

    const originalStartSong = startSong;
    startSong = async function(id = state.selectedSong, options = {}) {
      try {
        const unlockPromise = unlockAudioContext();
        const result = await originalStartSong.apply(this, arguments);
        await unlockPromise;
        const song = SONGS[id] || state.currentSong;
        if (!song?.chartSource) return result;
        if ((options.forceMode || state.mode) === "online") return result;
        const started = await nudgeImportedPlayback(song);
        if (!started && state.playing) {
          state.playing = false;
          ui.statusText.textContent = "Audio start blocked";
          ui.statusSub.textContent = "Press Play again so the browser can unlock the song audio.";
        }
        return result;
      } catch (error) {
        console.error("Playback start fix failed", error);
        return null;
      }
    };
  } catch (error) {
    console.error("Playback start fix failed to initialize", error);
  }
})();

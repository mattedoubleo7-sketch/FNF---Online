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

    function ensureTracksForSong(song = state.currentSong) {
      const chartSource = String(song?.chartSource || "");
      if (chartSource === "sporting" && typeof ensureSportingAudio === "function") ensureSportingAudio();
      else if (chartSource === "boxingMatch" && typeof ensureBoxingMatchAudio === "function") ensureBoxingMatchAudio();
      else if (chartSource === "perseverance" && typeof ensurePerseveranceAudio === "function") ensurePerseveranceAudio();
      else if (chartSource === "brokenReality" && typeof window.ensureBrokenRealityAudio === "function") window.ensureBrokenRealityAudio();
      else if (chartSource === "challengeEdd" && typeof window.ensureChallengeEddAudio === "function") window.ensureChallengeEddAudio();
      else if (chartSource === "ourBrokenConstellations" && typeof window.ensureFallenStarsAudio === "function") window.ensureFallenStarsAudio();
      else if (chartSource === "genocide" && typeof window.ensureGenocideAudio === "function") window.ensureGenocideAudio();
      return importedTracksForSong(song).filter(Boolean);
    }

    function primeTrackForGesture(track) {
      if (!track || track.__startFixPrimed || track.__startFixPriming) return;
      track.__startFixPriming = true;
      const previousMuted = !!track.muted;
      const previousVolume = Number.isFinite(track.volume) ? track.volume : 1;
      const previousTime = Number.isFinite(track.currentTime) ? track.currentTime : 0;
      const restore = () => {
        track.__startFixPriming = false;
        try { track.pause(); } catch {}
        try { track.currentTime = previousTime; } catch { try { track.currentTime = 0; } catch {} }
        try { track.volume = previousVolume; } catch {}
        try { track.muted = previousMuted; } catch {}
      };
      try {
        if (track.readyState === 0) {
          try { track.load(); } catch {}
        }
        track.muted = true;
        track.volume = 0;
        const playAttempt = track.play();
        if (playAttempt && typeof playAttempt.then === "function") {
          playAttempt.then(() => {
            track.__startFixPrimed = true;
            restore();
          }).catch(() => {
            restore();
          });
        } else {
          track.__startFixPrimed = true;
          restore();
        }
      } catch {
        restore();
      }
    }

    function primeSongTracksForGesture(song = state.currentSong) {
      for (const track of ensureTracksForSong(song)) primeTrackForGesture(track);
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
      const tracks = ensureTracksForSong(song);
      if (!tracks.length) return false;
      await unlockAudioContext();
      await Promise.allSettled(tracks.map(track => attemptTrackPlayback(track)));
      return tracks.some(track => !track.paused);
    }

    const originalStartSong = startSong;
    startSong = async function(id = state.selectedSong, options = {}) {
      try {
        const song = SONGS[id] || state.currentSong;
        if (song?.chartSource && (options.forceMode || state.mode) !== "online") {
          primeSongTracksForGesture(song);
        }
        const unlockPromise = unlockAudioContext();
        const result = await originalStartSong.apply(this, arguments);
        await unlockPromise;
        if (!song?.chartSource) return result;
        if ((options.forceMode || state.mode) === "online") return result;
        const started = await nudgeImportedPlayback(song);
        if (!started && state.playing) {
          ui.statusText.textContent = "Audio still loading";
          ui.statusSub.textContent = "The song tracks are still unlocking. If vocals stay missing, press Play again.";
          setTimeout(() => {
            if (!state.playing) return;
            nudgeImportedPlayback(song).catch(() => {});
          }, 320);
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

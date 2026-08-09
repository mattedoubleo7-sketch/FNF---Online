(() => {
  try {
    const SNOW = window.SNOWED_IN_DATA;
    if (!SNOW || typeof SONGS === "undefined") return;

    const SONG_ID = "snowedIn";
    const SONG_SOURCE = "snowedIn";
    const DIR = ["left", "down", "up", "right"];
    const DIR_ANIM = ["singLEFT", "singDOWN", "singUP", "singRIGHT"];
    const SOURCE_W = Number(SNOW.stage?.viewport?.[0] || 1280);
    const SOURCE_H = Number(SNOW.stage?.viewport?.[1] || 720);
    const CAMERA_FOLLOW_SPEED = 0.04;
    const scene = {
      initialized: false,
      images: {},
      particles: [],
      particleIndex: 0,
      lastParticleTime: -1,
      dialogueActive: false,
      dialogueIndex: 0,
      dialogueDone: null,
      dialogueLineStarted: 0,
      dialogueRevealAll: false,
      dialogueFrameHandle: 0
    };

    SONGS[SONG_ID] = {
      title: SNOW.song?.title || "Snowed In",
      subtitle: SNOW.song?.subtitle || "Gumballs original chart import",
      diff: SNOW.song?.diff || "Normal (Original Chart)",
      tempo: Number(SNOW.song?.bpm || 130),
      root: 45,
      scale: [0, 2, 3, 5, 7, 8, 10],
      prog: [0, 5, 3, 7],
      scroll: 1012,
      seed: 73,
      introBeats: 0,
      outroBeats: 2,
      palette: ["#140d2e", "#281a53", "#421f62", "#0b0c21", "#9b87ff", "#ff5a96"],
      blurb: "Imported from Gumballs with the original Snowed In chart and audio, Snowdin pixel stage, source camera events, centered note lane, custom note and hold skin, Sans hit particles, blackout, and bottom health bar.",
      chartSource: SONG_SOURCE
    };
    if (typeof NEW_SONGS !== "undefined" && NEW_SONGS?.add) NEW_SONGS.add(SONG_ID);
    state.poses.sans = state.poses.sans || { lane: 1, time: -10, kind: "hit" };

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
    const baseRenderScene = renderScene;
    const baseUpdateCamera = updateCamera;
    const baseCameraTargets = cameraTargets;
    const baseCameraPanProfile = cameraPanProfile;
    const baseCameraPoseKeys = cameraPoseKeys;

    const clamp01 = value => Math.max(0, Math.min(1, Number(value || 0)));
    const lerp = (a, b, p) => Number(a || 0) + (Number(b || 0) - Number(a || 0)) * clamp01(p);
    const isSnowedIn = song => !!song && song.chartSource === SONG_SOURCE;
    const clone = value => JSON.parse(JSON.stringify(value));
    const imageReady = image => !!(image && image.complete && image.naturalWidth);

    function injectStyle() {
      if (document.getElementById("snowedInStyle")) return;
      const style = document.createElement("style");
      style.id = "snowedInStyle";
      style.textContent = `
        body.snowed-in-active .hud .top,
        body.snowed-in-active .hud .bottom,
        body.snowed-in-active #judgments { opacity: 0 !important; pointer-events: none !important; }
        #snowedInDialogue {
          position: fixed; inset: 0; z-index: 120; display: none; place-items: center;
          padding: 0; background: #000; cursor: pointer; overflow: hidden;
        }
        #snowedInDialogue.show { display: grid; }
        #snowedInDialogueCanvas {
          width: 100vw; height: 100vh; display: block; image-rendering: auto;
        }
      `;
      document.head.appendChild(style);
    }

    function initAssets() {
      if (scene.initialized) return;
      scene.initialized = true;
      const sources = {};
      for (const layer of SNOW.stage?.layers || []) sources[layer.key] = layer.image;
      sources.sans = SNOW.sprites?.sans?.image;
      sources.boyfriend = SNOW.sprites?.boyfriend?.image;
      sources.notes = SNOW.notes?.tap;
      sources.holds = SNOW.notes?.hold;
      sources.holdCover = SNOW.notes?.holdCover?.image;
      sources.barBg = SNOW.hud?.background;
      sources.barOpp = SNOW.hud?.opponent;
      sources.barPlayer = SNOW.hud?.player;
      sources.pointer = SNOW.hud?.pointer;
      sources.dialogueBg = SNOW.dialogueUi?.background;
      sources.dialogueGum = SNOW.dialogueUi?.box?.image;
      sources.dialogueCharacters = SNOW.dialogueUi?.characters?.image;
      sources.dialogueAlphabet = SNOW.dialogueUi?.alphabet?.image;
      (SNOW.stage?.comicSans || []).forEach((source, index) => { sources[`comic${index}`] = source; });
      Object.entries(sources).forEach(([key, source]) => {
        if (!source) return;
        const image = new Image();
        image.decoding = "async";
        image.src = source;
        if (typeof image.decode === "function") image.decode().catch(() => {});
        scene.images[key] = image;
      });
    }

    function ensureAudioTracks() {
      if (!state.audio.snowedInInst) {
        state.audio.snowedInInst = new Audio(SNOW.audio.inst);
        state.audio.snowedInInst.preload = "auto";
        state.audio.snowedInInst.volume = 0.94;
      }
      if (!state.audio.snowedInVoices) {
        state.audio.snowedInVoices = new Audio(SNOW.audio.voices);
        state.audio.snowedInVoices.preload = "auto";
        state.audio.snowedInVoices.volume = 0.9;
      }
      return [state.audio.snowedInInst, state.audio.snowedInVoices];
    }

    window.ensureSnowedInAudio = ensureAudioTracks;
    window.prepareSnowedInOnlineStart = function() {
      const tracks = ensureAudioTracks();
      tracks.forEach(track => {
        track.pause();
        try { track.currentTime = 0; } catch {}
        try { track.load(); } catch {}
      });
      return tracks;
    };

    function totalTime() {
      const chartTime = Number(SNOW.chart?.totalTime || 0);
      const durations = ensureAudioTracks()
        .map(track => Number(track.duration || 0))
        .filter(duration => Number.isFinite(duration) && duration > 0);
      return durations.length ? Math.max(chartTime, ...durations) : chartTime;
    }

    function ensureDialogue() {
      injectStyle();
      let overlay = document.getElementById("snowedInDialogue");
      if (overlay) return overlay;
      overlay = document.createElement("div");
      overlay.id = "snowedInDialogue";
      overlay.setAttribute("role", "dialog");
      overlay.setAttribute("aria-label", "Snowed In dialogue");
      overlay.innerHTML = `<canvas id="snowedInDialogueCanvas" width="1280" height="720"></canvas>`;
      overlay.addEventListener("click", advanceDialogue);
      document.body.appendChild(overlay);
      return overlay;
    }

    function drawDialogueAtlas(renderCtx, image, frame, x, y, scale = 1, alpha = 1, flipX = false) {
      if (!imageReady(image) || !frame) return;
      const fw = Number(frame.fw || frame.w || 0);
      const fx = Number(frame.fx || 0);
      const fy = Number(frame.fy || 0);
      renderCtx.save();
      renderCtx.globalAlpha = alpha;
      renderCtx.imageSmoothingEnabled = false;
      renderCtx.translate(x, y);
      if (flipX) {
        renderCtx.translate(fw * scale, 0);
        renderCtx.scale(-1, 1);
      }
      renderCtx.drawImage(
        image,
        frame.x,
        frame.y,
        frame.w,
        frame.h,
        -fx * scale,
        -fy * scale,
        frame.w * scale,
        frame.h * scale
      );
      renderCtx.restore();
    }

    function dialogueOpenDuration() {
      return Number(SNOW.dialogueUi?.box?.open?.length || 0) / 24;
    }

    function dialogueTypedCount(now = performance.now() / 1000) {
      const line = SNOW.dialogue?.[scene.dialogueIndex];
      if (!line) return 0;
      if (scene.dialogueRevealAll) return String(line.text || "").length;
      const openDelay = scene.dialogueIndex === 0 ? dialogueOpenDuration() : 0;
      const age = Math.max(0, now - scene.dialogueLineStarted - openDelay);
      return Math.min(String(line.text || "").length, Math.floor(age / Math.max(0.001, Number(line.speed || 0.05))));
    }

    function dialogueGlyph(character) {
      const frames = SNOW.dialogueUi?.alphabet?.glyphs?.[character];
      return frames?.length ? frames[frames.length - 1] : null;
    }

    function dialogueGlyphWidth(character) {
      const frame = dialogueGlyph(character);
      return frame ? Number(frame.fw || frame.w || 40) : 40;
    }

    function drawDialogueText(renderCtx, line, visibleCharacters) {
      const image = scene.images.dialogueAlphabet;
      if (!imageReady(image)) return;
      const text = String(line?.text || "");
      const scale = 0.64;
      const startX = 220;
      const maxX = 1060;
      const lineHeight = 43;
      let x = startX;
      let baseline = 580;
      renderCtx.save();
      renderCtx.imageSmoothingEnabled = true;
      for (let index = 0; index < Math.min(text.length, visibleCharacters); index += 1) {
        const character = text[index];
        if (character === "\n") {
          x = startX;
          baseline += lineHeight;
          continue;
        }
        if (character !== " " && (index === 0 || text[index - 1] === " " || text[index - 1] === "\n")) {
          let wordWidth = 0;
          for (let wordIndex = index; wordIndex < text.length && text[wordIndex] !== " " && text[wordIndex] !== "\n"; wordIndex += 1) {
            wordWidth += dialogueGlyphWidth(text[wordIndex]) * scale;
          }
          if (x > startX && wordWidth <= maxX - startX && x + wordWidth > maxX) {
            x = startX;
            baseline += lineHeight;
          }
        }
        const advance = dialogueGlyphWidth(character) * scale;
        if (character !== " " && x + advance > maxX) {
          x = startX;
          baseline += lineHeight;
        }
        const frame = dialogueGlyph(character);
        if (frame) {
          renderCtx.drawImage(
            image,
            frame.x,
            frame.y,
            frame.w,
            frame.h,
            Math.round(x),
            Math.round(baseline - Number(frame.fh || frame.h || 0) * scale),
            frame.w * scale,
            frame.h * scale
          );
        }
        x += advance;
      }
      renderCtx.restore();
    }

    function renderDialogueFrame() {
      if (!scene.dialogueActive) return;
      const dialogueCanvas = document.getElementById("snowedInDialogueCanvas");
      const renderCtx = dialogueCanvas?.getContext("2d");
      const line = SNOW.dialogue?.[scene.dialogueIndex];
      if (!dialogueCanvas || !renderCtx || !line) return;
      const displayWidth = Math.max(1, Math.round(dialogueCanvas.clientWidth || window.innerWidth || 1280));
      const displayHeight = Math.max(1, Math.round(dialogueCanvas.clientHeight || window.innerHeight || 720));
      if (dialogueCanvas.width !== displayWidth || dialogueCanvas.height !== displayHeight) {
        dialogueCanvas.width = displayWidth;
        dialogueCanvas.height = displayHeight;
      }
      const now = performance.now() / 1000;
      const lineAge = Math.max(0, now - scene.dialogueLineStarted);
      renderCtx.clearRect(0, 0, dialogueCanvas.width, dialogueCanvas.height);
      renderCtx.fillStyle = "#000";
      renderCtx.fillRect(0, 0, dialogueCanvas.width, dialogueCanvas.height);

      const referenceWidth = 1280;
      const referenceHeight = 720;
      const coverScale = Math.max(dialogueCanvas.width / referenceWidth, dialogueCanvas.height / referenceHeight);
      renderCtx.save();
      renderCtx.translate(
        (dialogueCanvas.width - referenceWidth * coverScale) * 0.5,
        dialogueCanvas.height - referenceHeight * coverScale
      );
      renderCtx.scale(coverScale, coverScale);

      const background = scene.images.dialogueBg;
      if (imageReady(background)) {
        // Gumballs switches FlxG to 960x720, keeps menuBG at scale 1, then
        // screen-centers it. Scale that source camera uniformly to our width;
        // the extra height is cropped instead of distorting the artwork.
        const sourceWidth = 960;
        const sourceHeight = 720;
        const sourceScale = referenceWidth / sourceWidth;
        const drawWidth = background.naturalWidth * sourceScale;
        const drawHeight = background.naturalHeight * sourceScale;
        const sourceCenterX = (sourceWidth - background.naturalWidth) * 0.5;
        const sourceCenterY = (sourceHeight - background.naturalHeight) * 0.5;
        const drawX = sourceCenterX * sourceScale;
        const drawY = sourceCenterY * sourceScale + (referenceHeight - sourceHeight * sourceScale) * 0.5;
        renderCtx.drawImage(background, drawX, drawY, drawWidth, drawHeight);
      }

      const characterDef = SNOW.dialogueUi?.characters?.[String(line.character || "")];
      const characterImage = scene.images.dialogueCharacters;
      if (characterDef?.frames?.length && imageReady(characterImage)) {
        const frame = characterDef.frames[Math.floor(now * 24) % characterDef.frames.length];
        const pop = 1 - Math.pow(1 - clamp01(lineAge / 0.2), 5);
        drawDialogueAtlas(
          renderCtx,
          characterImage,
          frame,
          Number(characterDef.x || 0),
          Number(characterDef.y || 0) - Number(characterDef.offsetY || 0) + (1 - pop) * 100,
          Number(characterDef.scale || 1),
          pop,
          !!characterDef.flipX
        );
      }

      const boxImage = scene.images.dialogueGum;
      const openFrames = SNOW.dialogueUi?.box?.open || [];
      const idleFrames = SNOW.dialogueUi?.box?.idle || [];
      const opening = scene.dialogueIndex === 0 && lineAge < dialogueOpenDuration() && openFrames.length;
      const boxFrames = opening ? openFrames : idleFrames;
      if (boxFrames.length && imageReady(boxImage)) {
        const boxIndex = opening
          ? Math.min(boxFrames.length - 1, Math.floor(lineAge * 24))
          : Math.floor(now * 24) % boxFrames.length;
        const frame = boxFrames[boxIndex];
        drawDialogueAtlas(
          renderCtx,
          boxImage,
          frame,
          (1280 - Number(frame.fw || frame.w || 0)) * 0.5,
          720 - Number(frame.fh || frame.h || 0),
          1,
          1,
          String(line.character || "") === "sans"
        );
      }

      drawDialogueText(renderCtx, line, dialogueTypedCount(now));
      renderCtx.restore();
      scene.dialogueFrameHandle = requestAnimationFrame(renderDialogueFrame);
    }

    function renderDialogueLine() {
      const line = SNOW.dialogue?.[scene.dialogueIndex];
      if (!line) return closeDialogue(true);
      scene.dialogueLineStarted = performance.now() / 1000;
      scene.dialogueRevealAll = false;
    }

    function showDialogue(done) {
      const overlay = ensureDialogue();
      scene.dialogueActive = true;
      scene.dialogueIndex = 0;
      scene.dialogueDone = done;
      document.body.classList.add("snowed-in-active");
      ui.menu.classList.remove("show");
      overlay.classList.add("show");
      renderDialogueLine();
      cancelAnimationFrame(scene.dialogueFrameHandle);
      scene.dialogueFrameHandle = requestAnimationFrame(renderDialogueFrame);
    }

    function closeDialogue(continueSong) {
      const overlay = document.getElementById("snowedInDialogue");
      overlay?.classList.remove("show");
      scene.dialogueActive = false;
      cancelAnimationFrame(scene.dialogueFrameHandle);
      scene.dialogueFrameHandle = 0;
      const done = scene.dialogueDone;
      scene.dialogueDone = null;
      if (continueSong && typeof done === "function") done();
      else if (!state.playing) document.body.classList.remove("snowed-in-active");
    }

    function advanceDialogue(event) {
      if (event) event.preventDefault();
      if (!scene.dialogueActive) return;
      const line = SNOW.dialogue?.[scene.dialogueIndex];
      if (line && dialogueTypedCount() < String(line.text || "").length) {
        scene.dialogueRevealAll = true;
        return;
      }
      scene.dialogueIndex += 1;
      if (scene.dialogueIndex >= Number(SNOW.dialogue?.length || 0)) closeDialogue(true);
      else renderDialogueLine();
    }

    window.addEventListener("keydown", event => {
      if (!scene.dialogueActive) return;
      if (event.key === "Enter" || event.key === " ") advanceDialogue(event);
      else if (event.key === "Escape") closeDialogue(false);
    });

    function sourceEventAt(t, name) {
      let found = null;
      for (const event of SNOW.chart?.events || []) {
        if (event.time > t + 0.0001) break;
        if (event.name === name) found = event;
      }
      return found;
    }

    function cameraSideForEvent(event) {
      return Number(event?.params?.[0] || 0) === 1 ? "player" : "opp";
    }

    function cameraTargetForSide(side) {
      if (side === "player") {
        const bf = SNOW.stage.positions.boyfriend;
        const idleFrame = SNOW.sprites?.boyfriend?.animations?.idle?.frames?.[0];
        const width = Number(idleFrame?.fw || idleFrame?.w || 261);
        const height = Number(idleFrame?.fh || idleFrame?.h || 336);
        return {
          x: Number(bf[0]) + width * 0.5 - 100 + Number(SNOW.sprites?.boyfriend?.camera?.[0] || 0),
          y: Number(bf[1]) + height * 0.5 - 100 + Number(SNOW.sprites?.boyfriend?.camera?.[1] || 0)
        };
      }
      const sans = SNOW.stage.positions.sans;
      const idleFrame = SNOW.sprites?.sans?.animations?.idle?.frames?.[0];
      const width = Number(idleFrame?.fw || idleFrame?.w || 283);
      const height = Number(idleFrame?.fh || idleFrame?.h || 414);
      return {
        x: Number(sans[0]) + width * 0.5 + 150 + Number(SNOW.sprites?.sans?.camera?.[0] || 0),
        y: Number(sans[1]) + height * 0.5 - 100 + Number(SNOW.sprites?.sans?.camera?.[1] || 0)
      };
    }

    function followToward(current, target, seconds) {
      const amount = 1 - Math.pow(1 - CAMERA_FOLLOW_SPEED, Math.max(0, seconds) * 60);
      return lerp(current, target, amount);
    }

    function cameraScrollAt(t) {
      const cameraEvents = (SNOW.chart?.events || []).filter(event => event.name === "Camera Movement");
      let side = "opp";
      let target = cameraTargetForSide(side);
      let scrollX = target.x - SOURCE_W * 0.5;
      let scrollY = target.y - SOURCE_H * 0.5;
      let lastTime = 0;
      for (const event of cameraEvents) {
        if (event.time > t + 0.0001) break;
        scrollX = followToward(scrollX, target.x - SOURCE_W * 0.5, event.time - lastTime);
        scrollY = followToward(scrollY, target.y - SOURCE_H * 0.5, event.time - lastTime);
        side = cameraSideForEvent(event);
        target = cameraTargetForSide(side);
        lastTime = event.time;
      }
      return {
        x: followToward(scrollX, target.x - SOURCE_W * 0.5, t - lastTime),
        y: followToward(scrollY, target.y - SOURCE_H * 0.5, t - lastTime)
      };
    }

    function cameraModuloAt(t) {
      const event = sourceEventAt(t, "Camera Modulo Change");
      return Math.max(1, Number(event?.params?.[0] || 4));
    }

    function cameraBeatZoom(t) {
      const spb = Number(SNOW.chart?.spb || (60 / 130));
      const modulo = cameraModuloAt(t);
      const beat = Math.floor(t / spb + 0.0001);
      if (beat % modulo !== 0) return 0;
      const age = t - beat * spb;
      return age >= 0 && age < 0.5 ? 0.015 * (1 - age / 0.5) : 0;
    }

    function drawAtlasSub(image, frame, dx, dy, scale = 1) {
      if (frame.rotated) {
        ctx.save();
        ctx.translate(dx, dy + frame.w * scale);
        ctx.rotate(-Math.PI / 2);
        ctx.drawImage(image, frame.x, frame.y, frame.w, frame.h, 0, 0, frame.w * scale, frame.h * scale);
        ctx.restore();
        return;
      }
      ctx.drawImage(image, frame.x, frame.y, frame.w, frame.h, dx, dy, frame.w * scale, frame.h * scale);
    }

    function drawAtlasTopLeft(image, frame, x, y, scale = 1, alpha = 1, flipX = false) {
      if (!imageReady(image) || !frame) return;
      const fw = Number(frame.fw || frame.w || 0);
      const fx = Number(frame.fx || 0);
      const fy = Number(frame.fy || 0);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.imageSmoothingEnabled = false;
      ctx.translate(x, y);
      if (flipX) {
        ctx.translate(fw * scale, 0);
        ctx.scale(-1, 1);
      }
      drawAtlasSub(image, frame, -fx * scale, -fy * scale, scale);
      ctx.restore();
    }

    function frameForAnimation(animation, elapsed, forceLoop = null) {
      if (!animation?.frames?.length) return null;
      const fps = Math.max(1, Number(animation.fps || 24));
      const loop = forceLoop == null ? !!animation.loop : !!forceLoop;
      const index = Math.floor(Math.max(0, elapsed) * fps);
      return animation.frames[loop ? index % animation.frames.length : Math.min(animation.frames.length - 1, index)];
    }

    function activePlayerAnimation(t) {
      const sprite = SNOW.sprites.boyfriend;
      const held = typeof activeHoldNoteForCharacter === "function" ? activeHoldNoteForCharacter("player", t) : null;
      const pose = state.poses.player || { lane: 1, time: -10, kind: "hit" };
      const age = performance.now() / 1000 - Number(pose.time || -10);
      const lane = Number((held ? held.lane : pose.lane) || 0) % 4;
      let name = DIR_ANIM[lane];
      if (pose.kind === "miss" && age < 0.48 && sprite.animations[`${name}miss`]) name += "miss";
      const animation = sprite.animations[name];
      if ((held || age < 0.32) && animation?.frames?.length) {
        return { animation, frame: frameForAnimation(animation, held ? Math.max(0, t - held.time) : age, false) };
      }
      const idle = sprite.animations.idle;
      const idleDuration = idle?.frames?.length ? idle.frames.length / Math.max(1, Number(idle.fps || 24)) : 0.6;
      return { animation: idle, frame: frameForAnimation(idle, t % Math.max(0.001, idleDuration), false) };
    }

    function drawCharacter(key, t, cameraScroll) {
      const sprite = SNOW.sprites[key];
      const image = scene.images[key];
      const stagePosition = key === "boyfriend" ? SNOW.stage.positions.boyfriend : SNOW.stage.positions.sans;
      if (!sprite || !imageReady(image) || !stagePosition) return;
      let animation;
      let frame;
      if (key === "boyfriend") ({ animation, frame } = activePlayerAnimation(t));
      else {
        animation = sprite.animations.idle;
        frame = frameForAnimation(animation, t, true);
      }
      if (!frame) return;
      const offset = animation?.offset || [0, 0];
      const finalFlipX = key === "boyfriend" ? !sprite.flipX : !!sprite.flipX;
      drawAtlasTopLeft(
        image,
        frame,
        Number(stagePosition[0]) - Number(cameraScroll.x || 0) - Number(offset[0] || 0),
        Number(stagePosition[1]) - Number(cameraScroll.y || 0) - Number(offset[1] || 0),
        1,
        1,
        finalFlipX
      );
    }

    function resetParticles(t = 0) {
      scene.particles.length = 0;
      scene.particleIndex = 0;
      const notes = SNOW.chart?.notes || [];
      while (scene.particleIndex < notes.length && notes[scene.particleIndex].time < t - 0.04) scene.particleIndex += 1;
      scene.lastParticleTime = t;
    }

    function spawnComicParticle(note, index) {
      if (note.side !== "opp") return;
      const hash = ((index + 1) * 1103515245 + 12345) >>> 0;
      scene.particles.push({
        born: Number(note.time || 0),
        lane: Number(note.lane || 0) % 4,
        vx: hash % 301
      });
      if (scene.particles.length > 48) scene.particles.splice(0, scene.particles.length - 48);
    }

    function updateParticles(t) {
      const chartNotes = SNOW.chart?.notes || [];
      if (t + 0.08 < scene.lastParticleTime) resetParticles(t);
      while (scene.particleIndex < chartNotes.length && chartNotes[scene.particleIndex].time <= t + 0.001) {
        const note = chartNotes[scene.particleIndex];
        if (note.time >= scene.lastParticleTime - 0.03) spawnComicParticle(note, scene.particleIndex);
        scene.particleIndex += 1;
      }
      scene.lastParticleTime = t;
      scene.particles = scene.particles.filter(particle => t - particle.born <= 1.02);
    }

    function drawParticles(t, cameraScroll) {
      if (state.playing) updateParticles(t);
      for (const particle of scene.particles) {
        const age = Math.max(0, t - particle.born);
        const image = scene.images[`comic${particle.lane}`];
        if (!imageReady(image) || age > 1) continue;
        const x = 397 - Number(cameraScroll.x || 0) + particle.vx * age;
        const y = 303 - Number(cameraScroll.y || 0) - 500 * age + 500 * age * age;
        ctx.save();
        ctx.globalAlpha = 1 - age;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(image, Math.round(x), Math.round(y));
        ctx.restore();
      }
    }

    function drawSnowdinStage(t) {
      initAssets();
      const spb = Number(SNOW.chart?.spb || (60 / 130));
      const blackoutStart = Number(SNOW.stage?.blackout?.startBeat || 28) * spb;
      const blackoutEnd = Number(SNOW.stage?.blackout?.endBeat || 32) * spb;
      if (t >= blackoutStart && t < blackoutEnd) return;
      const cameraScroll = cameraScrollAt(t);
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      for (const layer of SNOW.stage?.layers || []) {
        const image = scene.images[layer.key];
        if (!imageReady(image)) continue;
        const scroll = Number(layer.scroll == null ? 1 : layer.scroll);
        const layerX = Number(layer.x || 0) - cameraScroll.x * scroll;
        const layerY = Number(layer.y || 0) - cameraScroll.y * scroll;
        ctx.drawImage(image, Math.round(layerX), Math.round(layerY));
      }
      drawCharacter("sans", t, cameraScroll);
      drawCharacter("boyfriend", t, cameraScroll);
      drawParticles(t, cameraScroll);
      ctx.restore();
    }

    function snowLaneX(lane) {
      return canvas.width * 0.5 - 168 + (Number(lane || 0) % 4) * 112;
    }

    function snowReceptorY() {
      return typeof isDownScroll === "function" && isDownScroll() ? 548 : 72;
    }

    function drawSheetCell(image, frameIndex, columns, cellW, cellH, x, y, width = cellW, height = cellH, alpha = 1) {
      if (!imageReady(image)) return;
      const sx = (frameIndex % columns) * cellW;
      const sy = Math.floor(frameIndex / columns) * cellH;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(image, sx, sy, cellW, cellH, x - width * 0.5, y - height * 0.5, width, height);
      ctx.restore();
    }

    function drawSnowReceptor(lane, x, y, t) {
      const local = Number(lane || 0) % 4;
      const image = scene.images.notes;
      const hitAge = performance.now() / 1000 - Number(state.receptorFx?.[lane]?.time || -10);
      let frame = local;
      if (state.keysDown?.[lane]) frame = 4 + local;
      if (hitAge >= 0 && hitAge < 0.18) frame = (hitAge < 0.075 ? 12 : 16) + local;
      const introDelay = 0.5 + local * 0.2;
      const alpha = clamp01((t - introDelay) / 1);
      const lift = (1 - alpha) * -10;
      drawSheetCell(image, frame, 4, 110, 110, x, y + lift, 110, 110, alpha);
    }

    function drawSnowHold(note, headY, tailY, alpha, x) {
      const image = scene.images.holds;
      if (!imageReady(image)) return;
      const local = Number(note.lane || 0) % 4;
      const top = Math.min(headY, tailY);
      const bottom = Math.max(headY, tailY);
      const bodyTop = top + 18;
      const bodyBottom = bottom - 16;
      if (bodyBottom > bodyTop) {
        const sx = local * 46;
        ctx.save();
        ctx.globalAlpha = alpha * 0.96;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(image, sx, 0, 46, 48, x - 23, bodyTop, 46, bodyBottom - bodyTop);
        ctx.restore();
      }
      drawSheetCell(image, 4 + local, 4, 46, 48, x, tailY, 46, 48, alpha);
    }

    function drawHoldCoverForLane(lane, t, x, y) {
      const active = (state.chart?.notes || []).find(note => note.lane === lane && note.side === "player" && note.hit && !note.holdDone && note.sLen > 0 && t <= note.time + note.sLen + 0.03);
      if (!active) return;
      const definition = SNOW.notes?.holdCover?.lanes?.[String(lane % 4)] || SNOW.notes?.holdCover?.lanes?.[lane % 4];
      const frames = definition?.holding;
      if (!frames?.length) return;
      const frame = frames[Math.floor(Math.max(0, t - active.time) * 24) % frames.length];
      const image = scene.images.holdCover;
      if (!imageReady(image)) return;
      const fw = Number(frame.fw || frame.w || 66);
      const fh = Number(frame.fh || frame.h || 24);
      drawAtlasTopLeft(image, frame, x - fw * 0.5 - 5, y - fh * 0.5 - 20, 1, 1, false);
    }

    function drawSnowedInHud(t) {
      if (!state.playing && !scene.dialogueActive) return;
      const bgImage = scene.images.barBg;
      const oppImage = scene.images.barOpp;
      const playerImage = scene.images.barPlayer;
      const pointer = scene.images.pointer;
      if (!imageReady(bgImage) || !imageReady(oppImage) || !imageReady(playerImage)) return;
      const viewportOffset = (canvas.width - SOURCE_W) * 0.5;
      const x = viewportOffset + 15;
      const y = canvas.height - bgImage.naturalHeight - 10;
      const barX = x + 27;
      const barY = y + 15;
      const barW = oppImage.naturalWidth;
      const barH = oppImage.naturalHeight;
      const health = clamp01(state.health);
      const splitX = barX + barW * (1 - health);
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(bgImage, Math.round(x), Math.round(y));
      ctx.drawImage(oppImage, Math.round(barX), Math.round(barY));
      ctx.save();
      ctx.beginPath();
      ctx.rect(splitX, barY, Math.max(0, barX + barW - splitX), barH);
      ctx.clip();
      ctx.drawImage(playerImage, Math.round(barX), Math.round(barY));
      ctx.restore();
      if (imageReady(pointer)) ctx.drawImage(pointer, Math.round(splitX - pointer.naturalWidth * 0.5), Math.round(y + 3));
      ctx.fillStyle = "#fff";
      ctx.font = "700 18px Consolas, monospace";
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.shadowColor = "#000";
      ctx.shadowBlur = 3;
      ctx.fillText(formatTime(Math.max(0, totalTime() - t)), x + 8, y - 8);
      ctx.fillText(Number(state.stats?.player?.score || 0).toLocaleString(), x + bgImage.naturalWidth + 12, y + 42);
      ctx.restore();
    }

    isImportedSong = song => isSnowedIn(song) || baseIsImportedSong(song);

    makeChart = function(song) {
      if (!isSnowedIn(song)) return baseMakeChart(song);
      return {
        ...clone(SNOW.chart),
        notes: clone(SNOW.chart.notes || []),
        timeline: clone(SNOW.chart.timeline || []),
        events: clone(SNOW.chart.events || [])
      };
    };

    stopExternalAudio = function() {
      const leakedInst = state.audio.inst === state.audio.snowedInInst;
      const leakedVoices = state.audio.voices === state.audio.snowedInVoices;
      baseStopExternalAudio();
      [state.audio.snowedInInst, state.audio.snowedInVoices].forEach(track => {
        if (!track) return;
        try {
          track.pause();
          track.currentTime = 0;
        } catch {}
      });
      if (leakedInst) state.audio.inst = null;
      if (leakedVoices) state.audio.voices = null;
      if (!isSnowedIn(state.currentSong)) document.body.classList.remove("snowed-in-active");
    };

    songTime = function() {
      if (isSnowedIn(state.currentSong) && state.audio.snowedInInst) return state.audio.snowedInInst.currentTime;
      return baseSongTime();
    };

    songEndTime = function() {
      if (isSnowedIn(state.currentSong)) return totalTime();
      return baseSongEndTime();
    };

    function resetSceneState(t = 0) {
      state.feeds.player.time = -10;
      state.feeds.opp.time = -10;
      Object.values(state.poses).forEach(pose => {
        if (!pose) return;
        pose.time = -10;
        pose.kind = "hit";
      });
      state.receptorFx.forEach(effect => { effect.time = -10; });
      state.hitGlow.length = 0;
      state.camera = { zoom: 1, focusX: canvas.width / 2, focusY: canvas.height / 2, sideTime: 0, lastSide: "both", highwayX: 0, highwayY: 0 };
      resetParticles(t);
    }

    startSong = function(id = state.selectedSong, options = {}) {
      const song = SONGS[id] || state.currentSong;
      if (!isSnowedIn(song)) {
        closeDialogue(false);
        document.body.classList.remove("snowed-in-active");
        if (state.audio.inst === state.audio.snowedInInst) state.audio.inst = null;
        if (state.audio.voices === state.audio.snowedInVoices) state.audio.voices = null;
        return baseStartSong(id, options);
      }

      const onlineStart = Number(options.startAt);
      const isOnlineStart = Number.isFinite(onlineStart) || options.forceMode === "online";
      if (!isOnlineStart && !options.skipDialogue && !scene.dialogueActive) {
        initAssets();
        state.selectedSong = id;
        state.currentSong = song;
        showDialogue(() => startSong(id, { ...options, skipDialogue: true }));
        return null;
      }

      const audioContext = ensureAudio();
      if (audioContext.state === "suspended") audioContext.resume();
      stopExternalAudio();
      initAssets();
      const [inst, voices] = ensureAudioTracks();
      const skipReload = !!options.skipReload;

      if (state.startTimer) clearTimeout(state.startTimer);
      state.startTimer = null;
      if (state.endTimer) clearTimeout(state.endTimer);
      state.endTimer = null;

      state.selectedSong = id;
      state.currentSong = song;
      state.mode = options.forceMode || (isOnlineStart ? "online" : (ui.versusToggle?.checked ? "versus" : "solo"));
      rebuildKeyMap();
      state.chart = makeChart(song);
      state.chart.notes = state.chart.notes.map((note, index) => ({ ...note, id: note.id == null ? index : note.id }));
      resetStats();
      state.health = 0.65;
      state.playing = true;
      state.songStart = 0;
      state.nextStep = 0;
      state.nextStepTime = 0;
      resetSceneState(0);
      document.body.classList.add("snowed-in-active");

      if (isOnlineStart) {
        const now = typeof serverClockNow === "function" ? serverClockNow() : Date.now();
        state.network.matchStartAt = Number(options.startAt || (now + 8000));
        state.network.pendingStartAt = state.network.matchStartAt;
        state.network.lastTrackSync = 0;
        state.network.ready = { host: false, guest: false };
      }

      ui.songTitle.textContent = song.title;
      ui.songSub.textContent = song.subtitle;
      ui.timer.textContent = `0:00 / ${formatTime(totalTime())}`;
      ui.modeLabel.textContent = state.mode === "versus" ? "1v1 Versus" : state.mode === "online" ? "Online Match" : "Solo Battle";
      ui.statusText.textContent = isOnlineStart ? "Match syncing" : "Snowdin";
      ui.statusSub.textContent = isOnlineStart
        ? "Both players finished loading. The server is holding a synced countdown before audio starts."
        : "Original Gumballs chart, camera events, pixel stage, and custom HUD are active.";
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
      return null;
    };

    refreshHUD = function(t) {
      baseRefreshHUD(t);
      if (!isSnowedIn(state.currentSong)) return;
      ui.timer.textContent = `${formatTime(t)} / ${formatTime(totalTime())}`;
      const event = sourceEventAt(t, "Camera Movement");
      const side = cameraSideForEvent(event);
      ui.statusText.textContent = side === "player" ? "Boyfriend" : "Sans";
      ui.statusSub.textContent = "Snowed In is running the source camera timeline and centered player lane.";
    };

    finish = function(failed = false) {
      if (isSnowedIn(state.currentSong)) {
        [state.audio.snowedInInst, state.audio.snowedInVoices].forEach(track => {
          try { track?.pause(); } catch {}
        });
        document.body.classList.remove("snowed-in-active");
      }
      return baseFinish(failed);
    };

    bg = function(song, t) {
      if (!isSnowedIn(song)) return baseBg(song, t);
      ctx.fillStyle = "#05030b";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    };

    updateCamera = function(t, dt) {
      baseUpdateCamera(t, dt);
      if (!isSnowedIn(state.currentSong)) return;
      state.camera.zoom = 1 + cameraBeatZoom(t);
      state.camera.focusX = canvas.width * 0.5;
      state.camera.focusY = canvas.height * 0.5;
      state.camera.lastSide = cameraSideForEvent(sourceEventAt(t, "Camera Movement"));
      state.camera.highwayX = 0;
      state.camera.highwayY = 0;
    };

    stage = function(t) {
      if (!isSnowedIn(state.currentSong)) return baseStage(t);
      drawSnowdinStage(t);
    };

    receptors = function(t) {
      if (!isSnowedIn(state.currentSong)) return baseReceptors(t);
      initAssets();
      const y = snowReceptorY();
      for (let lane = 4; lane < 8; lane++) drawSnowReceptor(lane, snowLaneX(lane), y, t);
    };

    notes = function(t) {
      if (!isSnowedIn(state.currentSong)) return baseNotes(t);
      if (!state.chart) return;
      const scroll = Number(state.currentSong.scroll || 1012);
      const receptor = snowReceptorY();
      const down = typeof isDownScroll === "function" && isDownScroll();
      for (const note of state.chart.notes) {
        if (note.invisible || note.side !== "player") continue;
        if (note.played && note.hit && (!isHoldNote(note) || note.holdDone)) continue;
        if (note.judged && (!isHoldNote(note) || note.holdDone || !note.hit)) continue;
        const diff = Number(note.time || 0) - t;
        const x = snowLaneX(note.lane);
        const y = receptor + diff * scroll * (down ? -1 : 1);
        const endTime = typeof holdEndTime === "function" ? holdEndTime(note) : note.time + Number(note.sLen || 0);
        const tailY = receptor + (endTime - t) * scroll * (down ? -1 : 1);
        const minY = -140;
        const maxY = canvas.height + 140;
        if (!down && y < minY && tailY < minY) continue;
        if (!down && y > maxY && tailY > maxY) continue;
        if (down && y > maxY && tailY > maxY) continue;
        if (down && y < minY && tailY < minY) continue;
        if (isHoldNote(note)) drawSnowHold(note, note.hit ? receptor : y, tailY, note.hit ? 0.92 : 1, x);
        if (!(note.hit && isHoldNote(note) && t > note.time)) drawSheetCell(scene.images.notes, 4 + (note.lane % 4), 4, 110, 110, x, y, 110, 110, 1);
      }
      for (let lane = 4; lane < 8; lane++) drawHoldCoverForLane(lane, t, snowLaneX(lane), receptor);
    };

    renderScene = function(songT, previewT) {
      const result = baseRenderScene(songT, previewT);
      if (isSnowedIn(state.currentSong)) drawSnowedInHud(state.playing ? songT : 0);
      return result;
    };

    cameraTargets = function() {
      if (isSnowedIn(state.currentSong)) {
        const opp = cameraTargetForSide("opp");
        const player = cameraTargetForSide("player");
        return { oppX: opp.x, playerX: player.x, focusY: (opp.y + player.y) * 0.5 };
      }
      return baseCameraTargets();
    };

    cameraPanProfile = function() {
      if (isSnowedIn(state.currentSong)) return { zoom: 1, bias: 1, hud: 0, hudClamp: 0, speed: 1 };
      return baseCameraPanProfile();
    };

    cameraPoseKeys = function() {
      if (isSnowedIn(state.currentSong)) return { opp: "sans", player: "player" };
      return baseCameraPoseKeys();
    };

    if (typeof syncOnlinePlayback === "function" && typeof expectedOnlineSongTime === "function") {
      const baseSyncOnlinePlayback = syncOnlinePlayback;
      syncOnlinePlayback = function(force = false) {
        const targetTime = expectedOnlineSongTime();
        const result = baseSyncOnlinePlayback(force);
        if (targetTime == null || !isSnowedIn(state.currentSong)) return result;
        const now = typeof serverClockNow === "function" ? serverClockNow() : Date.now();
        const shouldPlay = now + 40 >= Number(state.network?.matchStartAt || 0);
        ensureAudioTracks().forEach((track, index) => {
          if (!track) return;
          if (track.readyState === 0) {
            try { track.load(); } catch {}
          }
          const duration = Number.isFinite(track.duration) && track.duration > 0 ? track.duration : null;
          const desired = Math.max(0, duration == null ? targetTime : Math.min(targetTime, Math.max(0, duration - 0.05)));
          const tolerance = index === 0 ? 0.05 : 0.12;
          if (force || Math.abs(Number(track.currentTime || 0) - desired) > tolerance) {
            try { track.currentTime = desired; } catch {}
          }
          if (shouldPlay) {
            if (track.paused && (duration == null || desired < duration - 0.05)) track.play().catch(() => {});
          } else if (!track.paused) track.pause();
        });
        return targetTime;
      };
    }

    injectStyle();
    renderSongs();
  } catch (error) {
    console.error("Snowed In mode failed to initialize", error);
  }
})();

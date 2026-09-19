(() => {
  try {
    const K = window.KNOCKOUT_DATA;
    if (!K || typeof SONGS === "undefined") return;

    const SONG_ID = "knockout";
    const SOURCE = "knockout";
    const W = 1280;
    const H = 720;
    const DIR_ANIM = ["singLEFT", "singDOWN", "singUP", "singRIGHT"];
    const NOTE_X = { opp: [92, 204, 316, 428], player: [732, 844, 956, 1068] };
    const NOTE_SCROLL = 450 * Number(K.chart.speed || 2.8);
    const NOTE_SCALE = 108 / 155;
    const NOTE_CENTER = { x: 54, y: 158 * NOTE_SCALE / 2 };
    const PARRY_SCALE = 107 / 154;
    const PARRY_CENTER = { x: 53.5, y: 157 * PARRY_SCALE / 2 };
    const NOTE_COLORS = ["#d47bff", "#55c8ff", "#55f59a", "#ff5b69"];
    const MUGMAN_WALK = 1145 * K.chart.spb / 4;
    const MUGMAN_KO_SOUND = 1165 * K.chart.spb / 4;
    const MUGMAN_DEAD = 1168 * K.chart.spb / 4;

    SONGS[SONG_ID] = {
      title: K.meta.title || "Knockout",
      subtitle: K.meta.subtitle || "Indie Cross Cuphead source port",
      diff: "Standard (Original Chart)",
      tempo: Number(K.meta.bpm || 136),
      root: 41,
      scale: [0, 2, 3, 5, 7, 8, 10],
      prog: [0, 5, 3, 6],
      scroll: NOTE_SCROLL,
      seed: 73,
      introBeats: 0,
      outroBeats: 2,
      palette: ["#071421", "#123348", "#39768b", "#03070b", "#d9f8ff", "#ee3344"],
      blurb: "The supplied Knockout standard chart, split audio, Cuphead rain stage, source characters and arrows, parry card, Shift attack, Space dodge, projectile events, Mugman knockout beat, custom HUD, and official bloom/chromatic shaders.",
      chartSource: SOURCE
    };
    if (typeof NEW_SONGS !== "undefined" && NEW_SONGS?.add) NEW_SONGS.add(SONG_ID);

    const ko = {
      initialized: false,
      images: {},
      sounds: {},
      eventIndex: 0,
      lastTime: -1,
      camera: { x: 527, y: 382.25, zoom: 0.52 },
      mechanics: null,
      warmCanvas: document.createElement("canvas"),
      warmCtx: null,
      warmed: false,
      introSoundPlayed: false,
      mugmanKoPlayed: false,
      mugmanHurtPlayed: false
    };
    ko.warmCanvas.width = 256;
    ko.warmCanvas.height = 144;
    ko.warmCtx = ko.warmCanvas.getContext("2d");

    const baseIsImportedSong = isImportedSong;
    const baseMakeChart = makeChart;
    const baseStopExternalAudio = stopExternalAudio;
    const baseSongTime = songTime;
    const baseSongEndTime = songEndTime;
    const baseStartSong = startSong;
    const baseFinish = finish;
    const baseRefreshHUD = refreshHUD;
    const baseBg = bg;
    const baseStage = stage;
    const baseReceptors = receptors;
    const baseNotes = notes;
    const baseRenderScene = renderScene;
    const baseUpdateCamera = updateCamera;
    const baseJudge = judge;
    const baseHandleMisses = handleMisses;
    const baseApplyDustinBloom = typeof applyDustinBloom === "function" ? applyDustinBloom : null;

    const clamp01 = value => Math.max(0, Math.min(1, Number(value || 0)));
    const clampValue = (value, min, max) => Math.max(min, Math.min(max, Number(value || 0)));
    const lerp = (a, b, amount) => Number(a || 0) + (Number(b || 0) - Number(a || 0)) * clamp01(amount);
    const easeInOutSine = value => -(Math.cos(Math.PI * clamp01(value)) - 1) / 2;
    const isKnockout = song => !!song && song.chartSource === SOURCE;
    const imageReady = image => !!(image && image.complete && image.naturalWidth);

    function injectStyle() {
      if (document.getElementById("knockoutStyle")) return;
      const style = document.createElement("style");
      style.id = "knockoutStyle";
      style.textContent = `
        @font-face { font-family: KnockoutCup; src: url("assets/knockout/ui/cuphead.ttf") format("truetype"); font-display: swap; }
        body.knockout-active .hud .top,
        body.knockout-active .hud .bottom,
        body.knockout-active #judgments { opacity: 0 !important; pointer-events: none !important; }
      `;
      document.head.appendChild(style);
    }

    function loadImage(key, src) {
      if (!src || ko.images[key]) return;
      const image = new Image();
      image.decoding = "async";
      image.loading = "eager";
      image.src = src;
      ko.images[key] = image;
    }

    function addSound(key, src, count = 2) {
      if (!src || ko.sounds[key]) return;
      ko.sounds[key] = Array.from({ length: count }, () => {
        const audio = new Audio(src);
        audio.preload = "auto";
        audio.volume = 0.82;
        try { audio.load(); } catch {}
        return audio;
      });
    }

    function initAssets() {
      if (ko.initialized) return;
      ko.initialized = true;
      injectStyle();
      Object.entries(K.stage.images || {}).forEach(([key, src]) => loadImage(key, src));
      Object.entries(K.animations.weapons || {}).forEach(([key, item]) => loadImage(`weapon-${key}`, item.image));
      addSound("intro0", K.sounds.intro0, 1);
      addSound("intro1", K.sounds.intro1, 1);
      addSound("attack", K.sounds.attack, 2);
      addSound("hurt", K.sounds.hurt, 3);
      addSound("parry", K.sounds.parry, 3);
      addSound("exAttack", K.sounds.exAttack, 2);
      addSound("cupHurt", K.sounds.cupHurt, 2);
      addSound("knockout", K.sounds.knockout, 1);
      addSound("shoot", K.sounds.shoot, 3);
      (K.sounds.pea || []).forEach((src, i) => addSound(`pea${i}`, src, 1));
      (K.sounds.chaser || []).forEach((src, i) => addSound(`chaser${i}`, src, 1));
      warmAssets();
    }

    async function warmAssets() {
      if (ko.warmed) return;
      ko.warmed = true;
      for (const image of Object.values(ko.images)) {
        try { if (typeof image.decode === "function") await image.decode(); } catch {}
        if (imageReady(image) && ko.warmCtx) {
          try {
            ko.warmCtx.clearRect(0, 0, 256, 144);
            ko.warmCtx.drawImage(image, 0, 0, 256, 144);
          } catch {}
        }
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      if (!window.PERFORMANCE_MODE && !state?.settings?.performance) {
        try { window.FNF_WEBGL?.warmKnockoutPostStack?.(); } catch {}
      }
    }

    function playSound(key, volume = 0.82) {
      const pool = ko.sounds[key];
      if (!pool?.length) return;
      const audio = pool.find(item => item.paused || item.ended) || pool[0];
      try {
        audio.pause();
        audio.currentTime = 0;
        audio.volume = volume;
        audio.play().catch(() => {});
      } catch {}
    }

    function ensureAudioTracks() {
      if (!state.audio.knockoutInst) {
        state.audio.knockoutInst = new Audio(K.audio.inst);
        state.audio.knockoutInst.preload = "auto";
        state.audio.knockoutInst.volume = 0.94;
      }
      if (!state.audio.knockoutVoices) {
        state.audio.knockoutVoices = new Audio(K.audio.voices);
        state.audio.knockoutVoices.preload = "auto";
        state.audio.knockoutVoices.volume = 0.9;
      }
      return [state.audio.knockoutInst, state.audio.knockoutVoices];
    }

    window.ensureKnockoutAudio = ensureAudioTracks;
    window.prepareKnockoutOnlineStart = function() {
      initAssets();
      const tracks = ensureAudioTracks();
      tracks.forEach(track => {
        try { track.pause(); track.currentTime = 0; track.load(); } catch {}
      });
      return tracks;
    };

    function cloneChart() {
      return {
        ...K.chart,
        notes: K.chart.notes.map((note, id) => ({ ...note, id })),
        timeline: (K.chart.timeline || []).map(section => ({ ...section })),
        events: (K.events || []).map(event => ({ ...event }))
      };
    }

    function resetMechanics() {
      ko.eventIndex = 0;
      ko.lastTime = -1;
      ko.camera = { x: 527, y: 382.25, zoom: 0.52 };
      ko.introSoundPlayed = false;
      ko.mugmanKoPlayed = false;
      ko.mugmanHurtPlayed = false;
      ko.mechanics = {
        bullets: [],
        deaths: [],
        peaActive: false,
        chaserActive: false,
        restoreChaserAt: -1,
        cardProgress: 0,
        hasCard: false,
        cardAnim: "",
        cardAnimStart: -10,
        bfSpecial: null,
        cupSpecial: null,
        specialShot: null,
        lastPeaShot: -10,
        chromPulse: 0,
        dodged: false,
        dodgeWindow: null,
        nextBulletId: 1
      };
    }

    function frameFor(animation, elapsed, forceLoop) {
      if (!animation?.frames?.length) return null;
      return frameFromList(animation.frames, Math.max(0, elapsed), Number(animation.fps || 24), forceLoop == null ? !!animation.loop : !!forceLoop);
    }

    function drawAtlasTop(image, frame, x, y, scale, alpha = 1, flipX = false) {
      if (!imageReady(image) || !frame) return;
      const fw = frame.fw || frame.w;
      const fx = frame.fx || 0;
      const fy = frame.fy || 0;
      ctx.save();
      ctx.globalAlpha = alpha;
      if (flipX) {
        ctx.translate(x + fw * scale, y);
        ctx.scale(-1, 1);
        drawAtlasSub(image, frame, -fx * scale, -fy * scale, scale);
      } else {
        drawAtlasSub(image, frame, x - fx * scale, y - fy * scale, scale);
      }
      ctx.restore();
    }

    function drawAtlasCenteredLocal(image, frame, x, y, scale, alpha = 1, flipX = false) {
      if (!imageReady(image) || !frame) return;
      const fw = frame.fw || frame.w;
      const fh = frame.fh || frame.h;
      const fx = frame.fx || 0;
      const fy = frame.fy || 0;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(x, y);
      if (flipX) ctx.scale(-1, 1);
      drawAtlasSub(image, frame, -fw * scale / 2 - fx * scale, -fh * scale / 2 - fy * scale, scale);
      ctx.restore();
    }

    function worldPointWithScroll(x, y, scroll = 1) {
      const cameraScrollX = ko.camera.x - W / 2;
      const cameraScrollY = ko.camera.y - H / 2;
      return {
        x: W / 2 + (x - cameraScrollX * scroll - W / 2) * ko.camera.zoom,
        y: H / 2 + (y - cameraScrollY * scroll - H / 2) * ko.camera.zoom
      };
    }

    function stageLayer(key, x, y, scaleX, scaleY, scroll, alpha = 1, blend = "source-over") {
      const image = ko.images[key];
      if (!imageReady(image)) return;
      const point = worldPointWithScroll(x, y, scroll);
      const width = image.naturalWidth * scaleX * ko.camera.zoom;
      const height = image.naturalHeight * scaleY * ko.camera.zoom;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.globalCompositeOperation = blend;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(image, point.x, point.y, width, height);
      ctx.restore();
    }

    function worldPoint(x, y) {
      return {
        x: W / 2 + (x - ko.camera.x) * ko.camera.zoom,
        y: H / 2 + (y - ko.camera.y) * ko.camera.zoom
      };
    }

    function poseAge(key) {
      const poseInfo = state.poses[key];
      return performance.now() / 1000 - Number(poseInfo?.time || -10);
    }

    function activeCharacterAnimation(kind, t) {
      const mechanic = ko.mechanics;
      const sprite = kind === "bf" ? K.sprites.boyfriend : K.sprites.cuphead;
      const special = kind === "bf" ? mechanic?.bfSpecial : mechanic?.cupSpecial;
      if (special && t >= special.start && t < special.end && sprite.animations[special.name]) {
        return { animation: sprite.animations[special.name], name: special.name, elapsed: t - special.start, loop: !!special.loop };
      }
      const poseKey = kind === "bf" ? "knockoutBf" : "knockoutCuphead";
      const poseInfo = state.poses[poseKey] || { lane: 1, time: -10, kind: "hit" };
      const held = activeHoldNoteForCharacter(poseKey, t);
      const age = held ? Math.max(0, t - held.time) : poseAge(poseKey);
      const lane = Number((held ? held.lane : poseInfo.lane) || 0) % 4;
      let name = DIR_ANIM[lane];
      if (kind === "cup" && poseInfo.alt) name += "-alt";
      if (poseInfo.kind === "miss" && sprite.animations[`${name}miss`]) name += "miss";
      const singing = sprite.animations[name];
      const duration = Math.max(0.24, Number(sprite.singDuration || 4) * K.chart.spb / 4);
      if (singing && (held || (age >= 0 && age < duration))) return { animation: singing, name, elapsed: age, loop: false };
      if (kind === "cup" && mechanic?.peaActive && sprite.animations.shotting) {
        return { animation: sprite.animations.shotting, name: "shotting", elapsed: t - mechanic.lastPeaShot, loop: true };
      }
      return { animation: sprite.animations.idle, name: "idle", elapsed: t, loop: true };
    }

    function drawCharacter(kind, t) {
      const sprite = kind === "bf" ? K.sprites.boyfriend : K.sprites.cuphead;
      const image = ko.images[kind === "bf" ? "boyfriend" : "cuphead"];
      const pose = activeCharacterAnimation(kind, t);
      const frame = frameFor(pose.animation, pose.elapsed, pose.loop);
      if (!frame) return;
      const base = kind === "bf" ? K.stage.boyfriend : K.stage.opponent;
      const worldX = Number(base[0]) + Number(sprite.position[0]);
      const worldY = Number(base[1]) + Number(sprite.position[1]);
      const point = worldPoint(worldX, worldY);
      const scale = Number(sprite.scale || 1) * ko.camera.zoom;
      const offsets = pose.animation.offsets || [0, 0];
      const baseWidth = Number(sprite.baseFrameSize?.[0] || frame.fw || frame.w);
      const baseHeight = Number(sprite.baseFrameSize?.[1] || frame.fh || frame.h);
      const sourceScale = Number(sprite.scale || 1);
      const topX = point.x + (baseWidth * 0.5 * (1 - sourceScale) - Number(offsets[0] || 0)) * ko.camera.zoom;
      const topY = point.y + (baseHeight * 0.5 * (1 - sourceScale) - Number(offsets[1] || 0)) * ko.camera.zoom;
      drawAtlasTop(image, frame, topX, topY, scale, 1, kind === "bf" ? !sprite.flipX : !!sprite.flipX);
    }

    function hash(value) {
      const raw = Math.sin(value * 12.9898 + 73.17) * 43758.5453;
      return raw - Math.floor(raw);
    }

    function lightningAt(t) {
      const beat = Math.floor(t / K.chart.spb);
      for (let candidate = beat; candidate >= Math.max(0, beat - 1); candidate -= 1) {
        const start = candidate * K.chart.spb;
        if (hash(candidate) > 0.9 && t >= start && t < start + 0.4) return t - start;
      }
      return -1;
    }

    function drawSmoke(t) {
      const image = ko.images.stageSmoke;
      if (!imageReady(image)) return;
      for (let i = 0; i < 5; i += 1) {
        const seed = i * 17 + 4;
        const speed = 300 + hash(seed) * 200;
        const period = 3200 / speed;
        const phase = (t / period + hash(seed + 1)) % 1;
        const x = -1200 + phase * 3400;
        const y = -100 + hash(seed + 2) * 800;
        const scale = 3 + hash(seed + 3) * 2;
        const alpha = 0.2 + hash(seed + 4) * 0.4;
        const point = worldPointWithScroll(
          x + image.naturalWidth * (1 - scale) / 2,
          y + image.naturalHeight * (1 - scale) / 2,
          1
        );
        const width = image.naturalWidth * scale * ko.camera.zoom;
        const height = image.naturalHeight * scale * ko.camera.zoom;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.drawImage(image, point.x, point.y, width, height);
        ctx.restore();
      }
    }

    function drawRain(t) {
      const rain = ko.images.stageRain;
      if (imageReady(rain)) {
        const stepTime = K.chart.spb / 4;
        const currentStep = Math.floor(t / stepTime);
        const oldestStep = Math.max(0, currentStep - Math.ceil(0.6 / stepTime));
        ctx.save();
        ctx.imageSmoothingEnabled = false;
        for (let step = oldestStep; step <= currentStep; step += 1) {
          const age = t - step * stepTime;
          if (age < 0 || age > 0.6) continue;
          for (let index = 0; index < 20; index += 1) {
            const seed = step * 20 + index;
            const startX = -500 + hash(seed + 8) * 3400;
            const startY = -200 + hash(seed + 17) * 400;
            const x = startX - 400 * Math.min(1, age / 0.4);
            const y = startY + (2800 - startY) * (age / 0.6);
            const scale = hash(seed + 31) > 0.5 ? 1 : 0.5;
            const point = worldPoint(x, y);
            ctx.globalAlpha = 0.5;
            ctx.drawImage(rain, point.x, point.y, rain.naturalWidth * scale * ko.camera.zoom, rain.naturalHeight * scale * ko.camera.zoom);
          }
        }
        ctx.restore();
      }
      const animation = K.animations.rainCover;
      const frame = frameFor(animation, t, true);
      if (frame) drawAtlasCenteredLocal(ko.images.rainCover, frame, W / 2, H / 2, Math.max(W / (frame.fw || frame.w), H / (frame.fh || frame.h)), 0.22);
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      ctx.globalAlpha = 0.1;
      ctx.fillStyle = "#006391";
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }

    function drawMugman(t) {
      if (t < MUGMAN_WALK) return;
      const dead = t >= MUGMAN_DEAD;
      const animation = dead ? K.sprites.mugman.dead : K.sprites.mugman.walking;
      const frame = frameFor(animation, t - (dead ? MUGMAN_DEAD : MUGMAN_WALK), false);
      if (!frame) return;
      const point = worldPoint(1300, 430);
      drawAtlasTop(ko.images.mugman, frame, point.x, point.y, ko.camera.zoom, 1, false);
    }

    function drawWorld(t) {
      ctx.fillStyle = "#09131e";
      ctx.fillRect(0, 0, W, H);
      stageLayer("stageBack", -704, -396, 2.8, 2.8, 0.1);
      stageLayer("stageWorld", 355, 349, 1, 0.6, 0.1);
      const flashAge = lightningAt(t);
      if (flashAge >= 0) {
        const animation = K.animations.lightning;
        const frame = frameFor(animation, flashAge, false);
        if (frame) {
          const sourceFrame = K.animations.lightning.frames[0];
          const sourceWidth = Number(sourceFrame?.fw || sourceFrame?.w || 0);
          const sourceHeight = Number(sourceFrame?.fh || sourceFrame?.h || 0);
          const point = worldPointWithScroll((W - sourceWidth) / 2 + 90, (H - sourceHeight) / 2 - 140, 0.1);
          drawAtlasTop(ko.images.lightning, frame, point.x, point.y, ko.camera.zoom, 0.92 * (1 - flashAge / 0.4));
        }
      }
      stageLayer("stageHouse", 684, 172, 1, 1, 0.15);
      stageLayer("stageTree", 235.9, 50.6, 2.6, 2.6, 0.27);
      stageLayer("stageMid", -722, -272, 2.9, 2.6, 0.3);
      drawSmoke(t);
      stageLayer("stageMoon", -198.5, -677, 3, 3, 0.1, 0.92, "screen");
      stageLayer("stageFront", -768, -755, 3.1, 3.5, 1);
      drawBullets(t, "behind");
      drawCharacter("cup", t);
      drawMugman(t);
      drawCharacter("bf", t);
      drawBullets(t, "front");
      drawRain(t);
    }

    function currentSection(t) {
      const list = state.chart?.timeline || K.chart.timeline;
      return list.find(section => t >= section.startTime && t < section.endTime) || list[list.length - 1];
    }

    function activeSide(t) {
      const section = currentSection(t);
      return section?.gfSection ? "both" : section?.mustHitSection ? "player" : "opp";
    }

    function characterCameraTarget(kind) {
      const sprite = kind === "bf" ? K.sprites.boyfriend : K.sprites.cuphead;
      const base = kind === "bf" ? K.stage.boyfriend : K.stage.opponent;
      const x = Number(base[0]) + Number(sprite.position[0]);
      const y = Number(base[1]) + Number(sprite.position[1]);
      const width = Number(sprite.baseFrameSize?.[0] || 0) * Number(sprite.scale || 1);
      const height = Number(sprite.baseFrameSize?.[1] || 0) * Number(sprite.scale || 1);
      if (kind === "bf") {
        return {
          x: x + width / 2 - 100 - Number(sprite.cameraPosition?.[0] || 0),
          y: y + height / 2 - 100 + Number(sprite.cameraPosition?.[1] || 0)
        };
      }
      return {
        x: x + width / 2 + 150 + Number(sprite.cameraPosition?.[0] || 0),
        y: y + height / 2 - 100 + Number(sprite.cameraPosition?.[1] || 0)
      };
    }

    function cameraEventState(t) {
      let zoom = 0.52;
      let follow = null;
      let beatInterval = 0;
      let advanced = null;
      for (const event of K.events) {
        if (event.time > t) break;
        const name = event.name.toLowerCase();
        if (name === "camerazoom") zoom = Number(event.value1) || zoom;
        else if (name === "cameramusicbeatzoom") beatInterval = Number(event.value1) || 0;
        else if (name === "camera follow pos") {
          const x = Number(event.value1);
          const y = Number(event.value2);
          follow = Number.isFinite(x) && Number.isFinite(y) && event.value1 !== "" && event.value2 !== "" ? { x, y } : null;
        } else if (name === "camerazoom(advanced)") {
          const target = Number(event.value1);
          const pieces = String(event.value2 || "").split(",");
          const duration = Math.max(0.01, Number(pieces[0]) || 0.5);
          advanced = { start: event.time, end: event.time + duration, from: zoom, to: Number.isFinite(target) ? target : zoom };
          if (t >= advanced.end) zoom = advanced.to;
        }
      }
      if (advanced && t < advanced.end) zoom = lerp(advanced.from, advanced.to, easeInOutSine((t - advanced.start) / (advanced.end - advanced.start)));
      if (beatInterval > 0) {
        const beat = t / K.chart.spb;
        const beatIndex = Math.floor(beat);
        if (beatIndex % beatInterval === 0) zoom += 0.015 * Math.max(0, 1 - (beat - beatIndex) * 5);
      }
      for (const event of K.events) {
        if (event.time > t) break;
        const age = t - event.time;
        const name = event.name.toLowerCase();
        if (name === "peashooterex" && age >= 0 && age < 1.05) {
          follow = age < 0.55 ? { x: 350, y: 450 } : { x: 900, y: 390 };
          zoom = age < 0.55 ? 0.6 : 0.52;
        } else if (name === "roundaboutex" && age >= 0 && age < 0.8) {
          follow = age < 0.5 ? { x: 350, y: 450 } : { x: 900, y: 390 };
          zoom = age < 0.5 ? 0.6 : 0.52;
        }
      }
      return { zoom, follow };
    }

    function updateKnockoutCamera(t, dt) {
      const side = activeSide(t);
      const event = cameraEventState(t);
      const opponent = characterCameraTarget("cup");
      const player = characterCameraTarget("bf");
      const base = event.follow || (side === "player" ? player : side === "opp" ? opponent : { x: (opponent.x + player.x) / 2, y: (opponent.y + player.y) / 2 });
      const amount = t < 0.08 || ko.lastTime < 0 ? 1 : 1 - Math.pow(0.96, Math.max(0.001, dt) * 60 * Number(K.stage.cameraSpeed || 1));
      ko.camera.x = lerp(ko.camera.x, base.x, amount);
      ko.camera.y = lerp(ko.camera.y, base.y, amount);
      ko.camera.zoom = lerp(ko.camera.zoom, event.zoom, 1 - Math.exp(-Math.max(0.001, dt) * 3.125));
      state.camera.zoom = 1;
      state.camera.focusX = W / 2 + (side === "player" ? 110 : side === "opp" ? -110 : 0);
      state.camera.focusY = H * 0.5;
      state.camera.lastSide = side;
      state.camera.highwayX = 0;
      state.camera.highwayY = 0;
    }

    function spawnBullet(type, direction = 0, startTime = songTime()) {
      const mechanic = ko.mechanics;
      if (!mechanic) return;
      const baseY = 540;
      let bullet;
      if (type === "pea") bullet = { type, x: 300, startX: 300, y: baseY - 10 + hash(mechanic.nextBulletId) * 20, vx: 2000, start: startTime, key: "pea" };
      else if (type === "chaser") {
        const xs = [290, 300, 200, 400];
        const ys = [20, 40, -40, 40];
        const startX = 40 + xs[direction % 4];
        bullet = { type, x: startX, startX, y: baseY + ys[direction % 4], vx: 1200, start: startTime, key: "chaser" };
      } else if (type === "peaEx") bullet = { type, x: 40, startX: 40, y: baseY, vx: startTime >= 127 && startTime <= 131 ? 1540 : 1400, start: startTime, key: "peaEx" };
      else bullet = { type: "roundEx", x: 240, y: baseY, vx: 0, start: startTime, key: "roundEx", originX: 240, returning: false, returnChecked: false };
      bullet.id = mechanic.nextBulletId++;
      mechanic.bullets.push(bullet);
      if (type === "pea") playSound(`pea${bullet.id % 6}`, 0.42);
      else if (type === "chaser") playSound(`chaser${bullet.id % 5}`, 0.48);
      else playSound("shoot", 0.72);
    }

    function spawnDeath(bullet, t) {
      const mechanic = ko.mechanics;
      const key = bullet.type === "pea" ? "peaDeath" : bullet.type === "chaser" ? "chaserDeath" : bullet.type === "peaEx" ? "peaExDeath" : "roundExDeath";
      const source = K.animations.weapons[bullet.key];
      const first = source?.fly?.frames?.[0];
      const scale = Number(source?.scale || 1);
      const centerX = bullet.x + Number(first?.fw || first?.w || 0) * scale / 2;
      const centerY = bullet.y + Number(first?.fh || first?.h || 0) * scale / 2;
      const offset = bullet.type === "pea" ? [-100, -140] : bullet.type === "chaser" ? [-25, -20] : bullet.type === "peaEx" ? [-200, -250] : [-250, -200];
      mechanic.deaths.push({ key, x: centerX + offset[0], y: centerY + offset[1], start: t });
      if (bullet.type === "pea") state.health = clampValue(state.health - 0.05, 0, 1);
      if (bullet.type === "chaser") state.health = clampValue(state.health - 0.005, 0, 1);
    }

    function drawWeaponSprite(key, x, y, elapsed, alpha = 1) {
      const definition = K.animations.weapons[key];
      const image = ko.images[`weapon-${key}`];
      const frame = frameFor(definition?.fly, elapsed, definition?.fly?.loop);
      if (!frame) return;
      const point = worldPoint(x, y);
      drawAtlasTop(image, frame, point.x, point.y, Number(definition.scale || 1) * ko.camera.zoom, alpha);
    }

    function drawBullets(t, layer = "front") {
      const mechanic = ko.mechanics;
      if (!mechanic) return;
      for (const bullet of mechanic.bullets) {
        const behindCharacters = bullet.type === "roundEx" && !bullet.returning;
        if ((layer === "behind") !== behindCharacters) continue;
        drawWeaponSprite(bullet.key, bullet.x, bullet.y, t - bullet.start);
      }
      if (layer === "front") {
        for (const death of mechanic.deaths) drawWeaponSprite(death.key, death.x, death.y, t - death.start, Math.max(0, 1 - (t - death.start) / 0.32));
      }
    }

    function startSpecial(type, eventTime) {
      const mechanic = ko.mechanics;
      if (!mechanic || mechanic.specialShot) return;
      mechanic.peaActive = false;
      mechanic.chaserActive = false;
      mechanic.specialShot = { type, start: eventTime, shotAt: eventTime + (type === "peaEx" ? 0.55 : 0.5), checkAt: eventTime + 0.9, end: eventTime + (type === "peaEx" ? 1.8 : 2), spawned: false, checked: false };
      mechanic.cupSpecial = { name: "big shot", start: eventTime, end: eventTime + 1.8, loop: false };
      mechanic.dodgeWindow = { start: eventTime + 0.45, end: eventTime + 0.9, source: "special" };
      mechanic.dodged = false;
      playSound("exAttack", 0.9);
    }

    function useAttack(t) {
      const mechanic = ko.mechanics;
      if (!mechanic?.hasCard || mechanic.specialShot || (mechanic.bfSpecial && t < mechanic.bfSpecial.end)) return false;
      mechanic.hasCard = false;
      mechanic.cardProgress = 0;
      mechanic.cardAnim = "used";
      mechanic.cardAnimStart = t;
      mechanic.bfSpecial = { name: "attack", start: t, end: t + 1.4, loop: false };
      mechanic.peaActive = false;
      const restore = mechanic.chaserActive;
      mechanic.chaserActive = false;
      mechanic.restoreChaserAt = restore ? t + 0.5 : -1;
      mechanic.cupSpecial = { name: "hurt", start: t + 0.4, end: t + 1.1, loop: false };
      mechanic.chromPulse = 1;
      state.health = clampValue(state.health + 0.3, 0, 1);
      playSound("attack", 0.9);
      setTimeout(() => playSound("hurt", 0.76), 400);
      return true;
    }

    function tryDodge(t) {
      const mechanic = ko.mechanics;
      if (!mechanic?.dodgeWindow || t < mechanic.dodgeWindow.start - 0.08 || t > mechanic.dodgeWindow.end) return false;
      mechanic.dodged = true;
      mechanic.bfSpecial = { name: "dodge", start: t, end: t + 0.62, loop: false };
      return true;
    }

    function handleEvent(event, currentTime) {
      const mechanic = ko.mechanics;
      const name = event.name.toLowerCase();
      if (name === "peashooter") {
        if (!mechanic.chaserActive && !mechanic.specialShot) {
          mechanic.peaActive = true;
          mechanic.lastPeaShot = Math.max(event.time - 0.2, currentTime - 0.2);
          mechanic.cupSpecial = { name: "pre_shotting", start: event.time, end: event.time + 0.2, loop: false };
        }
      } else if (name === "chaser") {
        mechanic.peaActive = false;
        mechanic.chaserActive = String(event.value1).toLowerCase() === "true";
      } else if (name === "peashooterex" && currentTime - event.time < 2.1) startSpecial("peaEx", event.time);
      else if (name === "roundaboutex" && currentTime - event.time < 2.3) startSpecial("roundEx", event.time);
    }

    function updateMechanics(t, dt) {
      const mechanic = ko.mechanics;
      if (!mechanic) return;
      if (t + 0.1 < ko.lastTime) {
        resetMechanics();
        for (const note of state.chart?.notes || []) delete note._knockoutHandled;
      }
      while (ko.eventIndex < K.events.length && K.events[ko.eventIndex].time <= t) {
        handleEvent(K.events[ko.eventIndex], t);
        ko.eventIndex += 1;
      }
      if (!ko.introSoundPlayed && t >= 0.3) {
        ko.introSoundPlayed = true;
        playSound(hash(Date.now()) > 0.5 ? "intro1" : "intro0", 0.86);
      }
      if (!ko.mugmanKoPlayed && t >= MUGMAN_KO_SOUND) {
        ko.mugmanKoPlayed = true;
        playSound("knockout", 0.86);
      }
      if (!ko.mugmanHurtPlayed && t >= MUGMAN_DEAD) {
        ko.mugmanHurtPlayed = true;
        playSound("cupHurt", 0.8);
      }
      if (mechanic.restoreChaserAt > 0 && t >= mechanic.restoreChaserAt) {
        mechanic.chaserActive = true;
        mechanic.restoreChaserAt = -1;
      }
      if (mechanic.peaActive) {
        while (t - mechanic.lastPeaShot >= 0.2) {
          mechanic.lastPeaShot += 0.2;
          spawnBullet("pea", 0, mechanic.lastPeaShot);
        }
      }
      if (state.settings?.autoPlayer && mechanic.peaActive && mechanic.hasCard) useAttack(t);
      const shot = mechanic.specialShot;
      if (shot) {
        if (!shot.spawned && t >= shot.shotAt) {
          shot.spawned = true;
          spawnBullet(shot.type, 0, shot.shotAt);
        }
        if (!shot.checked && t >= shot.checkAt) {
          shot.checked = true;
          if (mechanic.dodgeWindow?.source === "special") mechanic.dodgeWindow = null;
          if (!mechanic.dodged) {
            mechanic.bfSpecial = { name: "hurt", start: t, end: t + 0.72, loop: false };
            state.health = clampValue(state.health - 0.5, 0, 1);
            playSound("hurt", 0.88);
          }
        }
        if (t >= shot.end) {
          mechanic.specialShot = null;
          mechanic.cupSpecial = null;
          if (mechanic.dodgeWindow?.source === "special") mechanic.dodgeWindow = null;
        }
      }
      for (let index = mechanic.bullets.length - 1; index >= 0; index -= 1) {
        const bullet = mechanic.bullets[index];
        if (bullet.type === "roundEx") {
          const age = t - bullet.start;
          if (age <= 1.2) bullet.x = bullet.originX + 1600 * (1 - Math.pow(1 - clamp01(age / 1.2), 2));
          else {
            bullet.x = bullet.originX + 1600 * (1 - Math.pow(clamp01((age - 1.2) / 1), 2));
            if (!bullet.returning) {
              bullet.returning = true;
              bullet.returnCheckAt = bullet.start + 1.7;
              mechanic.dodgeWindow = { start: bullet.start + 1.2, end: bullet.returnCheckAt, source: "round-return", bulletId: bullet.id };
              mechanic.dodged = false;
            }
            if (!bullet.returnChecked && t >= bullet.returnCheckAt) {
              bullet.returnChecked = true;
              if (mechanic.dodgeWindow?.source === "round-return" && mechanic.dodgeWindow.bulletId === bullet.id) mechanic.dodgeWindow = null;
              if (!mechanic.dodged) {
                mechanic.bfSpecial = { name: "hurt", start: t, end: t + 0.72, loop: false };
                state.health = clampValue(state.health - 0.5, 0, 1);
                playSound("hurt", 0.88);
              }
            }
          }
          if (age > 2.2) {
            spawnDeath(bullet, t);
            mechanic.bullets.splice(index, 1);
          }
          continue;
        }
        bullet.x = bullet.startX + bullet.vx * Math.max(0, t - bullet.start);
        const limit = bullet.type === "peaEx" ? 2200 : 1200;
        if (bullet.x > limit) {
          spawnDeath(bullet, t);
          mechanic.bullets.splice(index, 1);
        }
      }
      mechanic.deaths = mechanic.deaths.filter(death => t - death.start < 0.34);
      mechanic.chromPulse = Math.max(0, mechanic.chromPulse - dt * 10);
      ko.lastTime = t;
    }

    function receptorY() {
      return typeof isDownScroll === "function" && isDownScroll() ? 570 : 50;
    }

    function scrollDirection() {
      return typeof isDownScroll === "function" && isDownScroll() ? -1 : 1;
    }

    function laneX(lane) {
      const side = lane < 4 ? "opp" : "player";
      return NOTE_X[side][lane % 4];
    }

    function noteY(time, t) {
      return receptorY() + (time - t) * NOTE_SCROLL * scrollDirection();
    }

    function drawNoteFrame(image, frame, x, y, scale, alpha = 1, glow = "") {
      if (!frame) return;
      ctx.save();
      ctx.shadowBlur = glow ? 20 : 8;
      ctx.shadowColor = glow || "rgba(255,255,255,0.24)";
      drawAtlasCenteredLocal(image, frame, x, y, scale, alpha);
      ctx.restore();
    }

    function drawReceptor(lane, t) {
      const skin = K.notes.skin[lane % 4];
      const age = performance.now() / 1000 - Number(state.receptorFx[lane]?.time || -10);
      let frame = skin.static;
      let scale = NOTE_SCALE;
      if (age >= 0 && age < 0.17 && skin.confirm?.length) {
        frame = frameFor({ frames: skin.confirm, fps: 24 }, age, false);
        scale = NOTE_SCALE;
      } else if (state.keysDown[lane] && skin.press?.length) {
        frame = frameFor({ frames: skin.press, fps: 24 }, performance.now() / 1000, true);
        scale = NOTE_SCALE;
      }
      drawNoteFrame(ko.images.notes, frame, laneX(lane) + NOTE_CENTER.x, receptorY() + NOTE_CENTER.y, scale, lane < 4 ? 0.86 : 1, NOTE_COLORS[lane % 4]);
    }

    function drawSustain(note, x, headY, tailY, alpha) {
      const skin = K.notes.skin[note.lane % 4];
      if (!skin?.hold || !skin?.tail) return;
      const scale = 0.72;
      const upper = Math.min(headY, tailY);
      const lower = Math.max(headY, tailY);
      const capH = (skin.tail.fh || skin.tail.h) * scale;
      const bodyWidth = (skin.hold.fw || skin.hold.w) * scale;
      const bodyTop = upper + capH * 0.38;
      const bodyBottom = lower - capH * 0.38;
      if (bodyBottom > bodyTop) drawAtlasStretchVertical(ko.images.notes, skin.hold, x, bodyTop, bodyWidth, bodyBottom - bodyTop, alpha * 0.92);
      drawNoteFrame(ko.images.notes, skin.tail, x, tailY, scale, alpha, NOTE_COLORS[note.lane % 4]);
    }

    function drawNotesAndReceptors(t) {
      for (let lane = 0; lane < 8; lane += 1) drawReceptor(lane, t);
      if (!state.chart) return;
      for (const note of state.chart.notes) {
        if (note.played && note.hit && (!isHoldNote(note) || note.holdDone)) continue;
        if (note.judged && note.side !== "opp" && (!isHoldNote(note) || note.holdDone || !note.hit)) continue;
        const x = laneX(note.lane);
        const y = noteY(note.time, t);
        const tailY = noteY(holdEndTime(note), t);
        if ((y < -160 && tailY < -160) || (y > H + 160 && tailY > H + 160)) continue;
        const alpha = note.side === "opp" ? 0.84 : 1;
        const center = note.noteType === "parryNote" ? PARRY_CENTER : NOTE_CENTER;
        if (isHoldNote(note)) drawSustain(note, x + NOTE_CENTER.x, (note.hit ? receptorY() : y) + NOTE_CENTER.y, tailY + NOTE_CENTER.y, alpha);
        if (note.hit && isHoldNote(note) && t > note.time) continue;
        const direction = note.lane % 4;
        const frame = note.noteType === "parryNote" ? K.notes.parrySkin[direction] : K.notes.skin[direction].gem;
        const image = note.noteType === "parryNote" ? ko.images.parryNotes : ko.images.notes;
        const scale = note.noteType === "parryNote" ? PARRY_SCALE : NOTE_SCALE;
        drawNoteFrame(image, frame, x + center.x, y + center.y, scale, alpha, note.noteType === "parryNote" ? "#ff66dc" : NOTE_COLORS[direction]);
      }
    }

    function drawCard(t) {
      const mechanic = ko.mechanics;
      if (!mechanic) return;
      const x = 980;
      const y = typeof isDownScroll === "function" && isDownScroll() ? 10 : 520;
      const empty = ko.images.cardEmpty;
      const full = ko.images.cardFull;
      if (imageReady(empty)) ctx.drawImage(empty, x + 16, y + 50, 97, 144);
      if (imageReady(full) && mechanic.cardProgress > 0) {
        const fill = mechanic.hasCard ? 1 : clamp01(mechanic.cardProgress / 100);
        const height = 144 * fill;
        ctx.drawImage(full, 0, 144 - height, 97, height, x + 16, y + 50 + 144 - height, 97, height);
      }
      let animation = null;
      if (mechanic.cardAnim && t - mechanic.cardAnimStart < 1.5) animation = K.animations.card[mechanic.cardAnim];
      else if (mechanic.hasCard) animation = K.animations.card.filled;
      if (animation) {
        const frame = frameFor(animation, mechanic.hasCard ? t : t - mechanic.cardAnimStart, mechanic.hasCard);
        if (frame) drawAtlasTop(ko.images.card, frame, x, y, 1, 1);
      }
    }

    function drawHealth(t) {
      const x = 315;
      const y = 623;
      const width = 633;
      const health = clamp01(state.health);
      ctx.save();
      ctx.fillStyle = "#220f14";
      ctx.fillRect(x + 25, y + 18, 600, 22);
      ctx.fillStyle = "#df3545";
      ctx.fillRect(x + 25, y + 18, 600 * (1 - health), 22);
      ctx.fillStyle = "#31b0d1";
      ctx.fillRect(x + 25 + 600 * (1 - health), y + 18, 600 * health, 22);
      if (imageReady(ko.images.health)) ctx.drawImage(ko.images.health, x, y, width, 50);
      const marker = x + 25 + 600 * (1 - health);
      const cupKey = health > 0.85 ? "cupLose" : "cupNormal";
      const bfKey = health > 0.85 ? "bfWin" : health < 0.35 ? "bfLose" : "bfNormal";
      const cupAnim = K.animations.icons[cupKey];
      const bfAnim = K.animations.icons[bfKey];
      drawAtlasCenteredLocal(ko.images.iconCuphead, frameFor(cupAnim, t, true), marker - 58, y - 35, 0.6, 1);
      drawAtlasCenteredLocal(ko.images.iconBf, frameFor(bfAnim, t, true), marker + 58, y - 27, 0.8, 1);
      ctx.restore();
    }

    function drawIntro(t) {
      if (t < 2.5) {
        const thing = frameFor(K.animations.introThing, t, false);
        if (thing && !window.PERFORMANCE_MODE) drawAtlasTop(ko.images.introThing, thing, -345, -200, 1.6, 0.86);
      }
      if (t >= 0.3 && t < 2.35) {
        const frame = frameFor(K.animations.intro, t - 0.3, false);
        if (frame) drawAtlasTop(ko.images.intro, frame, -200, 60, 0.7, 1);
      }
      if (t < 3.3) {
        const alpha = t <= 3 ? 1 : 1 - (t - 3) / 0.3;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = "#fff";
        ctx.strokeStyle = "#000";
        ctx.lineWidth = 3;
        ctx.font = "30px KnockoutCup, Impact, sans-serif";
        ["CONTROLS", "[SPACE]-DODGE", "LEFT SHIFT-ATTACK"].forEach((text, index) => {
          ctx.strokeText(text, 12, 34 + index * 31);
          ctx.fillText(text, 12, 34 + index * 31);
        });
        ctx.restore();
      }
    }

    function drawAlert(t) {
      const shot = ko.mechanics?.specialShot;
      if (!shot || t - shot.start > 1.2) return;
      const down = typeof isDownScroll === "function" && isDownScroll();
      const animation = down ? K.animations.alertDown : K.animations.alertUp;
      const frame = frameFor(animation, t - shot.start, true);
      const image = ko.images[down ? "alertDown" : "alertUp"];
      if (frame) drawAtlasTop(image, frame, 500, down ? 110 : 340, 1, 1);
    }

    function drawKnockoutText(t) {
      if (t < MUGMAN_DEAD) return;
      const age = t - MUGMAN_DEAD;
      const frame = frameFor(K.animations.knockout, age, false);
      if (!frame) return;
      const animationDuration = K.animations.knockout.frames.length / Number(K.animations.knockout.fps || 28);
      const alpha = age <= animationDuration ? 1 : Math.max(0, 1 - (age - animationDuration));
      drawAtlasTop(ko.images.knockout, frame, 125, 200, 0.9, alpha);
    }

    function applySourceShaders(t) {
      if (window.PERFORMANCE_MODE || state.settings?.performance) return;
      const lightning = lightningAt(t);
      const dim = lightning >= 0 ? lerp(1, 1.9, clamp01(lightning / 0.4)) : 1.9;
      const chrom = 0.001 + Number(ko.mechanics?.chromPulse || 0) * 0.019;
      try {
        window.FNF_WEBGL?.drawKnockoutPostStack?.(canvas, {
          dim,
          directions: 12,
          quality: 5,
          size: 2,
          rOffset: chrom,
          gOffset: 0,
          bOffset: -chrom
        });
      } catch {}
    }

    function renderKnockout(t) {
      initAssets();
      const dt = ko.lastTime < 0 ? 1 / 60 : clampValue(t - ko.lastTime, 0, 0.05);
      updateMechanics(t, dt);
      drawWorld(t);
      drawNotesAndReceptors(t);
      drawCard(t);
      drawHealth(t);
      drawIntro(t);
      drawAlert(t);
      drawKnockoutText(t);
      applySourceShaders(t);
    }

    function applyJudgedNote(best, kind, t = songTime()) {
      if (!best || best._knockoutHandled || !ko.mechanics) return;
      best._knockoutHandled = true;
      const side = best.side;
      const poseInfo = state.poses[side === "player" ? "knockoutBf" : "knockoutCuphead"];
      if (poseInfo) poseInfo.alt = !!best.alt;
      if (kind === "miss") return;
      if (side === "player") {
        if (best.noteType === "parryNote") {
          ko.mechanics.hasCard = true;
          ko.mechanics.cardProgress = 100;
          ko.mechanics.cardAnim = "parry";
          ko.mechanics.cardAnimStart = t;
          playSound("parry", 0.92);
        } else if (!ko.mechanics.hasCard) {
          ko.mechanics.cardProgress = Math.min(100, ko.mechanics.cardProgress + 1);
          if (ko.mechanics.cardProgress >= 100) {
            ko.mechanics.hasCard = true;
            ko.mechanics.cardAnim = "normal";
            ko.mechanics.cardAnimStart = t;
          }
        }
        if (ko.mechanics.peaActive) state.health = clampValue(state.health - 0.01, 0, 1);
      } else if (ko.mechanics.chaserActive && !ko.mechanics.specialShot) {
        spawnBullet("chaser", best.lane % 4, t);
      }
    }

    function processJudgedNote(side, kind, lane) {
      if (!isKnockout(state.currentSong) || !ko.mechanics) return;
      const t = songTime();
      let best = null;
      let bestDistance = Infinity;
      for (const note of state.chart?.notes || []) {
        if (!note.judged || note._knockoutHandled || note.side !== side || note.lane !== lane) continue;
        const distance = Math.abs(note.time - t);
        if (distance < bestDistance) { best = note; bestDistance = distance; }
        if (note.time > t + 0.3) break;
      }
      applyJudgedNote(best, kind, t);
    }

    window.addEventListener("keydown", event => {
      if (!isKnockout(state.currentSong) || !state.playing || event.repeat) return;
      if (event.code === "ShiftLeft" || event.code === "ShiftRight") {
        event.preventDefault();
        useAttack(songTime());
      } else if (event.code === "Space") {
        event.preventDefault();
        tryDodge(songTime());
      }
    }, true);

    isImportedSong = function(song) {
      return isKnockout(song) || baseIsImportedSong(song);
    };

    makeChart = function(song) {
      if (isKnockout(song)) return cloneChart();
      return baseMakeChart(song);
    };

    stopExternalAudio = function() {
      const wasInst = state.audio.inst === state.audio.knockoutInst;
      const wasVoices = state.audio.voices === state.audio.knockoutVoices;
      baseStopExternalAudio();
      [state.audio.knockoutInst, state.audio.knockoutVoices].filter(Boolean).forEach(track => {
        try { track.pause(); track.currentTime = 0; } catch {}
      });
      if (wasInst) state.audio.inst = null;
      if (wasVoices) state.audio.voices = null;
      if (!isKnockout(state.currentSong)) document.body.classList.remove("knockout-active");
    };

    songTime = function() {
      if (isKnockout(state.currentSong) && state.audio.knockoutInst) return state.audio.knockoutInst.currentTime;
      return baseSongTime();
    };

    songEndTime = function() {
      if (isKnockout(state.currentSong)) {
        const tracks = ensureAudioTracks();
        const durations = tracks.map(track => Number(track.duration || 0)).filter(value => Number.isFinite(value) && value > 0);
        return durations.length ? Math.max(Number(K.chart.totalTime), ...durations) : Number(K.chart.totalTime);
      }
      return baseSongEndTime();
    };

    startSong = function(id = state.selectedSong, options = {}) {
      const song = SONGS[id] || state.currentSong;
      if (!isKnockout(song)) {
        document.body.classList.remove("knockout-active");
        return baseStartSong(id, options);
      }
      const audioContext = ensureAudio();
      if (audioContext.state === "suspended") audioContext.resume();
      stopExternalAudio();
      initAssets();
      const tracks = ensureAudioTracks();
      const onlineStart = Number(options.startAt);
      const online = Number.isFinite(onlineStart) || options.forceMode === "online";
      if (state.startTimer) clearTimeout(state.startTimer);
      if (state.endTimer) clearTimeout(state.endTimer);
      state.startTimer = null;
      state.endTimer = null;
      state.selectedSong = id;
      state.currentSong = song;
      state.mode = options.forceMode || (online ? "online" : (ui.versusToggle?.checked ? "versus" : "solo"));
      rebuildKeyMap();
      state.chart = cloneChart();
      resetStats();
      state.health = 0.65;
      state.playing = true;
      state.songStart = 0;
      state.nextStep = 0;
      state.nextStepTime = 0;
      state.feeds.player.time = -10;
      state.feeds.opp.time = -10;
      Object.values(state.poses).forEach(poseInfo => { if (poseInfo) { poseInfo.time = -10; poseInfo.kind = "hit"; } });
      state.receptorFx.forEach(effect => { effect.time = -10; });
      state.hitGlow.length = 0;
      state.camera = { zoom: 1, focusX: W / 2, focusY: H / 2, sideTime: 0, lastSide: "opp", highwayX: 0, highwayY: 0 };
      resetMechanics();
      document.body.classList.add("knockout-active");
      if (online) {
        const now = typeof serverClockNow === "function" ? serverClockNow() : Date.now();
        state.network.matchStartAt = Number(options.startAt || now + 8000);
        state.network.pendingStartAt = state.network.matchStartAt;
        state.network.lastTrackSync = 0;
        state.network.ready = { host: false, guest: false };
      }
      ui.songTitle.textContent = song.title;
      ui.songSub.textContent = song.subtitle;
      ui.modeLabel.textContent = state.mode === "versus" ? "1v1 Versus" : state.mode === "online" ? "Online Match" : "Solo Battle";
      ui.statusText.textContent = online ? "Match syncing" : "Knockout";
      ui.statusSub.textContent = "Space dodges EX shots. Left Shift spends a full card to attack Cuphead.";
      ui.timer.textContent = `0:00 / ${formatTime(songEndTime())}`;
      ui.menu.classList.remove("show");
      ui.settings.classList.remove("show");
      ui.resultsWrap.classList.remove("show");
      if (typeof syncModeUI === "function") syncModeUI();
      tracks.forEach(track => {
        track.pause();
        try { track.currentTime = 0; } catch {}
        if (!options.skipReload) { try { track.load(); } catch {} }
      });
      if (state.mode === "online" && state.network?.matchStartAt) {
        if (typeof syncOnlinePlayback === "function") syncOnlinePlayback(true);
      } else tracks.forEach(track => track.play().catch(() => {}));
      return null;
    };

    finish = function(failed = false) {
      if (isKnockout(state.currentSong)) {
        ensureAudioTracks().forEach(track => { try { track.pause(); } catch {} });
        document.body.classList.remove("knockout-active");
      }
      return baseFinish(failed);
    };

    refreshHUD = function(t) {
      baseRefreshHUD(t);
      if (!isKnockout(state.currentSong)) return;
      if (state.audio.knockoutVoices) state.audio.knockoutVoices.muted = !!state.settings?.muteVoices;
      ui.timer.textContent = `${formatTime(t)} / ${formatTime(songEndTime())}`;
      const dodgeWindow = ko.mechanics?.dodgeWindow;
      const dodgeActive = dodgeWindow && t >= dodgeWindow.start - 0.08 && t <= dodgeWindow.end;
      ui.statusText.textContent = dodgeActive ? "DODGE!" : ko.mechanics?.hasCard ? "CARD READY" : "Knockout";
      ui.statusSub.textContent = ko.mechanics?.hasCard ? "Press Left Shift to attack." : "Space dodges EX shots. Parry notes instantly fill the card.";
    };

    updateCamera = function(t, dt) {
      baseUpdateCamera(t, dt);
      if (isKnockout(state.currentSong)) updateKnockoutCamera(t, dt);
    };

    judge = function(side, kind, lane, char) {
      baseJudge(side, kind, lane, char);
      processJudgedNote(side, kind, lane);
    };

    handleMisses = function(t) {
      if (!isKnockout(state.currentSong)) return baseHandleMisses(t);
      const pendingOpponentHits = (state.chart?.notes || []).filter(note => !note.judged && note.side === "opp" && note.time <= t);
      const result = baseHandleMisses(t);
      for (const note of pendingOpponentHits) {
        if (note.judged && note.hit) applyJudgedNote(note, "perfect", t);
      }
      return result;
    };

    bg = function(song, t) {
      if (isKnockout(song)) {
        ctx.fillStyle = "#07121d";
        ctx.fillRect(0, 0, W, H);
        return;
      }
      return baseBg(song, t);
    };

    stage = function(t) {
      if (isKnockout(state.currentSong)) return drawWorld(t);
      return baseStage(t);
    };

    receptors = function(t) {
      if (isKnockout(state.currentSong)) {
        for (let lane = 0; lane < 8; lane += 1) drawReceptor(lane, t);
        return;
      }
      return baseReceptors(t);
    };

    notes = function(t) {
      if (isKnockout(state.currentSong)) return drawNotesAndReceptors(t);
      return baseNotes(t);
    };

    renderScene = function(songT, previewT) {
      if (!isKnockout(state.currentSong)) return baseRenderScene(songT, previewT);
      renderKnockout(state.playing ? songT : 0);
      return null;
    };

    if (baseApplyDustinBloom) {
      applyDustinBloom = function(t) {
        if (isKnockout(state.currentSong)) return;
        return baseApplyDustinBloom(t);
      };
    }

    if (typeof syncOnlinePlayback === "function" && typeof expectedOnlineSongTime === "function") {
      const baseSyncOnlinePlayback = syncOnlinePlayback;
      syncOnlinePlayback = function(force = false) {
        const target = expectedOnlineSongTime();
        const result = baseSyncOnlinePlayback(force);
        if (target == null || !isKnockout(state.currentSong)) return result;
        const now = typeof serverClockNow === "function" ? serverClockNow() : Date.now();
        const shouldPlay = now + 40 >= Number(state.network?.matchStartAt || 0);
        ensureAudioTracks().forEach((track, index) => {
          const duration = Number.isFinite(track.duration) && track.duration > 0 ? track.duration : null;
          const desired = Math.max(0, duration == null ? target : Math.min(target, Math.max(0, duration - 0.05)));
          if (force || Math.abs(Number(track.currentTime || 0) - desired) > (index ? 0.12 : 0.05)) {
            try { track.currentTime = desired; } catch {}
          }
          if (shouldPlay) {
            if (track.paused && (duration == null || desired < duration - 0.05)) track.play().catch(() => {});
          } else if (!track.paused) track.pause();
        });
        return target;
      };
    }

    if (typeof importedTracksForSong === "function") {
      const baseImportedTracksForSong = importedTracksForSong;
      importedTracksForSong = function(songId = state.selectedSong) {
        if (SONGS[songId]?.chartSource === SOURCE) return ensureAudioTracks();
        return baseImportedTracksForSong(songId);
      };
    }

    if (typeof preloadSongForMatch === "function" && typeof waitForTrackReady === "function") {
      const basePreloadSongForMatch = preloadSongForMatch;
      preloadSongForMatch = async function(songId, matchId) {
        if (SONGS[songId]?.chartSource !== SOURCE) return basePreloadSongForMatch(songId, matchId);
        state.network.preparing = true;
        state.network.prepareMatchId = matchId;
        state.network.preparedSongId = "";
        state.network.loadingStatus = "Loading Knockout files on your side.";
        if (typeof updateOnlinePanel === "function") updateOnlinePanel();
        const tracks = window.prepareKnockoutOnlineStart();
        await Promise.all(tracks.filter(Boolean).map(track => waitForTrackReady(track)));
        if (state.network.prepareMatchId !== matchId) return false;
        state.network.preparedSongId = songId;
        state.network.loadingStatus = "Loaded on your side. Waiting for the other player.";
        if (state.network.role === "host") state.network.loaded.host = true;
        if (state.network.role === "guest") state.network.loaded.guest = true;
        if (typeof updateOnlinePanel === "function") updateOnlinePanel();
        if (state.network.socket && state.network.roomId) state.network.socket.emit("game:loaded", { matchId, songId });
        return true;
      };
    }

    state.poses.knockoutCuphead = state.poses.knockoutCuphead || { lane: 1, time: -10, kind: "hit" };
    state.poses.knockoutBf = state.poses.knockoutBf || { lane: 1, time: -10, kind: "hit" };
    injectStyle();
    renderSongs();
  } catch (error) {
    console.error("Knockout mode failed to initialize", error);
  }
})();

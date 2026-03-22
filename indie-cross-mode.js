(() => {
  try {
    const SANSATIONAL = window.SANSATIONAL_DATA;
    const LAST_REEL = window.LAST_REEL_DATA;
    if ((!SANSATIONAL && !LAST_REEL) || typeof SONGS === "undefined") return;

    const nowSec = () => performance.now() / 1000;
    const INDIE_CROSS_ASSET_VER = "20260322c";
    const versionedAsset = (path) => path ? `${path}${String(path).includes("?") ? "&" : "?"}v=${INDIE_CROSS_ASSET_VER}` : path;
    const DIR_TO_ANIM = {
      left: "singLEFT",
      down: "singDOWN",
      up: "singUP",
      right: "singRIGHT"
    };
    const indieState = {
      ready: {},
      images: {},
      groundCache: {},
      atlasRequested: {},
      altSprites: {},
      noteSkin: null
    };

    const CONFIGS = {
      sansational: SANSATIONAL ? {
        id: "sansational",
        source: "sansational",
        data: SANSATIONAL,
        title: SANSATIONAL.song.title,
        subtitle: SANSATIONAL.song.subtitle,
        diff: SANSATIONAL.song.diff,
        tempo: Number(SANSATIONAL.song.bpm || 130),
        scroll: 1160,
        palette: ["#040711", "#0e1631", "#130a1f", "#090d17", "#75b9ff", "#f5f7ff"],
        blurb: "Imported from Indie Cross with the original Sansational hard chart, the hall stage, real Sans/BF placements, and the dodge and attack mechanics.",
        roleScale: { opponent: 0.74, boyfriend: 0.64 },
        roleGround: {
          opponent: { x: 302, y: 678 },
          boyfriend: { x: 1086, y: 688 }
        },
        camera: {
          oppX: 334,
          playerX: 1042,
          focusY: 420,
          zoom: 1.07,
          speed: 4
        },
        stage: {
          x: 640,
          y: 724,
          scale: 1
        }
      } : null,
      lastReel: LAST_REEL ? {
        id: "lastReel",
        source: "lastReel",
        data: LAST_REEL,
        title: LAST_REEL.song.title,
        subtitle: LAST_REEL.song.subtitle,
        diff: LAST_REEL.song.diff,
        tempo: Number(LAST_REEL.song.bpm || 195),
        scroll: 1240,
        palette: ["#060403", "#1a120e", "#251915", "#0b0908", "#f6cc88", "#f7f3ea"],
        blurb: "Imported from Indie Cross with the original Last Reel hard chart, the real Bendy stage layering, darker threat sprites, and the combat mechanics from the real mod.",
        roleScale: { opponent: 0.64, boyfriend: 0.9, left: 1.34, right: 1.36 },
        roleGround: {
          opponent: { x: 646, y: 642 },
          boyfriend: { x: 1008, y: 714 },
          left: { x: 166, y: 716 },
          right: { x: 1114, y: 708 }
        },
        camera: {
          oppX: 636,
          playerX: 982,
          focusY: 492,
          zoom: 1.08,
          speed: 3.7
        },
        stage: {
          x: 640,
          y: 726,
          scale: 1.08
        }
      } : null
    };

    state.poses.sans = state.poses.sans || { lane: 1, time: -10, kind: "hit" };
    state.poses.bendy = state.poses.bendy || { lane: 1, time: -10, kind: "hit" };
    state.poses.piper = state.poses.piper || { lane: 1, time: -10, kind: "hit" };
    state.poses.striker = state.poses.striker || { lane: 1, time: -10, kind: "hit" };

    for (const config of Object.values(CONFIGS)) {
      if (!config) continue;
      SONGS[config.id] = {
        title: config.title,
        subtitle: config.subtitle,
        diff: config.diff,
        tempo: config.tempo,
        root: 44,
        scale: [0, 2, 3, 5, 7, 8, 10],
        prog: [0, 5, 3, 6],
        scroll: config.scroll,
        seed: config.id === "sansational" ? 71 : 73,
        introBeats: 0,
        outroBeats: 4,
        palette: config.palette,
        blurb: config.blurb,
        chartSource: config.source
      };
    }

    const baseIsImportedSong = isImportedSong;
    const baseMakeChart = makeChart;
    const baseStopExternalAudio = stopExternalAudio;
    const baseSongTime = songTime;
    const baseSongEndTime = songEndTime;
    const baseStartSong = startSong;
    const baseJudge = judge;
    const baseHandlePress = handlePress;
    const baseHandleMisses = handleMisses;
    const baseUpdateHoldNotes = updateHoldNotes;
    const baseRefreshHUD = refreshHUD;
    const baseFinish = finish;
    const baseBg = bg;
    const baseStage = stage;
    const baseNotes = notes;
    const baseReceptors = receptors;
    const baseCameraTargets = typeof cameraTargets === "function" ? cameraTargets : null;
    const baseCameraPanProfile = typeof cameraPanProfile === "function" ? cameraPanProfile : null;
    const baseCameraPoseKeys = typeof cameraPoseKeys === "function" ? cameraPoseKeys : null;

    function clone(value) {
      return JSON.parse(JSON.stringify(value));
    }

    function activeConfig(song = state.currentSong) {
      const source = String(song?.chartSource || "");
      return Object.values(CONFIGS).find(config => config && config.source === source) || null;
    }

    function configById(id = state.selectedSong) {
      return CONFIGS[id] || null;
    }

    function dataFor(config) {
      return config?.data || null;
    }

    function imageReady(image) {
      return !!(image && image.complete && image.naturalWidth);
    }

    function parseAtlasNumber(node, name, fallback = 0) {
      const value = Number(node.getAttribute(name));
      return Number.isFinite(value) ? value : fallback;
    }

    function frameOrder(name) {
      const match = String(name || "").match(/instance\s+(\d+)|(\d+)(?!.*\d)/i);
      return match ? Number(match[1] || match[2]) : 0;
    }

    function parseAtlasFrames(xmlText) {
      const doc = new DOMParser().parseFromString(xmlText, "application/xml");
      return Array.from(doc.getElementsByTagName("SubTexture")).map(node => {
        const name = node.getAttribute("name") || "";
        return {
          name,
          label: name.replace(/\s+instance.*$/i, ""),
          x: parseAtlasNumber(node, "x"),
          y: parseAtlasNumber(node, "y"),
          w: parseAtlasNumber(node, "width"),
          h: parseAtlasNumber(node, "height"),
          fx: parseAtlasNumber(node, "frameX"),
          fy: parseAtlasNumber(node, "frameY"),
          fw: parseAtlasNumber(node, "frameWidth", parseAtlasNumber(node, "width")),
          fh: parseAtlasNumber(node, "frameHeight", parseAtlasNumber(node, "height")),
          rotated: /true/i.test(node.getAttribute("rotated") || "false")
        };
      });
    }

    function atlasFramesByLabel(frames, labels) {
      const wanted = new Set((Array.isArray(labels) ? labels : [labels]).filter(Boolean));
      return frames
        .filter(frame => wanted.has(frame.label))
        .sort((a, b) => frameOrder(a.name) - frameOrder(b.name));
    }

    function atlasFramesByPrefix(frames, prefix) {
      return frames
        .filter(frame => String(frame.name || "").toLowerCase().startsWith(String(prefix || "").toLowerCase()))
        .sort((a, b) => frameOrder(a.name) - frameOrder(b.name));
    }

    function buildNoteSkin(xmlText) {
      const frames = parseAtlasFrames(xmlText);
      const map = {
        left: { static: "arrowLEFT", tap: "purple alone", hold: "purple hold", tail: "purple tail", press: "left press", confirm: "left confirm" },
        down: { static: "arrowDOWN", tap: "blue alone", hold: "blue hold", tail: "blue tail", press: "down press", confirm: "down confirm" },
        up: { static: "arrowUP", tap: "green alone", hold: "green hold", tail: "green tail", press: "up press", confirm: "up confirm" },
        right: { static: "arrowRIGHT", tap: "red alone", hold: "red hold", tail: "red tail", press: "right press", confirm: "right confirm" }
      };
      const skin = {};
      Object.entries(map).forEach(([dir, info]) => {
        skin[dir] = {
          static: atlasFramesByPrefix(frames, info.static)[0] || null,
          tap: atlasFramesByPrefix(frames, info.tap)[0] || null,
          hold: atlasFramesByPrefix(frames, info.hold)[0] || null,
          tail: atlasFramesByPrefix(frames, info.tail)[0] || null,
          press: atlasFramesByPrefix(frames, info.press),
          confirm: atlasFramesByPrefix(frames, info.confirm)
        };
      });
      return skin;
    }

    function requestNoteSkin() {
      if (indieState.atlasRequested.noteSkin) return;
      indieState.atlasRequested.noteSkin = true;
      fetch("assets/NOTE_assets.xml")
        .then(resp => resp.ok ? resp.text() : Promise.reject(new Error(`assets/NOTE_assets.xml ${resp.status}`)))
        .then(text => {
          indieState.noteSkin = buildNoteSkin(text);
        })
        .catch(err => {
          console.warn("Failed to load Indie Cross note skin atlas", err);
        });
    }

    function indieSkinReady(config) {
      const images = assetsFor(config.id);
      return !!indieState.noteSkin && imageReady(images.noteSkin);
    }

    function buildAltSprite(xmlText, baseSprite, mapping) {
      const frames = parseAtlasFrames(xmlText);
      const animations = {};
      Object.entries(mapping).forEach(([animName, labels]) => {
        const animFrames = atlasFramesByLabel(frames, labels);
        if (!animFrames.length) return;
        animations[animName] = {
          frames: animFrames,
          fps: 24,
          loop: animName === "idle"
        };
      });
      return {
        scale: Number(baseSprite?.scale || 1),
        flipX: !!baseSprite?.flipX,
        animations
      };
    }

    function requestAltSprite(key, xmlPath, builder) {
      if (indieState.atlasRequested[key]) return;
      indieState.atlasRequested[key] = true;
      fetch(xmlPath)
        .then(resp => resp.ok ? resp.text() : Promise.reject(new Error(`${xmlPath} ${resp.status}`)))
        .then(text => {
          indieState.altSprites[key] = builder(text);
        })
        .catch(err => {
          console.warn(`Failed to load ${key} atlas`, err);
        });
    }

    function assetsFor(id) {
      indieState.images[id] = indieState.images[id] || {};
      return indieState.images[id];
    }

    function initAssets(id) {
      const config = configById(id);
      if (!config || indieState.ready[id]) return;
      const images = assetsFor(id);
      const data = dataFor(config);
      const sources = id === "sansational"
        ? {
            stageMain: versionedAsset("assets/indie-cross/hall.png"),
            stageShade: versionedAsset("assets/indie-cross/halldark.png"),
            sans: versionedAsset("assets/indie-cross/SansWF.png"),
            sansAlt: versionedAsset("assets/indie-cross/Sans.png"),
            boyfriend: versionedAsset("assets/indie-cross/BoyFriend_SansWT.png"),
            dodgeMechs: versionedAsset("assets/indie-cross/DodgeMechs.png"),
            warning: versionedAsset("assets/indie-cross/Warning.png"),
            alert: versionedAsset(data.sprites.alert),
            noteSkin: versionedAsset("assets/NOTE_assets.png")
          }
        : {
            roomBackBack: versionedAsset("assets/indie-cross/last-reel-backback.png"),
            roomBackMain: versionedAsset("assets/indie-cross/last-reel-backmain.png"),
            roomMidGround: versionedAsset("assets/indie-cross/last-reel-midground.png"),
            roomForeground: versionedAsset("assets/indie-cross/last-reel-foreground.png"),
            roomChainOrig: versionedAsset("assets/indie-cross/last-reel-chain-orig.png"),
            roomCandles: versionedAsset("assets/indie-cross/last-reel-candles.png"),
            rain: versionedAsset(data.stage.rain.image),
            inkOverlay: versionedAsset(data.stage.inkOverlay),
            bendy: versionedAsset("assets/indie-cross/Bendy_remastered.png"),
            boyfriend: versionedAsset("assets/indie-cross/BoyFriend_NM_Bendy.png"),
            piper: versionedAsset(data.sprites.piper.image),
            striker: versionedAsset(data.sprites.striker.image),
            warning: versionedAsset(data.sprites.warning.image),
            alert: versionedAsset(data.sprites.alert),
            noteSkin: versionedAsset("assets/NOTE_assets.png")
          };
      Object.entries(sources).forEach(([key, src]) => {
        if (!src) return;
        const image = new Image();
        image.src = src;
        images[key] = image;
      });
      requestNoteSkin();
      if (id === "sansational") {
        requestAltSprite("sansationalSans", "assets/indie-cross/Sans.xml", xmlText => {
          return buildAltSprite(xmlText, data.sprites.sans, {
            idle: "Sans FNF",
            singLEFT: "Left",
            singDOWN: "Down",
            singUP: "Up",
            singRIGHT: "Right"
          });
        });
        requestAltSprite("sansationalBoyfriend", "assets/indie-cross/BoyFriend_SansWT.xml", xmlText => {
          return buildAltSprite(xmlText, data.sprites.boyfriend, {
            idle: "BF idle dance",
            singLEFT: "BF NOTE LEFT",
            singDOWN: "BF NOTE DOWN",
            singUP: "BF NOTE UP",
            singRIGHT: "BF NOTE RIGHT",
            singLEFTmiss: "BF NOTE LEFT MISS",
            singDOWNmiss: "BF NOTE DOWN MISS",
            singUPmiss: "BF NOTE UP MISS",
            singRIGHTmiss: "BF NOTE RIGHT MISS",
            dodge: "boyfriend dodge",
            attack: "0BF attack",
            hurt: "BF hit"
          });
        });
      } else {
        requestAltSprite("lastReelBendy", "assets/indie-cross/Bendy_remastered.xml", xmlText => {
          return buildAltSprite(xmlText, data.sprites.bendy, {
            idle: "Bendy Idle",
            singLEFT: "Left",
            singDOWN: "bendydown",
            singUP: "Up",
            singRIGHT: "B-Right"
          });
        });
        requestAltSprite("lastReelCandles", "assets/indie-cross/last-reel-candles.xml", xmlText => {
          const frames = parseAtlasFrames(xmlText);
          return {
            candles: atlasFramesByLabel(frames, "Candless"),
            lights: atlasFramesByLabel(frames, "Lights")
          };
        });
      }
      indieState.ready[id] = true;
    }

    function ensureSongAudio(id) {
      const config = configById(id);
      if (!config) return;
      const data = dataFor(config);
      if (id === "sansational") {
        if (!state.audio.sansationalInst) {
          state.audio.sansationalInst = new Audio(data.audio.inst);
          state.audio.sansationalInst.preload = "auto";
          state.audio.sansationalInst.volume = 0.94;
        }
        if (!state.audio.sansationalVoices) {
          state.audio.sansationalVoices = new Audio(data.audio.voices);
          state.audio.sansationalVoices.preload = "auto";
          state.audio.sansationalVoices.volume = 0.9;
        }
        state.audio.sansationalFx = state.audio.sansationalFx || {};
        for (const key of ["dodge", "attack", "hurt", "notice"]) {
          if (!state.audio.sansationalFx[key] && data.audio[key]) {
            const audio = new Audio(data.audio[key]);
            audio.preload = "auto";
            state.audio.sansationalFx[key] = audio;
          }
        }
      } else if (id === "lastReel") {
        if (!state.audio.lastReelInst) {
          state.audio.lastReelInst = new Audio(data.audio.inst);
          state.audio.lastReelInst.preload = "auto";
          state.audio.lastReelInst.volume = 0.94;
        }
        if (!state.audio.lastReelVoices) {
          state.audio.lastReelVoices = new Audio(data.audio.voices);
          state.audio.lastReelVoices.preload = "auto";
          state.audio.lastReelVoices.volume = 0.9;
        }
        state.audio.lastReelFx = state.audio.lastReelFx || {};
        for (const key of ["inked", "whoosh", "punched", "attack", "hit", "hurt"]) {
          if (!state.audio.lastReelFx[key] && data.audio[key]) {
            const audio = new Audio(data.audio[key]);
            audio.preload = "auto";
            state.audio.lastReelFx[key] = audio;
          }
        }
      }
    }

    function songTracks(config = activeConfig()) {
      if (!config) return [];
      ensureSongAudio(config.id);
      if (config.id === "sansational") return [state.audio.sansationalInst, state.audio.sansationalVoices];
      return [state.audio.lastReelInst, state.audio.lastReelVoices];
    }

    function fxBank(config = activeConfig()) {
      if (!config) return null;
      ensureSongAudio(config.id);
      return config.id === "sansational" ? state.audio.sansationalFx : state.audio.lastReelFx;
    }

    function playFx(config, key, volume = 1) {
      const track = fxBank(config)?.[key];
      if (!track) return;
      try {
        track.pause();
        track.currentTime = 0;
        track.volume = volume;
        track.play().catch(() => {});
      } catch {}
    }

    function noteEndTime(config) {
      return (dataFor(config)?.chart?.notes || []).reduce((max, note) => {
        return Math.max(max, Number(note.time || 0) + Math.max(0, Number(note.sLen || 0)));
      }, 0);
    }

    function totalTimeFor(config = activeConfig()) {
      if (!config) return 0;
      const durations = songTracks(config)
        .filter(Boolean)
        .map(track => Number(track.duration || 0))
        .filter(duration => Number.isFinite(duration) && duration > 0);
      const chartEnd = Math.max(noteEndTime(config) + 2, Number(dataFor(config)?.chart?.songEndTime || 0));
      return durations.length ? Math.max(chartEnd, ...durations) : chartEnd;
    }

    function animDuration(anim) {
      if (!anim?.frames?.length) return 0.24;
      return anim.frames.length / Math.max(1, Number(anim.fps || 24));
    }

    function animOffset(anim) {
      const raw = anim?.offset || anim?.offsets || [0, 0];
      return { x: Number(raw?.[0] || 0), y: Number(raw?.[1] || 0) };
    }

    function missAnimName(sprite, hitAnim) {
      const lower = hitAnim + "miss";
      const upper = hitAnim + "Miss";
      if (sprite?.animations?.[lower]) return lower;
      if (sprite?.animations?.[upper]) return upper;
      return null;
    }

    function drawShadow(x, y, width, alpha = 0.24) {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = "#000";
      ctx.beginPath();
      ctx.ellipse(x, y, width, Math.max(10, width * 0.24), 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    function drawAtlasBottomCentered(image, frame, x, y, scale, alpha = 1, flipX = false) {
      if (!imageReady(image) || !frame) return;
      const fw = Number(frame.fw || frame.w || 0);
      const fh = Number(frame.fh || frame.h || 0);
      const fx = Number(frame.fx || 0);
      const fy = Number(frame.fy || 0);
      const dx = -fw * scale / 2 - fx * scale;
      const dy = -fh * scale - fy * scale;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(x, y);
      if (flipX) ctx.scale(-1, 1);
      drawAtlasSub(image, frame, dx, dy, scale);
      ctx.restore();
    }

    function drawCoverImage(image, alpha = 1, scaleMul = 1, yOffset = 0) {
      if (!imageReady(image)) return;
      const scale = Math.max(canvas.width / image.naturalWidth, canvas.height / image.naturalHeight) * scaleMul;
      const width = image.naturalWidth * scale;
      const height = image.naturalHeight * scale;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.drawImage(image, (canvas.width - width) * 0.5, (canvas.height - height) * 0.5 + yOffset, width, height);
      ctx.restore();
    }

    function drawCoverAtlasFrame(image, frame, alpha = 1, scaleMul = 1, yOffset = 0) {
      if (!imageReady(image) || !frame) return;
      const fw = Math.max(1, Number(frame.fw || frame.w || 1));
      const fh = Math.max(1, Number(frame.fh || frame.h || 1));
      const scale = Math.max(canvas.width / fw, canvas.height / fh) * scaleMul;
      const dx = (canvas.width - fw * scale) * 0.5;
      const dy = (canvas.height - fh * scale) * 0.5 + yOffset;
      ctx.save();
      ctx.globalAlpha = alpha;
      drawAtlasSub(image, frame, dx - Number(frame.fx || 0) * scale, dy - Number(frame.fy || 0) * scale, scale);
      ctx.restore();
    }

    function frameGroundPoint(image, frame) {
      if (!imageReady(image) || !frame) return { x: 0, y: 0 };
      const key = image.src + "|" + (frame.name || [frame.x, frame.y, frame.w, frame.h].join(","));
      if (indieState.groundCache[key]) return indieState.groundCache[key];
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
      indieState.groundCache[key] = point;
      return point;
    }

    function roleSprite(config, role) {
      const sprites = dataFor(config)?.sprites;
      if (!sprites) return null;
      if (config.id === "sansational") {
        if (role === "opponent") return indieState.altSprites.sansationalSans || sprites.sans;
        if (role === "boyfriend") return indieState.altSprites.sansationalBoyfriend || sprites.boyfriend;
      }
      if (role === "opponent") return indieState.altSprites.lastReelBendy || sprites.bendy;
      if (role === "boyfriend") return sprites.boyfriend;
      if (role === "left") return sprites.piper;
      if (role === "right") return sprites.striker;
      return null;
    }

    function roleImage(config, role) {
      const images = assetsFor(config.id);
      if (config.id === "sansational") {
        if (role === "opponent") return imageReady(images.sansAlt) ? images.sansAlt : images.sans;
        if (role === "boyfriend") return images.boyfriend;
      }
      if (role === "opponent") return images.bendy;
      if (role === "boyfriend") return images.boyfriend;
      if (role === "left") return images.piper;
      if (role === "right") return images.striker;
      return null;
    }

    function poseKeyFor(config, role) {
      if (role === "opponent") return config.id === "sansational" ? "sans" : "bendy";
      if (role === "left") return "piper";
      if (role === "right") return "striker";
      return "player";
    }

    function currentModeState() {
      return state.indieCross || null;
    }

    function setRoleAction(role, name) {
      const mode = currentModeState();
      if (!mode) return;
      mode.actions[role] = { name, time: nowSec() };
    }

    function roleAnimation(config, role, t) {
      const sprite = roleSprite(config, role);
      if (!sprite) return null;
      const action = currentModeState()?.actions?.[role];
      if (action?.name && sprite.animations[action.name]) {
        const age = nowSec() - Number(action.time || -10);
        if (age >= 0 && age < animDuration(sprite.animations[action.name])) {
          return { name: action.name, elapsed: age, loop: false };
        }
      }
      if (role === "left" || role === "right") return { name: "peek", elapsed: t, loop: true };
      const pose = state.poses[poseKeyFor(config, role)] || { lane: 1, time: -10, kind: "hit" };
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
      const idle = sprite.animations.idle ? "idle" : Object.keys(sprite.animations || {})[0];
      return { name: idle, elapsed: t * (role === "opponent" ? 0.9 : 1), loop: true };
    }

    function drawRole(config, role, t, overrideAnim = null, alpha = 1) {
      const sprite = roleSprite(config, role);
      const image = roleImage(config, role);
      if (!sprite || !imageReady(image)) return;
      const animState = overrideAnim || roleAnimation(config, role, t);
      const anim = sprite.animations?.[animState?.name] || sprite.animations?.idle || Object.values(sprite.animations || {})[0];
      const frame = frameFromList(anim?.frames, Number(animState?.elapsed || 0), Number(anim?.fps || 24), !!animState?.loop);
      if (!frame) return;
      const groundPoint = frameGroundPoint(image, frame);
      const scale = (config.roleScale?.[role] || 0.5) * Number(sprite.scale || 1);
      const anchor = config.roleGround?.[role] || { x: 640, y: 640 };
      const offset = animOffset(anim);
      const fw = Number(frame.fw || frame.w || 0);
      const fh = Number(frame.fh || frame.h || 0);
      const fx = Number(frame.fx || 0);
      const fy = Number(frame.fy || 0);
      const x = anchor.x + (fw * 0.5 + fx - groundPoint.x - offset.x) * scale;
      const y = anchor.y + (fh + fy - groundPoint.y - offset.y) * scale;
      drawShadow(anchor.x, anchor.y + 4, Math.max(56, fw * scale * 0.36), 0.2);
      drawAtlasFrame(image, frame, x, y, scale, alpha, role === "boyfriend" ? false : !!sprite.flipX);
    }

    function cloneChart(config) {
      const data = dataFor(config);
      return {
        ...clone(data.chart),
        notes: clone(data.chart.notes),
        timeline: clone(data.chart.timeline || [])
      };
    }

    function controlsSide(side) {
      if (state.mode === "online" && typeof localControlsSide === "function") return localControlsSide(side);
      if (state.mode === "versus") return true;
      return side === "player";
    }

    function eventTargetSide(event) {
      return event.side === "opp" ? "player" : "opp";
    }

    function eventTargetsLocal(event) {
      if (state.mode === "versus") return true;
      return controlsSide(eventTargetSide(event));
    }

    function damageLocal(amount, allowKill = false) {
      const floor = allowKill ? 0 : 0.02;
      state.health = clamp(state.health - amount, floor, 1);
      state.shake = { time: nowSec(), intensity: allowKill ? 7 : 5 };
    }

    function healLocal(amount) {
      state.health = clamp(state.health + amount, 0, 1);
    }

    function isAvoidNote(note) {
      return note.specialType === "blueDeath" || note.specialType === "ink" || note.specialType === "shadow";
    }

    function findBestNote(lane, t, side) {
      let best = null;
      let bestDiff = Infinity;
      for (const note of state.chart.notes) {
        if (note.judged || note.side !== side || note.lane !== lane) continue;
        const diff = Math.abs(Number(note.time || 0) - t);
        if (diff < bestDiff) {
          bestDiff = diff;
          best = note;
        }
        if (Number(note.time || 0) - t > 0.2) break;
      }
      return { note: best, diff: bestDiff };
    }

    function markHitNote(note) {
      note.judged = true;
      note.played = true;
      note.hit = true;
      if (isHoldNote(note)) {
        note.holdActive = true;
        note.holdDone = false;
        note.played = false;
      }
    }

    function emitImportedJudgment(note, kind, timingError) {
      if (typeof emitOnlineJudgment === "function" && state.mode === "online" && controlsSide(note.side)) {
        emitOnlineJudgment(note, kind, timingError);
      }
    }

    function createModeState(id) {
      const config = configById(id);
      return {
        id,
        lastTime: -1,
        flash: 0,
        inkAlpha: 0,
        prompt: "",
        promptSub: "",
        promptType: "",
        runHeld: false,
        events: clone(dataFor(config)?.mechanics?.events || []).map(event => ({
          ...event,
          resolved: false,
          noticed: false,
          hitApplied: false,
          dodged: false,
          countered: false
        })),
        actions: {
          boyfriend: { name: "", time: -10 },
          opponent: { name: "", time: -10 },
          left: { name: "", time: -10 },
          right: { name: "", time: -10 }
        }
      };
    }

    function activeDodgeEvent(t) {
      return currentModeState()?.events.find(event => {
        return eventTargetsLocal(event)
          && !event.resolved
          && event.eventType === "dodge"
          && t >= Number(event.warnAt || 0) - 0.06
          && t <= Number(event.fireAt || 0) + 0.12;
      }) || null;
    }

    function activeAttackEvent(t) {
      return currentModeState()?.events.find(event => {
        return eventTargetsLocal(event)
          && !event.resolved
          && event.eventType === "attack"
          && t >= Number(event.startAt || 0) - 0.06
          && t <= Number(event.endAt || 0) + 0.12;
      }) || null;
    }

    function resolveSansationalDodge(t) {
      const config = configById("sansational");
      const event = activeDodgeEvent(t);
      if (!config || !event) return false;
      event.resolved = true;
      event.dodged = true;
      setRoleAction("boyfriend", "dodge");
      playFx(config, "dodge", 0.92);
      currentModeState().prompt = "DODGED";
      currentModeState().promptSub = "Sans missed the strike.";
      currentModeState().promptType = "dodge";
      return true;
    }

    function resolveSansationalAttack(t) {
      const config = configById("sansational");
      const event = activeAttackEvent(t);
      if (!config || !event) return false;
      event.resolved = true;
      event.countered = true;
      setRoleAction("boyfriend", "attack");
      healLocal(0.035);
      playFx(config, "attack", 0.94);
      currentModeState().prompt = "COUNTER";
      currentModeState().promptSub = "You pushed Sans back.";
      currentModeState().promptType = "attack";
      return true;
    }

    function activeButcherEvent(direction, t) {
      return currentModeState()?.events.find(event => {
        return eventTargetsLocal(event)
          && !event.resolved
          && event.eventType === "butcher"
          && event.direction === direction
          && t >= Number(event.warnAt || 0) - 0.08
          && t <= Number(event.counterEndAt || 0) + 0.08;
      }) || null;
    }

    function resolveLastReelDodge(t) {
      const config = configById("lastReel");
      const event = currentModeState()?.events.find(candidate => {
        return eventTargetsLocal(candidate)
          && !candidate.resolved
          && candidate.eventType === "butcher"
          && t >= Number(candidate.warnAt || 0) - 0.05
          && t <= Number(candidate.fireAt || 0) + 0.12;
      });
      if (!config || !event) return false;
      event.resolved = true;
      event.dodged = true;
      setRoleAction("boyfriend", "dodge");
      playFx(config, "whoosh", 0.9);
      currentModeState().prompt = "DODGED";
      currentModeState().promptSub = "You slipped past the butcher strike.";
      currentModeState().promptType = "dodge";
      return true;
    }

    function resolveLastReelCounter(direction, t) {
      const config = configById("lastReel");
      const event = activeButcherEvent(direction, t);
      if (!config || !event) return false;
      if (t < Number(event.counterStartAt || 0) - 0.05 || t > Number(event.counterEndAt || 0) + 0.08) return false;
      event.resolved = true;
      event.countered = true;
      setRoleAction("boyfriend", "attack");
      setRoleAction(direction, "hit");
      healLocal(0.045);
      playFx(config, "hit", 0.92);
      currentModeState().prompt = "COUNTER";
      currentModeState().promptSub = "Butcher Gang got knocked back.";
      currentModeState().promptType = "attack";
      return true;
    }

    function updateSansationalMechanics(t, dt) {
      const config = configById("sansational");
      const mode = currentModeState();
      if (!config || !mode) return;
      mode.prompt = "";
      mode.promptSub = "";
      mode.promptType = "";
      mode.flash = Math.max(0, mode.flash - dt * 1.8);
      for (const event of mode.events) {
        if (!eventTargetsLocal(event)) continue;
        if (event.eventType === "dodge") {
          if (t >= Number(event.warnAt || 0) && t < Number(event.fireAt || 0) && !event.resolved) {
            mode.prompt = "Q DODGE";
            mode.promptSub = "Move when the red warning flashes.";
            mode.promptType = "dodge";
            if (!event.noticed) {
              event.noticed = true;
              playFx(config, "notice", 0.8);
            }
          }
          if (t >= Number(event.fireAt || 0) && !event.resolved) {
            event.resolved = true;
            event.hitApplied = true;
            mode.flash = 0.52;
            setRoleAction("boyfriend", "hurt");
            damageLocal(0.24, true);
            playFx(config, "hurt", 0.92);
          }
        } else if (event.eventType === "attack") {
          if (t >= Number(event.startAt || 0) && t < Number(event.endAt || 0) && !event.resolved) {
            mode.prompt = "E ATTACK";
            mode.promptSub = "Swing back to steal a little health.";
            mode.promptType = "attack";
          }
          if (t >= Number(event.endAt || 0) && !event.resolved) {
            event.resolved = true;
            event.hitApplied = true;
            mode.flash = 0.36;
            setRoleAction("boyfriend", "hurt");
            damageLocal(0.12, true);
            playFx(config, "hurt", 0.84);
          }
        }
      }
    }

    function updateLastReelMechanics(t, dt) {
      const config = configById("lastReel");
      const mode = currentModeState();
      if (!config || !mode) return;
      mode.prompt = "";
      mode.promptSub = "";
      mode.promptType = "";
      mode.inkAlpha = Math.max(0, mode.inkAlpha - dt * 0.34);
      mode.flash = Math.max(0, mode.flash - dt * 1.6);
      for (const event of mode.events) {
        if (!eventTargetsLocal(event)) continue;
        if (event.eventType === "run") {
          if (t >= Number(event.startAt || 0) && t <= Number(event.endAt || 0)) {
            mode.prompt = "HOLD SPACE";
            mode.promptSub = "Run through the hallway section.";
            mode.promptType = "run";
            if (!mode.runHeld) damageLocal(dt * 0.16, true);
          } else if (t > Number(event.endAt || 0) && !event.resolved) {
            event.resolved = true;
          }
        } else if (event.eventType === "butcher") {
          if (t >= Number(event.warnAt || 0) && t < Number(event.fireAt || 0) && !event.resolved) {
            mode.prompt = "Q DODGE";
            mode.promptSub = "Then counter with " + (event.direction === "left" ? "Z" : "X") + ".";
            mode.promptType = "dodge";
            if (!event.noticed) {
              event.noticed = true;
              playFx(config, "attack", 0.75);
            }
          }
          if (t >= Number(event.fireAt || 0) && !event.hitApplied && !event.dodged) {
            event.hitApplied = true;
            setRoleAction("boyfriend", "hurt");
            damageLocal(0.18, true);
            playFx(config, "hurt", 0.9);
            mode.flash = 0.34;
          }
          if (t >= Number(event.counterStartAt || 0) && t < Number(event.counterEndAt || 0) && !event.resolved) {
            mode.prompt = event.direction === "left" ? "Z COUNTER" : "X COUNTER";
            mode.promptSub = "Punch the attacker back before the window closes.";
            mode.promptType = "attack";
          }
          if (t > Number(event.counterEndAt || 0) && !event.resolved) event.resolved = true;
        }
      }
    }

    function updateMechanics(t) {
      const mode = currentModeState();
      const config = activeConfig();
      if (!mode || !config) return;
      const dt = mode.lastTime >= 0 ? Math.min(0.12, Math.max(0, t - mode.lastTime)) : 1 / 60;
      mode.lastTime = t;
      if (config.id === "sansational") updateSansationalMechanics(t, dt);
      else updateLastReelMechanics(t, dt);
    }

    function drawPrompt(config, t) {
      const mode = currentModeState();
      if (!config || !mode || !mode.prompt) return;
      const images = assetsFor(config.id);
      const warningSprite = dataFor(config)?.sprites?.warning;
      const warningImage = images.warning;
      const alertImage = images.alert;
      const promptAnimName = mode.promptType === "attack" ? "attack" : "dodge";
      const pulse = 0.78 + Math.sin(t * 10.4) * 0.08;
      if (warningSprite?.animations?.[promptAnimName] && imageReady(warningImage)) {
        const anim = warningSprite.animations[promptAnimName];
        const frame = frameFromList(anim.frames, t, Number(anim.fps || 24), !!anim.loop);
        drawAtlasBottomCentered(warningImage, frame, canvas.width * 0.5, 250, 0.24 * pulse, 0.92);
      }
      if (imageReady(alertImage)) {
        const width = alertImage.naturalWidth * 0.72;
        const height = alertImage.naturalHeight * 0.72;
        ctx.save();
        ctx.globalAlpha = 0.28 + Math.sin(t * 12) * 0.08;
        ctx.drawImage(alertImage, canvas.width * 0.5 - width * 0.5, 138, width, height);
        ctx.restore();
      }
      ctx.save();
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.shadowBlur = 24;
      ctx.shadowColor = mode.promptType === "attack" ? "rgba(255,214,120,0.72)" : "rgba(130,210,255,0.8)";
      ctx.fillStyle = "#f7f4ef";
      ctx.font = "900 48px Tahoma, sans-serif";
      ctx.fillText(mode.prompt, canvas.width * 0.5, 116);
      ctx.shadowBlur = 0;
      ctx.fillStyle = "rgba(245,247,252,0.92)";
      ctx.font = "700 18px Tahoma, sans-serif";
      ctx.fillText(mode.promptSub || "", canvas.width * 0.5, 152);
      ctx.restore();
    }

    function drawSpecialNoteOverlay(note, t) {
      if (!note?.specialType) return;
      const scroll = Number(state.currentSong?.scroll || 1160);
      const headY = receptorY() + (Number(note.time || 0) - t) * scroll;
      const tailY = receptorY() + (holdEndTime(note) - t) * scroll;
      if (headY < -160 && tailY < -160) return;
      if (headY > canvas.height + 160 && tailY > canvas.height + 160) return;
      const x = laneX(note.lane);
      const y = note.hit && isHoldNote(note) ? receptorY() : headY;
      const pulse = 0.74 + Math.sin(t * 10 + note.lane) * 0.12;
      ctx.save();
      if (note.specialType === "orangeBone") {
        ctx.strokeStyle = "rgba(255,178,72,0.92)";
        ctx.lineWidth = 5;
        ctx.shadowBlur = 18;
        ctx.shadowColor = "rgba(255,178,72,0.85)";
        ctx.beginPath();
        ctx.arc(x, y, 32 * pulse, 0, Math.PI * 2);
        ctx.stroke();
      } else if (note.specialType === "blueDeath") {
        ctx.strokeStyle = "rgba(108,196,255,0.96)";
        ctx.lineWidth = 6;
        ctx.shadowBlur = 20;
        ctx.shadowColor = "rgba(108,196,255,0.9)";
        ctx.beginPath();
        ctx.moveTo(x - 24, y - 24);
        ctx.lineTo(x + 24, y + 24);
        ctx.moveTo(x + 24, y - 24);
        ctx.lineTo(x - 24, y + 24);
        ctx.stroke();
      } else if (note.specialType === "ink") {
        ctx.fillStyle = "rgba(17,8,4,0.46)";
        ctx.shadowBlur = 18;
        ctx.shadowColor = "rgba(42,17,6,0.86)";
        ctx.beginPath();
        ctx.ellipse(x, y, 38 * pulse, 28 * pulse, 0, 0, Math.PI * 2);
        ctx.fill();
      } else if (note.specialType === "shadow") {
        ctx.strokeStyle = "rgba(255,78,88,0.96)";
        ctx.lineWidth = 6;
        ctx.shadowBlur = 18;
        ctx.shadowColor = "rgba(255,78,88,0.8)";
        ctx.beginPath();
        ctx.moveTo(x, y - 30);
        ctx.lineTo(x + 30, y);
        ctx.lineTo(x, y + 30);
        ctx.lineTo(x - 30, y);
        ctx.closePath();
        ctx.stroke();
      }
      ctx.restore();
    }

    function drawSansationalStage(t) {
      const config = CONFIGS.sansational;
      const mode = currentModeState();
      const images = assetsFor(config.id);
      drawCoverImage(images.stageMain, 1, 1.03, 8);
      if (imageReady(images.stageShade)) {
        drawCoverImage(images.stageShade, 0.14, 1.03, 8);
      }
      if (imageReady(images.dodgeMechs)) {
        const data = dataFor(config);
        const dodgeEvent = activeDodgeEvent(t);
        const attackEvent = activeAttackEvent(t);
        const fxAnimName = dodgeEvent ? "bones" : (attackEvent ? "alarm" : "");
        const fxAnim = fxAnimName ? data.sprites.dodgeMechs.animations?.[fxAnimName] : null;
        if (fxAnim) {
          const elapsed = dodgeEvent
            ? Math.max(0, t - Number(dodgeEvent.warnAt || t))
            : Math.max(0, t - Number(attackEvent?.startAt || t));
          const frame = frameFromList(fxAnim.frames, elapsed, Number(fxAnim.fps || 24), true);
          drawAtlasBottomCentered(images.dodgeMechs, frame, config.roleGround.boyfriend.x + 18, config.roleGround.boyfriend.y - 78, 0.42, dodgeEvent ? 0.92 : 0.72);
        }
      }
      drawRole(config, "opponent", t);
      drawRole(config, "boyfriend", t);
      drawPrompt(config, t);
      if (mode?.flash > 0.001) {
        ctx.save();
        ctx.globalAlpha = Math.min(0.66, mode.flash);
        ctx.fillStyle = "rgba(194,240,255,0.85)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.restore();
      }
    }

    function drawLayerImage(image, alpha = 1, scaleMul = 1.02, yOffset = 0) {
      drawCoverImage(image, alpha, scaleMul, yOffset);
    }

    function activeButcherThreats(t) {
      const mode = currentModeState();
      const threats = { left: null, right: null };
      if (!mode) return threats;
      for (const event of mode.events) {
        if (event.eventType !== "butcher" || !eventTargetsLocal(event)) continue;
        if (t < Number(event.warnAt || 0) - 0.28) continue;
        if (t > Number(event.counterEndAt || 0) + 0.32) continue;
        const direction = event.direction === "right" ? "right" : "left";
        if (!threats[direction] || Math.abs(t - Number(event.fireAt || 0)) < Math.abs(t - Number(threats[direction].fireAt || 0))) {
          threats[direction] = event;
        }
      }
      return threats;
    }

    function butcherAnim(event, t) {
      if (!event) return { name: "peek", elapsed: t, loop: true, alpha: 0.48 };
      if (t < Number(event.warnAt || 0)) return { name: "peek", elapsed: t, loop: true, alpha: 0.62 };
      if (event.countered && t <= Number(event.counterEndAt || 0) + 0.24) {
        return { name: "hit", elapsed: Math.max(0, t - Number(event.counterStartAt || t)), loop: false, alpha: 1 };
      }
      if (t < Number(event.fireAt || 0)) {
        return { name: "walk", elapsed: Math.max(0, t - Number(event.warnAt || 0)), loop: true, alpha: 0.94 };
      }
      if (t < Number(event.counterEndAt || 0) + 0.16) {
        return { name: "attack", elapsed: Math.max(0, t - Number(event.fireAt || 0)), loop: false, alpha: event.dodged ? 0.74 : 1 };
      }
      return { name: "peek", elapsed: t, loop: true, alpha: 0.42 };
    }

    function drawLastReelStage(t) {
      const config = CONFIGS.lastReel;
      const mode = currentModeState();
      const images = assetsFor(config.id);
      ctx.save();
      const bg = ctx.createLinearGradient(0, 0, 0, canvas.height);
      bg.addColorStop(0, "#080402");
      bg.addColorStop(0.48, "#26170f");
      bg.addColorStop(1, "#090604");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
      drawLayerImage(images.roomBackBack, 1, 1.03, -8);
      drawLayerImage(images.roomBackMain, 1, 1.03, -8);
      drawLayerImage(images.roomMidGround, 1, 1.03, -6);
      const candleAtlas = indieState.altSprites.lastReelCandles;
      const candleFrame = frameFromList(candleAtlas?.candles, t, 14, true);
      if (candleFrame) drawCoverAtlasFrame(images.roomCandles, candleFrame, 0.86, 1.03, -6);
      const threats = activeButcherThreats(t);
      drawRole(config, "opponent", t);
      drawRole(config, "boyfriend", t);
      if (threats.left) {
        const anim = butcherAnim(threats.left, t);
        drawRole(config, "left", t, anim, anim.alpha);
      }
      if (threats.right) {
        const anim = butcherAnim(threats.right, t);
        drawRole(config, "right", t, anim, anim.alpha);
      }
      drawLayerImage(images.roomForeground, 1, 1.03, -4);
      drawLayerImage(images.roomChainOrig, 0.9, 1.03, -4);
      const lightFrame = frameFromList(candleAtlas?.lights, t, 16, true);
      if (lightFrame) drawCoverAtlasFrame(images.roomCandles, lightFrame, 0.28 + Math.min(0.16, (mode?.flash || 0) * 0.18), 1.03, -6);
      if (imageReady(images.rain)) {
        const data = dataFor(config);
        const rainAnim = data.stage.rain.animations.idle || Object.values(data.stage.rain.animations || {})[0];
        const frame = frameFromList(rainAnim?.frames, t, Number(rainAnim?.fps || 24), true);
        drawCoverAtlasFrame(images.rain, frame, 0.12 + Math.min(0.24, (mode?.inkAlpha || 0) * 0.28), 1.03, -6);
      }
      if (imageReady(images.inkOverlay) && mode?.inkAlpha > 0.001) {
        ctx.save();
        ctx.globalAlpha = Math.min(0.72, mode.inkAlpha);
        ctx.drawImage(images.inkOverlay, 0, 0, canvas.width, canvas.height);
        ctx.restore();
      }
      ctx.save();
      const vignette = ctx.createRadialGradient(canvas.width * 0.5, canvas.height * 0.45, canvas.width * 0.18, canvas.width * 0.5, canvas.height * 0.45, canvas.width * 0.72);
      vignette.addColorStop(0, "rgba(0,0,0,0)");
      vignette.addColorStop(1, "rgba(0,0,0,0.48)");
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
      drawPrompt(config, t);
      if (mode?.flash > 0.001) {
        ctx.save();
        ctx.globalAlpha = Math.min(0.58, mode.flash);
        ctx.fillStyle = "rgba(246,217,159,0.7)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.restore();
      }
    }

    function noteLaneDir(lane) {
      return sportingLaneKey(lane);
    }

    function indieNoteScale() {
      return 0.58;
    }

    function indieNoteFilter(config) {
      return config?.id === "lastReel"
        ? "brightness(0.42) sepia(0.95) saturate(1.1) hue-rotate(-12deg) contrast(1.12)"
        : "";
    }

    function indieNoteGlow(config, dir) {
      if (config?.id === "lastReel") {
        return { left: "#7a4b18", down: "#9a5e18", up: "#c1892e", right: "#69240f" }[dir] || "#9a6b2b";
      }
      return { left: "#d86bff", down: "#56d8ff", up: "#8fff63", right: "#ff6158" }[dir] || "#fff";
    }

    function indieConfirmAlpha(age) {
      return clamp(1 - age / 0.18, 0, 1);
    }

    function indieReceptorFrame(lane, age) {
      const dir = noteLaneDir(lane);
      const frames = indieState.noteSkin?.[dir];
      if (!frames) return null;
      if (age != null && frames.confirm?.length) {
        const confirm = frameFromList(frames.confirm, age, 24, false);
        if (confirm) return { frame: confirm, alpha: indieConfirmAlpha(age) };
      }
      if (state.keysDown[lane] && frames.press?.length) {
        return { frame: frameFromList(frames.press, performance.now() / 1000, 24, true), alpha: 1 };
      }
      return { frame: frames.static, alpha: 0.92 };
    }

    function drawIndieReceptor(lane, x, y) {
      const config = activeConfig();
      if (!config || !indieSkinReady(config)) return;
      const image = assetsFor(config.id).noteSkin;
      const fx = state.receptorFx[lane];
      const age = fx ? performance.now() / 1000 - Number(fx.time || 0) : null;
      const result = fx && age >= 0 && age < 0.18 ? indieReceptorFrame(lane, age) : indieReceptorFrame(lane, null);
      if (!result?.frame) return;
      const dir = noteLaneDir(lane);
      const glowColor = indieNoteGlow(config, dir);
      ctx.save();
      ctx.shadowBlur = state.keysDown[lane] || (age != null && age < 0.18) ? 20 : 10;
      ctx.shadowColor = glowColor;
      if (indieNoteFilter(config)) ctx.filter = indieNoteFilter(config);
      drawAtlasCentered(image, result.frame, x, y, indieNoteScale(), result.alpha);
      ctx.restore();
    }

    function drawIndieSustain(note, x, topY, tailY, alpha = 1) {
      const config = activeConfig();
      if (!config || !indieSkinReady(config) || !isHoldNote(note) || tailY <= topY + 10) return;
      const dir = noteLaneDir(note.lane);
      const frames = indieState.noteSkin?.[dir];
      if (!frames?.hold || !frames?.tail) return;
      const image = assetsFor(config.id).noteSkin;
      const scale = indieNoteScale() * 0.92;
      const bodyFrame = frames.hold;
      const tailFrame = frames.tail;
      const bodyWidth = Math.max(18, Number(bodyFrame.fw || bodyFrame.w || 0) * scale);
      const tailHeight = Math.max(20, Number(tailFrame.fh || tailFrame.h || 0) * scale);
      const bodyTop = topY + 16;
      const bodyBottom = tailY - tailHeight * 0.4;
      if (indieNoteFilter(config)) {
        ctx.save();
        ctx.filter = indieNoteFilter(config);
      }
      if (bodyBottom > bodyTop) {
        drawAtlasStretchVertical(image, bodyFrame, x, bodyTop, bodyWidth, bodyBottom - bodyTop, alpha * 0.92);
      }
      drawAtlasCentered(image, tailFrame, x, tailY, scale, alpha);
      if (indieNoteFilter(config)) ctx.restore();
    }

    function drawIndieNote(note, t) {
      const config = activeConfig();
      if (!config || !indieSkinReady(config)) return false;
      const image = assetsFor(config.id).noteSkin;
      const lane = note.lane;
      const scroll = state.currentSong.scroll;
      const diff = Number(note.time || 0) - t;
      const y = receptorY() + diff * scroll;
      const tailY = receptorY() + (holdEndTime(note) - t) * scroll;
      if (y < -120 && tailY < -120) return true;
      if (y > canvas.height + 120 && tailY > canvas.height + 120) return true;
      const dir = noteLaneDir(lane);
      const frames = indieState.noteSkin?.[dir];
      if (!frames?.tap) return false;
      const alpha = note.side === "opp" ? 0.84 : 1;
      if (isHoldNote(note)) {
        drawIndieSustain(note, laneX(lane), note.hit ? receptorY() : y, tailY, alpha * (note.hit ? 0.92 : 1));
      }
      if (note.hit && isHoldNote(note) && t > Number(note.time || 0)) return true;
      ctx.save();
      ctx.shadowBlur = 14;
      ctx.shadowColor = indieNoteGlow(config, dir);
      if (indieNoteFilter(config)) ctx.filter = indieNoteFilter(config);
      drawAtlasCentered(image, frames.tap, laneX(lane), y, indieNoteScale(), alpha);
      ctx.restore();
      return true;
    }

    window.ensureSansationalAudio = function() {
      ensureSongAudio("sansational");
      return [state.audio.sansationalInst, state.audio.sansationalVoices];
    };
    window.prepareSansationalOnlineStart = function() {
      const tracks = window.ensureSansationalAudio().filter(Boolean);
      tracks.forEach(track => {
        track.pause();
        try { track.currentTime = 0; } catch {}
        try { track.load(); } catch {}
      });
      return tracks;
    };
    window.ensureLastReelAudio = function() {
      ensureSongAudio("lastReel");
      return [state.audio.lastReelInst, state.audio.lastReelVoices];
    };
    window.prepareLastReelOnlineStart = function() {
      const tracks = window.ensureLastReelAudio().filter(Boolean);
      tracks.forEach(track => {
        track.pause();
        try { track.currentTime = 0; } catch {}
        try { track.load(); } catch {}
      });
      return tracks;
    };

    isImportedSong = function(song) {
      const source = String(song?.chartSource || "");
      if (source === "sansational" || source === "lastReel") return true;
      return baseIsImportedSong(song);
    };

    makeChart = function(song) {
      const config = activeConfig(song) || configById(song?.id || state.selectedSong);
      if (config && String(song?.chartSource || "") === config.source) {
        const chart = cloneChart(config);
        chart.notes = chart.notes.map((note, index) => ({ ...note, id: note.id == null ? config.id + "-" + index : note.id }));
        chart.notes.sort((a, b) => Number(a.time || 0) - Number(b.time || 0));
        chart.totalTime = Math.max(Number(chart.totalTime || 0), Number(chart.songEndTime || 0), noteEndTime(config) + 2);
        return chart;
      }
      return baseMakeChart(song);
    };

    stopExternalAudio = function() {
      baseStopExternalAudio();
      const allTracks = [
        state.audio?.sansationalInst,
        state.audio?.sansationalVoices,
        state.audio?.lastReelInst,
        state.audio?.lastReelVoices,
        ...Object.values(state.audio?.sansationalFx || {}),
        ...Object.values(state.audio?.lastReelFx || {})
      ].filter(Boolean);
      allTracks.forEach(track => {
        try { track.pause(); } catch {}
      });
      if (state.indieCross) state.indieCross.runHeld = false;
    };

    songTime = function() {
      const config = activeConfig();
      if (!config) return baseSongTime();
      if (state.mode === "online") return baseSongTime();
      const tracks = songTracks(config).filter(Boolean);
      const master = tracks[0];
      if (master) {
        const current = Number(master.currentTime || 0);
        if (Number.isFinite(current)) return current;
      }
      return baseSongTime();
    };

    songEndTime = function() {
      const config = activeConfig();
      if (config) return totalTimeFor(config);
      return baseSongEndTime();
    };

    function resetImportedSceneState(id) {
      state.feeds.player.time = -10;
      state.feeds.opp.time = -10;
      Object.values(state.poses).forEach(poseState => {
        if (!poseState) return;
        poseState.time = -10;
        poseState.kind = "hit";
      });
      state.receptorFx.forEach(fx => fx.time = -10);
      state.camera = {
        zoom: 1,
        focusX: canvas.width * 0.5,
        focusY: canvas.height * 0.45,
        sideTime: 0,
        lastSide: "both",
        highwayX: 0,
        highwayY: 0
      };
      state.indieCross = createModeState(id);
    }

    function beginImportedSong(id, options = {}) {
      const config = configById(id);
      if (!config) return baseStartSong(id, options);
      const audioContext = ensureAudio();
      if (audioContext?.state === "suspended") audioContext.resume();
      stopExternalAudio();
      initAssets(id);
      ensureSongAudio(id);
      state.selectedSong = id;
      state.currentSong = SONGS[id];
      state.mode = options.forceMode === "online" ? "online" : (ui.versusToggle.checked ? "versus" : "solo");
      if (ui.modeLabel) {
        ui.modeLabel.textContent = state.mode === "online" ? "Online Battle" : (state.mode === "versus" ? "1v1 Versus" : "Solo Battle");
      }
      rebuildKeyMap();
      state.chart = makeChart({ ...state.currentSong, chartSource: config.source, id });
      resetStats();
      state.health = 0.65;
      state.playing = true;
      state.songStart = 0;
      state.nextStep = 0;
      state.nextStepTime = 0;
      resetImportedSceneState(id);
      const chartDuration = Math.max(totalTimeFor(config), Number(state.chart?.totalTime || 0), Number(state.chart?.songEndTime || 0));
      state.chart.totalTime = chartDuration;
      ui.songTitle.textContent = state.currentSong.title;
      ui.songSub.textContent = state.currentSong.subtitle;
      ui.timer.textContent = "0:00 / " + formatTime(chartDuration);
      ui.statusText.textContent = config.id === "sansational" ? "Sansational live" : "Last Reel live";
      ui.statusSub.textContent = config.id === "sansational"
        ? "Imported Indie Cross song with dodge and counter prompts."
        : "Imported Indie Cross song with Butcher Gang counters, dodges, and run sections.";
      ui.menu.classList.remove("show");
      ui.settings.classList.remove("show");
      ui.resultsWrap.classList.remove("show");
      if (ui.p1Box) ui.p1Box.style.display = state.mode === "versus" ? "block" : "none";
      const tracks = songTracks(config).filter(Boolean);
      const skipReload = !!options.skipReload;
      tracks.forEach(track => {
        track.pause();
        try { track.currentTime = 0; } catch {}
        if (!skipReload) {
          try { track.load(); } catch {}
        }
      });
      if (state.mode === "online") {
        state.network.matchStartAt = Number(options.startAt || (typeof serverClockNow === "function" ? serverClockNow() + 8000 : Date.now() + 8000));
        state.network.pendingStartAt = state.network.matchStartAt;
        state.network.lastTrackSync = 0;
        state.network.ready = { host: false, guest: false };
        state.network.loaded = { host: false, guest: false };
        if (typeof syncModeUI === "function") syncModeUI();
        if (typeof syncOnlinePlayback === "function") syncOnlinePlayback(true);
      } else {
        tracks.forEach(track => {
          try { track.play().catch(() => {}); } catch {}
        });
      }
      return state.currentSong;
    }

    startSong = function(id = state.selectedSong, options = {}) {
      const config = configById(id);
      if (!config) return baseStartSong(id, options);
      return beginImportedSong(id, options);
    };

    handlePress = function(lane) {
      const config = activeConfig();
      if (!config) return baseHandlePress(lane);
      if (!state.playing || !state.chart) return;
      const t = songTime();
      const side = lane < 4 ? "opp" : "player";
      if (!controlsSide(side)) return;
      const result = findBestNote(lane, t, side);
      const note = result.note;
      if (!note || result.diff > 0.155) return;
      const mode = currentModeState();
      if (note.specialType === "blueDeath") {
        note.judged = true;
        note.played = true;
        setRoleAction("boyfriend", "hurt");
        playFx(config, "hurt", 0.94);
        judge(side, "miss", lane, note.character);
        damageLocal(1, true);
        emitImportedJudgment(note, "miss", result.diff);
        return;
      }
      if (note.specialType === "shadow") {
        note.judged = true;
        note.played = true;
        setRoleAction("boyfriend", "hurt");
        playFx(config, "hurt", 0.94);
        judge(side, "miss", lane, note.character);
        damageLocal(1, true);
        emitImportedJudgment(note, "miss", result.diff);
        return;
      }
      if (note.specialType === "ink") {
        note.judged = true;
        note.played = true;
        if (mode) mode.inkAlpha = Math.max(mode.inkAlpha, 0.78);
        setRoleAction("boyfriend", "hurt");
        playFx(config, "inked", 0.94);
        judge(side, "miss", lane, note.character);
        damageLocal(0.18, true);
        emitImportedJudgment(note, "miss", result.diff);
        return;
      }
      markHitNote(note);
      const kind = result.diff <= 0.045 ? "perfect" : (result.diff <= 0.09 ? "good" : "bad");
      judge(side, kind, lane, note.character);
      emitImportedJudgment(note, kind, result.diff);
      if (note.specialType === "orangeBone") {
        healLocal(0.018);
      }
    };

    handleMisses = function(t) {
      const config = activeConfig();
      if (!config || !state.chart) return baseHandleMisses(t);
      for (const note of state.chart.notes) {
        if (note.judged) continue;
        if (note.side === "opp" && state.mode === "solo" && t >= Number(note.time || 0)) {
          markHitNote(note);
          pose(note.character, note.lane % 4, "hit");
          continue;
        }
        if (!controlsSide(note.side)) continue;
        if (t <= Number(note.time || 0) + 0.16) continue;
        note.judged = true;
        note.played = true;
        if (isAvoidNote(note)) continue;
        judge(note.side, "miss", note.lane, note.character);
        emitImportedJudgment(note, "miss", 0.16);
        if (note.specialType === "orangeBone") {
          playFx(config, "hurt", 0.8);
          damageLocal(0.08, true);
        }
      }
    };

    updateHoldNotes = function(t) {
      const config = activeConfig();
      if (!config || !state.chart) return baseUpdateHoldNotes(t);
      for (const note of state.chart.notes) {
        if (!note.holdActive || note.holdDone || !isHoldNote(note)) continue;
        const end = holdEndTime(note);
        if (t >= end - 0.02) {
          note.holdDone = true;
          note.played = true;
          continue;
        }
        if (!controlsSide(note.side)) continue;
        if (t > Number(note.time || 0) + 0.09 && !state.keysDown[note.lane]) {
          note.holdDone = true;
          note.played = true;
          judge(note.side, "miss", note.lane, note.character);
          emitImportedJudgment(note, "miss", 0.16);
          if (note.specialType === "orangeBone") damageLocal(0.08, true);
        }
      }
    };

    refreshHUD = function(t) {
      const config = activeConfig();
      if (!config) return baseRefreshHUD(t);
      baseRefreshHUD(t);
      const mode = currentModeState();
      const section = state.chart?.timeline?.find(item => t >= Number(item.startTime || 0) && t < Number(item.endTime || 0));
      if (mode?.prompt) {
        ui.statusText.textContent = mode.prompt;
        ui.statusSub.textContent = mode.promptSub || "";
      } else if (config.id === "sansational") {
        ui.statusText.textContent = section?.mustHitSection ? "Sansational player section" : "Sansational enemy section";
        ui.statusSub.textContent = section?.mustHitSection
          ? "Your phrase. Watch for blue bones and the Q/E mechanic prompts."
          : "Sans is pressing the lead. Get ready for the mechanic burst.";
      } else {
        ui.statusText.textContent = mode?.runHeld ? "Last Reel run" : (section?.mustHitSection ? "Last Reel player section" : "Last Reel enemy section");
        ui.statusSub.textContent = mode?.runHeld
          ? "Keep holding Space through the hallway section."
          : (section?.mustHitSection
            ? "Your phrase. Avoid ink and shadow notes while watching butcher warnings."
            : "Bendy is singing. Be ready to dodge and counter the Butcher Gang.");
      }
    };

    finish = function(failed = false) {
      const config = activeConfig();
      if (!config) return baseFinish(failed);
      stopExternalAudio();
      const result = baseFinish(failed);
      state.indieCross = null;
      return result;
    };

    bg = function(song, t) {
      const config = activeConfig();
      if (!config) return baseBg(song, t);
      const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
      gradient.addColorStop(0, config.palette[0]);
      gradient.addColorStop(0.56, config.palette[1]);
      gradient.addColorStop(1, config.palette[2]);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const glow = ctx.createRadialGradient(canvas.width * 0.5, canvas.height * 0.22, 24, canvas.width * 0.5, canvas.height * 0.22, 420);
      glow.addColorStop(0, config.palette[4] + "44");
      glow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    };

    stage = function(t) {
      const config = activeConfig();
      if (!config) return baseStage(t);
      updateMechanics(t);
      if (config.id === "sansational") drawSansationalStage(t);
      else drawLastReelStage(t);
    };

    receptors = function(t) {
      const config = activeConfig();
      if (!config || !indieSkinReady(config)) return baseReceptors(t);
      const y = receptorY();
      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(canvas.width * 0.5, 72);
      ctx.lineTo(canvas.width * 0.5, 452);
      ctx.stroke();
      for (let lane = 0; lane < 8; lane++) {
        const x = laneX(lane);
        drawIndieReceptor(lane, x, y);
        ctx.strokeStyle = "rgba(255,255,255,0.06)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x, y + 26);
        ctx.lineTo(x, 448);
        ctx.stroke();
      }
    };

    notes = function(t) {
      const config = activeConfig();
      if (!config) return baseNotes(t);
      if (!indieSkinReady(config)) {
        baseNotes(t);
      } else if (state.chart?.notes) {
        for (const note of state.chart.notes) {
          if (note.played && note.hit && (!isHoldNote(note) || note.holdDone)) continue;
          if (note.judged && note.side !== "opp" && (!isHoldNote(note) || note.holdDone || !note.hit)) continue;
          drawIndieNote(note, t);
        }
      }
      if (!state.chart?.notes) return;
      state.chart.notes.forEach(note => {
        if (note.judged && !note.holdActive) return;
        drawSpecialNoteOverlay(note, t);
      });
    };

    cameraTargets = function() {
      const config = activeConfig();
      if (!config) return baseCameraTargets ? baseCameraTargets() : { oppX: 314, playerX: 962, focusY: canvas.height * 0.46 };
      return {
        oppX: config.camera.oppX,
        playerX: config.camera.playerX,
        focusY: config.camera.focusY
      };
    };

    cameraPanProfile = function() {
      const config = activeConfig();
      if (!config) return baseCameraPanProfile ? baseCameraPanProfile() : { zoom: 1.1, bias: 1, hud: 0.18, hudClamp: 56, speed: 3.2 };
      return {
        zoom: config.camera.zoom,
        bias: 1.16,
        hud: 0.22,
        hudClamp: 74,
        speed: config.camera.speed
      };
    };

    cameraPoseKeys = function() {
      const config = activeConfig();
      if (!config) return baseCameraPoseKeys ? baseCameraPoseKeys() : { opp: "dad", player: "player" };
      return { opp: poseKeyFor(config, "opponent"), player: "player" };
    };

    window.addEventListener("keydown", event => {
      const config = activeConfig();
      const mode = currentModeState();
      if (!config || !mode || !state.playing) return;
      const key = String(event.key || "").toLowerCase();
      const t = songTime();
      if (config.id === "sansational") {
        if (key === "q" && resolveSansationalDodge(t)) {
          event.preventDefault();
          event.stopPropagation();
        } else if (key === "e" && resolveSansationalAttack(t)) {
          event.preventDefault();
          event.stopPropagation();
        }
        return;
      }
      if (key === "q" && resolveLastReelDodge(t)) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (key === "z" && resolveLastReelCounter("left", t)) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (key === "x" && resolveLastReelCounter("right", t)) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (key === " " || key === "space") {
        mode.runHeld = true;
      }
    }, true);

    window.addEventListener("keyup", event => {
      const config = activeConfig();
      const mode = currentModeState();
      if (!config || config.id !== "lastReel" || !mode) return;
      const key = String(event.key || "").toLowerCase();
      if (key === " " || key === "space") mode.runHeld = false;
    }, true);

    if (typeof renderSongs === "function") renderSongs();
  } catch (error) {
    console.error("Indie Cross mode failed to initialize", error);
  }
})();

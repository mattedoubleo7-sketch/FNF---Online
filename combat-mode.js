(function(){
  const DIR = ["left", "down", "up", "right"];
  const combatState = {
    initialized: false,
    images: {},
    cameraTarget: { x: 640, y: 330, zoom: 1.05 },
    cameraCurrent: { x: 640, y: 330, zoom: 1.05 },
    cameraSong: "",
    cameraLastSide: "both",
    cameraLastSideTime: -99,
    dust: [],
    fxCanvas: null,
    fxCtx: null,
    shimmySpeedFx: null,
    shaderFxCache: null
  };

  const ONE_HIT_SPEED_STEPS = [528, 600, 632, 652, 704, 3344, 3416, 3448, 3468, 3520, 4864];
  const ONE_HIT_BLOOM_STEPS = [256, 512, 640, 768, 1024, 1280, 1408, 1536, 1600, 1664, 1728, 1792, 1856, 1920, 1984, 2048, 2080, 2112, 2144, 2176, 2208, 2240, 2272, 2304, 2368, 2432, 2496, 2560, 2624, 2688, 2752, 2816, 3072, 3328, 3456, 3584, 3840, 4096, 4224, 4352, 4480, 4608, 4736, 4864, 4992, 5120, 5248, 5376];
  const ONE_HIT_BARS_STEPS = [504, 760, 1272, 1528, 1592, 1656, 1720, 1784, 1848, 1912, 1976, 2040, 2072, 2104, 2136, 2168, 2200, 2232, 2264, 2296, 2360, 2424, 2488, 2552, 2616, 2680, 2744, 2808, 3320, 3576, 3832, 4088, 4344, 4856];
  const ONE_HIT_BLUR_STEPS = [2560, 2568, 2576, 2584, 2624, 2632, 2640, 2648, 2688, 2696, 2704, 2712, 2752, 2760, 2768, 2776];
  const ONE_HIT_WARP_STEPS = [2048, 2080, 2112, 2144, 2176, 2208, 2240, 2272, 2560, 2568, 2576, 2584, 2624, 2632, 2640, 2648, 2688, 2696, 2704, 2712, 2752, 2760, 2768, 2776];
  const ONE_HIT_GREYSCALE_WINDOWS = [[1024, 256, 1], [1392, 32, 0.55], [2304, 64, 0.55], [3840, 256, 1], [4208, 32, 0.55], [4320, 32, 1], [4848, 16, 0.55]];
  const ONE_HIT_SIDE_SPEED_START = 191;
  const ONE_HIT_MOVING_ROCK_START = 192;

  function clampValue(value, min, max){
    const number = Number(value) || 0;
    return Math.max(min, Math.min(max, number));
  }

  const WII_COMBAT_DEPTH = {
    fov: Math.PI / 2,
    focalLength: 250,
    eyeZ: -150,
    maxZ: 900,
    layers: {
      far: { z: 900, scrollX: 0.03, travel: 16, sway: 4, floatY: -3, floatRate: 0.26, phase: 0.2, angle: 0.004 },
      mid: { z: 430, scrollX: 0.2, travel: 42, sway: 8, floatY: 5, floatRate: 0.34, phase: 1.15, angle: 0.009 },
      near: { z: 150, scrollX: 0.6, travel: 70, sway: 12, floatY: 9, floatRate: 0.42, phase: 2.3, angle: 0.015 },
      platform: { z: 35, scrollX: 1, travel: 86, sway: 15, floatY: 0, floatRate: 0.42, phase: 0, angle: 0.018 }
    }
  };
  const WIIK_Z_LIGHT_COLOR = "rgb(8,0,20)";
  const WIIK_Z_LIGHT_FILTER = "brightness(0) saturate(100%) invert(7%) sepia(58%) saturate(3478%) hue-rotate(246deg) brightness(92%) contrast(112%)";

  const WIIK_Z_STAGE = {
    unknownBG: { key: "unknownBG", x: -450, y: -100, scale: 2, scrollX: 0, scrollY: 0.3 },
    back4: { key: "back4", x: -250 + 273, y: -100 + 250, scale: 2, scrollX: 0.4, scrollY: 0.4 },
    back5: { key: "back5", x: -600 + 118 * 1.2, y: -200 + 378 * 1.2, scale: 1.2 * 2, scrollX: 0.6, scrollY: 0.6 },
    platformLeft: { key: "platform", x: 207, y: -150 + 1074, scale: 1 },
    platformRight: { key: "platform", x: 1471, y: -150 + 1074, scale: 1, flipX: true },
    splitLeft: { key: "split", x: 0, y: -500, scale: 1.2 * 2, scrollX: 1.3, scrollY: 1.3 },
    splitRight: { key: "split", x: 1844 * 1.2, y: -500, scale: 1.2 * 2, scrollX: 1.3, scrollY: 1.3, flipX: true }
  };
  const WIIK_Z_MATT_SCALE = 0.5;
  const WIIK_Z_BF_SCALE = 0.5;
  const WIIK_Z_DEFAULT_OPPONENT = { x: 500, y: 250 };
  const WIIK_Z_DEFAULT_BOYFRIEND = { x: 1700, y: 250 };
  const WIIK_Z_MATT_POSITION = { x: -20, y: 40 };
  const WIIK_Z_BF_POSITION = { x: 0, y: 380 };
  const WIIK_Z_MATT_IDLE = { fw: 423, fh: 462, offsetX: 90, offsetY: -255 };
  const WIIK_Z_BF_IDLE = { offsetX: 301, offsetY: -203, bottom: 137.77951959762723 };

  function isCombat(){
    return typeof state !== "undefined" && (state.selectedSong === "combat" || state.selectedSong === "oneHit" || state.selectedSong === "shimmy");
  }

  function isOneHit(){
    return typeof state !== "undefined" && state.selectedSong === "oneHit";
  }

  function isShimmy(){
    return typeof state !== "undefined" && state.selectedSong === "shimmy";
  }

  function loadImage(key, src){
    const img = new Image();
    img.src = src;
    combatState.images[key] = img;
  }

  function initCombatVisuals(){
    if(combatState.initialized || !window.COMBAT_VISUAL_DATA) return;
    combatState.initialized = true;
    const data = window.COMBAT_VISUAL_DATA;
    Object.entries(data.stage).forEach(([key, src]) => loadImage(key, src));
    loadImage("matt", data.sprites.matt.image);
    if(data.sprites.bfSword) loadImage("bfSword", data.sprites.bfSword.image);
    if(window.SHIMMY_VISUAL_DATA?.shimmer) loadImage("shimmyShimmer", window.SHIMMY_VISUAL_DATA.shimmer.image);
    const dustSpecs = {
      far: { count: 51, speed: 50, scale: 0.48, alpha: 0.13, sway: 5, startBelow: 160 },
      mid: { count: 16, speed: 100, scale: 0.72, alpha: 0.22, sway: 10, startBelow: 170 },
      near: { count: 11, speed: 200, scale: 1.18, alpha: 0.34, sway: 18, startBelow: 260 }
    };
    Object.entries(dustSpecs).forEach(([layer, spec]) => {
      for(let i = 0; i < spec.count; i++){
        combatState.dust.push({
          layer,
          x: (i * 233 + (layer === "near" ? 97 : layer === "mid" ? 41 : 0)) % 1760 - 240,
          phase: (i * 137) % 980,
          speed: spec.speed,
          scale: spec.scale * (0.86 + (i % 5) * 0.07),
          alpha: spec.alpha,
          sway: spec.sway,
          startBelow: spec.startBelow
        });
      }
    });
    if(!window.REDUCE_MOTION && typeof setTimeout === "function") setTimeout(() => ensureShimmySpeedFx(), 0);
  }

  function imgReady(image){
    return image && image.complete && image.naturalWidth;
  }

  function combatReady(){
    return combatState.initialized && Object.entries(combatState.images).every(([key, img]) => key === "shimmyShimmer" && !isShimmy() ? true : imgReady(img));
  }

  function drawImage(key, x, y, scale = 1, alpha = 1, flipX = false){
    const image = combatState.images[key];
    if(!imgReady(image)) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    if(flipX){
      ctx.translate(x + image.naturalWidth * scale, y);
      ctx.scale(-1, 1);
      ctx.drawImage(image, 0, 0, image.naturalWidth * scale, image.naturalHeight * scale);
    } else {
      ctx.drawImage(image, x, y, image.naturalWidth * scale, image.naturalHeight * scale);
    }
    ctx.restore();
  }

  function drawImageRotated(key, x, y, scale = 1, angle = 0, alpha = 1, flipX = false){
    const image = combatState.images[key];
    if(!imgReady(image)) return;
    const width = image.naturalWidth * scale;
    const height = image.naturalHeight * scale;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.translate(x + width * 0.5, y + height * 0.5);
    ctx.rotate(angle);
    if(flipX) ctx.scale(-1, 1);
    ctx.drawImage(image, -width * 0.5, -height * 0.5, width, height);
    ctx.restore();
  }

  const WIIK_Z_PARALLAX_BASE = { x: 640, y: 448 };
  function combatCameraParallaxPoint(x, y, scrollX = 1, scrollY = scrollX){
    const camZ = Number(state.camera?.zoom || 1);
    if(window.REDUCE_MOTION || !Number.isFinite(camZ) || Math.abs(camZ - 1) < 0.001) return { x, y };
    const focusX = Number.isFinite(state.camera?.focusX) ? state.camera.focusX : WIIK_Z_PARALLAX_BASE.x;
    const focusY = Number.isFinite(state.camera?.focusY) ? state.camera.focusY : WIIK_Z_PARALLAX_BASE.y;
    const layerFocusX = WIIK_Z_PARALLAX_BASE.x + (focusX - WIIK_Z_PARALLAX_BASE.x) * scrollX;
    const layerFocusY = WIIK_Z_PARALLAX_BASE.y + (focusY - WIIK_Z_PARALLAX_BASE.y) * scrollY;
    return {
      x: x + (layerFocusX - focusX) * (1 - camZ) / camZ,
      y: y + (layerFocusY - focusY) * (1 - camZ) / camZ
    };
  }

  function drawImageParallax(key, x, y, scale = 1, alpha = 1, flipX = false, scrollX = 1, scrollY = scrollX){
    const p = combatCameraParallaxPoint(x, y, scrollX, scrollY);
    drawImage(key, p.x, p.y, scale, alpha, flipX);
  }

  function wiiProjectionScale(z){
    const distance = Math.max(1, z - WII_COMBAT_DEPTH.eyeZ);
    return WII_COMBAT_DEPTH.focalLength / (WII_COMBAT_DEPTH.focalLength + distance);
  }

  function wiiLayerDepth(name, pan, sway, t){
    const spec = WII_COMBAT_DEPTH.layers[name];
    const projection = wiiProjectionScale(spec.z);
    const zNorm = Math.max(0, Math.min(1, spec.z / WII_COMBAT_DEPTH.maxZ));
    const perspectiveLift = 1 - projection;
    return {
      x: -pan * spec.travel + sway * spec.sway,
      y: Math.sin(t * spec.floatRate + spec.phase) * spec.floatY * (1 + perspectiveLift * 0.35),
      scale: 1 + (1 - zNorm) * 0.06 + perspectiveLift * 0.012,
      angle: pan * spec.angle,
      projection,
      scrollX: spec.scrollX
    };
  }

  function combatDepth(t){
    // Only the back sky drifts. Rocks and platforms stay locked.
    const tSafe = Number.isFinite(t) ? t : 0;
    const bgX = Math.sin(tSafe * 0.42) * 22 + Math.sin(tSafe * 0.17) * 8;
    const bgY = Math.cos(tSafe * 0.31) * 12 + Math.sin(tSafe * 0.09) * 4;
    return {
      far: 0,
      mid: 0,
      near: 0,
      farY: 0,
      midY: 0,
      nearY: 0,
      lean: 0,
      bgX,
      bgY,
      scale: {
        far: 1,
        mid: 1,
        near: 1,
        platform: 1
      },
      angle: {
        far: 0,
        mid: 0,
        near: 0
      },
      projection: {
        far: 1,
        mid: 1,
        near: 1
      }
    };
  }

  function drawCombatDepthWash(depth){
    ctx.save();
    const floor = ctx.createLinearGradient(0, canvas.height * 0.48, 0, canvas.height);
    floor.addColorStop(0, "rgba(255,255,255,0)");
    floor.addColorStop(0.45, "rgba(35,22,82,0.11)");
    floor.addColorStop(1, "rgba(0,0,0,0.28)");
    ctx.fillStyle = floor;
    ctx.beginPath();
    ctx.moveTo(-40 + depth.near * 0.2, canvas.height * 0.58);
    ctx.lineTo(canvas.width + 40 + depth.near * 0.2, canvas.height * 0.54);
    ctx.lineTo(canvas.width + 60, canvas.height + 40);
    ctx.lineTo(-60, canvas.height + 40);
    ctx.closePath();
    ctx.fill();

    ctx.globalCompositeOperation = "screen";
    const leftLight = ctx.createLinearGradient(0, 0, canvas.width, 0);
    leftLight.addColorStop(0, "rgba(126,104,255,0.16)");
    leftLight.addColorStop(0.44, "rgba(126,104,255,0)");
    leftLight.addColorStop(1, "rgba(78,196,255,0.12)");
    ctx.fillStyle = leftLight;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
  }

  function worldX(x){ return x * 0.5 + 10; }
  function worldY(y){ return y * 0.5; }
  function worldScale(scale){ return scale * 0.5; }

  function wiikZPlatformBob(t, strength){
    const rate = 1.5;
    const assumedFps = 60;
    const sourceAmplitude = assumedFps * strength / rate;
    const amplitude = worldScale(sourceAmplitude);
    return {
      x: amplitude * (1 - Math.cos(t * rate)),
      y: amplitude * Math.sin(t * rate)
    };
  }

  function wiikZPlatformMotion(t, depth){
    const leftBob = wiikZPlatformBob(t, 0.5);
    const rightBob = wiikZPlatformBob(t, 0.3);
    return {
      left: leftBob,
      right: rightBob,
      angle: 0
    };
  }

  function wiikZStageDepthStyle(layer, depth){
    // Only the back sky (`bg`) drifts. Rocks (`far`/`mid`) and the
    // foreground split cliffs (`near`) stay locked to camera-parallax
    // only - any motion on those would visibly shear the rock frame.
    if(layer === "bg"){
      return {
        x: Number(depth?.bgX || 0),
        y: Number(depth?.bgY || 0),
        scale: 1,
        angle: 0
      };
    }
    return { x: 0, y: 0, scale: 1, angle: 0 };
  }

  function wiikZMattBaseAnchor(){
    return {
      x: worldX(WIIK_Z_DEFAULT_OPPONENT.x + WIIK_Z_MATT_POSITION.x - WIIK_Z_MATT_IDLE.offsetX + WIIK_Z_MATT_IDLE.fw * 0.5),
      y: worldY(WIIK_Z_DEFAULT_OPPONENT.y + WIIK_Z_MATT_POSITION.y - WIIK_Z_MATT_IDLE.offsetY + WIIK_Z_MATT_IDLE.fh)
    };
  }

  function wiikZBfBaseAnchor(){
    // User: put BF back at his original spot, don't touch his size. Pre-
    // 7125603 BF was positioned relative to the right platform's foot point
    // (rightRockCenter + 8, rightPlatformY + 132), which keeps him glued
    // to the rock even though Matt now uses the constants-based anchor.
    // The polish constants moved BF up ~109px and right ~96px in canvas
    // space; restore the platform-foot calculation so he sits where he
    // used to. WIIK_Z_BF_SCALE (his size knob) is untouched.
    const platformScale = worldScale(WIIK_Z_STAGE.platformRight.scale || 1);
    const platformImage = combatState.images.platform;
    const platformWidth = platformImage && platformImage.naturalWidth
      ? platformImage.naturalWidth * platformScale
      : 0;
    const rightPlatformX = worldX(WIIK_Z_STAGE.platformRight.x);
    const rightPlatformY = worldY(WIIK_Z_STAGE.platformRight.y);
    return {
      x: rightPlatformX + platformWidth * 0.5 + 8,
      y: rightPlatformY + 132
    };
  }

  function wiikZCharacterAnchors(t){
    const motion = wiikZPlatformMotion(t);
    const matt = wiikZMattBaseAnchor();
    const bf = wiikZBfBaseAnchor();
    return {
      matt: { x: matt.x + motion.left.x, y: matt.y + motion.left.y },
      bf: { x: bf.x + motion.right.x, y: bf.y + motion.right.y }
    };
  }

  function drawWiikZStageSprite(spec, xOffset = 0, yOffset = 0, scaleMult = 1, alpha = 1, angle = 0, depthStyle = null){
    const style = depthStyle || {};
    const baseX = worldX(spec.x) + xOffset + Number(style.x || 0);
    const baseY = worldY(spec.y) + yOffset + Number(style.y || 0);
    const scale = worldScale(spec.scale || 1) * scaleMult * Number(style.scale || 1);
    const finalAngle = angle + Number(style.angle || 0);
    const p = combatCameraParallaxPoint(baseX, baseY, spec.scrollX ?? 1, spec.scrollY ?? spec.scrollX ?? 1);
    if(Math.abs(finalAngle) > 0.0001){
      drawImageRotated(spec.key, p.x, p.y, scale, finalAngle, alpha, !!spec.flipX);
    } else {
      drawImage(spec.key, p.x, p.y, scale, alpha, !!spec.flipX);
    }
  }

  function rotatePointAround(x, y, cx, cy, angle){
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const dx = x - cx;
    const dy = y - cy;
    return {
      x: cx + dx * cos - dy * sin,
      y: cy + dx * sin + dy * cos
    };
  }

  function combatHeldNote(characterKey, t){
    if(!state.chart?.notes || typeof isHoldNote !== "function" || typeof holdEndTime !== "function") return null;
    for(const n of state.chart.notes){
      if(n.time > t + 0.08) break;
      if(!n.holdActive || n.holdDone || !isHoldNote(n) || n.character !== characterKey) continue;
      if(t < n.time - 0.02 || t > holdEndTime(n) + 0.02) continue;
      if(n.side === "player" && t > n.time + 0.09 && !state.keysDown[n.lane]) continue;
      return n;
    }
    return null;
  }

  function currentAnimName(spriteName, characterKey, t = 0){
    const data = window.COMBAT_VISUAL_DATA?.sprites?.[spriteName];
    const pose = state.poses?.[characterKey] || { time: -10, lane: 1, kind: "idle" };
    const held = combatHeldNote(characterKey, t);
    if(held){
      const dir = DIR[held.lane % 4] || "down";
      return dir;
    }
    const age = performance.now() / 1000 - (pose.time || -10);
    let anim = "idle";
    if(age < 0.42 && Number.isFinite(pose.lane)){
      const dir = DIR[pose.lane % 4] || "down";
      anim = pose.kind === "miss" && data?.animations?.[dir + "Miss"]?.length ? dir + "Miss" : dir;
    }
    return anim;
  }

  function currentFrame(spriteName, characterKey, t){
    const data = window.COMBAT_VISUAL_DATA?.sprites?.[spriteName];
    if(!data) return null;
    const pose = state.poses?.[characterKey] || { time: -10, lane: 1, kind: "idle" };
    const held = combatHeldNote(characterKey, t);
    const age = held ? Math.max(0, t - held.time) : performance.now() / 1000 - (pose.time || -10);
    const anim = currentAnimName(spriteName, characterKey, t);
    const frames = data.animations[anim]?.length ? data.animations[anim] : data.animations.idle;
    const isSinging = anim !== "idle";
    // Match the original Wii Funkin character.json fps + loop behavior:
    //   idle: fps 18, loops indefinitely
    //   sing*: fps 24, plays once then clamps at the last frame (no wrap)
    // The elapsed time for sing must be `age` (time since the pose was set)
    // so each note hit plays the animation fresh from frame 0. Idle stays
    // indexed by song time so the loop runs continuously.
    const fps = anim === "idle" ? 18 : 24;
    const loop = !isSinging;
    const elapsed = isSinging ? age : t;
    return frameFromList(frames, elapsed, fps, loop);
  }

  function laneVector(lane){
    const dir = ((Math.floor(Number(lane) || 0) % 4) + 4) % 4;
    if(dir === 0) return { x: -1, y: 0 };
    if(dir === 1) return { x: 0, y: 1 };
    if(dir === 2) return { x: 0, y: -1 };
    return { x: 1, y: 0 };
  }

  function combatSpriteJuice(characterKey, lane, hit, t){
    if(window.REDUCE_MOTION) return { x: 0, y: 0, rotate: 0, skewX: 0, scaleX: 1, scaleY: 1, after: false, hit: 0 };
    return { x: 0, y: 0, rotate: 0, skewX: 0, scaleX: 1, scaleY: 1, after: false, hit: clampValue(hit, 0, 1) };
  }

  function drawWiikZAtlasLighting(image, frame, x, y, scale, flipX){
    if(typeof drawAtlasFrameSilhouette !== "function") return;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    drawAtlasFrameSilhouette(image, frame, x, y, scale, 1, flipX, WIIK_Z_LIGHT_COLOR);
    ctx.restore();
  }

  function atlasFootCorrection(frame, scale){
    const fh = frame.fh || frame.h;
    const fy = frame.fy || 0;
    const visibleHeight = frame.rotated ? frame.w : frame.h;
    return (fh + fy - visibleHeight) * scale;
  }

  // Wiik Z/Psych Engine offsets from mods/characters/swordmatt.json.
  // HaxeFlixel draws the graphic at sprite position minus offset.
  const MATT_WIIK_Z_IDLE_FRAME = { fw: 423, fh: 462 };
  const MATT_WIIK_Z_OFFSETS = {
    idle: { x: 90, y: -255 },
    left: { x: 36, y: -286 },
    down: { x: 209, y: -336 },
    up: { x: 171, y: -238 },
    right: { x: 161, y: -302 }
  };

  function mattWiikZDrawCorrection(frame, anim, scale){
    const key = String(anim || "idle").replace(/Miss$/, "");
    const idle = MATT_WIIK_Z_OFFSETS.idle;
    const offset = MATT_WIIK_Z_OFFSETS[key] || idle;
    const fw = frame.fw || frame.w;
    const fh = frame.fh || frame.h;
    return {
      x: (idle.x - offset.x + (fw - MATT_WIIK_Z_IDLE_FRAME.fw) * 0.5) * scale,
      y: (idle.y - offset.y + (fh - MATT_WIIK_Z_IDLE_FRAME.fh)) * scale
    };
  }

  function drawCharacter(spriteName, imageKey, characterKey, x, y, scale, flipX, t, lean = 0){
    const frame = currentFrame(spriteName, characterKey, t);
    if(!frame || typeof drawAtlasFrame !== "function") return;
    const pose = state.poses?.[characterKey] || { time: -10, lane: 1 };
    const age = performance.now() / 1000 - (pose.time || -10);
    const hit = age < 0.18 ? 1 - age / 0.18 : 0;
    const lane = pose.lane % 4;
    const dx = lane === 0 ? -10 : lane === 3 ? 12 : 0;
    const dy = lane === 2 ? -13 : lane === 1 ? 10 : 0;
    const bob = Math.sin(t * Math.PI * 2 * 1.5) * 1.8;
    const juice = combatSpriteJuice(characterKey, lane, hit, t);
    const plainSprite = spriteName === "matt";
    const mattDraw = plainSprite ? mattWiikZDrawCorrection(frame, currentAnimName(spriteName, characterKey, t), scale) : null;
    const drawX = mattDraw ? mattDraw.x : dx * hit;
    const drawY = mattDraw ? mattDraw.y : bob + dy * hit;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(lean + juice.rotate);
    ctx.translate(juice.x, juice.y);
    ctx.transform(juice.scaleX, 0, juice.skewX, juice.scaleY, 0, 0);
    drawAtlasFrame(combatState.images[imageKey], frame, drawX, drawY, scale, 1, flipX);
    if(!window.PERFORMANCE_MODE){
      drawWiikZAtlasLighting(combatState.images[imageKey], frame, drawX, drawY, scale, flipX);
    }
    ctx.restore();
  }

  function combatAnimateRuntime(){
    if(combatState.bfRuntime) return combatState.bfRuntime;
    const data = window.COMBAT_VISUAL_DATA?.sprites?.bfSword;
    if(!data?.animation || !data?.atlas) return null;
    const symbols = {};
    (data.animation.SD?.S || []).forEach(symbol => { symbols[symbol.SN] = symbol; });
    const mainFrames = data.animation.AN?.TL?.L?.[0]?.FR || [];
    const maxFrame = Math.max(1, ...mainFrames.map(frame => (frame.I || 0) + (frame.DU || 1)));
    const labelStarts = mainFrames.filter(frame => frame.N).map(frame => ({ name: frame.N, start: frame.I || 0 }));
    const labels = {};
    const labelMatrices = {};
    labelStarts.forEach((label, index) => {
      labels[label.name] = {
        start: label.start,
        end: index + 1 < labelStarts.length ? labelStarts[index + 1].start : maxFrame
      };
      const frame = mainFrames.find(item => item.N === label.name);
      labelMatrices[label.name] = frame?.E?.find(element => element.SI)?.SI?.M3D || null;
    });
    combatState.bfRuntime = { data, symbols, labels, labelMatrices, maxFrame };
    return combatState.bfRuntime;
  }

  function activeAnimateFrame(layer, frameIndex){
    let chosen = null;
    for(const frame of layer.FR || []){
      if((frame.I || 0) <= frameIndex) chosen = frame;
      else break;
    }
    return chosen;
  }

  function applyAnimateMatrix(matrix){
    if(!matrix) return;
    ctx.transform(
      matrix[0] ?? 1,
      matrix[1] ?? 0,
      matrix[4] ?? 0,
      matrix[5] ?? 1,
      matrix[12] ?? 0,
      matrix[13] ?? 0
    );
  }

  function drawAnimateSpritePiece(rt, sprite){
    const frame = rt.data.atlas[sprite.N];
    const image = combatState.images.bfSword;
    if(!frame || !imgReady(image)) return;
    ctx.save();
    applyAnimateMatrix(sprite.M3D);
    if(frame.rotated){
      ctx.translate(0, frame.w);
      ctx.rotate(-Math.PI / 2);
      ctx.drawImage(image, frame.x, frame.y, frame.w, frame.h, 0, 0, frame.w, frame.h);
    } else {
      ctx.drawImage(image, frame.x, frame.y, frame.w, frame.h, 0, 0, frame.w, frame.h);
    }
    ctx.restore();
  }

  function drawAnimateTimeline(rt, timeline, frameIndex, depth = 0){
    if(!timeline || depth > 12) return;
    const layers = [...(timeline.L || [])].reverse();
    layers.forEach(layer => {
      const frame = activeAnimateFrame(layer, frameIndex);
      (frame?.E || []).forEach(element => {
        if(element.ASI){
          drawAnimateSpritePiece(rt, element.ASI);
          return;
        }
        if(!element.SI) return;
        const symbol = rt.symbols[element.SI.SN];
        if(!symbol?.TL) return;
        ctx.save();
        applyAnimateMatrix(element.SI.M3D);
        drawAnimateTimeline(rt, symbol.TL, element.SI.FF || 0, depth + 1);
        ctx.restore();
      });
    });
  }

  const BF_WIIK_Z_SING_STEPS = 4;
  function combatBfSingWindow(){
    const bpm = Number(state.chart?.bpm || state.currentSong?.tempo || 150) || 150;
    const stepSeconds = 60 / Math.max(1, bpm) / 4;
    return Math.max(0.16, Math.min(0.42, stepSeconds * BF_WIIK_Z_SING_STEPS));
  }

  function combatBfAnimLabel(t = 0){
    const held = combatHeldNote("player", t);
    if(held){
      const dir = DIR[held.lane % 4] || "down";
      return dir;
    }
    const pose = state.poses?.player || { time: -10, lane: 1, kind: "idle" };
    const age = performance.now() / 1000 - (pose.time || -10);
    if(age >= combatBfSingWindow() || !Number.isFinite(pose.lane)) return "idle";
    const dir = DIR[pose.lane % 4] || "down";
    return pose.kind === "miss" ? `miss ${dir}` : dir;
  }

  function combatBfOffsetKey(label){
    if(label === "miss left") return "leftMiss";
    if(label === "miss down") return "downMiss";
    if(label === "miss up") return "upMiss";
    if(label === "miss right") return "rightMiss";
    return label || "idle";
  }

  function combatBfOffsetResidual(rt, label){
    const offsets = rt.data.offsets || {};
    const idleOffset = offsets.idle || [0, 0];
    const offset = offsets[combatBfOffsetKey(label)] || idleOffset;
    const idleMatrix = rt.labelMatrices?.idle;
    const labelMatrix = rt.labelMatrices?.[label] || idleMatrix;
    const currentX = (labelMatrix?.[12] || 0) - (idleMatrix?.[12] || 0);
    const currentY = (labelMatrix?.[13] || 0) - (idleMatrix?.[13] || 0);
    return {
      x: (idleOffset[0] - offset[0]) - currentX,
      y: (idleOffset[1] - offset[1]) - currentY
    };
  }

  function drawBfSwordCharacter(x, y, scale, flipX, t, lean = 0){
    const rt = combatAnimateRuntime();
    if(!rt || !imgReady(combatState.images.bfSword)) return;
    const label = combatBfAnimLabel(t);
    const range = rt.labels[label] || rt.labels.idle || { start: 0, end: rt.maxFrame };
    const pose = state.poses?.player || { time: -10 };
    const held = combatHeldNote("player", t);
    const age = held ? Math.max(0, t - held.time) : performance.now() / 1000 - (pose.time || -10);
    const lane = Number.isFinite(Number(held?.lane)) ? held.lane : pose.lane;
    const hit = label === "idle" ? 0 : Math.max(0, 1 - age / 0.18);
    const juice = combatSpriteJuice("player", lane, hit, t);
    const len = Math.max(1, range.end - range.start);
    const frameOffset = label === "idle"
      ? Math.floor(t * 24) % len
      : Math.min(len - 1, Math.max(0, Math.floor(age * 24)));
    const anchor = rt.data.anchor || { centerX: -527, bottomY: 138 };
    const residual = combatBfOffsetResidual(rt, label);
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.translate(x, y);
    ctx.rotate(lean + juice.rotate);
    ctx.translate(juice.x, juice.y);
    ctx.transform(juice.scaleX, 0, juice.skewX, juice.scaleY, 0, 0);
    ctx.scale(flipX ? -scale : scale, scale);
    ctx.translate(residual.x, residual.y);
    ctx.translate(-anchor.centerX, -anchor.bottomY);
    drawAnimateTimeline(rt, rt.data.animation.AN.TL, range.start + frameOffset);
    if(!window.PERFORMANCE_MODE){
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 1;
      ctx.filter = WIIK_Z_LIGHT_FILTER;
      drawAnimateTimeline(rt, rt.data.animation.AN.TL, range.start + frameOffset);
      ctx.restore();
    }
    ctx.restore();
  }

  function combatDustDepthStyle(layer, depth){
    const spec = layer === "near"
      ? { strength: 1.25, y: 18, scale: 1.08, angle: 1.15, alpha: 1.05 }
      : layer === "mid"
        ? { strength: 0.82, y: 4, scale: 1, angle: 0.62, alpha: 1 }
        : { strength: 0.38, y: -16, scale: 0.94, angle: 0.28, alpha: 0.9 };
    const offset = Number(depth?.[layer] || 0);
    const lean = Number(depth?.lean || 0);
    const layerY = Number(depth?.[layer + "Y"] || 0);
    const layerScale = Number(depth?.scale?.[layer] || 1);
    const layerAngle = Number(depth?.angle?.[layer] || 0);
    return {
      x: offset * spec.strength,
      y: spec.y + layerY * spec.strength + lean * 150 * spec.strength,
      scale: spec.scale * layerScale + Math.abs(lean) * 1.25 * spec.strength,
      angle: layerAngle + lean * spec.angle,
      alpha: spec.alpha
    };
  }

  function drawCombatDust(layer, t, depth){
    const depthStyle = combatDustDepthStyle(layer, depth || combatDepth(t));
    const scrollFactors = { far: 0.2, mid: 0.6, near: 1.4 };
    const scroll = scrollFactors[layer] || 1;
    combatState.dust.forEach(p => {
      if(p.layer !== layer) return;
      const image = combatState.images[p.layer];
      if(!imgReady(image)) return;
      const spanX = canvas.width + 420;
      const spanY = canvas.height + p.startBelow + 220;
      const x = ((p.x + Math.sin(t * 0.2 + p.phase) * p.sway + spanX * 3) % spanX) - 210;
      const y = canvas.height + p.startBelow - ((t * p.speed + p.phase) % spanY);
      if(y < -180) return;
      ctx.save();
      ctx.globalAlpha = p.alpha * depthStyle.alpha;
      ctx.globalCompositeOperation = "screen";
      const origin = combatCameraParallaxPoint(canvas.width * 0.5 + depthStyle.x, canvas.height * 0.58 + depthStyle.y, scroll, scroll);
      ctx.translate(origin.x, origin.y);
      ctx.rotate(depthStyle.angle);
      ctx.scale(depthStyle.scale, depthStyle.scale);
      ctx.translate(-canvas.width * 0.5, -canvas.height * 0.58);
      ctx.drawImage(image, x, y, image.naturalWidth * p.scale, image.naturalHeight * p.scale);
      ctx.restore();
    });
  }

  function drawOneHitBackgroundRockField(t, depth){
    if(!isOneHit() || t < ONE_HIT_MOVING_ROCK_START) return;
    const elapsed = t - ONE_HIT_MOVING_ROCK_START;
    const warmup = easeOutCubic(elapsed / 2.4);
    const rocks = [
      { key: "back4", delay: 0.0, duration: 4.7, sx: 0.46, sy: 0.27, ex: -0.28, ey: 0.48, s0: 0.24, s1: 0.98, alpha: 0.72, rot: -0.1, drift: 34, flip: false },
      { key: "back5", delay: 0.55, duration: 5.3, sx: 0.58, sy: 0.32, ex: 0.93, ey: 0.55, s0: 0.18, s1: 1.05, alpha: 0.62, rot: 0.13, drift: 42, flip: true },
      { key: "back4", delay: 1.15, duration: 4.2, sx: 0.51, sy: 0.2, ex: 0.78, ey: 0.34, s0: 0.16, s1: 0.72, alpha: 0.52, rot: 0.2, drift: 28, flip: true },
      { key: "back5", delay: 1.75, duration: 5.8, sx: 0.42, sy: 0.36, ex: -0.18, ey: 0.62, s0: 0.22, s1: 0.92, alpha: 0.56, rot: -0.18, drift: 38, flip: false },
      { key: "back4", delay: 2.45, duration: 4.9, sx: 0.63, sy: 0.24, ex: 1.02, ey: 0.46, s0: 0.2, s1: 0.84, alpha: 0.5, rot: -0.04, drift: 30, flip: false },
      { key: "back5", delay: 3.1, duration: 5.1, sx: 0.37, sy: 0.25, ex: 0.12, ey: 0.43, s0: 0.15, s1: 0.68, alpha: 0.46, rot: 0.16, drift: 24, flip: true }
    ];
    const queue = [];
    for(const spec of rocks){
      const local = elapsed - spec.delay;
      if(local < 0) continue;
      const rawP = (local % spec.duration) / spec.duration;
      const p = rawP * rawP * (3 - 2 * rawP);
      const image = combatState.images[spec.key];
      if(!imgReady(image)) continue;
      const fadeIn = Math.min(1, rawP / 0.14);
      const fadeOut = 1 - Math.max(0, (rawP - 0.82) / 0.18);
      const centerX = canvas.width * (spec.sx + (spec.ex - spec.sx) * p) + depth.mid * 0.16 + Math.sin(t * 1.1 + spec.delay * 3) * spec.drift * (0.25 + p);
      const centerY = canvas.height * (spec.sy + (spec.ey - spec.sy) * p) + depth.midY * 0.52 + Math.cos(t * 0.9 + spec.delay * 4) * spec.drift * 0.22;
      const scale = spec.s0 + (spec.s1 - spec.s0) * p;
      const scroll = 0.28 + p * 0.64;
      const pos = combatCameraParallaxPoint(centerX - image.naturalWidth * scale * 0.5, centerY - image.naturalHeight * scale * 0.5, scroll, scroll);
      queue.push({
        p,
        key: spec.key,
        x: pos.x,
        y: pos.y,
        scale,
        angle: spec.rot + Math.sin(t * 0.65 + spec.delay * 5) * 0.045 + p * spec.rot * 0.8,
        alpha: warmup * fadeIn * Math.max(0, fadeOut) * spec.alpha,
        flip: spec.flip
      });
    }
    queue.sort((a, b) => a.p - b.p);
    for(const rock of queue){
      drawImageRotated(rock.key, rock.x, rock.y, rock.scale, rock.angle, rock.alpha, rock.flip);
    }
  }

  function oneHitSectionAmount(t, start = ONE_HIT_SIDE_SPEED_START){
    if(!isOneHit() || t < start) return 0;
    return easeOutCubic((t - start) / 1.35);
  }

  function oneHitPlatformMotion(t, depth){
    const amount = oneHitSectionAmount(t);
    if(amount <= 0.001) return { x: 0, y: 0, spread: 0, leftY: 0, rightY: 0, angle: 0 };
    const midSpec = WII_COMBAT_DEPTH.layers.mid;
    const phase = t * midSpec.floatRate + midSpec.phase;
    const midSway = Math.sin(phase);
    const slowDrift = Math.sin(t * 0.22 + 1.4);
    const x = (depth.mid * 0.34 + midSway * 16 + slowDrift * 14) * amount;
    const y = (depth.midY * 0.9 + Math.cos(phase) * 7) * amount;
    return {
      x,
      y,
      spread: Math.sin(t * 0.28 + 0.8) * 10 * amount,
      leftY: Math.sin(phase + 0.7) * 5 * amount,
      rightY: Math.sin(phase + 2.2) * 5 * amount,
      angle: (depth.angle?.mid || 0) * 0.8 * amount + Math.sin(phase) * 0.012 * amount
    };
  }

  function ensureCombatFxCanvas(){
    if(!combatState.fxCanvas){
      combatState.fxCanvas = document.createElement("canvas");
      combatState.fxCtx = combatState.fxCanvas.getContext("2d");
    }
    if(combatState.fxCanvas.width !== canvas.width || combatState.fxCanvas.height !== canvas.height){
      combatState.fxCanvas.width = canvas.width;
      combatState.fxCanvas.height = canvas.height;
      if(typeof setRenderQuality === "function") setRenderQuality(combatState.fxCtx);
    }
    combatState.fxCtx.clearRect(0, 0, canvas.width, canvas.height);
    combatState.fxCtx.drawImage(canvas, 0, 0);
    return combatState.fxCanvas;
  }

  function easeOutCubic(v){
    const x = Math.max(0, Math.min(1, v));
    return 1 - Math.pow(1 - x, 3);
  }

  function easeInCubic(v){
    const x = Math.max(0, Math.min(1, v));
    return x * x * x;
  }

  function easeInOutCubic(v){
    const x = Math.max(0, Math.min(1, v));
    return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
  }

  function shaderEase(kind, value){
    const name = String(kind || "linear").toLowerCase();
    const x = Math.max(0, Math.min(1, value));
    if(name.includes("quartout")) return 1 - Math.pow(1 - x, 4);
    if(name.includes("quartin")) return Math.pow(x, 4);
    if(name.includes("cubeinout")) return easeInOutCubic(value);
    if(name.includes("cubeout")) return easeOutCubic(value);
    if(name.includes("cubein")) return easeInCubic(value);
    return x;
  }

  function pulseFromStep(step, start, length){
    const age = step - start;
    if(age < 0 || age > length) return 0;
    return 1 - easeOutCubic(age / length);
  }

  function maxStepPulse(step, starts, length){
    let value = 0;
    for(const start of starts) value = Math.max(value, pulseFromStep(step, start, length));
    return value;
  }

  function combatSongStep(t){
    const spb = Number(state.chart?.spb) || 60 / (Number(state.chart?.bpm || state.currentSong?.tempo) || 150);
    return t / (spb / 4);
  }

  function combatInsaneFxState(t){
    const step = combatSongStep(t);
    const bloomStarts = [128, 256, 384, 512, 640, 768, 896];
    const speedStarts = [384, 640, 896];
    const burstStarts = [380, 496, 560, 624, 636, 892];
    let bloom = 0;
    let speed = 0;
    let burst = 0;
    for(const s of bloomStarts) bloom = Math.max(bloom, pulseFromStep(step, s, 8));
    for(const s of speedStarts) speed = Math.max(speed, pulseFromStep(step, s, 16));
    for(const s of burstStarts) burst = Math.max(burst, pulseFromStep(step, s, 10));
    const beat = ((step % 16) + 16) % 16;
    const earlyMirror = step < 128 ? 0.45 * Math.max(0, 1 - Math.min(beat, 16 - beat) / 8) : 0;
    const phase = ((step % 8) + 8) % 8;
    const wobbleActive = step >= 128 && phase < 4 ? 1 - easeOutCubic(phase / 4) : 0;
    const wobbleSign = Math.floor(step / 8) % 2 === 0 ? -1 : 1;
    return {
      step,
      bloom,
      speed,
      burst,
      bars: Math.max(speed * 0.8, burst * 0.35),
      mirror: Math.max(earlyMirror, wobbleActive * 0.55, speed * 0.5, burst * 0.65),
      angle: wobbleSign * wobbleActive * 5 + burst * 2.5,
      chrom: 1.2 + bloom * 9 + speed * 10 + burst * 7 + wobbleActive * 3
    };
  }

  function oneHitShaderFxState(t){
    const step = combatSongStep(t);
    let greyscale = 0;
    for(const win of ONE_HIT_GREYSCALE_WINDOWS){
      const age = step - win[0];
      if(age >= 0 && age <= win[1]) greyscale = Math.max(greyscale, win[2] * (1 - Math.max(0, age - win[1] * 0.82) / Math.max(1, win[1] * 0.18)));
    }
    const speed = maxStepPulse(step, ONE_HIT_SPEED_STEPS, 16);
    const sideSpeed = oneHitSideSpeedAmount(t);
    const bloom = maxStepPulse(step, ONE_HIT_BLOOM_STEPS, 16);
    const bars = maxStepPulse(step, ONE_HIT_BARS_STEPS, 16);
    const blur = maxStepPulse(step, ONE_HIT_BLUR_STEPS, 8);
    const warp = Math.max(maxStepPulse(step, ONE_HIT_WARP_STEPS, 16), speed * 0.42);
    return {
      step,
      greyscale,
      blur,
      warp,
      speed,
      sideSpeed,
      bloom,
      bars,
      chrom: bloom * 10 + speed * 9 + sideSpeed * 7 + warp * 8 + blur * 7,
      active: greyscale + blur + warp + speed + sideSpeed + bloom + bars
    };
  }

  function shimmyNotBadAmount(t){
    if(!isShimmy()) return 0;
    const data = window.SHIMMY_CHART?.notBadKid;
    if(!data) return 0;
    const start = Number(data.start || 0);
    const end = Number(data.end || start + 1.2) + 0.55;
    if(t < start || t > end) return 0;
    const fadeIn = Math.max(0, Math.min(1, (t - start) / 0.18));
    const fadeOut = 1 - Math.max(0, Math.min(1, (t - (end - 0.5)) / 0.5));
    return Math.min(fadeIn, fadeOut);
  }

  function currentWiiShaderEvents(){
    if(typeof state !== "undefined" && Array.isArray(state.chart?.shaderEvents) && state.chart.shaderEvents.length) return state.chart.shaderEvents;
    const selected = typeof state !== "undefined" ? state.selectedSong : "";
    if(selected === "combat") return window.COMBAT_CHART?.shaderEvents || [];
    if(selected === "oneHit") return window.ONE_HIT_CHART?.shaderEvents || [];
    if(selected === "shimmy") return window.SHIMMY_CHART?.shaderEvents || [];
    return [];
  }

  function shimmyShaderValue(step, name, property, fallback = 0){
    const events = currentWiiShaderEvents();
    let value = fallback;
    for(const event of events){
      if(event.name !== name || event.property !== property) continue;
      const start = Number(event.step || 0);
      if(start > step) break;
      const duration = Math.max(0.001, Number(event.duration || 0));
      const target = Number(event.value || 0);
      if(step <= start + duration){
        const from = Number.isFinite(Number(event.startValue)) ? Number(event.startValue) : value;
        value = from + (target - from) * shaderEase(event.ease, (step - start) / duration);
      } else {
        value = target;
      }
    }
    return value;
  }

  function shimmyShaderFxState(t){
    const events = currentWiiShaderEvents();
    if(!events.length && !isShimmy()) return null;
    const step = combatSongStep(t);
    const cacheKey = (state?.selectedSong || "") + ":" + Math.round(step * 1000);
    if(combatState.shaderFxCache?.key === cacheKey) return combatState.shaderFxCache.value;
    const mirrorZoomRaw = shimmyShaderValue(step, "mirror", "zoom", 1);
    const mirrorHudZoomRaw = shimmyShaderValue(step, "mirrorHud", "zoom", 1);
    const mirrorOtherZoomRaw = shimmyShaderValue(step, "mirrorOther", "zoom", 1);
    const mirrorAngleRaw = shimmyShaderValue(step, "mirror", "angle", 0);
    const mirrorHudAngleRaw = shimmyShaderValue(step, "mirrorHud", "angle", 0);
    const mirrorOtherAngleRaw = shimmyShaderValue(step, "mirrorOther", "angle", 0);
    const mirrorXRaw = shimmyShaderValue(step, "mirror", "x", 0);
    const mirrorYRaw = shimmyShaderValue(step, "mirror", "y", 0);
    const mirrorHudXRaw = shimmyShaderValue(step, "mirrorHud", "x", 0);
    const mirrorHudYRaw = shimmyShaderValue(step, "mirrorHud", "y", 0);
    const mirrorOtherXRaw = shimmyShaderValue(step, "mirrorOther", "x", 0);
    const mirrorOtherYRaw = shimmyShaderValue(step, "mirrorOther", "y", 0);
    const mirrorWarpRaw = Math.abs(shimmyShaderValue(step, "mirror", "warp", 0));
    const mirrorHudWarpRaw = Math.abs(shimmyShaderValue(step, "mirrorHud", "warp", 0));
    const mirrorOtherWarpRaw = Math.abs(shimmyShaderValue(step, "mirrorOther", "warp", 0));
    const mirrorGameZoom = Math.abs(mirrorZoomRaw - 1);
    const mirrorHudZoom = Math.abs(mirrorHudZoomRaw - 1);
    const mirrorOtherZoom = Math.abs(mirrorOtherZoomRaw - 1);
    const mirrorGameAngle = Math.max(Math.abs(mirrorAngleRaw), Math.abs(mirrorOtherAngleRaw)) / 8;
    const mirrorHudAngle = Math.abs(mirrorHudAngleRaw) / 8;
    const bloomRaw = Math.max(
      shimmyShaderValue(step, "bloom", "effect", 0),
      shimmyShaderValue(step, "bloom", "strength", 0)
    );
    const notBad = shimmyNotBadAmount(t);
    const blur = Math.max(0, shimmyShaderValue(step, "blur", "strength", 0));
    const greyscale = Math.max(0, Math.min(1, shimmyShaderValue(step, "greyscale", "strength", 0)));
    const speed = Math.max(0, shimmyShaderValue(step, "speed", "effect", 0));
    const bars = Math.max(0, shimmyShaderValue(step, "bars", "effect", 0));
    const colorFillFade = Math.max(0, Math.min(1, shimmyShaderValue(step, "ColorFill", "fade", 1)));
    const colorFill = {
      amount: 1 - colorFillFade,
      red: Math.max(0, Math.min(255, shimmyShaderValue(step, "ColorFill", "red", 0))),
      green: Math.max(0, Math.min(255, shimmyShaderValue(step, "ColorFill", "green", 0))),
      blue: Math.max(0, Math.min(255, shimmyShaderValue(step, "ColorFill", "blue", 0)))
    };
    const bloom = bloomRaw / 3;
    const gameWarp = clampValue(Math.max(mirrorWarpRaw, mirrorOtherWarpRaw, mirrorGameAngle * 0.2), 0, 0.75);
    const hudWarp = clampValue(Math.max(mirrorHudWarpRaw, mirrorHudAngle * 0.18), 0, 0.75);
    const mirror = Math.max(mirrorGameZoom * 5.2, mirrorOtherZoom * 4.4, mirrorGameAngle * 1.25, gameWarp * 2.35);
    const hudMirror = Math.max(mirrorHudZoom * 4.2, mirrorHudAngle * 1.15, hudWarp * 2.1);
    const signedGameAngle = Math.abs(mirrorOtherAngleRaw) > Math.abs(mirrorAngleRaw) ? mirrorOtherAngleRaw : mirrorAngleRaw;
    const cameraZoomPulse = clampValue(
      mirrorGameZoom * 0.34 + mirrorOtherZoom * 0.28 + mirrorHudZoom * 0.15 + bloom * 0.025 + speed * 0.035 + gameWarp * 0.045,
      0,
      0.22
    );
    const result = {
      hasEvents: events.length > 0,
      step,
      greyscale,
      blur,
      speed,
      bars,
      bloom,
      mirror,
      hudMirror,
      colorFill,
      gameZoom: mirrorZoomRaw,
      hudZoom: mirrorHudZoomRaw,
      gameAngle: signedGameAngle,
      hudAngle: mirrorHudAngleRaw,
      gameX: mirrorXRaw + mirrorOtherXRaw,
      gameY: mirrorYRaw + mirrorOtherYRaw,
      hudX: mirrorHudXRaw,
      hudY: mirrorHudYRaw,
      gameWarp,
      hudWarp,
      cameraZoomPulse,
      angle: signedGameAngle,
      chrom: 1.2 + bloom * 9 + speed * 8 + bars * 5 + Math.max(mirror, hudMirror) * 8 + blur * 7 + gameWarp * 11 + hudWarp * 8 + notBad * 11,
      active: greyscale + blur + speed + bars + bloom + mirror + hudMirror + gameWarp + hudWarp + notBad + colorFill.amount
    };
    combatState.shaderFxCache = { key: cacheKey, value: result };
    return result;
  }

  function shimmyDialogueText(t){
    if(!isShimmy()) return null;
    const data = window.SHIMMY_CHART?.notBadKid;
    if(!data) return null;
    const events = window.SHIMMY_CHART?.dialogueEvents || [];
    const textStart = Number(data.textStart || data.start || 0);
    const end = Number(data.end || textStart + 1.2);
    if(t < textStart - 0.05 || t > end + 0.65) return null;
    let text = "";
    for(const event of events){
      if(Number(event.time || 0) > t) break;
      if(event.action === "remove") text = String(data.line || text);
      else if(event.action === "add") text += String(event.text || "");
    }
    if(!text && t >= textStart) text = String(data.line || "");
    const fadeIn = Math.max(0, Math.min(1, (t - textStart) / 0.18));
    const fadeOut = t <= end ? 1 : 1 - Math.max(0, Math.min(1, (t - end) / 0.65));
    return { text, alpha: Math.min(fadeIn, fadeOut) };
  }

  function drawShimmyDialogue(t){
    const dialogue = shimmyDialogueText(t);
    if(!dialogue?.text || dialogue.alpha <= 0.01) return;
    const alpha = dialogue.alpha;
    const x = canvas.width * 0.5;
    const y = canvas.height - 92;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.globalCompositeOperation = "screen";
    ctx.shadowColor = "rgba(170,215,255,0.9)";
    ctx.shadowBlur = 28;
    ctx.fillStyle = "rgba(118,174,255,0.24)";
    ctx.fillRect(318, y - 42, canvas.width - 636, 76);
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "rgba(5,8,20,0.74)";
    ctx.strokeStyle = "rgba(190,222,255,0.72)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(330, y - 48, canvas.width - 660, 86, 8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#9fd8ff";
    ctx.font = "700 15px system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("MATT", 356, y - 17);
    ctx.fillStyle = "#ffffff";
    ctx.shadowColor = "rgba(126,196,255,0.85)";
    ctx.shadowBlur = 14;
    ctx.font = "800 31px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(dialogue.text, x, y + 16);
    ctx.restore();
  }

  function drawShimmyMattCharacter(x, y, scale, flipX, t, lean = 0){
    const data = window.SHIMMY_VISUAL_DATA?.shimmer;
    const image = combatState.images.shimmyShimmer;
    if(!data?.frames?.length || !imgReady(image) || typeof drawAtlasFrame !== "function") {
      drawCharacter("matt", "matt", "matt", x, y, scale, flipX, t, lean);
      return;
    }
    const startedAt = Number(window.SHIMMY_CHART?.notBadKid?.start || 0);
    const elapsed = Math.max(0, t - startedAt);
    const frame = frameFromList(data.frames, elapsed, data.fps || 18, false);
    if(!frame) return drawCharacter("matt", "matt", "matt", x, y, scale, flipX, t, lean);
    // User wants the not-bad kid to render at the same size as Matt. The
    // shimmer atlas has scale: 0.66 baked into SHIMMY_VISUAL_DATA, which
    // used to win over the caller-supplied `scale`. Flip the precedence so
    // the caller's value (WIIK_Z_MATT_SCALE = 0.5) takes priority; the
    // 0.66 just stays as a final fallback if nobody passes a scale.
    const drawScale = Number(scale || data.scale || 0.66);
    const amount = shimmyNotBadAmount(t);
    const juice = combatSpriteJuice("matt", 3, amount * 0.22, t);
    ctx.save();
    ctx.translate(x + 22, y);
    ctx.rotate(lean + juice.rotate);
    ctx.translate(juice.x, juice.y);
    ctx.transform(juice.scaleX, 0, juice.skewX, juice.scaleY, 0, 0);
    drawAtlasFrame(image, frame, 0, atlasFootCorrection(frame, drawScale), drawScale, 1, flipX);
    if(!window.PERFORMANCE_MODE){
      drawWiikZAtlasLighting(image, frame, 0, atlasFootCorrection(frame, drawScale), drawScale, flipX);
    }
    ctx.restore();
  }

  function oneHitSideSpeedAmount(t){
    if(!isOneHit() || t < ONE_HIT_SIDE_SPEED_START) return 0;
    const end = ONE_HIT_SIDE_SPEED_START + 9.6;
    if(t >= end) return 0;
    const fadeIn = easeOutCubic((t - ONE_HIT_SIDE_SPEED_START) / 0.45);
    const fadeOut = 1 - easeOutCubic((t - (end - 1.4)) / 1.4);
    return Math.max(0, Math.min(1, fadeIn, fadeOut));
  }

  function drawCombatSpeedLines(amount, t){
    if(amount <= 0.01) return;
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.lineWidth = 2.5;
    for(let i = 0; i < 34; i++){
      const lane = i / 34;
      const angle = lane * Math.PI * 2 + t * 0.8;
      const inner = 130 + (i % 5) * 14;
      const outer = 660 + (i % 7) * 26;
      const x1 = canvas.width / 2 + Math.cos(angle) * inner;
      const y1 = canvas.height / 2 + Math.sin(angle) * inner * 0.55;
      const x2 = canvas.width / 2 + Math.cos(angle) * outer;
      const y2 = canvas.height / 2 + Math.sin(angle) * outer * 0.55;
      const grad = ctx.createLinearGradient(x1, y1, x2, y2);
      grad.addColorStop(0, "rgba(255,255,255,0)");
      grad.addColorStop(0.55, "rgba(185,210,255," + (0.05 * amount).toFixed(3) + ")");
      grad.addColorStop(1, "rgba(148,88,255,0)");
      ctx.strokeStyle = grad;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function compileCombatShader(gl, type, source){
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if(!gl.getShaderParameter(shader, gl.COMPILE_STATUS)){
      const info = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(info || "shader compile failed");
    }
    return shader;
  }

  function ensureShimmySpeedFx(){
    if(combatState.shimmySpeedFx?.failed) return null;
    if(combatState.shimmySpeedFx) return combatState.shimmySpeedFx;
    const fxCanvas = document.createElement("canvas");
    const gl = fxCanvas.getContext("webgl", {
      alpha: true,
      antialias: false,
      depth: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
      stencil: false
    });
    if(!gl){
      combatState.shimmySpeedFx = { failed: true };
      return null;
    }
    try {
      const vertex = compileCombatShader(gl, gl.VERTEX_SHADER, `
        attribute vec2 aPosition;
        attribute vec2 aTexCoord;
        varying vec2 openfl_TextureCoordv;
        void main(){
          openfl_TextureCoordv = aTexCoord;
          gl_Position = vec4(aPosition, 0.0, 1.0);
        }
      `);
      const fragment = compileCombatShader(gl, gl.FRAGMENT_SHADER, `
        precision mediump float;
        uniform float iTime;
        uniform float effect;
        varying vec2 openfl_TextureCoordv;

        float mod289(float x){return x - floor(x * (1.0 / 289.0)) * 289.0;}
        vec4 mod289(vec4 x){return x - floor(x * (1.0 / 289.0)) * 289.0;}
        vec4 perm(vec4 x){return mod289(((x * 34.0) + 1.0) * x);}

        float noise(vec3 p){
          vec3 a = floor(p);
          vec3 d = p - a;
          d = d * d * (3.0 - 2.0 * d);

          vec4 b = a.xxyy + vec4(0.0, 1.0, 0.0, 1.0);
          vec4 k1 = perm(b.xyxy);
          vec4 k2 = perm(k1.xyxy + b.zzww);

          vec4 c = k2 + a.zzzz;
          vec4 k3 = perm(c);
          vec4 k4 = perm(c + 1.0);

          vec4 o1 = fract(k3 * (1.0 / 41.0));
          vec4 o2 = fract(k4 * (1.0 / 41.0));

          vec4 o3 = o2 * d.z + o1 * (1.0 - d.z);
          vec2 o4 = o3.yw * d.x + o3.xz * (1.0 - d.x);

          return o4.y * d.y + o4.x * (1.0 - d.y);
        }

        float speed = 25.0;
        float size = 50.0;
        float cutoff = 0.2;

        void main(){
          vec2 uv = openfl_TextureCoordv.xy;
          vec2 centeredUV = uv - 0.5;
          float dist = length(centeredUV);
          vec2 dir = dist > 0.001 ? normalize(centeredUV) * (size + noise(vec3(iTime))) : vec2(0.0);
          float amount = noise(vec3(dir, iTime * speed)) * noise(vec3(dir, iTime * speed * 1.2));
          amount *= smoothstep(cutoff, 0.7, dist);
          if(amount > 0.2)
            amount *= 3.0;
          else
            amount = 0.0;
          if(noise(vec3(dir, iTime)) > effect)
            amount = 0.0;
          gl_FragColor = vec4(vec3(amount), clamp(amount * 0.82, 0.0, 1.0));
        }
      `);
      const program = gl.createProgram();
      gl.attachShader(program, vertex);
      gl.attachShader(program, fragment);
      gl.linkProgram(program);
      if(!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || "shader link failed");
      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        -1, -1, 0, 0,
         1, -1, 1, 0,
        -1,  1, 0, 1,
         1,  1, 1, 1
      ]), gl.STATIC_DRAW);
      combatState.shimmySpeedFx = {
        canvas: fxCanvas,
        gl,
        program,
        buffer,
        aPosition: gl.getAttribLocation(program, "aPosition"),
        aTexCoord: gl.getAttribLocation(program, "aTexCoord"),
        uTime: gl.getUniformLocation(program, "iTime"),
        uEffect: gl.getUniformLocation(program, "effect")
      };
      if(typeof canvas !== "undefined"){
        fxCanvas.width = canvas.width;
        fxCanvas.height = canvas.height;
        paintShimmySpeedFx(combatState.shimmySpeedFx, 0, 0);
      }
    } catch(error) {
      combatState.shimmySpeedFx = { failed: true, error };
      return null;
    }
    return combatState.shimmySpeedFx;
  }

  function paintShimmySpeedFx(fx, amount, t){
    const gl = fx.gl;
    gl.viewport(0, 0, fx.canvas.width, fx.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(fx.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, fx.buffer);
    gl.enableVertexAttribArray(fx.aPosition);
    gl.vertexAttribPointer(fx.aPosition, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(fx.aTexCoord);
    gl.vertexAttribPointer(fx.aTexCoord, 2, gl.FLOAT, false, 16, 8);
    gl.uniform1f(fx.uTime, t);
    gl.uniform1f(fx.uEffect, amount);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  function drawShimmyOriginalSpeedEffect(effect, t){
    const amount = Math.max(0, Math.min(0.25, effect || 0));
    if(amount <= 0.005) return;
    const fx = ensureShimmySpeedFx();
    if(!fx) return;
    if(fx.canvas.width !== canvas.width || fx.canvas.height !== canvas.height){
      fx.canvas.width = canvas.width;
      fx.canvas.height = canvas.height;
      paintShimmySpeedFx(fx, 0, 0);
    }
    paintShimmySpeedFx(fx, amount, t);
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.drawImage(fx.canvas, 0, 0);
    ctx.restore();
  }

  function drawOneHitSideSpeedLines(amount, t){
    if(amount <= 0.01) return;
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.lineCap = "round";
    for(let side = -1; side <= 1; side += 2){
      for(let i = 0; i < 24; i++){
        const seed = i * 61 + (side > 0 ? 19 : 0);
        const y = ((seed + t * (520 + (i % 5) * 28)) % (canvas.height + 160)) - 80;
        const reach = 100 + (i % 7) * 18 + Math.sin(t * 2 + i) * 14;
        const x1 = side < 0 ? -42 : canvas.width + 42;
        const x2 = side < 0 ? reach : canvas.width - reach;
        const y2 = y + Math.sin(t * 2.7 + i) * 16;
        const grad = ctx.createLinearGradient(x1, y, x2, y2);
        if(side < 0){
          grad.addColorStop(0, "rgba(255,255,255,0)");
          grad.addColorStop(0.35, "rgba(196,224,255," + (0.34 * amount).toFixed(3) + ")");
          grad.addColorStop(1, "rgba(130,90,255,0)");
        } else {
          grad.addColorStop(0, "rgba(255,255,255,0)");
          grad.addColorStop(0.65, "rgba(196,224,255," + (0.34 * amount).toFixed(3) + ")");
          grad.addColorStop(1, "rgba(130,90,255,0)");
        }
        ctx.strokeStyle = grad;
        ctx.lineWidth = (2 + (i % 4) * 0.9) * amount;
        ctx.beginPath();
        ctx.moveTo(x1, y);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawWiiHudCameraShaders(fx, source, t){
    const mirror = Math.max(fx?.hudMirror || 0, fx?.hudWarp || 0);
    if(mirror <= 0.01) return;
    const left = typeof laneX === "function" ? laneX(0) - 76 : canvas.width * 0.14;
    const right = typeof laneX === "function" ? laneX(7) + 76 : canvas.width * 0.86;
    const top = 0;
    const height = canvas.height;
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const warp = fx?.hudWarp || 0;
    const zoomWarp = Math.abs(1 - (fx?.hudZoom || 1));
    ctx.save();
    ctx.beginPath();
    ctx.rect(Math.max(0, left), top, Math.min(canvas.width, right) - Math.max(0, left), height);
    ctx.clip();
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = Math.min(0.32, 0.045 + mirror * 0.15 + warp * 0.1);
    ctx.translate(cx, cy);
    ctx.rotate(((fx?.hudAngle || 0) + Math.sin(t * 9) * mirror * 2.4) * Math.PI / 180 * 0.48);
    ctx.transform(1 + warp * 0.018, Math.sin(t * 6) * warp * 0.012, Math.sin(t * 7.5) * warp * 0.032, 1 + warp * 0.014, 0, 0);
    const scale = 1 + mirror * 0.072 + zoomWarp * 0.18;
    ctx.scale(scale, scale);
    ctx.drawImage(source, -cx + Math.sin(t * 10) * mirror * 8 + warp * 18, -cy + Math.cos(t * 8) * warp * 8);
    ctx.restore();
  }

  function drawCombatInsanePostFx(t){
    if(!isCombat() || !state.playing || !Number.isFinite(t)) return;
    const chartShaderFx = shimmyShaderFxState(t);
    const useChartShaders = !!chartShaderFx?.hasEvents;
    const zeroFx = { step: combatSongStep(t), bloom: 0, speed: 0, burst: 0, bars: 0, mirror: 0, angle: 0, chrom: 1.2 };
    const fx = useChartShaders || isShimmy() ? zeroFx : combatInsaneFxState(t);
    const oneHitMotionFx = isOneHit() ? oneHitShaderFxState(t) : null;
    const oneHitFx = !useChartShaders && isOneHit() ? oneHitMotionFx : null;
    const oneHitCameraFx = isOneHit() ? oneHitCameraState(t) : null;
    const shimmyFx = useChartShaders || isShimmy() ? chartShaderFx : null;
    const active = fx.mirror + fx.bloom + fx.speed + fx.burst + (oneHitFx?.active || 0) + (shimmyFx?.active || 0) + (oneHitMotionFx?.sideSpeed || 0) + (oneHitCameraFx?.flash || 0);
    if(active <= 0.015 && fx.chrom <= 1.21 && (!oneHitFx || oneHitFx.active <= 0.015) && (!shimmyFx || shimmyFx.active <= 0.015) && (oneHitMotionFx?.sideSpeed || 0) <= 0.015 && (oneHitCameraFx?.flash || 0) <= 0.015) return;
    const source = ensureCombatFxCanvas();
    const cx = canvas.width / 2, cy = canvas.height / 2;
    const speedEffect = Math.max(
      shimmyFx?.speed || 0,
      Math.min(0.24, (fx.speed || 0) * 0.22),
      Math.min(0.24, (oneHitFx?.speed || 0) * 0.22),
      Math.min(0.2, (oneHitMotionFx?.sideSpeed || 0) * 0.18)
    );
    drawShimmyOriginalSpeedEffect(speedEffect, t);

    const greyscale = Math.max(oneHitFx?.greyscale || 0, shimmyFx?.greyscale || 0);
    const blur = Math.max(oneHitFx?.blur || 0, shimmyFx?.blur || 0);
    if(greyscale > 0.01 || blur > 0.01){
      ctx.save();
      ctx.globalAlpha = Math.min(0.86, 0.2 + greyscale * 0.58 + blur * 0.18);
      ctx.filter = "grayscale(" + greyscale.toFixed(3) + ") contrast(" + (1 + greyscale * 0.22).toFixed(3) + ") blur(" + (blur * 4.5).toFixed(2) + "px)";
      ctx.drawImage(source, 0, 0);
      ctx.filter = "none";
      ctx.restore();
    }

    if(fx.mirror > 0.01 || (oneHitFx?.warp || 0) > 0.01 || (shimmyFx?.mirror || 0) > 0.01 || (shimmyFx?.gameWarp || 0) > 0.01){
      const mirror = Math.max(fx.mirror, (oneHitFx?.warp || 0) * 0.86, shimmyFx?.mirror || 0, (shimmyFx?.gameWarp || 0) * 1.35);
      const shaderWarp = shimmyFx?.gameWarp || 0;
      const shaderAngle = shimmyFx?.gameAngle || 0;
      const shaderZoom = Math.abs(1 - (shimmyFx?.gameZoom || 1));
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      ctx.globalAlpha = Math.min(0.34, 0.05 + mirror * 0.15 + shaderWarp * 0.1);
      ctx.translate(cx, cy);
      ctx.rotate((fx.angle + shaderAngle + (oneHitFx?.warp || 0) * Math.sin(t * 8) * 7) * Math.PI / 180 * 0.55);
      ctx.transform(1 + shaderWarp * 0.018, Math.sin(t * 5.5) * shaderWarp * 0.014, Math.sin(t * 7.5) * shaderWarp * 0.04, 1 + shaderWarp * 0.018, 0, 0);
      const scale = 1 + mirror * 0.082 + shaderZoom * 0.24;
      ctx.scale(scale, scale);
      ctx.drawImage(source, -cx + Math.sin(t * 12) * mirror * 9 + shaderWarp * 24, -cy + Math.cos(t * 8) * shaderWarp * 9);
      ctx.globalAlpha = Math.min(0.1, mirror * 0.045 + shaderWarp * 0.065);
      ctx.drawImage(source, -cx - 7 - shaderWarp * 14, -cy + 2);
      ctx.drawImage(source, -cx + 7 + shaderWarp * 14, -cy - 2);
      ctx.restore();
    }
    drawWiiHudCameraShaders(shimmyFx, source, t);

    const chrom = Math.max(fx.chrom, oneHitFx?.chrom || 0, shimmyFx?.chrom || 0);
    if(chrom > 1.4){
      const offset = Math.min(18, chrom);
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      ctx.globalAlpha = Math.min(0.22, 0.06 + active * 0.09);
      ctx.filter = "sepia(1) saturate(6) hue-rotate(275deg)";
      ctx.drawImage(source, -offset, 0);
      ctx.filter = "sepia(1) saturate(6) hue-rotate(145deg)";
      ctx.drawImage(source, offset, 0);
      ctx.filter = "none";
      ctx.restore();
    }

    const bloom = Math.max(fx.bloom, oneHitFx?.bloom || 0, shimmyFx?.bloom || 0);
    if(bloom > 0.01){
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      ctx.globalAlpha = Math.min(0.7, 0.18 + bloom * 0.46);
      ctx.filter = "blur(" + (6 + bloom * 15).toFixed(1) + "px) saturate(1.8) brightness(1.18)";
      ctx.drawImage(source, 0, 0);
      ctx.filter = "none";
      ctx.globalAlpha = Math.min(0.28, bloom * 0.22);
      ctx.fillStyle = "#f2eaff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
    }

    const colorFill = shimmyFx?.colorFill;
    if(colorFill && colorFill.amount > 0.01){
      ctx.save();
      ctx.globalAlpha = Math.min(1, colorFill.amount);
      ctx.fillStyle = "rgb(" + Math.round(colorFill.red) + "," + Math.round(colorFill.green) + "," + Math.round(colorFill.blue) + ")";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
    }

    drawCombatSpeedLines(Math.max(fx.burst * 0.7, (fx.speed || 0) * 0.45, (oneHitFx?.speed || 0) * 0.45), t);
    drawOneHitSideSpeedLines(oneHitMotionFx?.sideSpeed || 0, t);

    const bars = Math.max(
      Math.min(0.24, (fx.bars || 0) * 0.15),
      Math.min(0.24, (oneHitFx?.bars || 0) * 0.15),
      Math.min(0.45, shimmyFx?.bars || 0)
    );
    if(bars > 0.003){
      ctx.save();
      const h = canvas.height * bars;
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, canvas.width, h);
      ctx.fillRect(0, canvas.height - h, canvas.width, h);
      ctx.restore();
    }

    if((oneHitCameraFx?.flash || 0) > 0.01){
      ctx.save();
      ctx.globalAlpha = Math.min(0.9, oneHitCameraFx.flash);
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
    }

    const notBadBloom = shimmyNotBadAmount(t);
    if(notBadBloom > 0.01){
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      const bloomGlow = ctx.createRadialGradient(cx, cy, 70, cx, cy, 760);
      bloomGlow.addColorStop(0, "rgba(210,240,255," + (0.44 * notBadBloom).toFixed(3) + ")");
      bloomGlow.addColorStop(0.42, "rgba(128,188,255," + (0.24 * notBadBloom).toFixed(3) + ")");
      bloomGlow.addColorStop(1, "rgba(10,20,56,0)");
      ctx.fillStyle = bloomGlow;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.globalAlpha = Math.min(0.34, notBadBloom * 0.28);
      ctx.fillStyle = "#dff4ff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
    }

    ctx.save();
    const vignette = ctx.createRadialGradient(cx, cy, 100, cx, cy, 760);
    vignette.addColorStop(0, "rgba(92,72,180,0)");
    vignette.addColorStop(0.68, "rgba(92,72,180," + Math.min(0.1, active * 0.07).toFixed(3) + ")");
    vignette.addColorStop(1, "rgba(5,0,18," + Math.min(0.32, 0.12 + active * 0.16).toFixed(3) + ")");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();

    drawShimmyDialogue(t);
  }

  function drawCombatFallback(t){
    const g = ctx.createLinearGradient(0, 0, 0, canvas.height);
    g.addColorStop(0, "#060716");
    g.addColorStop(1, "#141042");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "rgba(190,170,255,0.18)";
    for(let i = 0; i < 7; i++){
      ctx.beginPath();
      ctx.arc((i * 193 + t * 22) % canvas.width, 140 + Math.sin(t + i) * 90, 34 + i * 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawCombatStage(t){
    initCombatVisuals();
    if(!combatReady()){
      drawCombatFallback(t);
      return;
    }

    const depth = combatDepth(t);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawWiikZStageSprite(WIIK_Z_STAGE.unknownBG, 0, 0, 1, 1, 0, wiikZStageDepthStyle("bg", depth));
    drawCombatDust("far", t, depth);
    if(isOneHit() && t >= ONE_HIT_MOVING_ROCK_START){
      drawOneHitBackgroundRockField(t, depth);
    } else {
      drawWiikZStageSprite(WIIK_Z_STAGE.back4, 0, 0, 1, 1, 0, wiikZStageDepthStyle("far", depth));
      drawWiikZStageSprite(WIIK_Z_STAGE.back5, 0, 0, 1, 1, 0, wiikZStageDepthStyle("mid", depth));
    }
    drawCombatDust("mid", t, depth);

    const platformScale = worldScale(WIIK_Z_STAGE.platformLeft.scale);
    const platformMotion = wiikZPlatformMotion(t, depth);
    const leftPlatformX = worldX(WIIK_Z_STAGE.platformLeft.x) + platformMotion.left.x;
    const rightPlatformX = worldX(WIIK_Z_STAGE.platformRight.x) + platformMotion.right.x;
    const leftPlatformY = worldY(WIIK_Z_STAGE.platformLeft.y) + platformMotion.left.y;
    const rightPlatformY = worldY(WIIK_Z_STAGE.platformRight.y) + platformMotion.right.y;
    drawImageRotated("platform", leftPlatformX, leftPlatformY, platformScale, 0);
    drawImageRotated("platform", rightPlatformX, rightPlatformY, platformScale, 0, 1, true);
    drawWiikZStageSprite(WIIK_Z_STAGE.splitLeft, 0, 0, 1, 1, 0, wiikZStageDepthStyle("near", depth));
    drawWiikZStageSprite(WIIK_Z_STAGE.splitRight, 0, 0, 1, 1, 0, wiikZStageDepthStyle("near", depth));

    const anchors = wiikZCharacterAnchors(t);
    if(isShimmy() && shimmyNotBadAmount(t) > 0.01) drawShimmyMattCharacter(anchors.matt.x, anchors.matt.y, WIIK_Z_MATT_SCALE, false, t, 0);
    else drawCharacter("matt", "matt", "matt", anchors.matt.x, anchors.matt.y, WIIK_Z_MATT_SCALE, false, t, 0);
    drawBfSwordCharacter(anchors.bf.x, anchors.bf.y, WIIK_Z_BF_SCALE, false, t, 0);
    drawCombatDust("near", t, depth);
    // (Wii Funkin's unknownnew has no top-of-screen purple glow; removed.)
  }

  function combatTimelineSide(t){
    const timeline = state.chart?.timeline;
    if(!Array.isArray(timeline) || !timeline.length) return "";
    const bpm = Number(state.chart?.bpm || state.currentSong?.bpm || 160);
    const spb = Number(state.chart?.spb || (Number.isFinite(bpm) && bpm > 0 ? 60 / bpm : 0.375));
    let current = null;
    for(let i = 0; i < timeline.length; i++){
      const sec = timeline[i];
      let start = Number(sec.startTime);
      let end = Number(sec.endTime);
      if(!Number.isFinite(start) && Number.isFinite(Number(sec.startBeat))) start = Number(sec.startBeat) * spb;
      if(!Number.isFinite(end) && Number.isFinite(Number(sec.endBeat))) end = Number(sec.endBeat) * spb;
      if(!Number.isFinite(start)) continue;
      if(!Number.isFinite(end)){
        const next = timeline[i + 1];
        let nextStart = Number(next?.startTime);
        if(!Number.isFinite(nextStart) && Number.isFinite(Number(next?.startBeat))) nextStart = Number(next.startBeat) * spb;
        end = Number.isFinite(nextStart) ? nextStart : Infinity;
      }
      if(t >= start && t < end){
        current = sec;
        break;
      }
    }
    if(!current) return "";
    if(Object.prototype.hasOwnProperty.call(current, "mustHitSection")) return current.mustHitSection ? "player" : "opp";
    if(Object.prototype.hasOwnProperty.call(current, "mustHit")) return current.mustHit ? "player" : "opp";
    const turn = String(current.turn || current.side || current.camera || current.mode || "").toLowerCase();
    if(turn === "player" || turn === "bf" || turn === "boyfriend") return "player";
    if(turn === "opp" || turn === "opponent" || turn === "dad" || turn === "matt") return "opp";
    if(turn === "both" || turn === "duet" || turn === "trade" || turn === "center" || turn === "middle") return "both";
    return "";
  }

  function combatWiiCameraBump(t, side){
    if(side !== "opp" && side !== "player") return { x: 0, y: 0, active: 0 };
    const notes = state.chart?.notes;
    if(!Array.isArray(notes)) return { x: 0, y: 0, active: 0 };
    let latest = null;
    for(const note of notes){
      const noteTime = Number(note.time);
      if(!Number.isFinite(noteTime)) continue;
      if(noteTime > t) break;
      if(note.side !== side) continue;
      const age = t - noteTime;
      if(age < 0 || age > 1) continue;
      if(!latest || noteTime > latest.time) latest = { note, time: noteTime };
    }
    if(!latest) return { x: 0, y: 0, active: 0 };
    const age = t - latest.time;
    const active = Math.max(0, Math.min(1, age <= 0.86 ? 1 : 1 - easeOutCubic((age - 0.86) / 0.14)));
    const laneRaw = Number(latest.note.lane || 0);
    const lane = ((Math.floor(laneRaw) % 4) + 4) % 4;
    const move = 9 * active;
    if(lane === 0) return { x: -move, y: 0, active };
    if(lane === 1) return { x: 0, y: move, active };
    if(lane === 2) return { x: 0, y: -move, active };
    return { x: move, y: 0, active };
  }

  function activeCombatSide(t){
    if(!state.chart?.notes) return "both";
    const oneHitCamera = oneHitCameraState(t);
    if(oneHitCamera.duet) return "both";
    if(combatState.cameraSong !== state.selectedSong || t < 0.08){
      combatState.cameraSong = state.selectedSong;
      combatState.cameraLastSide = "both";
      combatState.cameraLastSideTime = -99;
    }
    let hasOpp = false;
    let hasPlayer = false;
    for(const note of state.chart.notes){
      if(note.time > t + 0.09) break;
      const activeTap = !isHoldNote(note) && note.time >= t - 0.05;
      const activeHold = isHoldNote(note) && t >= note.time - 0.05 && holdEndTime(note) >= t - 0.03;
      if(!activeTap && !activeHold) continue;
      if(note.side === "opp") hasOpp = true;
      if(note.side === "player") hasPlayer = true;
    }
    const side = hasOpp && hasPlayer ? "both" : hasOpp ? "opp" : hasPlayer ? "player" : "";
    if(side){
      combatState.cameraLastSide = side;
      combatState.cameraLastSideTime = t;
      return side;
    }
    const holdTime = isShimmy() ? 1.25 : 0.72;
    if(combatState.cameraLastSide !== "both" && t - combatState.cameraLastSideTime <= holdTime) return combatState.cameraLastSide;
    return combatTimelineSide(t) || "both";
  }

  function oneHitCameraState(t){
    const result = { duet: false, zoomOffset: 0, flash: 0 };
    if(!isOneHit()) return result;
    const events = window.ONE_HIT_CHART?.cameraEvents || [];
    let zoomOffset = 0;
    for(const event of events){
      const eventTime = Number(event.time || 0);
      if(eventTime <= t && event.type === "duetCamera") result.duet = !!event.enabled;
      if(event.type === "betterZoom"){
        const duration = Math.max(0.01, Number(event.duration || 0.5));
        const amount = Number(event.amount || 0);
        const age = t - eventTime;
        if(age >= 0){
          const from = zoomOffset;
          const to = zoomOffset + amount;
          if(age <= duration){
            const fallbackEase = amount > 0.2 ? "quartIn" : amount < -0.25 ? "quartOut" : "cubeOut";
            zoomOffset = from + (to - from) * shaderEase(event.ease || fallbackEase, age / duration);
          } else {
            zoomOffset = to;
          }
        }
      } else if(event.type === "flash") {
        const age = t - eventTime;
        const duration = Math.max(0.05, Number(event.duration || 1));
        if(age >= 0 && age <= duration) result.flash = Math.max(result.flash, 1 - age / duration);
      }
    }
    result.zoomOffset = zoomOffset;
    return result;
  }

  function combatRockCameraMotion(t, side){
    const platformMotion = wiikZPlatformMotion(t);
    if(side === "opp") return { x: platformMotion.left.x, y: platformMotion.left.y };
    if(side === "player") return { x: platformMotion.right.x, y: platformMotion.right.y };
    return {
      x: (platformMotion.left.x + platformMotion.right.x) * 0.5,
      y: (platformMotion.left.y + platformMotion.right.y) * 0.5
    };
  }

  function combatMattRockAnchor(t){
    return wiikZCharacterAnchors(t).matt;
  }

  function wiiShaderCameraMotion(t){
    if(window.REDUCE_MOTION) return { x: 0, y: 0, zoom: 0, active: 0 };
    const fx = shimmyShaderFxState(t);
    if(!fx?.hasEvents) return { x: 0, y: 0, zoom: 0, active: 0 };
    const perf = window.PERFORMANCE_MODE ? 0.55 : 1;
    const zoomDeviation = Math.abs((fx.gameZoom || 1) - 1) + Math.abs((fx.hudZoom || 1) - 1) * 0.35;
    const xyIntensity = Math.abs(fx.gameX || 0) + Math.abs(fx.gameY || 0) + Math.abs(fx.hudX || 0) * 0.35 + Math.abs(fx.hudY || 0) * 0.35;
    const intensity = clampValue((fx.mirror + fx.hudMirror + fx.gameWarp + fx.hudWarp + fx.speed + fx.bloom + zoomDeviation * 1.7 + xyIntensity) * 0.24, 0, 1) * perf;
    const step = fx.step || combatSongStep(t);
    return {
      x: (Math.sin(t * 7.2 + step * 0.035) * 12 * intensity) + (fx.gameAngle || 0) * 0.68 * perf + ((fx.gameX || 0) * 18 + (fx.hudX || 0) * 6) * perf,
      y: (Math.cos(t * 6.4 + step * 0.025) * 8 * intensity) + Math.sin(step * 0.12) * (fx.gameWarp || 0) * 18 * perf + ((fx.gameY || 0) * 14 + (fx.hudY || 0) * 5) * perf,
      zoom: ((fx.cameraZoomPulse || 0) * 1.45 + clampValue(zoomDeviation * 0.18, 0, 0.08) + Math.min(0.07, (fx.bloom || 0) * 0.02 + (fx.speed || 0) * 0.04)) * perf,
      active: intensity
    };
  }

  const originalStage = typeof stage === "function" ? stage : null;
  if(originalStage){
    stage = function(t){
      if(isCombat()){
        drawCombatStage(t);
        return;
      }
      return originalStage.apply(this, arguments);
    };
  }

  const originalUpdateCamera = typeof updateCamera === "function" ? updateCamera : null;
  if(originalUpdateCamera){
    updateCamera = function(t, dt){
      originalUpdateCamera.apply(this, arguments);
      if(!isCombat()) return;
      const side = activeCombatSide(t);
      const oneHitCamera = oneHitCameraState(t);
      const rockMotion = combatRockCameraMotion(t, side);
      const mattRockAnchor = combatMattRockAnchor(t);
      const shaderCamera = wiiShaderCameraMotion(t);
      const mattCenterY = mattRockAnchor.y - 78;
      const mattCloseY = mattRockAnchor.y - 58;
      const target = side === "opp"
        ? { x: 332 + rockMotion.x, y: mattCloseY, zoom: 1.76 }
        : side === "player"
          ? { x: 958 + rockMotion.x, y: 468 + rockMotion.y, zoom: 1.76 }
          : { x: 640 + rockMotion.x, y: mattCenterY, zoom: 1.54 };
      if(isOneHit()) {
        target.zoom = Math.max(1.2, target.zoom + oneHitCamera.zoomOffset);
        if(oneHitCamera.duet) {
          target.x = 640 + rockMotion.x;
          target.y = mattCenterY;
        }
      }
      if(isShimmy()){
        const notBad = shimmyNotBadAmount(t);
        if(notBad > 0.01){
          const mattMotion = combatRockCameraMotion(t, "opp");
          target.x = 332 + mattMotion.x * 0.45;
          target.y = mattRockAnchor.y - 70;
          target.zoom = Math.max(target.zoom, 1.9 + notBad * 0.22);
        }
      }
      const cameraBump = combatWiiCameraBump(t, side);
      target.x += cameraBump.x;
      target.y += cameraBump.y;
      target.x += shaderCamera.x;
      target.y += shaderCamera.y;
      target.zoom += shaderCamera.zoom;
      // Camera smoothing - exponential lerp parameterised so per-frame catch-up
      // is a fixed FRACTION of the remaining distance per unit time, framerate
      // independent. The note-direction bump uses the quicker Wii CamMovement
      // catch-up, then settles back to the smoother platform camera.
      const dtClamped = Math.max(0, dt || 0.016);
      const cameraLive = cameraBump.active > 0.01 || shaderCamera.active > 0.01;
      const posLerp = 1 - Math.pow(cameraLive ? 0.035 : 0.08, dtClamped);
      const zoomLerp = 1 - Math.pow(shaderCamera.active > 0.01 ? 0.075 : 0.12, dtClamped);
      combatState.cameraCurrent.x += (target.x - combatState.cameraCurrent.x) * posLerp;
      combatState.cameraCurrent.y += (target.y - combatState.cameraCurrent.y) * posLerp;
      combatState.cameraCurrent.zoom += (target.zoom - combatState.cameraCurrent.zoom) * zoomLerp;
      state.camera.focusX = combatState.cameraCurrent.x;
      state.camera.focusY = combatState.cameraCurrent.y;
      state.camera.zoom = combatState.cameraCurrent.zoom;
      state.camera.lastSide = side;
    };
  }

  const originalApplyDustinBloom = typeof applyDustinBloom === "function" ? applyDustinBloom : null;
  if(originalApplyDustinBloom){
    applyDustinBloom = function(t){
      originalApplyDustinBloom.apply(this, arguments);
      drawCombatInsanePostFx(t);
    };
  }

  window.ensureCombatVisuals = initCombatVisuals;
})();

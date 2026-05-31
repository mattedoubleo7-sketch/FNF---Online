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
    fxCtx: null
  };

  const ONE_HIT_SPEED_STEPS = [528, 600, 632, 652, 704, 3344, 3416, 3448, 3468, 3520, 4864];
  const ONE_HIT_BLOOM_STEPS = [256, 512, 640, 768, 1024, 1280, 1408, 1536, 1600, 1664, 1728, 1792, 1856, 1920, 1984, 2048, 2080, 2112, 2144, 2176, 2208, 2240, 2272, 2304, 2368, 2432, 2496, 2560, 2624, 2688, 2752, 2816, 3072, 3328, 3456, 3584, 3840, 4096, 4224, 4352, 4480, 4608, 4736, 4864, 4992, 5120, 5248, 5376];
  const ONE_HIT_BARS_STEPS = [504, 760, 1272, 1528, 1592, 1656, 1720, 1784, 1848, 1912, 1976, 2040, 2072, 2104, 2136, 2168, 2200, 2232, 2264, 2296, 2360, 2424, 2488, 2552, 2616, 2680, 2744, 2808, 3320, 3576, 3832, 4088, 4344, 4856];
  const ONE_HIT_BLUR_STEPS = [2560, 2568, 2576, 2584, 2624, 2632, 2640, 2648, 2688, 2696, 2704, 2712, 2752, 2760, 2768, 2776];
  const ONE_HIT_WARP_STEPS = [2048, 2080, 2112, 2144, 2176, 2208, 2240, 2272, 2560, 2568, 2576, 2584, 2624, 2632, 2640, 2648, 2688, 2696, 2704, 2712, 2752, 2760, 2768, 2776];
  const ONE_HIT_GREYSCALE_WINDOWS = [[1024, 256, 1], [1392, 32, 0.55], [2304, 64, 0.55], [3840, 256, 1], [4208, 32, 0.55], [4320, 32, 1], [4848, 16, 0.55]];
  const ONE_HIT_SIDE_SPEED_START = 191;
  const ONE_HIT_MOVING_ROCK_START = 192;

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
      far: { count: 51, speed: 24, scale: 0.48, alpha: 0.13, sway: 5, startBelow: 160 },
      mid: { count: 16, speed: 48, scale: 0.72, alpha: 0.22, sway: 10, startBelow: 170 },
      near: { count: 11, speed: 92, scale: 1.18, alpha: 0.34, sway: 18, startBelow: 260 }
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
    const focus = (state.camera?.focusX || 640) - 640;
    const pan = Math.max(-1, Math.min(1, focus / 360));
    const sway = Math.sin(t * 0.55) * 0.35;
    const far = wiiLayerDepth("far", pan, sway, t);
    const mid = wiiLayerDepth("mid", pan, sway, t);
    const near = wiiLayerDepth("near", pan, sway, t);
    const platform = wiiLayerDepth("platform", pan, sway, t);
    return {
      far: far.x,
      mid: mid.x,
      near: near.x,
      farY: far.y,
      midY: mid.y,
      nearY: near.y,
      lean: pan * WII_COMBAT_DEPTH.layers.platform.angle,
      scale: {
        far: far.scale,
        mid: mid.scale,
        near: near.scale,
        platform: platform.scale
      },
      angle: {
        far: far.angle,
        mid: mid.angle,
        near: near.angle
      },
      projection: {
        far: far.projection,
        mid: mid.projection,
        near: near.projection
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

  function currentFrame(spriteName, characterKey, t){
    const data = window.COMBAT_VISUAL_DATA?.sprites?.[spriteName];
    if(!data) return null;
    const pose = state.poses?.[characterKey] || { time: -10, lane: 1, kind: "idle" };
    const age = performance.now() / 1000 - (pose.time || -10);
    let anim = "idle";
    if(age < 0.42 && Number.isFinite(pose.lane)){
      const dir = DIR[pose.lane % 4] || "down";
      anim = pose.kind === "miss" && data.animations[dir + "Miss"]?.length ? dir + "Miss" : dir;
    }
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

  function atlasFootCorrection(frame, scale){
    const fh = frame.fh || frame.h;
    const fy = frame.fy || 0;
    const visibleHeight = frame.rotated ? frame.w : frame.h;
    return (fh + fy - visibleHeight) * scale;
  }

  function mattHorizontalAnchorCorrection(frame, scale){
    const idleFrameWidth = 423;
    const fw = frame.fw || frame.w;
    return Math.max(0, (fw - idleFrameWidth) * 0.5 * scale);
  }

  // Per-anim drawX/drawY shifts that put matt's visible content EXACTLY where
  // Wii Funkin's Psych engine would render it on screen, relative to the idle
  // anchor (which is treated as 0,0 = our chosen rock position).
  //
  // Derivation (the math that took me five tries to get right):
  //
  // 1. In Psych, the sprite's padded canvas top-left lands at
  //    (base.x - offset.x, base.y - offset.y). The visible trim sits at
  //    (canvas + fx, canvas + fy) within that, sized (vis_w, vis_h) where
  //    vis_w/vis_h are h/w for rotated frames (since the -90deg rotation
  //    swaps the displayed dims).
  // 2. So WF visible bottom Y = (base.y - offset.y) + fy + vis_h
  //                centre X = (base.x - offset.x) + fx + vis_w/2
  // 3. In our renderer at drawX=0/drawY=0, the visible content lands at:
  //                bottom Y = y + (h - fh - fy) * scale   (non-rot)
  //                bottom Y = y + (w - fh - fy) * scale   (rot; w is stored width)
  //                centre X = x + (w - fw)/2 * scale - fx*scale (non-rot)
  //                centre X = x + (h - fw)/2 * scale - fx*scale (rot)
  // 4. The drawX/drawY needed to put OUR rendering at the WF visible position,
  //    measured as a delta from idle (so idle stays at the rock at 0,0):
  //
  //         dx = (WF centre X delta from idle) - (our centre X delta from idle)
  //         dy = (WF bottom Y delta from idle) - (our bottom Y delta from idle)
  //
  // Computed from swordmatt.json offsets + WIIK_Z_MATT.xml frame data:
  //   idle  offset(90, -255)  fx=0    fy=-23  vis_w=416  vis_h=439  rot=no
  //   left  offset(36, -286)  fx=-4   fy=0    vis_w=699  vis_h=501  rot=yes
  //   down  offset(209,-336)  fx=0    fy=-11  vis_w=539  vis_h=380  rot=yes
  //   up    offset(171,-238)  fx=0    fy=0    vis_w=557  vis_h=479  rot=yes
  //   right offset(161,-302)  fx=-75  fy=-5   vis_w=627  vis_h=412  rot=yes
  // Anchored by FEET (not body). Foot anchor keeps the visible bottom (matt's
  // feet for idle, sword-tip approximation for sings) at the rock surface,
  // and these per-anim deltas nudge each sing pose slightly UP so the body
  // sits where you expect rather than dropping below the rock.
  //   dx: horizontal shift from idle's screen position (small, to keep matt's
  //        body roughly centred on the rock as the sword swings around him)
  //   dy: NEGATIVE = up. Sings lift slightly so the body reads as "above feet"
  //        instead of "dropped into the rock".
  const MATT_DRAW_DELTAS = {
    idle:  { dx:   0,  dy:   0 },
    left:  { dx:  35,  dy: -28 },
    down:  { dx: -15,  dy: -18 },
    up:    { dx:  -8,  dy: -22 },
    right: { dx: -25,  dy: -20 },
  };
  function mattAnimDelta(characterKey){
    const pose = state.poses?.[characterKey];
    if(!pose) return MATT_DRAW_DELTAS.idle;
    const age = performance.now() / 1000 - (pose.time || -10);
    const anim = (age < 0.42 && Number.isFinite(pose.lane)) ? (DIR[pose.lane % 4] || "down") : "idle";
    return MATT_DRAW_DELTAS[anim] || MATT_DRAW_DELTAS.idle;
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
    const plainSprite = spriteName === "matt";
    const anchorFeet = spriteName === "matt";
    // Matt sing poses lift off the rock so the body reads above the feet.
    // The lift amount lives on window.MATT_SING_LIFT (set in the HTMLs) so
    // it can be tweaked there without touching this file. Default -50.
    let mattSingLift = 0;
    if (spriteName === "matt") {
      const pose = state.poses?.[characterKey];
      const poseAge = performance.now() / 1000 - (pose?.time || -10);
      const isSinging = poseAge < 0.42 && Number.isFinite(pose?.lane);
      if (isSinging) {
        const cfg = (typeof window !== "undefined" && Number.isFinite(window.MATT_SING_LIFT)) ? window.MATT_SING_LIFT : -50;
        mattSingLift = cfg * scale;
      }
    }
    const drawX = anchorFeet ? mattHorizontalAnchorCorrection(frame, scale) : dx * hit;
    const drawY = (anchorFeet ? atlasFootCorrection(frame, scale) : bob + dy * hit) + mattSingLift;
    ctx.save();
    if(!plainSprite){
      ctx.shadowColor = "rgba(118,180,255,0.46)";
      ctx.shadowBlur = 12;
    }
    ctx.translate(x, y);
    ctx.rotate(lean);
    // === Wii Funkin "3D" perspective sway on matt ===
    // The original mod uses a MirrorRepeatWarpEffect shader whose `warp` and
    // `zoom` properties get tweened by the modchart. We can't run the GLSL
    // shader in canvas 2D, but we can approximate the perceived 3D motion
    // with a periodic horizontal skew + scale pulse - the most visible part
    // of the original look.
    if (spriteName === "matt" && !window.PERFORMANCE_MODE && !window.REDUCE_MOTION) {
      const beat = t * Math.PI * 2 * (state.currentSong?.tempo || 150) / 60 / 4;
      const skewX = Math.sin(beat) * 0.045;   // ~2.5deg sway, beat-sync'd
      const scaleY = 1 + Math.cos(beat) * 0.018;
      const punch = hit > 0 ? hit * 0.04 : 0; // momentary scale punch on hit
      ctx.transform(1 + punch, 0, skewX, scaleY + punch, 0, 0);
    }
    drawAtlasFrame(combatState.images[imageKey], frame, drawX, drawY, scale, 1, flipX);
    if(!plainSprite){
      ctx.globalCompositeOperation = "screen";
      ctx.globalAlpha = 0.22;
      drawAtlasFrame(combatState.images[imageKey], frame, drawX - 3, drawY - 2, scale, 1, flipX);
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
    labelStarts.forEach((label, index) => {
      labels[label.name] = {
        start: label.start,
        end: index + 1 < labelStarts.length ? labelStarts[index + 1].start : maxFrame
      };
    });
    combatState.bfRuntime = { data, symbols, labels, maxFrame };
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

  function combatBfAnimLabel(){
    const pose = state.poses?.player || { time: -10, lane: 1, kind: "idle" };
    const age = performance.now() / 1000 - (pose.time || -10);
    if(age >= 0.42 || !Number.isFinite(pose.lane)) return "idle";
    const dir = DIR[pose.lane % 4] || "down";
    return pose.kind === "miss" ? `miss ${dir}` : dir;
  }

  function drawBfSwordCharacter(x, y, scale, flipX, t, lean = 0){
    const rt = combatAnimateRuntime();
    if(!rt || !imgReady(combatState.images.bfSword)) return;
    const label = combatBfAnimLabel();
    const range = rt.labels[label] || rt.labels.idle || { start: 0, end: rt.maxFrame };
    const pose = state.poses?.player || { time: -10 };
    const age = performance.now() / 1000 - (pose.time || -10);
    const len = Math.max(1, range.end - range.start);
    const frameOffset = label === "idle"
      ? Math.floor(t * 24) % len
      : Math.min(len - 1, Math.max(0, Math.floor(age * 24)));
    const anchor = rt.data.anchor || { centerX: -527, bottomY: 138 };
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.shadowColor = "rgba(118,180,255,0.46)";
    ctx.shadowBlur = 12;
    ctx.translate(x, y);
    ctx.rotate(lean);
    ctx.scale(flipX ? -scale : scale, scale);
    ctx.translate(-anchor.centerX, -anchor.bottomY);
    drawAnimateTimeline(rt, rt.data.animation.AN.TL, range.start + frameOffset);
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
      ctx.translate(canvas.width * 0.5 + depthStyle.x, canvas.height * 0.58 + depthStyle.y);
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
      queue.push({
        p,
        key: spec.key,
        x: centerX - image.naturalWidth * scale * 0.5,
        y: centerY - image.naturalHeight * scale * 0.5,
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

  function shaderEase(kind, value){
    const name = String(kind || "linear").toLowerCase();
    if(name.includes("cubeout")) return easeOutCubic(value);
    if(name.includes("cubein")) return easeInCubic(value);
    return Math.max(0, Math.min(1, value));
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

  function shimmyShaderValue(step, name, property, fallback = 0){
    const events = window.SHIMMY_CHART?.shaderEvents || [];
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
    const step = combatSongStep(t);
    const mirrorZoom = Math.abs(shimmyShaderValue(step, "mirror", "zoom", 1) - 1);
    const mirrorHudZoom = Math.abs(shimmyShaderValue(step, "mirrorHud", "zoom", 1) - 1);
    const mirrorOtherZoom = Math.abs(shimmyShaderValue(step, "mirrorOther", "zoom", 1) - 1);
    const mirrorAngle = Math.max(
      Math.abs(shimmyShaderValue(step, "mirror", "angle", 0)),
      Math.abs(shimmyShaderValue(step, "mirrorOther", "angle", 0))
    ) / 8;
    const bloomRaw = Math.max(
      shimmyShaderValue(step, "bloom", "effect", 0),
      shimmyShaderValue(step, "bloom", "strength", 0)
    );
    const notBad = shimmyNotBadAmount(t);
    const blur = Math.max(0, shimmyShaderValue(step, "blur", "strength", 0));
    const greyscale = Math.max(0, Math.min(1, shimmyShaderValue(step, "greyscale", "strength", 0)));
    const speed = Math.max(0, shimmyShaderValue(step, "speed", "effect", 0));
    const bars = Math.max(0, shimmyShaderValue(step, "bars", "effect", 0));
    const bloom = bloomRaw / 3;
    const mirror = Math.max(mirrorZoom * 2.8, mirrorHudZoom * 2.2, mirrorOtherZoom * 2.4, mirrorAngle);
    return {
      step,
      greyscale,
      blur,
      speed,
      bars,
      bloom,
      mirror,
      angle: mirrorAngle * 7,
      chrom: 1.2 + bloom * 9 + speed * 8 + bars * 5 + mirror * 7 + blur * 7 + notBad * 11,
      active: greyscale + blur + speed + bars + bloom + mirror + notBad
    };
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
    const drawScale = Number(data.scale || scale || 0.66);
    ctx.save();
    ctx.translate(x + 22, y);
    ctx.rotate(lean);
    drawAtlasFrame(image, frame, 0, atlasFootCorrection(frame, drawScale), drawScale, 1, flipX);
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

  function drawCombatInsanePostFx(t){
    if(!isCombat() || !state.playing || !Number.isFinite(t)) return;
    const fx = isShimmy() ? { step: combatSongStep(t), bloom: 0, speed: 0, burst: 0, bars: 0, mirror: 0, angle: 0, chrom: 1.2 } : combatInsaneFxState(t);
    const oneHitFx = isOneHit() ? oneHitShaderFxState(t) : null;
    const shimmyFx = isShimmy() ? shimmyShaderFxState(t) : null;
    const active = fx.mirror + fx.bloom + fx.speed + fx.burst + (oneHitFx?.active || 0) + (shimmyFx?.active || 0);
    if(active <= 0.015 && fx.chrom <= 1.21 && (!oneHitFx || oneHitFx.active <= 0.015) && (!shimmyFx || shimmyFx.active <= 0.015)) return;
    const source = ensureCombatFxCanvas();
    const cx = canvas.width / 2, cy = canvas.height / 2;

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

    if(fx.mirror > 0.01 || (oneHitFx?.warp || 0) > 0.01 || (shimmyFx?.mirror || 0) > 0.01){
      const mirror = Math.max(fx.mirror, (oneHitFx?.warp || 0) * 0.86, shimmyFx?.mirror || 0);
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      ctx.globalAlpha = Math.min(0.28, 0.05 + mirror * 0.18);
      ctx.translate(cx, cy);
      ctx.rotate((fx.angle + (shimmyFx?.angle || 0) + (oneHitFx?.warp || 0) * Math.sin(t * 8) * 7) * Math.PI / 180 * 0.35);
      const scale = 1 + mirror * 0.05;
      ctx.scale(scale, scale);
      ctx.drawImage(source, -cx + Math.sin(t * 12) * mirror * 6, -cy);
      ctx.restore();
    }

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

    drawCombatSpeedLines(Math.max(fx.speed, fx.burst * 0.7, oneHitFx?.speed || 0, shimmyFx?.speed || 0), t);
    drawOneHitSideSpeedLines(oneHitFx?.sideSpeed || 0, t);

    const bars = Math.max(fx.bars, oneHitFx?.bars || 0, shimmyFx?.bars || 0);
    if(bars > 0.01){
      ctx.save();
      const h = 22 + bars * 42;
      ctx.fillStyle = "rgba(3,4,12," + Math.min(0.44, bars * 0.34).toFixed(3) + ")";
      ctx.fillRect(0, 0, canvas.width, h);
      ctx.fillRect(0, canvas.height - h, canvas.width, h);
      ctx.globalCompositeOperation = "screen";
      ctx.globalAlpha = Math.min(0.2, bars * 0.14);
      for(let y = 0; y < canvas.height; y += 18){
        ctx.fillStyle = y % 36 === 0 ? "#c4d6ff" : "#9d6cff";
        ctx.fillRect(0, y, canvas.width, 1);
      }
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

    ctx.fillStyle = "#050612";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const depth = combatDepth(t);
    drawImage("unknownBG", -410 + depth.far, -210 + depth.farY, 1.68 * depth.scale.far);
    drawCombatDust("far", t, depth);
    if(isOneHit() && t >= ONE_HIT_MOVING_ROCK_START){
      drawOneHitBackgroundRockField(t, depth);
    } else {
      drawImage("back4", worldX(23) + depth.mid, worldY(150) - 4 + depth.midY, worldScale(2.05) * depth.scale.mid, 0.98);
      drawImage("back5", worldX(-458.4) + depth.near, worldY(253.6) + 4 + depth.nearY, worldScale(2.45) * depth.scale.near, 0.95);
    }
    drawCombatDust("mid", t, depth);
    drawCombatDepthWash(depth);

    const float = Math.sin(t * 1.5) * 2;
    const platformScale = worldScale(1) * (1 + (depth.scale.platform - 1) * 0.35);
    const platformImage = combatState.images.platform;
    const platformMotion = oneHitPlatformMotion(t, depth);
    const leftPlatformX = worldX(207) + platformMotion.x - platformMotion.spread;
    const rightPlatformX = worldX(1471) + platformMotion.x + platformMotion.spread;
    const leftPlatformY = worldY(924) + float + platformMotion.y + platformMotion.leftY;
    const rightPlatformY = worldY(924) - float * 0.7 + platformMotion.y + platformMotion.rightY;
    const rockTilt = Math.sin(t * 1.35) * 0.035 + depth.lean + platformMotion.angle;
    const rightRockTilt = -rockTilt * 0.85 + platformMotion.angle * 0.35;
    const leftRockCenter = leftPlatformX + platformImage.naturalWidth * platformScale * 0.5;
    const rightRockCenter = rightPlatformX + platformImage.naturalWidth * platformScale * 0.5;
    const platformCenterY = platformImage.naturalHeight * platformScale * 0.5;
    const leftRockPivotY = leftPlatformY + platformCenterY;
    const rightRockPivotY = rightPlatformY + platformCenterY;
    const mattRockFeetY = worldY(924) + 64;
    const bfRockFeetY = worldY(924) + 132;
    drawImageRotated("platform", leftPlatformX, leftPlatformY, platformScale, rockTilt);
    drawImageRotated("platform", rightPlatformX, rightPlatformY, platformScale, rightRockTilt, 1, true);
    drawImage("split", worldX(0) + depth.near * 0.32, worldY(-500), worldScale(2.42), 0.88);
    drawImage("split", worldX(2212.8) + depth.near * 0.32, worldY(-500), worldScale(2.42), 0.88, true);

    const mattFeet = rotatePointAround(leftRockCenter - 22, mattRockFeetY + float, leftRockCenter, leftRockPivotY, rockTilt);
    const bfFeet = rotatePointAround(rightRockCenter + 8, bfRockFeetY - float * 0.7, rightRockCenter, rightRockPivotY, rightRockTilt);
    if(isShimmy() && shimmyNotBadAmount(t) > 0.01) drawShimmyMattCharacter(mattFeet.x, mattFeet.y, 0.66, false, t, rockTilt);
    else drawCharacter("matt", "matt", "matt", mattFeet.x, mattFeet.y, 0.66, false, t, rockTilt);
    drawBfSwordCharacter(bfFeet.x, bfFeet.y, 0.6, false, t, rightRockTilt);
    drawCombatDust("near", t, depth);

    ctx.save();
    ctx.globalCompositeOperation = "screen";
    const glow = ctx.createRadialGradient(canvas.width * 0.5, 220, 80, canvas.width * 0.5, 220, 760);
    glow.addColorStop(0, "rgba(131,90,255,0.16)");
    glow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
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
    return state.camera.lastSide || combatState.cameraLastSide || "both";
  }

  function oneHitCameraState(t){
    const result = { duet: false, zoomOffset: 0, flash: 0 };
    if(!isOneHit()) return result;
    const events = window.ONE_HIT_CHART?.cameraEvents || [];
    for(const event of events){
      const eventTime = Number(event.time || 0);
      if(eventTime <= t && event.type === "duetCamera") result.duet = !!event.enabled;
      if(event.type === "betterZoom"){
        const duration = Math.max(0.01, Number(event.duration || 0.5));
        const age = t - eventTime;
        if(age >= 0 && age <= duration){
          const fade = 1 - easeOutCubic(age / duration);
          result.zoomOffset += Number(event.amount || 0) * fade;
        }
      } else if(event.type === "flash") {
        const age = t - eventTime;
        if(age >= 0 && age <= 0.45) result.flash = Math.max(result.flash, 1 - age / 0.45);
      }
    }
    return result;
  }

  function combatRockCameraMotion(t, side){
    const float = Math.sin(t * 1.5) * 2;
    const tilt = Math.sin(t * 1.35) * 0.035;
    if(side === "opp") return { x: tilt * 210, y: float * 4.2 + tilt * 95 };
    if(side === "player") return { x: -tilt * 160, y: -float * 0.7 * 4.2 - tilt * 70 };
    return { x: tilt * 24, y: float * 0.75 };
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
      const target = side === "opp"
        ? { x: 332 + rockMotion.x, y: 468 + rockMotion.y, zoom: 1.76 }
        : side === "player"
          ? { x: 958 + rockMotion.x, y: 468 + rockMotion.y, zoom: 1.76 }
          : { x: 640 + rockMotion.x, y: 448 + rockMotion.y, zoom: 1.54 };
      if(isOneHit()) {
        target.zoom = Math.max(1.2, target.zoom + oneHitCamera.zoomOffset);
        if(oneHitCamera.duet) {
          target.x = 640 + rockMotion.x * 0.34;
          target.y = 456 + rockMotion.y * 0.3;
        }
      }
      if(isShimmy()){
        const notBad = shimmyNotBadAmount(t);
        if(notBad > 0.01){
          const mattMotion = combatRockCameraMotion(t, "opp");
          target.x = 332 + mattMotion.x * 0.45;
          target.y = 456 + mattMotion.y * 0.35;
          target.zoom = Math.max(target.zoom, 1.9 + notBad * 0.22);
        }
      }
      const lerp = 1 - Math.pow(0.001, Math.max(0, dt || 0.016));
      combatState.cameraCurrent.x += (target.x - combatState.cameraCurrent.x) * lerp;
      combatState.cameraCurrent.y += (target.y - combatState.cameraCurrent.y) * lerp;
      combatState.cameraCurrent.zoom += (target.zoom - combatState.cameraCurrent.zoom) * lerp;
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

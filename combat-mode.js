(function(){
  const DIR = ["left", "down", "up", "right"];
  const combatState = {
    initialized: false,
    images: {},
    cameraTarget: { x: 640, y: 330, zoom: 1.05 },
    cameraCurrent: { x: 640, y: 330, zoom: 1.05 },
    dust: [],
    fxCanvas: null,
    fxCtx: null
  };

  function isCombat(){
    return typeof state !== "undefined" && state.selectedSong === "combat";
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
    for(let i = 0; i < 72; i++){
      const layer = i % 3 === 0 ? "near" : i % 3 === 1 ? "mid" : "far";
      combatState.dust.push({
        layer,
        x: (i * 211) % 1460 - 90,
        y: 40 + ((i * 97) % 640),
        speed: layer === "near" ? 34 : layer === "mid" ? 20 : 11,
        scale: layer === "near" ? 0.72 + (i % 5) * 0.08 : layer === "mid" ? 0.6 : 0.48,
        alpha: layer === "near" ? 0.32 : layer === "mid" ? 0.2 : 0.12
      });
    }
  }

  function imgReady(image){
    return image && image.complete && image.naturalWidth;
  }

  function combatReady(){
    return combatState.initialized && Object.values(combatState.images).every(imgReady);
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

  function worldX(x){ return x * 0.5 + 10; }
  function worldY(y){ return y * 0.5; }
  function worldScale(scale){ return scale * 0.5; }

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
    const fps = anim === "idle" ? 18 : spriteName === "boyfriend" ? 24 : 20;
    return frameFromList(frames, t + age * 0.16, fps, true);
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

  function drawCharacter(spriteName, imageKey, characterKey, x, y, scale, flipX, t){
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
    const drawX = anchorFeet ? x + mattHorizontalAnchorCorrection(frame, scale) : x + dx * hit;
    const drawY = anchorFeet ? y + atlasFootCorrection(frame, scale) : y + bob + dy * hit;
    ctx.save();
    if(!plainSprite){
      ctx.shadowColor = "rgba(118,180,255,0.46)";
      ctx.shadowBlur = 12;
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

  function drawBfSwordCharacter(x, y, scale, flipX, t){
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
    ctx.scale(flipX ? -scale : scale, scale);
    ctx.translate(-anchor.centerX, -anchor.bottomY);
    drawAnimateTimeline(rt, rt.data.animation.AN.TL, range.start + frameOffset);
    ctx.restore();
  }

  function drawCombatDust(t){
    combatState.dust.forEach(p => {
      const image = combatState.images[p.layer];
      if(!imgReady(image)) return;
      const drift = (p.x + t * p.speed) % 1460 - 90;
      const sway = Math.sin(t * 0.7 + p.x * 0.01) * 8;
      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.globalCompositeOperation = "screen";
      ctx.drawImage(image, drift, p.y + sway, image.naturalWidth * p.scale, image.naturalHeight * p.scale);
      ctx.restore();
    });
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

  function pulseFromStep(step, start, length){
    const age = step - start;
    if(age < 0 || age > length) return 0;
    return 1 - easeOutCubic(age / length);
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

  function drawCombatInsanePostFx(t){
    if(!isCombat() || !state.playing || !Number.isFinite(t)) return;
    const fx = combatInsaneFxState(t);
    const active = fx.mirror + fx.bloom + fx.speed + fx.burst;
    if(active <= 0.015 && fx.chrom <= 1.21) return;
    const source = ensureCombatFxCanvas();
    const cx = canvas.width / 2, cy = canvas.height / 2;

    if(fx.mirror > 0.01){
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      ctx.globalAlpha = Math.min(0.23, 0.05 + fx.mirror * 0.16);
      ctx.translate(cx, cy);
      ctx.rotate(fx.angle * Math.PI / 180 * 0.35);
      const scale = 1 + fx.mirror * 0.045;
      ctx.scale(scale, scale);
      ctx.drawImage(source, -cx + Math.sin(t * 12) * fx.mirror * 5, -cy);
      ctx.restore();
    }

    if(fx.chrom > 1.4){
      const offset = Math.min(16, fx.chrom);
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

    if(fx.bloom > 0.01){
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      ctx.globalAlpha = Math.min(0.68, 0.18 + fx.bloom * 0.45);
      ctx.filter = "blur(" + (6 + fx.bloom * 15).toFixed(1) + "px) saturate(1.8) brightness(1.18)";
      ctx.drawImage(source, 0, 0);
      ctx.filter = "none";
      ctx.globalAlpha = Math.min(0.26, fx.bloom * 0.2);
      ctx.fillStyle = "#f2eaff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
    }

    drawCombatSpeedLines(Math.max(fx.speed, fx.burst * 0.7), t);

    if(fx.bars > 0.01){
      ctx.save();
      const h = 22 + fx.bars * 40;
      ctx.fillStyle = "rgba(3,4,12," + Math.min(0.42, fx.bars * 0.32).toFixed(3) + ")";
      ctx.fillRect(0, 0, canvas.width, h);
      ctx.fillRect(0, canvas.height - h, canvas.width, h);
      ctx.globalCompositeOperation = "screen";
      ctx.globalAlpha = Math.min(0.18, fx.bars * 0.12);
      for(let y = 0; y < canvas.height; y += 18){
        ctx.fillStyle = y % 36 === 0 ? "#c4d6ff" : "#9d6cff";
        ctx.fillRect(0, y, canvas.width, 1);
      }
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
    drawImage("unknownBG", -410, -210, 1.65);
    drawImage("back4", worldX(23), worldY(150), worldScale(2), 0.98);
    drawImage("back5", worldX(-458.4), worldY(253.6), worldScale(2.4), 0.95);

    const float = Math.sin(t * 1.5) * 2;
    const platformScale = worldScale(1);
    const platformImage = combatState.images.platform;
    const leftPlatformX = worldX(207);
    const rightPlatformX = worldX(1471);
    const leftPlatformY = worldY(924) + float;
    const rightPlatformY = worldY(924) - float * 0.7;
    const leftRockCenter = leftPlatformX + platformImage.naturalWidth * platformScale * 0.5;
    const rightRockCenter = rightPlatformX + platformImage.naturalWidth * platformScale * 0.5;
    const mattRockFeetY = worldY(924) + 64;
    const bfRockFeetY = worldY(924) + 132;
    drawImage("platform", leftPlatformX, leftPlatformY, platformScale);
    drawImage("platform", rightPlatformX, rightPlatformY, platformScale, 1, true);
    drawImage("split", worldX(0), worldY(-500), worldScale(2.4), 0.88);
    drawImage("split", worldX(2212.8), worldY(-500), worldScale(2.4), 0.88, true);
    drawCombatDust(t);

    drawCharacter("matt", "matt", "matt", leftRockCenter - 22, mattRockFeetY + float, 0.66, false, t);
    drawBfSwordCharacter(rightRockCenter + 8, bfRockFeetY - float * 0.7, 0.6, false, t);

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
    let side = "both";
    for(const note of state.chart.notes){
      if(note.time > t + 0.09) break;
      if(note.time >= t - 0.05) side = note.side || side;
    }
    return side;
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
      const target = side === "opp"
        ? { x: 332, y: 468, zoom: 1.76 }
        : side === "player"
          ? { x: 958, y: 468, zoom: 1.76 }
          : { x: 640, y: 448, zoom: 1.54 };
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

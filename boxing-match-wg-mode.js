(function(){
  try {
    const DATA = window.BOXING_MATCH_WG_DATA;
    const CHART = window.BOXING_MATCH_WG_CHART;
    if(!DATA || !CHART || typeof SONGS === "undefined") return;

    const DIR = ["left", "down", "up", "right"];
    const wgState = {
      initialized: false,
      videosInitialized: false,
      images: {},
      videos: {},
      runtimes: {},
      shaderEventIndex: null,
      fxCanvas: null,
      fxCtx: null,
      camera: { x: 640, y: 330, zoom: 1.05 },
      lastSync: 0
    };

    SONGS.boxingMatchWg = {
      title: "Boxing Match WG",
      subtitle: "White Gloves original chart",
      diff: "White Gloves",
      tempo: 200,
      root: 45,
      scale: [0,2,3,5,7,8,10],
      prog: [0,5,3,7],
      scroll: 1040,
      seed: 61,
      introBeats: 0,
      outroBeats: 4,
      palette: ["#050611","#111b34","#364a72","#05070d","#f2f7ff","#ff8b2f"],
      blurb: "Imported from Wii Funkin Boxing Match WG with the white-gloved chart, eclipse perspective stage, videos, shader-style pulses, and form transforms.",
      chartSource: "boxingMatchWg"
    };

    function isWg(){
      return state?.currentSong?.chartSource === "boxingMatchWg" || state?.selectedSong === "boxingMatchWg";
    }

    function clone(value){
      return JSON.parse(JSON.stringify(value));
    }

    function clamp01(v){
      return Math.max(0, Math.min(1, Number(v) || 0));
    }

    function lerp(a, b, t){
      return a + (b - a) * clamp01(t);
    }

    function easeValue(t, ease){
      const p = clamp01(t);
      if(ease === "cubeIn") return p * p * p;
      if(ease === "cubeOut") return 1 - Math.pow(1 - p, 3);
      if(ease === "cubeInOut") return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
      if(ease === "expoIn") return p <= 0 ? 0 : Math.pow(2, 10 * p - 10);
      if(ease === "expoOut") return p >= 1 ? 1 : 1 - Math.pow(2, -10 * p);
      return p;
    }

    function shaderEventsFor(name, prop){
      if(!wgState.shaderEventIndex){
        wgState.shaderEventIndex = {};
        (window.BOXING_MATCH_WG_SHADER_EVENTS || []).forEach(event => {
          const key = event.name + ":" + event.prop;
          (wgState.shaderEventIndex[key] ||= []).push(event);
        });
        Object.values(wgState.shaderEventIndex).forEach(list => list.sort((a, b) => a.step - b.step));
      }
      return wgState.shaderEventIndex[name + ":" + prop] || [];
    }

    function shaderValue(name, prop, step, fallback = 0){
      let value = fallback;
      for(const event of shaderEventsFor(name, prop)){
        if(event.step > step) break;
        const target = Number(event.value);
        if(!Number.isFinite(target)) continue;
        if(event.type === "set"){
          value = target;
          continue;
        }
        const duration = Math.max(0, Number(event.time) || 0);
        const start = Number.isFinite(event.start) ? Number(event.start) : value;
        if(duration <= 0 || step >= event.step + duration){
          value = target;
          continue;
        }
        return lerp(start, target, easeValue((step - event.step) / duration, event.ease));
      }
      return value;
    }

    function shaderSnapshot(step){
      const bloomStrength = shaderValue("bloom", "strength", step, 0);
      const bloomEffect = shaderValue("bloom", "effect", step, 0);
      return {
        greyscale: clamp01(shaderValue("greyscale", "strength", step, 0)),
        blur: Math.max(0, shaderValue("blur", "strength", step, 0)),
        bloom: Math.max(0, bloomStrength, bloomEffect) / 3,
        ca: Math.abs(shaderValue("ca", "strength", step, 0)),
        speed: Math.max(0, shaderValue("speed", "effect", step, 0)),
        mirrorZoom: shaderValue("mirror", "zoom", step, 1),
        mirrorAngle: shaderValue("mirror", "angle", step, 0),
        mirrorWarp: shaderValue("mirror", "warp", step, 0),
        mirrorHudZoom: shaderValue("mirrorHud", "zoom", step, 1),
        mirrorOtherZoom: shaderValue("mirrorOther", "zoom", step, 1),
        mirrorOtherAngle: shaderValue("mirrorOther", "angle", step, 0),
        mirrorOtherWarp: shaderValue("mirrorOther", "warp", step, 0),
        bars: Math.max(0, shaderValue("bars", "effect", step, 0)),
        colorFill: clamp01(shaderValue("ColorFill", "fade", step, 0)),
        vhs: Math.max(0, shaderValue("vhs", "effect", step, 0)),
        smoke: Math.max(0, shaderValue("smoke", "smokeStrength", step, 0))
      };
    }

    function imgReady(image){
      return !!(image && image.complete && image.naturalWidth);
    }

    function loadImage(key, src){
      if(wgState.images[key]) return wgState.images[key];
      const image = new Image();
      image.src = src;
      wgState.images[key] = image;
      return image;
    }

    function initWgImages(){
      if(wgState.initialized) return;
      wgState.initialized = true;
      Object.entries(DATA.stage.images).forEach(([key, src]) => loadImage(key, src));
      loadImage("stars1", "assets/boxing-match-wg/eclipsewg_/stars1.png");
      loadImage("stars2", "assets/boxing-match-wg/eclipsewg_/stars2.png");
      loadImage("planets", "assets/boxing-match-wg/eclipsewg_/planets.png");
      loadImage("spacewithsun", "assets/boxing-match-wg/eclipsewg_/spacewithsun.png");
      Object.entries(DATA.sprites).forEach(([key, sprite]) => loadImage(key, sprite.image));
      DATA.stage.finalObjects.forEach(obj => loadImage(obj.image, obj.image));
    }

    function initWgVideos(){
      if(wgState.videosInitialized) return;
      wgState.videosInitialized = true;
      DATA.meta.videos.forEach(info => {
        const video = document.createElement("video");
        video.src = info.src;
        video.preload = "auto";
        video.muted = true;
        video.defaultMuted = true;
        video.playsInline = true;
        video.controls = false;
        video.style.cssText = "position:fixed;left:-99999px;top:0;width:1px;height:1px;display:none;pointer-events:none;z-index:-1;background:#000;";
        video.onended = () => {
          try {
            video.pause();
            video.currentTime = 0;
            video.style.display = "none";
          } catch {}
        };
        document.body.appendChild(video);
        wgState.videos[info.key] = video;
      });
    }

    function ensureBoxingMatchWgAudio(){
      if(!state.audio.boxingWgInst){
        state.audio.boxingWgInst = new Audio("boxing-match-wg-inst.ogg");
        state.audio.boxingWgInst.preload = "auto";
        state.audio.boxingWgInst.volume = 0.92;
      }
      if(!state.audio.boxingWgVoices){
        state.audio.boxingWgVoices = new Audio("boxing-match-wg-voices.ogg");
        state.audio.boxingWgVoices.preload = "auto";
        state.audio.boxingWgVoices.volume = 0.86;
      }
      state.audio.boxingWgInst.playbackRate = 1;
      state.audio.boxingWgVoices.playbackRate = 1;
    }
    window.ensureBoxingMatchWgAudio = ensureBoxingMatchWgAudio;

    function stepTime(step){
      const segments = DATA.meta.stepSegments || [{ step:0, time:0, bpm:200 }];
      let seg = segments[0];
      for(const next of segments){
        if(next.step > step) break;
        seg = next;
      }
      return seg.time + (step - seg.step) * 60 / seg.bpm / 4;
    }

    function stepAtTime(t){
      const segments = DATA.meta.stepSegments || [{ step:0, time:0, bpm:200 }];
      let seg = segments[0];
      for(const next of segments){
        if(next.time > t) break;
        seg = next;
      }
      return seg.step + (t - seg.time) / (60 / seg.bpm / 4);
    }

    function phaseForStep(step){
      if(step >= DATA.meta.phaseSteps.final) return "final";
      if(step >= DATA.meta.phaseSteps.endFly) return "arena";
      return "fly";
    }

    function currentPose(characterKey, spriteDef, t){
      const pose = state.poses?.[characterKey] || { time:-10, lane:1, kind:"hit" };
      const age = performance.now() / 1000 - (pose.time || -10);
      let key = "idle";
      if(age >= 0 && age < 0.48 && Number.isFinite(pose.lane)){
        const dir = DIR[pose.lane % 4] || "down";
        key = pose.kind === "miss" && spriteDef.animations?.[dir + "Miss"]?.length ? dir + "Miss" : dir;
      }
      const frames = spriteDef.animations?.[key]?.length ? spriteDef.animations[key] : spriteDef.animations?.idle || [];
      const fps = key === "idle" ? 18 : 24;
      return { key, age, lane: pose.lane || 1, frame: frameFromList(frames, key === "idle" ? t : age, fps, key === "idle") };
    }

    function drawAtlasCharacter(spriteKey, imageKey, characterKey, x, y, scale, t, options = {}){
      const sprite = DATA.sprites[spriteKey];
      const image = wgState.images[imageKey || spriteKey];
      if(!sprite || !imgReady(image)) return;
      const pose = currentPose(characterKey, sprite, t);
      if(!pose.frame) return;
      const hit = pose.age >= 0 && pose.age < 0.16 ? 1 - pose.age / 0.16 : 0;
      const lane = pose.lane % 4;
      const poseShift = options.poseShiftScale ?? 1;
      const dx = (lane === 0 ? -10 : lane === 3 ? 12 : 0) * hit * poseShift;
      const dy = (lane === 2 ? -12 : lane === 1 ? 8 : 0) * hit * poseShift;
      const bob = options.noBob ? 0 : Math.sin(t * Math.PI * 2 * 1.5 + (characterKey === "matt" ? 0.4 : 1.1)) * 2;
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      if(options.glow){
        ctx.shadowColor = options.glow;
        ctx.shadowBlur = options.glowBlur || 14;
      }
      ctx.translate(x, y);
      if(options.lean) ctx.rotate(options.lean);
      drawAtlasFrame(image, pose.frame, dx, dy + bob, scale, options.alpha ?? 1, options.flipX ?? sprite.flipX);
      if(options.afterImage){
        ctx.globalCompositeOperation = "screen";
        ctx.globalAlpha = 0.18;
        drawAtlasFrame(image, pose.frame, dx - 6, dy + bob - 2, scale, 1, options.flipX ?? sprite.flipX);
      }
      ctx.restore();
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

    function animateRuntime(spriteKey){
      if(wgState.runtimes[spriteKey]) return wgState.runtimes[spriteKey];
      const sprite = DATA.sprites[spriteKey];
      if(!sprite?.animation || !sprite?.atlas) return null;
      const symbols = {};
      (sprite.animation.SD?.S || []).forEach(symbol => { symbols[symbol.SN] = symbol; });
      wgState.runtimes[spriteKey] = { sprite, symbols };
      return wgState.runtimes[spriteKey];
    }

    function drawAnimateSpritePiece(rt, piece, image){
      const frame = rt.sprite.atlas[piece.N];
      if(!frame || !imgReady(image)) return;
      ctx.save();
      applyAnimateMatrix(piece.M3D);
      if(frame.rotated){
        ctx.translate(0, frame.w);
        ctx.rotate(-Math.PI / 2);
        ctx.drawImage(image, frame.x, frame.y, frame.w, frame.h, 0, 0, frame.w, frame.h);
      } else {
        ctx.drawImage(image, frame.x, frame.y, frame.w, frame.h, 0, 0, frame.w, frame.h);
      }
      ctx.restore();
    }

    function drawAnimateTimeline(rt, timeline, frameIndex, image, depth = 0){
      if(!timeline || depth > 12) return;
      [...(timeline.L || [])].reverse().forEach(layer => {
        const frame = activeAnimateFrame(layer, frameIndex);
        (frame?.E || []).forEach(element => {
          if(element.ASI){
            drawAnimateSpritePiece(rt, element.ASI, image);
            return;
          }
          const si = element.SI;
          const symbol = rt.symbols[si?.SN];
          if(!symbol?.TL) return;
          ctx.save();
          applyAnimateMatrix(si.M3D);
          drawAnimateTimeline(rt, symbol.TL, si.FF || 0, image, depth + 1);
          ctx.restore();
        });
      });
    }

    function animateLabel(spriteKey, characterKey){
      const sprite = DATA.sprites[spriteKey];
      const pose = state.poses?.[characterKey] || { time:-10, lane:1, kind:"hit" };
      const age = performance.now() / 1000 - (pose.time || -10);
      if(age >= 0 && age < 0.46 && Number.isFinite(pose.lane)){
        const dir = DIR[pose.lane % 4] || "down";
        const key = pose.kind === "miss" ? dir + "Miss" : dir;
        return sprite.labelMap?.[key] || sprite.labelMap?.[dir] || sprite.labelMap?.idle || "idle";
      }
      return sprite.labelMap?.idle || "idle";
    }

    function drawAnimateCharacter(spriteKey, characterKey, x, y, scale, t, options = {}){
      const rt = animateRuntime(spriteKey);
      const sprite = DATA.sprites[spriteKey];
      const image = wgState.images[spriteKey];
      if(!rt || !sprite || !imgReady(image)) return;
      const label = animateLabel(spriteKey, characterKey);
      const range = sprite.labels[label] || sprite.labels[sprite.labelMap?.idle] || { start:0, end:sprite.maxFrame || 1 };
      const pose = state.poses?.[characterKey] || { time:-10 };
      const age = performance.now() / 1000 - (pose.time || -10);
      const len = Math.max(1, range.end - range.start);
      const frameOffset = label === (sprite.labelMap?.idle || "idle")
        ? Math.floor(t * 24) % len
        : Math.min(len - 1, Math.max(0, Math.floor(age * 24)));
      const anchor = spriteKey === "mattFinal"
        ? { centerX:36.139, bottomY:536.05 }
        : { centerX:132.217, bottomY:570.597 };
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      if(options.glow){
        ctx.shadowColor = options.glow;
        ctx.shadowBlur = options.glowBlur || 18;
      }
      ctx.globalAlpha = options.alpha ?? 1;
      ctx.translate(x, y);
      if(options.lean) ctx.rotate(options.lean);
      ctx.scale((options.flipX ?? sprite.char?.flip_x) ? -scale : scale, scale);
      ctx.translate(-anchor.centerX, -anchor.bottomY);
      drawAnimateTimeline(rt, sprite.animation.AN.TL, range.start + frameOffset, image);
      ctx.restore();
    }

    function drawCover(imageKey, x = 0, y = 0, zoom = 1, alpha = 1){
      const image = wgState.images[imageKey];
      if(!imgReady(image)) return;
      const scale = Math.max(canvas.width / image.naturalWidth, canvas.height / image.naturalHeight) * zoom;
      const w = image.naturalWidth * scale;
      const h = image.naturalHeight * scale;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(image, (canvas.width - w) / 2 + x, (canvas.height - h) / 2 + y, w, h);
      ctx.restore();
    }

    function drawImageKey(key, x, y, scale = 1, alpha = 1, options = {}){
      const image = wgState.images[key];
      if(!imgReady(image)) return;
      const w = image.naturalWidth * scale;
      const h = image.naturalHeight * scale;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.translate(x + w * 0.5, y + h * 0.5);
      if(options.angle) ctx.rotate(options.angle);
      if(options.flipX) ctx.scale(-1, 1);
      ctx.drawImage(image, -w * 0.5, -h * 0.5, w, h);
      ctx.restore();
    }

    function projectScale(z){
      const focal = 250;
      const eyeZ = -150;
      return focal / (focal + Math.max(1, z - eyeZ));
    }

    function drawPerspectiveLayer(key, x, y, scale, z, pan, t, alpha = 1){
      const p = projectScale(z);
      const depth = 1 + (1 - p) * 0.24;
      drawImageKey(key, x - pan * (1 - p) * 210, y + Math.sin(t * 0.75 + z) * (1 - p) * 22, scale * depth, alpha, { angle: pan * (1 - p) * 0.018 });
    }

    function drawTiledDepthImage(key, y, scale, z, pan, t, alpha = 1, speed = 0){
      const image = wgState.images[key];
      if(!imgReady(image)) return;
      const p = projectScale(z);
      const depthScale = scale * (1 + (1 - p) * 0.18);
      const w = image.naturalWidth * depthScale;
      const h = image.naturalHeight * depthScale;
      const travel = ((t * speed) + pan * (1 - p) * 260) % w;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      for(let x = -w - travel; x < canvas.width + w; x += w){
        ctx.drawImage(image, x, y, w, h);
      }
      ctx.restore();
    }

    function drawWgDepthSky(t, pan, phase){
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      drawTiledDepthImage("stars2", -90 + Math.sin(t * 0.12) * 5, 0.7, 980, pan, t, phase === "final" ? 0.2 : 0.3, 5);
      drawTiledDepthImage("stars1", 12 + Math.cos(t * 0.16) * 7, 0.82, 680, pan, t, phase === "final" ? 0.22 : 0.34, 10);
      drawPerspectiveLayer("planets", 110 - pan * 20, 60, 0.28, 620, pan, t, phase === "fly" ? 0.34 : 0.18);
      ctx.restore();
    }

    function drawWgShaderStageWash(t, step, phase){
      const pulse = Math.max(
        Math.max(0, 1 - Math.abs(step - 288) / 28),
        Math.max(0, 1 - Math.abs(step - 544) / 34),
        Math.max(0, 1 - Math.abs(step - 2816) / 48)
      );
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      const speedGrad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
      speedGrad.addColorStop(0, `rgba(77,177,255,${0.04 + pulse * 0.08})`);
      speedGrad.addColorStop(0.48, "rgba(255,255,255,0)");
      speedGrad.addColorStop(1, `rgba(255,127,59,${0.04 + pulse * 0.07})`);
      ctx.fillStyle = speedGrad;
      ctx.fillRect(-120, -120, canvas.width + 240, canvas.height + 240);
      for(let i = 0; i < 18; i++){
        const x = ((i * 181 + t * (phase === "fly" ? 380 : 180)) % (canvas.width + 260)) - 130;
        const y = ((i * 83 + t * 42) % (canvas.height + 180)) - 90;
        ctx.globalAlpha = 0.035 + pulse * 0.05;
        ctx.strokeStyle = i % 2 ? "#72ddff" : "#ff8b4a";
        ctx.lineWidth = 1 + (i % 3);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + 120 + pulse * 80, y - 26);
        ctx.stroke();
      }
      ctx.restore();
      ctx.save();
      const vignette = ctx.createRadialGradient(canvas.width * 0.5, canvas.height * 0.5, 130, canvas.width * 0.5, canvas.height * 0.5, 780);
      vignette.addColorStop(0, "rgba(0,0,0,0)");
      vignette.addColorStop(0.62, "rgba(0,0,0,0.12)");
      vignette.addColorStop(1, "rgba(0,0,0,0.46)");
      ctx.fillStyle = vignette;
      ctx.fillRect(-200, -200, canvas.width + 400, canvas.height + 400);
      ctx.restore();
    }

    function drawMoonSurface(t, step, pan, forceProgress = 1){
      const image = wgState.images.moon;
      if(!imgReady(image)) return;
      const landing = clamp01(forceProgress);
      const eased = 1 - Math.pow(1 - landing, 3);
      const scale = lerp(0.24, 0.78, eased);
      const y = lerp(820, 430, eased) + Math.sin(t * 0.42) * 2;
      const x = canvas.width * 0.5 - image.naturalWidth * scale * 0.5 - pan * lerp(20, 115, eased);
      ctx.save();
      ctx.globalAlpha = lerp(0.25, 1, eased);
      ctx.shadowColor = "rgba(200,225,255,0.28)";
      ctx.shadowBlur = 18 * eased;
      ctx.drawImage(image, x, y, image.naturalWidth * scale, image.naturalHeight * scale);
      ctx.restore();
    }

    function drawBeam(key, x, y, color, t, direction = 1, options = {}){
      const image = wgState.images[key];
      const length = options.length || 520;
      const nearHeight = options.nearHeight || 142;
      const farHeight = options.farHeight || 78;
      const rise = options.rise ?? -34;
      const phaseSpeed = options.phaseSpeed ?? 0;
      const textureStretch = options.textureStretch || 1.18;
      const textureW = Math.max(1, length * textureStretch);
      const phase = ((t * phaseSpeed) % textureW + textureW) % textureW;
      const nearJitter = Math.sin(t * 8.5) * 2;
      const farJitter = Math.cos(t * 7.2) * 3;
      const pts = [
        { x: 0, y: -nearHeight * 0.5 + nearJitter },
        { x: length, y: rise - farHeight * 0.5 + farJitter },
        { x: length, y: rise + farHeight * 0.5 + farJitter },
        { x: 0, y: nearHeight * 0.5 + nearJitter }
      ];
      function beamPath(){
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        ctx.lineTo(pts[1].x, pts[1].y);
        ctx.lineTo(pts[2].x, pts[2].y);
        ctx.lineTo(pts[3].x, pts[3].y);
        ctx.closePath();
      }
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      ctx.translate(x, y + Math.sin(t * 2.6) * 3);
      ctx.scale(direction, 1);
      ctx.rotate(options.angle || 0);

      ctx.save();
      ctx.shadowColor = color;
      ctx.shadowBlur = options.glowBlur ?? 30;
      ctx.fillStyle = color;
      ctx.globalAlpha = options.glowAlpha ?? 0.34;
      beamPath();
      ctx.fill();
      ctx.restore();

      beamPath();
      ctx.clip();
      if(imgReady(image)){
        ctx.globalAlpha = options.alpha ?? 0.94;
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        for(let xx = -phase - textureW; xx < length + textureW; xx += textureW){
          ctx.drawImage(image, xx, -nearHeight * 0.5 - 4, textureW + 2, nearHeight + 8);
        }
        ctx.globalAlpha = options.textureAlpha ?? 0.2;
        const shimmerW = Math.max(18, length / 25);
        const shimmerPhase = ((t * (phaseSpeed || 36)) % shimmerW + shimmerW) % shimmerW;
        for(let xx = -shimmerPhase - shimmerW; xx < length + shimmerW; xx += shimmerW){
          ctx.drawImage(image, xx, -nearHeight * 0.46, shimmerW + 1, nearHeight * 0.92);
        }
      } else {
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.78;
        ctx.fillRect(0, -nearHeight * 0.5, length, nearHeight);
      }

      const grad = ctx.createLinearGradient(0, 0, length, rise);
      grad.addColorStop(0, "rgba(255,255,255,0.5)");
      grad.addColorStop(0.18, color);
      grad.addColorStop(0.72, "rgba(255,255,255,0.38)");
      grad.addColorStop(1, "rgba(255,255,255,0)");
      ctx.globalAlpha = options.coreAlpha ?? 0.28;
      ctx.fillStyle = grad;
      const core = options.coreHeight || nearHeight * 0.52;
      ctx.beginPath();
      ctx.moveTo(0, -core * 0.5);
      ctx.lineTo(length, rise - Math.max(24, farHeight * 0.38));
      ctx.lineTo(length, rise + Math.max(24, farHeight * 0.38));
      ctx.lineTo(0, core * 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    function wgPan(){
      return ((state.camera?.focusX || canvas.width / 2) - canvas.width / 2) / 360;
    }

    function cameraPulseAtStep(step){
      return Math.max(
        pulse(step, 288, 18),
        pulse(step, 512, 12),
        pulse(step, 528, 18),
        pulse(step, 544, 24),
        pulse(step, 2784, 22),
        pulse(step, 2816, 34)
      );
    }

    function drawFlyPhase(t, step){
      const pan = wgPan();

      // Wii Funkin mirror.zoom oscillates on a 32-step cycle during the fly
      // intro (0.95 -> 1 -> 0.9 -> 1 -> ...). Mimic that with a background
      // zoom pulse + slight rotation drift so the camera feels like it's
      // rushing forward instead of sitting still.
      const cycle = (step % 32) / 32;
      const bgPulse = 1 + Math.sin(cycle * Math.PI * 2) * 0.04;
      drawCover("spaceEmpty", -pan * 8, -14, 1.18 * bgPulse);

      // Greyscale-fade-in at the very start of the intro (matches WF's
      // greyscale shader tweening from 1.0 to 0 over the first beats).
      const introSteps = Math.max(1, DATA.meta.phaseSteps.hudIn || 288);
      const greyMix = clamp01(1 - step / Math.min(introSteps, 96));
      if (greyMix > 0.01) {
        ctx.save();
        ctx.globalCompositeOperation = "saturation";
        ctx.fillStyle = "rgba(128,128,128," + (greyMix * 0.9).toFixed(3) + ")";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.restore();
      }

      // Radial hyperspace - 80 streaks emanating from screen centre, scrolling
      // outward to sell "flying forward at speed". Matches the WF SpeedEffect
      // shader visually (white-ish radial lines) without the per-pixel cost.
      if (!window.PERFORMANCE_MODE && !window.REDUCE_MOTION) {
        const cx = canvas.width / 2;
        const cy = canvas.height * 0.46;
        const maxR = Math.hypot(canvas.width * 0.6, canvas.height * 0.55);
        const minR = maxR * 0.18;
        const span = maxR - minR;
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.lineCap = "round";
        const N = 80;
        for (let i = 0; i < N; i++) {
          const seed = i * 12.9898;
          const r1 = Math.abs((Math.sin(seed) * 43758.5453) % 1);
          const r2 = Math.abs((Math.sin(seed * 1.7 + 4.3) * 24634.6345) % 1);
          const r3 = Math.abs((Math.sin(seed * 0.9 + 1.1) * 16345.123) % 1);
          const r4 = Math.abs((Math.sin(seed * 2.3 + 7.7) * 9532.43) % 1);
          const angle = r1 * Math.PI * 2;
          const speedPx = 420 + r2 * 700;
          const length = 80 + r3 * 140;
          const phaseR = r4 * span;
          const offset = ((t * speedPx) + phaseR) % span;
          const r0 = minR + offset;
          const rEnd = Math.min(maxR + length, r0 + length);
          const cos = Math.cos(angle), sin = Math.sin(angle);
          const x0 = cx + cos * r0, y0 = cy + sin * r0;
          const x1 = cx + cos * rEnd, y1 = cy + sin * rEnd;
          const radialBoost = Math.min(1, (r0 - minR) / span + 0.2);
          const alpha = 0.55 * radialBoost;
          ctx.strokeStyle = "rgba(220,235,255," + alpha.toFixed(3) + ")";
          ctx.lineWidth = 1.2 + r2 * 2.2;
          ctx.beginPath();
          ctx.moveTo(x0, y0);
          ctx.lineTo(x1, y1);
          ctx.stroke();
        }
        ctx.restore();
      }

      const lean = Math.sin(t * 1.25) * 0.032;
      const flyBob = Math.sin(t * 1.55) * 6;
      const mattX = 842 + Math.sin(t * 0.52) * 6;
      const mattY = 498 + flyBob;
      const bfX = 448 + Math.sin(t * 0.56 + 1.7) * 6;
      const bfY = 506 - flyBob * 0.65;

      // Flight trails matching Wii Funkin's perspectiveBeam shader:
      // - Wide near (175 in WF scaled by our 0.5 = ~225px, then up because
      //   our characters are scale 0.5 too)
      // - Sharp perspective vanish to tiny far end
      // - Texture repeats 25x across the length (matches the WF
      //   perspectiveBeam.frag `uv.x *= 25.0;` line)
      // - direction -1 because our characters are mirrored from WF (matt
      //   on right, bf on left; WF has them swapped). WF's beams extend
      //   RIGHT toward their respective vanishing points; ours mirror that
      //   to extend LEFT.
      drawBeam("beamBlue", bfX, bfY - 6, "rgba(60,220,255,1)", t, -1, {
        length: 540,
        nearHeight: 240,
        farHeight: 28,
        rise: 0,
        phaseSpeed: 320,
        textureStretch: 0.04,
        alpha: 0.96,
        textureAlpha: 0.32,
        coreAlpha: 0.55,
        coreHeight: 96,
        glowAlpha: 0.62,
        glowBlur: 42
      });
      drawBeam("beamRed", mattX, mattY - 6, "rgba(255,55,55,1)", t, -1, {
        length: 600,
        nearHeight: 240,
        farHeight: 30,
        rise: 0,
        phaseSpeed: 300,
        textureStretch: 0.04,
        alpha: 0.98,
        textureAlpha: 0.32,
        coreAlpha: 0.55,
        coreHeight: 96,
        glowAlpha: 0.62,
        glowBlur: 42
      });
      drawAtlasCharacter("mattFly", "mattFly", "matt", mattX, mattY, 0.5, t, { glow:"rgba(255,70,45,0.5)", glowBlur:16, lean, noBob:true, poseShiftScale:0.2 });
      drawAtlasCharacter("bfFly", "bfFly", "player", bfX, bfY, 0.48, t, { glow:"rgba(80,200,255,0.56)", glowBlur:16, lean:-lean, noBob:true, poseShiftScale:0.2 });
    }

    function drawArenaPhase(t, step){
      const pan = wgPan();
      drawCover("space", -pan * 40, -22, 1.1);
      drawWgDepthSky(t, pan, "arena");
      drawPerspectiveLayer("wiikz", -112, 365, 0.34, 300, pan, t, 0.82);
      drawPerspectiveLayer("bluematt", 1014 + Math.sin(t * 1.5) * 2, 368 + Math.cos(t * 1.5) * 2, 0.34, 300, pan, t, 0.82);
      drawMoonSurface(t, step, pan, step < DATA.meta.phaseSteps.splash ? clamp01((step - DATA.meta.phaseSteps.endFly) / 16) : 1);
      if(step >= DATA.meta.phaseSteps.endFly && step < DATA.meta.phaseSteps.splash) return;
      const splashAge = step - DATA.meta.phaseSteps.splash;
      if(splashAge >= 0 && splashAge < 36){
        const p = 1 - splashAge / 36;
        ctx.save();
        ctx.globalCompositeOperation = "screen";
        ctx.globalAlpha = p * 0.45;
        ctx.strokeStyle = "rgba(255,255,255,0.8)";
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.ellipse(640, 498, 260 + (1 - p) * 320, 82 + (1 - p) * 120, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      drawAtlasCharacter("matt", "matt", "matt", 392, 642, 0.64, t, { glow:"rgba(255,160,72,0.24)", glowBlur:8, noBob:true, poseShiftScale:0 });
      drawAtlasCharacter("bf", "bf", "player", 890, 646, 0.78, t, { glow:"rgba(75,194,255,0.28)", glowBlur:10, noBob:true, poseShiftScale:0, flipX:false });
    }

    function drawFinalObjects(t){
      const finalStart = stepTime(DATA.meta.phaseSteps.final);
      const srcScale = 0.42;
      const travel = ((t - finalStart) * 1800) % (2560 * DATA.stage.objectGroups);
      DATA.stage.finalObjects.forEach((obj, index) => {
        let sourceX = obj.x - 100 + 2560 * obj.group - travel;
        if(sourceX < -2560 * (DATA.stage.objectGroups - 1)) sourceX += 2560 * DATA.stage.objectGroups;
        const x = sourceX * srcScale - 110;
        if(x < -220 || x > canvas.width + 220) return;
        const y = (obj.y - 100 + Math.sin(t + index) * 20) * srcScale - 26;
        drawImageKey(obj.image, x, y, srcScale, 0.92);
      });
    }

    function drawFinalPhase(t){
      const pan = wgPan();
      drawCover("spaceEmpty", -pan * 18, -8, 1.12);
      drawWgDepthSky(t, pan, "final");
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      drawImageKey("sunF", 80 - pan * 12, -130, 0.7, 0.9);
      drawImageKey("earthF", -170 - pan * 18, 324, 0.62, 0.82);
      drawImageKey("astF", -40 - pan * 45, 360, 0.7, 0.72);
      ctx.restore();
      drawFinalObjects(t);
      const orbit = { x: Math.cos(t * 2.15) * 46, y: Math.sin(t * 2.15) * 30 };
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      for(let i = 4; i >= 1; i--){
        const lag = i * 0.12;
        const ox = Math.cos((t - lag) * 2.15) * 46;
        const oy = Math.sin((t - lag) * 2.15) * 30;
        drawAnimateCharacter("mattFinal", "matt", 640 + ox, 386 + oy, 0.48, t - lag, { glow:"rgba(255,130,34,0.45)", glowBlur:18, alpha:0.08 + (5 - i) * 0.025 });
      }
      ctx.restore();
      drawAnimateCharacter("mattFinal", "matt", 640 + orbit.x, 386 + orbit.y, 0.48, t, { glow:"rgba(255,175,70,0.24)", glowBlur:10 });
      drawAnimateCharacter("bfFinal", "player", 640, 852, 0.38, t, { glow:"rgba(92,198,255,0.32)", glowBlur:12 });
    }

    function drawWgStage(t){
      initWgImages();
      const step = stepAtTime(t);
      const phase = phaseForStep(step);
      ctx.fillStyle = "#02040c";
      ctx.fillRect(-2000, -2000, 5000, 5000);
      if(drawActiveWgVideo(t, step)) return;
      if(phase === "fly") drawFlyPhase(t, step);
      else if(phase === "arena") drawArenaPhase(t, step);
      else drawFinalPhase(t);
      drawWgShaderStageWash(t, step, phase);
      const haze = ctx.createRadialGradient(canvas.width * 0.5, canvas.height * 0.54, 80, canvas.width * 0.5, canvas.height * 0.54, 760);
      haze.addColorStop(0, "rgba(255,255,255,0.05)");
      haze.addColorStop(0.55, "rgba(76,100,190,0.04)");
      haze.addColorStop(1, "rgba(0,0,0,0.34)");
      ctx.fillStyle = haze;
      ctx.fillRect(-300, -200, canvas.width + 600, canvas.height + 400);
    }

    function activeVideoForTime(t){
      const introEnd = stepTime(DATA.meta.phaseSteps.hudIn);
      const midStart = stepTime(DATA.meta.phaseSteps.midVideo);
      const midEnd = stepTime(DATA.meta.phaseSteps.final);
      if(t < introEnd) return { key:"intro", start:0, end:introEnd };
      if(t >= midStart && t < midEnd) return { key:"mid", start:midStart, end:midEnd };
      return null;
    }

    function drawActiveWgVideo(t, step){
      const active = activeVideoForTime(t);
      if(!active) return false;
      initWgVideos();
      const video = wgState.videos[active.key];
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      if(video && video.readyState >= 2){
        const scale = Math.max(canvas.width / video.videoWidth, canvas.height / video.videoHeight);
        const w = video.videoWidth * scale;
        const h = video.videoHeight * scale;
        const mono = step < DATA.meta.phaseSteps.hudIn ? 0.8 : 0.45;
        ctx.filter = `grayscale(${mono}) contrast(1.16) saturate(0.78)`;
        ctx.drawImage(video, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
        ctx.filter = "none";
      }
      const p = clamp01((t - active.start) / Math.max(0.001, active.end - active.start));
      ctx.globalCompositeOperation = "screen";
      ctx.globalAlpha = 0.15 + Math.sin(t * 9) * 0.03;
      ctx.fillStyle = active.key === "intro" ? "#d6e4ff" : "#fff0d0";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, canvas.width, 58 + Math.sin(p * Math.PI) * 14);
      ctx.fillRect(0, canvas.height - 58 - Math.sin(p * Math.PI) * 14, canvas.width, 74);
      ctx.restore();
      return true;
    }

    function syncWgVideos(t){
      initWgVideos();
      const active = activeVideoForTime(t);
      Object.entries(wgState.videos).forEach(([key, video]) => {
        if(!active || active.key !== key){
          video.style.display = "none";
          if(!video.paused) video.pause();
          return;
        }
        const desired = Math.max(0, Math.min(t - active.start, Math.max(0, (active.end - active.start) - 0.03)));
        video.style.display = "block";
        if(video.readyState === 0){
          try { video.load(); } catch {}
        }
        if(Math.abs((video.currentTime || 0) - desired) > 0.18){
          try { video.currentTime = desired; } catch {}
        }
        if(video.paused) video.play().catch(() => {});
      });
    }

    function noteColor(t, lane){
      const step = stepAtTime(t);
      let active = null;
      for(const entry of DATA.meta.noteColorSteps){
        if(step >= entry.step && step < entry.step + 20) active = entry;
      }
      if(!active) return COLORS[lane];
      return lane % 2 === 0 ? active.r : active.b;
    }

    function drawWgReceptor(lane, x, y, t){
      if(!sportingSpritesReady()) return;
      const color = noteColor(t, lane);
      const fx = state.receptorFx[lane];
      const age = performance.now() / 1000 - fx.time;
      ctx.save();
      ctx.shadowBlur = 18;
      ctx.shadowColor = color;
      if(age < 0.16){
        const frames = window.SPORTING_SPRITES.notes.confirm[sportingLaneKey(lane)];
        const frame = frameFromList(frames, age, 26, false);
        if(frame){
          drawAtlasCentered(spriteState.images.notes, frame, x, y, 0.78 + (0.16 - age) * 0.9, 1 - age / 0.16);
          ctx.restore();
          return;
        }
      }
      const frame = sportingReceptorFrame(lane);
      if(frame) drawAtlasCentered(spriteState.images.notes, frame, x, y, 0.72, lane < 4 ? 0.9 : 1);
      ctx.restore();
    }

    function drawWgNote(lane, x, y, scale, alpha, t){
      if(!sportingSpritesReady()) return;
      const frame = window.SPORTING_SPRITES.notes.gem[sportingLaneKey(lane)];
      if(!frame) return;
      const color = noteColor(t, lane);
      ctx.save();
      ctx.shadowBlur = 20;
      ctx.shadowColor = color;
      drawAtlasCentered(spriteState.images.notes, frame, x, y, scale, alpha);
      if(color !== COLORS[lane]){
        ctx.globalCompositeOperation = "screen";
        ctx.globalAlpha = 0.18 * alpha;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, 36 * scale, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    function drawWgSustain(note, x, y, tailY, alpha, t){
      const color = noteColor(t, note.lane);
      const top = Math.min(y, tailY);
      const height = Math.abs(tailY - y);
      if(height < 16) return;
      ctx.save();
      ctx.globalAlpha = alpha * 0.62;
      ctx.strokeStyle = color;
      ctx.lineWidth = 18;
      ctx.lineCap = "round";
      ctx.shadowBlur = 16;
      ctx.shadowColor = color;
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x, top + height);
      ctx.stroke();
      ctx.restore();
    }

    function drawWgNotes(t){
      if(!state.chart || !sportingSpritesReady()) return;
      const scroll = state.currentSong.scroll;
      const ry = receptorY();
      for(const n of state.chart.notes){
        if(n.played && n.hit && (!isHoldNote(n) || n.holdDone)) continue;
        if(n.judged && n.side !== "opp" && (!isHoldNote(n) || n.holdDone || !n.hit)) continue;
        const diff = n.time - t;
        const y = ry + diff * scroll;
        const tailY = ry + (holdEndTime(n) - t) * scroll;
        if(y < -140 && tailY < -140) continue;
        if(y > canvas.height + 140 && tailY > canvas.height + 140) continue;
        const rawScale = clamp(1 - Math.pow(Math.abs(diff), 0.7) * 0.45, 0.75, 1.12);
        const alpha = n.side === "opp" ? 0.84 : 1;
        if(isHoldNote(n)) drawWgSustain(n, laneX(n.lane), n.hit ? ry : y, tailY, alpha * (n.hit ? 0.9 : 1), t);
        if(n.hit && isHoldNote(n) && t > n.time) continue;
        drawWgNote(n.lane, laneX(n.lane), y, 0.76 * rawScale, alpha, t);
      }
    }

    function activeSideAt(t){
      let hasOpp = false;
      let hasPlayer = false;
      for(const n of state.chart?.notes || []){
        if(n.time > t + 0.1) break;
        const activeHold = isHoldNote(n) && n.hit && !n.holdDone && holdEndTime(n) >= t - 0.02;
        const activeTap = !isHoldNote(n) && t >= n.time - 0.04 && t <= n.time + 0.09;
        if(!activeHold && !activeTap) continue;
        if(n.side === "opp") hasOpp = true;
        if(n.side === "player") hasPlayer = true;
      }
      if(hasOpp && hasPlayer) return "both";
      if(hasOpp) return "opp";
      if(hasPlayer) return "player";
      return state.camera.lastSide || "both";
    }

    function cameraTargetFor(t){
      const step = stepAtTime(t);
      const phase = phaseForStep(step);
      const side = activeSideAt(t);
      let opp = { x: 392, y: 420 };
      let player = { x: 890, y: 420 };
      let zoom = 1.12;
      if(phase === "fly"){
        opp = { x: 808, y: 378 };
        player = { x: 486, y: 380 };
        zoom = 1.18;
      } else if(phase === "final"){
        opp = { x: 640, y: 268 };
        player = { x: 640, y: 620 };
        zoom = 1.26;
      } else {
        opp = { x: 392, y: 454 };
        player = { x: 890, y: 456 };
        zoom = step < DATA.meta.phaseSteps.splash ? 1.02 : 1.18;
      }
      const target = side === "opp" ? opp : side === "player" ? player : { x:(opp.x + player.x) / 2, y:(opp.y + player.y) / 2 };
      const dirBump = phase === "arena" ? { x:0, y:0 } : recentDirectionBump(t);
      const shader = shaderSnapshot(step);
      const mirrorPush = Math.max(
        cameraPulseAtStep(step),
        Math.abs(1 - shader.mirrorZoom) * 1.6,
        Math.abs(1 - shader.mirrorHudZoom) * 1.2,
        Math.max(0, shader.mirrorOtherZoom - 1) * 0.25,
        Math.abs(shader.mirrorOtherAngle) / 120
      );
      const pulseZoom = 1 + Math.min(0.28, mirrorPush * 0.055);
      return { x: target.x + dirBump.x, y: target.y + dirBump.y, zoom: (side === "both" ? zoom * 0.94 : zoom) * pulseZoom };
    }

    function recentDirectionBump(t){
      let bump = { x:0, y:0 };
      for(const n of state.chart?.notes || []){
        if(n.time > t + 0.04) break;
        if(t < n.time - 0.02 || t > n.time + 0.12) continue;
        const dir = n.lane % 4;
        if(dir === 0) bump.x -= 9;
        if(dir === 3) bump.x += 9;
        if(dir === 1) bump.y += 9;
        if(dir === 2) bump.y -= 9;
      }
      return bump;
    }

    function ensureFxCanvas(){
      if(!wgState.fxCanvas){
        wgState.fxCanvas = document.createElement("canvas");
        wgState.fxCtx = wgState.fxCanvas.getContext("2d");
      }
      if(wgState.fxCanvas.width !== canvas.width || wgState.fxCanvas.height !== canvas.height){
        wgState.fxCanvas.width = canvas.width;
        wgState.fxCanvas.height = canvas.height;
        if(typeof setRenderQuality === "function") setRenderQuality(wgState.fxCtx);
      }
      wgState.fxCtx.clearRect(0, 0, canvas.width, canvas.height);
      wgState.fxCtx.drawImage(canvas, 0, 0);
      return wgState.fxCanvas;
    }

    function pulse(step, center, width){
      return Math.max(0, 1 - Math.abs(step - center) / width);
    }

    function fxValues(t){
      const step = stepAtTime(t);
      const shader = shaderSnapshot(step);
      const flyWhiteIn = clamp01((step - 512) / 16);
      const flyWhiteOut = 1 - clamp01((step - 528) / 16);
      const whiteBg = step < 512 ? 0 : step < 528 ? Math.pow(flyWhiteIn, 2.4) : step < 544 ? flyWhiteOut : 0;
      const bloom = Math.max(
        shader.bloom,
        pulse(step, 288, 18),
        pulse(step, 416, 12),
        pulse(step, 544, 22),
        pulse(step, 2784, 20),
        pulse(step, 2816, 28)
      );
      const warp = Math.max(
        pulse(step, 264, 28),
        pulse(step, 540, 16),
        pulse(step, 2816, 36),
        Math.abs(1 - shader.mirrorZoom) * 2,
        Math.abs(1 - shader.mirrorHudZoom) * 1.4,
        Math.max(0, shader.mirrorOtherZoom - 1) * 0.2,
        Math.abs(shader.mirrorOtherAngle) / 110,
        Math.abs(shader.mirrorOtherWarp) * 4,
        shader.speed * 0.5
      );
      const invert = Math.max(
        pulse(step, 512, 10) * 0.24,
        pulse(step, 528, 18) * 0.38,
        pulse(step, 2816, 28) * 0.2,
        shader.vhs * 0.08,
        Math.abs(shader.mirrorOtherWarp) * 0.8
      );
      const greyscale = Math.max(shader.greyscale, Math.max(0, 0.5 * pulse(step, 540, 12)));
      const bars = Math.max(shader.bars, 0.08 * pulse(step, 288, 300), 0.12 * pulse(step, 2816, 400), 0.2 * pulse(step, 540, 16));
      const cameraPulse = Math.max(cameraPulseAtStep(step), Math.abs(1 - shader.mirrorZoom) * 1.5, Math.max(0, shader.mirrorOtherZoom - 1) * 0.25);
      return {
        ...shader,
        step,
        whiteBg,
        bloom:clamp01(bloom),
        warp:clamp01(warp),
        invert:clamp01(invert),
        greyscale:clamp01(greyscale),
        bars:clamp01(bars),
        cameraPulse:clamp01(cameraPulse)
      };
    }

    function drawWgFx(t){
      const fx = fxValues(t);
      const src = ensureFxCanvas();
      if(fx.greyscale > 0.01 || fx.invert > 0.01 || fx.bloom > 0.01 || fx.warp > 0.01 || fx.blur > 0.01 || fx.vhs > 0.01){
        ctx.save();
        ctx.globalCompositeOperation = "source-over";
        ctx.filter = `blur(${Math.min(3, fx.blur * 3 + fx.vhs * 0.6).toFixed(2)}px) grayscale(${fx.greyscale}) invert(${fx.invert}) contrast(${1.06 + fx.bloom * 0.28 + fx.vhs * 0.08}) saturate(${1.02 + fx.bloom * 0.25 - fx.greyscale * 0.18})`;
        ctx.drawImage(src, 0, 0);
        ctx.restore();
      }
      const mirrorAmount = Math.max(Math.abs(1 - fx.mirrorZoom), Math.max(0, fx.mirrorOtherZoom - 1) * 0.16, Math.abs(fx.mirrorOtherAngle) / 180, Math.abs(fx.mirrorOtherWarp) * 2);
      if(mirrorAmount > 0.01){
        ctx.save();
        ctx.globalCompositeOperation = "screen";
        ctx.globalAlpha = Math.min(0.5, 0.12 + mirrorAmount * 0.34);
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate((fx.mirrorOtherAngle + fx.mirrorAngle * 0.3) * Math.PI / 180 * 0.08);
        ctx.scale(1 + Math.min(0.3, mirrorAmount * 0.09), 1 + Math.min(0.3, mirrorAmount * 0.09));
        ctx.drawImage(src, -canvas.width / 2 - fx.mirrorOtherWarp * 32, -canvas.height / 2);
        ctx.restore();
      }
      if(fx.cameraPulse > 0.01){
        ctx.save();
        ctx.globalCompositeOperation = "screen";
        ctx.globalAlpha = 0.09 + fx.cameraPulse * 0.15;
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.scale(1 + fx.cameraPulse * 0.032, 1 + fx.cameraPulse * 0.032);
        ctx.drawImage(src, -canvas.width / 2, -canvas.height / 2);
        ctx.globalAlpha = fx.cameraPulse * 0.08;
        ctx.drawImage(src, -canvas.width / 2 - 7 * fx.cameraPulse, -canvas.height / 2 + 2);
        ctx.drawImage(src, -canvas.width / 2 + 7 * fx.cameraPulse, -canvas.height / 2 - 2);
        ctx.restore();
      }
      const chroma = Math.max(fx.ca, fx.vhs * 0.018, fx.warp * 0.012);
      if(chroma > 0.001){
        const off = Math.min(16, 3 + chroma * 220);
        ctx.save();
        ctx.globalCompositeOperation = "screen";
        ctx.globalAlpha = 0.16 + fx.vhs * 0.08;
        ctx.filter = "saturate(1.4)";
        ctx.drawImage(src, -off, 0);
        ctx.globalAlpha = 0.12 + fx.vhs * 0.06;
        ctx.drawImage(src, off, 0);
        ctx.restore();
      }
      if(fx.bloom > 0.01){
        ctx.save();
        ctx.globalCompositeOperation = "screen";
        ctx.globalAlpha = 0.18 + fx.bloom * 0.24;
        ctx.filter = `blur(${Math.round(3 + fx.bloom * 4)}px) brightness(${1.1 + fx.bloom * 0.45})`;
        ctx.drawImage(src, 0, 0);
        ctx.restore();
      }
      if(fx.warp > 0.01){
        ctx.save();
        ctx.globalCompositeOperation = "screen";
        ctx.globalAlpha = 0.12 * fx.warp;
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate(Math.sin(t * 3) * 0.035 * fx.warp);
        ctx.scale(1 + fx.warp * 0.045, 1 + fx.warp * 0.045);
        ctx.drawImage(src, -canvas.width / 2 - 8 * fx.warp, -canvas.height / 2);
        ctx.restore();
      }
      if(fx.speed > 0.01){
        ctx.save();
        ctx.globalCompositeOperation = "screen";
        for(let i = 0; i < 34; i++){
          const x = ((i * 97 + t * 720) % (canvas.width + 260)) - 130;
          const y = ((i * 61 + t * 105) % (canvas.height + 140)) - 70;
          ctx.globalAlpha = Math.min(0.32, 0.04 + fx.speed * 0.18);
          ctx.strokeStyle = i % 2 ? "#ffffff" : "#87f4ff";
          ctx.lineWidth = 1 + (i % 3);
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + 150 + fx.speed * 120, y - 18);
          ctx.stroke();
        }
        ctx.restore();
      }
      if(fx.step >= 288){
        ctx.save();
        ctx.globalCompositeOperation = "screen";
        for(let i = 0; i < 22; i++){
          const x = ((i * 251 + t * (18 + i % 4 * 9)) % (canvas.width + 180)) - 90;
          const y = ((i * 137 + t * (9 + i % 5 * 4)) % (canvas.height + 160)) - 80;
          ctx.globalAlpha = 0.045 + (i % 5) * 0.009;
          ctx.fillStyle = i % 2 ? "#9ad8ff" : "#ffffff";
          ctx.beginPath();
          ctx.arc(x, y, 1.5 + (i % 4), 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
      if(fx.smoke > 0.01){
        ctx.save();
        ctx.globalCompositeOperation = "screen";
        for(let i = 0; i < 20; i++){
          const x = ((i * 211 + t * (16 + i % 4 * 5)) % (canvas.width + 220)) - 110;
          const y = canvas.height * 0.72 + Math.sin(t * 0.9 + i) * 70 + (i % 5) * 22;
          const r = 45 + (i % 6) * 18;
          const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
          grad.addColorStop(0, `rgba(180,205,255,${0.055 * fx.smoke})`);
          grad.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = grad;
          ctx.fillRect(x - r, y - r, r * 2, r * 2);
        }
        ctx.restore();
      }
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      ctx.globalAlpha = 0.08 + fx.bloom * 0.08;
      ctx.drawImage(src, -2 - fx.warp * 3, 0);
      ctx.globalAlpha = 0.06 + fx.bloom * 0.06;
      ctx.drawImage(src, 2 + fx.warp * 3, 0);
      ctx.restore();
      if(fx.whiteBg > 0.001){
        ctx.save();
        ctx.globalAlpha = fx.whiteBg;
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.restore();
      }
      if(fx.vhs > 0.01){
        ctx.save();
        ctx.globalAlpha = Math.min(0.28, 0.06 + fx.vhs * 0.12);
        ctx.fillStyle = "rgba(255,255,255,0.22)";
        for(let y = 0; y < canvas.height; y += 4){
          ctx.fillRect(0, y + Math.sin(t * 9 + y) * 0.8, canvas.width, 1);
        }
        ctx.globalAlpha = Math.min(0.18, fx.vhs * 0.08);
        ctx.fillStyle = "#000";
        for(let i = 0; i < 50; i++){
          const x = (i * 79 + t * 220) % canvas.width;
          const y = (i * 43 + t * 120) % canvas.height;
          ctx.fillRect(x, y, 2 + (i % 3), 1);
        }
        ctx.restore();
      }
      if(fx.bars > 0.01){
        const h = Math.round(canvas.height * 0.16 * fx.bars);
        ctx.save();
        ctx.fillStyle = "rgba(0,0,0,0.78)";
        ctx.fillRect(0, 0, canvas.width, h);
        ctx.fillRect(0, canvas.height - h, canvas.width, h);
        ctx.restore();
      }
    }

    const originalRenderSongs = renderSongs;
    const originalIsImportedSong = isImportedSong;
    const originalMakeChart = makeChart;
    const originalStopExternalAudio = stopExternalAudio;
    const originalSongTime = songTime;
    const originalStartSong = startSong;
    const originalStage = stage;
    const originalReceptors = receptors;
    const originalNotes = notes;
    const originalUpdateCamera = updateCamera;
    const originalRefreshHUD = refreshHUD;
    const originalApplyDustinBloom = applyDustinBloom;

    renderSongs = function(){
      originalRenderSongs();
    };

    isImportedSong = function(song){
      return !!song && (song.chartSource === "boxingMatchWg" || originalIsImportedSong(song));
    };

    makeChart = function(song){
      if(song?.chartSource === "boxingMatchWg"){
        const chart = clone(CHART);
        chart.notes = chart.notes.map((note, index) => ({ ...note, id: note.id ?? index }));
        chart.timeline = (chart.timeline || []).map(section => ({ ...section }));
        return chart;
      }
      return originalMakeChart(song);
    };

    stopExternalAudio = function(){
      originalStopExternalAudio();
      [state.audio.boxingWgInst, state.audio.boxingWgVoices].forEach(track => {
        if(!track) return;
        try {
          track.pause();
          track.currentTime = 0;
        } catch {}
      });
      Object.values(wgState.videos).forEach(video => {
        if(!video) return;
        try {
          video.pause();
          video.currentTime = 0;
          video.style.display = "none";
        } catch {}
      });
    };

    songTime = function(){
      const onlineTarget = typeof expectedOnlineSongTime === "function" ? expectedOnlineSongTime() : null;
      if(isWg() && onlineTarget != null){
        if(typeof syncOnlinePlayback === "function") syncOnlinePlayback();
        return onlineTarget;
      }
      if(isWg() && state.audio.boxingWgInst) return state.audio.boxingWgInst.currentTime;
      return originalSongTime();
    };

    startSong = function(id = state.selectedSong, options = {}){
      const song = SONGS[id] || state.currentSong;
      if(song?.chartSource !== "boxingMatchWg") return originalStartSong(id, options);
      const a = ensureAudio();
      if(a.state === "suspended") a.resume();
      stopExternalAudio();
      if(state.startTimer) clearTimeout(state.startTimer);
      if(state.endTimer) clearTimeout(state.endTimer);
      initWgImages();
      initWgVideos();
      ensureBoxingMatchWgAudio();
      state.selectedSong = id;
      state.currentSong = SONGS[id];
      state.mode = options.forceMode || (ui.versusToggle?.checked ? "versus" : "solo");
      if(ui.modeLabel) ui.modeLabel.textContent = state.mode === "online" ? "Online Battle" : state.mode === "versus" ? "1v1 Versus" : "Solo Battle";
      rebuildKeyMap();
      state.chart = makeChart(state.currentSong);
      state.chart.notes = state.chart.notes.map((note, index) => ({ ...note, id: note.id ?? index }));
      resetStats();
      state.health = 0.65;
      state.songStart = 0;
      state.nextStep = 0;
      state.nextStepTime = 0;
      state.playing = true;
      state.audio.boxingWgInst.pause();
      state.audio.boxingWgVoices.pause();
      state.audio.boxingWgInst.currentTime = 0;
      state.audio.boxingWgVoices.currentTime = 0;
      Object.values(wgState.videos).forEach(video => {
        try {
          video.pause();
          video.currentTime = 0;
          video.style.display = "none";
          if(!options.skipReload) video.load();
        } catch {}
      });
      if(state.mode === "online" && typeof serverClockNow === "function"){
        state.network.matchStartAt = Number(options.startAt || (serverClockNow() + 8000));
        state.network.pendingStartAt = state.network.matchStartAt;
        state.network.lastTrackSync = 0;
        if(!options.skipReload){
          state.audio.boxingWgInst.load();
          state.audio.boxingWgVoices.load();
        }
      } else {
        state.audio.boxingWgInst.play().catch(() => {});
        state.audio.boxingWgVoices.play().catch(() => {});
      }
      state.feeds.player.time = -10;
      state.feeds.opp.time = -10;
      Object.values(state.poses).forEach(p => { p.time = -10; p.kind = "hit"; });
      state.receptorFx.forEach(fx => fx.time = -10);
      state.camera = { zoom:1.05, focusX:canvas.width / 2, focusY:canvas.height * 0.45, sideTime:0, lastSide:"both", highwayX:0, highwayY:0 };
      if(ui.p1Box) ui.p1Box.style.display = state.mode === "versus" ? "block" : "none";
      ui.songTitle.textContent = state.currentSong.title;
      ui.songSub.textContent = state.currentSong.subtitle;
      ui.statusText.textContent = "White Gloves intro";
      ui.statusSub.textContent = "Original Boxing Match WG chart, eclipse stage, videos, camera pulses, and form transforms are active.";
      ui.timer.textContent = `0:00 / ${formatTime(state.chart.totalTime)}`;
      ui.menu.classList.remove("show");
      ui.settings.classList.remove("show");
      ui.resultsWrap.classList.remove("show");
      if(state.mode === "online" && typeof syncOnlinePlayback === "function") syncOnlinePlayback(true);
    };

    stage = function(t){
      if(!isWg()) return originalStage(t);
      drawWgStage(t);
    };

    receptors = function(t){
      if(!isWg()) return originalReceptors(t);
      const y = receptorY();
      ctx.strokeStyle = "rgba(255,255,255,0.05)";
      ctx.lineWidth = 1.5;
      for(let lane = 0; lane < 8; lane++){
        const x = laneX(lane);
        drawWgReceptor(lane, x, y, t);
        ctx.beginPath();
        ctx.moveTo(x, y + 26);
        ctx.lineTo(x, canvas.height - 40);
        ctx.stroke();
      }
    };

    notes = function(t){
      if(!isWg()) return originalNotes(t);
      drawWgNotes(t);
    };

    updateCamera = function(t, dt){
      if(!isWg()) return originalUpdateCamera(t, dt);
      if(!state.camera) state.camera = {};
      const target = cameraTargetFor(t);
      const speed = 1 - Math.exp(-Math.max(0.001, dt) * 5.2);
      wgState.camera.x = lerp(wgState.camera.x, target.x, speed);
      wgState.camera.y = lerp(wgState.camera.y, target.y, speed);
      wgState.camera.zoom = lerp(wgState.camera.zoom, target.zoom, speed);
      state.camera.focusX = wgState.camera.x;
      state.camera.focusY = wgState.camera.y;
      state.camera.zoom = wgState.camera.zoom;
      state.camera.highwayX = 0;
      state.camera.highwayY = 0;
      state.camera.lastSide = activeSideAt(t);
      syncWgVideos(t);
    };

    refreshHUD = function(t){
      originalRefreshHUD(t);
      if(!isWg()) return;
      const step = stepAtTime(t);
      ui.timer.textContent = formatTime(t) + " / " + formatTime(songEndTime());
      if(step < DATA.meta.phaseSteps.hudIn){
        ui.statusText.textContent = "White Gloves intro";
        ui.statusSub.textContent = "Intro video and greyscale shader fade from the real script.";
      } else if(step < DATA.meta.phaseSteps.endFly){
        ui.statusText.textContent = "Eclipse flight";
        ui.statusSub.textContent = "Perspective beam phase before the White Gloves arena transform.";
      } else if(step < DATA.meta.phaseSteps.final){
        ui.statusText.textContent = "White Gloves arena";
        ui.statusSub.textContent = "Matt and BF swapped to the white-glove forms after the impact flash.";
      } else {
        ui.statusText.textContent = "Final phase";
        ui.statusSub.textContent = "Final forms, moving object field, contrast, bloom, and eclipse camera are active.";
      }
    };

    applyDustinBloom = function(t){
      originalApplyDustinBloom(t);
      if(isWg()) drawWgFx(t);
    };

    window.prepareBoxingMatchWgOnlineStart = function(){
      initWgImages();
      initWgVideos();
      ensureBoxingMatchWgAudio();
      const media = [state.audio.boxingWgInst, state.audio.boxingWgVoices];
      Object.values(wgState.videos).forEach(video => {
        try {
          video.pause();
          video.currentTime = 0;
          video.load();
          video.style.display = "none";
          media.push(video);
        } catch {}
      });
      media.forEach(track => {
        try {
          track.pause();
          track.currentTime = 0;
          if(track.load) track.load();
        } catch {}
      });
      return media;
    };

    if(typeof syncOnlinePlayback === "function" && typeof expectedOnlineSongTime === "function" && typeof syncTrackToTime === "function"){
      const originalSyncOnlinePlayback = syncOnlinePlayback;
      syncOnlinePlayback = function(force = false){
        const targetTime = expectedOnlineSongTime();
        if(targetTime == null || state.currentSong?.chartSource !== "boxingMatchWg") return originalSyncOnlinePlayback(force);
        const localNow = Date.now();
        if(!force && localNow - (state.network.lastTrackSync || 0) < 65) return targetTime;
        state.network.lastTrackSync = localNow;
        ensureBoxingMatchWgAudio();
        const shouldPlay = serverClockNow() + 40 >= state.network.matchStartAt;
        const syncOptions = { playTolerance:0.045, pauseTolerance:0.02, secondaryPlayTolerance:0.12, secondaryPauseTolerance:0.06 };
        syncTrackToTime(state.audio.boxingWgInst, targetTime, shouldPlay, syncOptions);
        syncTrackToTime(state.audio.boxingWgVoices, targetTime, shouldPlay, { ...syncOptions, isSecondary:true });
        syncWgVideos(targetTime);
        return targetTime;
      };
    }

    if(typeof preloadSongForMatch === "function" && typeof waitForTrackReady === "function"){
      const originalPreloadSongForMatch = preloadSongForMatch;
      preloadSongForMatch = async function(songId, matchId){
        if(SONGS[songId]?.chartSource !== "boxingMatchWg") return originalPreloadSongForMatch(songId, matchId);
        state.network.preparing = true;
        state.network.prepareMatchId = matchId;
        state.network.preparedSongId = "";
        state.network.loadingStatus = "Loading Boxing Match WG files on your side.";
        if(typeof updateOnlinePanel === "function") updateOnlinePanel();
        const media = window.prepareBoxingMatchWgOnlineStart();
        await Promise.all(media.filter(Boolean).map(track => waitForTrackReady(track)));
        if(state.network.prepareMatchId !== matchId) return false;
        state.network.preparedSongId = songId;
        state.network.loadingStatus = "Loaded on your side. Waiting for the other player.";
        if(state.network.role === "host") state.network.loaded.host = true;
        if(state.network.role === "guest") state.network.loaded.guest = true;
        if(typeof updateOnlinePanel === "function") updateOnlinePanel();
        if(state.network.socket && state.network.roomId) state.network.socket.emit("game:loaded", { matchId, songId });
        return true;
      };
    }

    renderSongs();
  } catch(error) {
    console.error("Boxing Match WG mode failed to initialize", error);
  }
})();

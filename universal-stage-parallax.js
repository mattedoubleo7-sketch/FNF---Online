(function(){
  if(window.__universalStageParallaxInstalled) return;
  if(typeof ctx === "undefined" || typeof canvas === "undefined") return;
  if(typeof stage !== "function" || typeof bg !== "function") return;
  window.__universalStageParallaxInstalled = true;

  const baseStage = stage;
  const baseBg = bg;
  const nativeDepthSongs = new Set(["combat", "oneHit", "shimmy"]);
  const strengthBySong = {
    combat: 0.68,
    oneHit: 0.68,
    shimmy: 0.68,
    boxingMatchWg: 0.34,
    sporting: 0.58,
    boxingMatch: 0.58,
    loFight: 0.66,
    overhead: 0.66,
    ballistic: 0.72,
    perseverance: 0.46,
    brokenReality: 0.48,
    challengeEdd: 0.58,
    fallenStars: 0.56,
    genocide: 0.54,
    overthrone: 0.56,
    sillyBilly: 0.48
  };

  function clamp(value, min, max){
    return Math.max(min, Math.min(max, value));
  }

  function selectedSongId(){
    return String((typeof state !== "undefined" && state.selectedSong) || "");
  }

  function songTempo(){
    return Number((typeof state !== "undefined" && state.currentSong && state.currentSong.tempo) || 120) || 120;
  }

  function songStrength(t){
    if(window.REDUCE_MOTION) return 0;
    const id = selectedSongId();
    if(nativeDepthSongs.has(id)) return 0;
    let strength = strengthBySong[id] ?? 0.5;
    if(window.PERFORMANCE_MODE) strength *= 0.48;
    if(id === "perseverance" && typeof perseveranceIsPixelPhase === "function" && perseveranceIsPixelPhase(t)) strength *= 0.38;
    if(id === "sillyBilly" && typeof sillyPhaseAt === "function"){
      try {
        const phase = sillyPhaseAt(t);
        if(phase === "pixel") strength *= 0.42;
      } catch {}
    }
    return strength;
  }

  function activeSide(t){
    if(typeof state === "undefined") return "both";
    if(typeof cameraActiveSide === "function"){
      try {
        const side = cameraActiveSide(t);
        if(side) return side;
      } catch {}
    }
    return state.camera?.lastSide || "both";
  }

  function sideScalar(t){
    const side = String(activeSide(t) || "both").toLowerCase();
    if(side === "opp" || side === "left" || side === "dad" || side === "sans") return -1;
    if(side === "player" || side === "right" || side === "bf" || side === "boyfriend") return 1;
    if(side === "gf" || side === "center" || side === "middle") return 0;
    return 0;
  }

  function cameraDrift(t){
    if(typeof state === "undefined" || !state.camera) return { x: 0, y: 0, zoom: 1, side: 0 };
    const cx = canvas.width * 0.5;
    const cy = canvas.height * 0.46;
    const focusX = Number.isFinite(state.camera.focusX) ? state.camera.focusX : cx;
    const focusY = Number.isFinite(state.camera.focusY) ? state.camera.focusY : cy;
    const side = sideScalar(t);
    return {
      x: clamp((focusX - cx) / Math.max(1, canvas.width * 0.5), -1, 1),
      y: clamp((focusY - cy) / Math.max(1, canvas.height * 0.5), -1, 1),
      zoom: Number(state.camera.zoom || 1) || 1,
      side
    };
  }

  function layerPose(layer, t){
    const strength = songStrength(t);
    if(strength <= 0) return null;
    const cam = cameraDrift(t);
    const beat = t * songTempo() / 60 * Math.PI * 2;
    const naturalSway = Math.sin(t * 0.52 + cam.side * 0.7);
    const beatSway = Math.sin(beat * 0.25);
    const native = nativeDepthSongs.has(selectedSongId()) ? 0 : 1;
    const layerScale = layer === "bg" ? 0.42 : 1;
    const direction = layer === "bg" ? -1 : 1;
    const sidePush = cam.side * 22 * layerScale;
    const cameraPush = cam.x * 76 * layerScale;
    const lift = cam.y * -34 * layerScale;
    const zoomPulse = Math.max(0, cam.zoom - 1);
    return {
      x: direction * (cameraPush + sidePush + naturalSway * 7) * strength * native,
      y: (lift + beatSway * 4) * strength * native,
      skewX: (cam.x * 0.034 + cam.side * 0.016 + naturalSway * 0.004) * strength * native,
      skewY: (-cam.x * 0.006 + cam.side * 0.004) * strength * native,
      scaleX: 1 + (layer === "bg" ? 0.078 : 0.026) * strength + zoomPulse * 0.08 * layerScale,
      scaleY: 1 + (layer === "bg" ? 0.046 : 0.014) * strength + Math.cos(beat * 0.25) * 0.004 * strength,
      alpha: strength
    };
  }

  function withParallaxLayer(layer, t, draw){
    const pose = layerPose(layer, t);
    if(!pose){
      draw();
      return;
    }
    const pivotX = canvas.width * 0.5;
    const pivotY = canvas.height * (layer === "bg" ? 0.54 : 0.64);
    ctx.save();
    try {
      ctx.translate(pivotX + pose.x, pivotY + pose.y);
      ctx.transform(pose.scaleX, pose.skewY, pose.skewX, pose.scaleY, 0, 0);
      ctx.translate(-pivotX, -pivotY);
      draw();
    } finally {
      ctx.restore();
    }
  }

  bg = function(song, t){
    withParallaxLayer("bg", Number(t || 0), () => baseBg(song, t));
  };

  stage = function(t){
    withParallaxLayer("stage", Number(t || 0), () => baseStage(t));
  };
})();

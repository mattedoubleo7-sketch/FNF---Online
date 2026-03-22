(() => {
  if (typeof SONGS === 'undefined' || typeof state === 'undefined' || typeof spriteState === 'undefined') return;

  const BOXING_RATE = 1;
  const SPORTING_SCROLL_MULT = 1.5;
  const BOXING_SCROLL_MULT = 2;
  const BOXING_SONGS = new Set(['boxingMatch']);
  const BOXING_STAGE_SONGS = new Set(['boxingMatch']);
  const SPORTING_STAGE_SONGS = new Set(['sporting']);
  const BOXING_SPRITE_SONG = 'boxingMatch';
  const BOXING_NOTE_DRAIN = { perfect: 0.008, good: 0.012, bad: 0.02, miss: 0.03 };
  const BOXING_STAMINA_REGEN = 0;
  const BOXING_BLOCK_RESTORE = 0.74;
  const BOXING_BLOCK_COOLDOWN = 5;
  const BOXING_BLOCK_MISS_BOOST = 0.09;
  const BOXING_MAX_BLOCK_BOOST = 0.78;
  const BOXING_STAGE_ASSETS = {
    ring: 'assets/boxing-fight/stage.png',
    back: 'assets/boxing-fight/stageback.png',
    front: 'assets/boxing-fight/stagefront.png',
    curtains: 'assets/boxing-fight/stagecurtains.png',
    light: 'assets/boxing-fight/stage_light.png',
    gfImage: 'assets/boxing-fight/GFMIIBOXING_ass_sets.png',
    gfAtlas: 'assets/boxing-fight/GFMIIBOXING_ass_sets.xml'
  };
  const SPORTING_STAGE_ASSETS = {
    back: 'assets/vsmatt-sporting/boxingnight1.png',
    mid: 'assets/vsmatt-sporting/boxingnight2.png',
    front: 'assets/vsmatt-sporting/boxingnight3.png'
  };
  const BOXING_STAGE_LAYOUTS = {
    boxingMatch: {
      stageScale: 1,
      stageYOffset: 0,
      gfScale: 0.47,
      gfY: 144,
      mattX: 262,
      mattY: 352,
      bfX: 722,
      bfY: 370
    }
  };
  const SPORTING_STAGE_LAYOUT = {
    stageScale: 1,
    stageYOffset: 0,
    gfX: 490,
    gfY: 206,
    gfScale: 0.5,
    mattX: 126,
    mattY: 386,
    mattScale: 0.66,
    bfX: 840,
    bfY: 400,
    bfScale: 0.66
  };
  const boxingSpriteState = { initialized: false, images: {}, gfAnimations: null, gfAtlasRequested: false };
  const sportingStageState = { initialized: false, images: {} };

  function imageReady(image) {
    return !!(image && image.complete && image.naturalWidth);
  }

  function songIdFor(song) {
    if (!song) return '';
    if (typeof song === 'string') return song;
    for (const [id, def] of Object.entries(SONGS)) {
      if (def === song) return id;
      if (def.chartSource && song.chartSource && def.chartSource === song.chartSource && def.title === song.title) return id;
    }
    return state.selectedSong || '';
  }

  function isBoxingSong(song) {
    return BOXING_SONGS.has(songIdFor(song || state.currentSong));
  }

  function isBoxingSpriteSong(song) {
    return songIdFor(song || state.currentSong) === BOXING_SPRITE_SONG;
  }

  function usesMattStage(song) {
    return BOXING_STAGE_SONGS.has(songIdFor(song || state.currentSong));
  }

  function usesSportingStage(song) {
    return SPORTING_STAGE_SONGS.has(songIdFor(song || state.currentSong));
  }

  function importedPlaybackRate(song) {
    return isBoxingSong(song) ? BOXING_RATE : 1;
  }

  function boxingLocalSide() {
    if (state.mode === 'online' && typeof localSideKey === 'function') return localSideKey();
    return 'player';
  }

  function boxingRemoteSide() {
    return boxingLocalSide() === 'player' ? 'opp' : 'player';
  }

  function boxingLocalFeedSide() {
    return boxingLocalSide();
  }

  function boxingSideForLane(lane) {
    return lane < 4 ? 'opp' : 'player';
  }

  function boxingLocalLane(lane) {
    return boxingSideForLane(lane) === boxingLocalSide() ? lane % 4 : null;
  }

  function boxingLocalStats() {
    return state.stats?.[boxingLocalSide()] || state.stats?.player || null;
  }

  function setBoxingAction(kind, name, time, lane) {
    if (!state.boxing) return;
    const slot = kind === 'matt' ? 'mattAction' : 'playerAction';
    state.boxing[slot] = { name, time, lane: lane ?? state.boxing.lastLane ?? 1 };
  }

  function setLocalBoxingAction(name, time, lane) {
    setBoxingAction(boxingLocalSide() === 'opp' ? 'matt' : 'boyfriend', name, time, lane);
  }

  function applyTrackRate(track, rate) {
    if (!track) return;
    try { track.defaultPlaybackRate = rate; } catch {}
    try { track.playbackRate = rate; } catch {}
    try { track.preservesPitch = false; } catch {}
    try { track.mozPreservesPitch = false; } catch {}
    try { track.webkitPreservesPitch = false; } catch {}
  }

  function parseAtlasNumber(node, name, fallback = 0) {
    const value = Number(node.getAttribute(name));
    return Number.isFinite(value) ? value : fallback;
  }

  function parseBoxingGfAtlas(xmlText) {
    const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
    const textures = Array.from(doc.getElementsByTagName('SubTexture'));
    const animations = { dance: [], cheer: [], sad: [] };
    textures.forEach(node => {
      const name = node.getAttribute('name') || '';
      let anim = '';
      if (name.startsWith('GF Dancing Beat')) anim = 'dance';
      else if (name.startsWith('GF Cheer')) anim = 'cheer';
      else if (name.startsWith('gf sad')) anim = 'sad';
      if (!anim) return;
      animations[anim].push({
        x: parseAtlasNumber(node, 'x'),
        y: parseAtlasNumber(node, 'y'),
        w: parseAtlasNumber(node, 'width'),
        h: parseAtlasNumber(node, 'height'),
        fx: parseAtlasNumber(node, 'frameX'),
        fy: parseAtlasNumber(node, 'frameY'),
        fw: parseAtlasNumber(node, 'frameWidth', parseAtlasNumber(node, 'width')),
        fh: parseAtlasNumber(node, 'frameHeight', parseAtlasNumber(node, 'height'))
      });
    });
    return animations;
  }

  function initBoxingSprites() {
    if (boxingSpriteState.initialized || !window.BOXING_FIGHT_DATA) return;
    boxingSpriteState.initialized = true;
    const sources = {
      boyfriend: window.BOXING_FIGHT_DATA.sprites.boyfriend.image,
      matt: window.BOXING_FIGHT_DATA.sprites.matt.image,
      texts: window.BOXING_FIGHT_DATA.sprites.texts.image,
      warning: window.BOXING_FIGHT_DATA.sprites.warning,
      stageRing: BOXING_STAGE_ASSETS.ring,
      stageBack: BOXING_STAGE_ASSETS.back,
      stageFront: BOXING_STAGE_ASSETS.front,
      stageCurtains: BOXING_STAGE_ASSETS.curtains,
      stageLight: BOXING_STAGE_ASSETS.light,
      gf: BOXING_STAGE_ASSETS.gfImage
    };
    Object.entries(sources).forEach(([key, src]) => {
      const img = new Image();
      img.src = src;
      boxingSpriteState.images[key] = img;
    });
    if (!boxingSpriteState.gfAtlasRequested) {
      boxingSpriteState.gfAtlasRequested = true;
      fetch(BOXING_STAGE_ASSETS.gfAtlas)
        .then(resp => resp.ok ? resp.text() : Promise.reject(new Error(`GF atlas ${resp.status}`)))
        .then(text => { boxingSpriteState.gfAnimations = parseBoxingGfAtlas(text); })
        .catch(err => {
          console.warn('Failed to load boxing GF atlas', err);
          boxingSpriteState.gfAnimations = { dance: [], cheer: [], sad: [] };
        });
    }
  }

  function initSportingStage() {
    if (sportingStageState.initialized) return;
    sportingStageState.initialized = true;
    Object.entries(SPORTING_STAGE_ASSETS).forEach(([key, src]) => {
      const img = new Image();
      img.src = src;
      sportingStageState.images[key] = img;
    });
  }

  function boxingStageReady() {
    const images = boxingSpriteState.images;
    return boxingSpriteState.initialized &&
      imageReady(images.stageRing);
  }

  function boxingGfReady() {
    return imageReady(boxingSpriteState.images.gf) && !!boxingSpriteState.gfAnimations?.dance?.length;
  }

  function boxingMatchSpritesReady() {
    const images = boxingSpriteState.images;
    return boxingStageReady() &&
      imageReady(images.boyfriend) &&
      imageReady(images.matt) &&
      imageReady(images.texts) &&
      imageReady(images.warning);
  }

  function sportingStageReady() {
    return sportingStageState.initialized &&
      imageReady(sportingStageState.images.back) &&
      imageReady(sportingStageState.images.mid) &&
      imageReady(sportingStageState.images.front) &&
      spriteState.initialized &&
      imageReady(spriteState.images.matt) &&
      imageReady(spriteState.images.boyfriend) &&
      imageReady(spriteState.images.gf) &&
      imageReady(spriteState.images.notes);
  }

  function mattStageSportingReady() {
    return spriteState.initialized &&
      imageReady(spriteState.images.matt) &&
      imageReady(spriteState.images.boyfriend) &&
      imageReady(spriteState.images.notes);
  }

  function boxingActionAnim(kind, t) {
    const bx = state.boxing || {};
    const data = window.BOXING_FIGHT_DATA?.sprites?.[kind];
    if (!data) return null;
    const action = kind === 'boyfriend' ? bx.playerAction : bx.mattAction;
    if (action && Number.isFinite(action.time)) {
      const age = Math.max(0, t - action.time);
      let anim = '';
      let fps = 18;
      if (kind === 'boyfriend') {
        if (action.name === 'dodge') {
          anim = 'dodge';
          fps = 24;
        } else if (action.name === 'block' || action.name === 'parry') anim = ({ left: 'blockLeft', down: 'blockDown', up: 'blockUp', right: 'blockRight' })[sportingLaneKey(action.lane || 0)] || 'blockLeft';
        else if (action.name === 'hit') anim = 'hit';
        else if (action.name === 'stando') anim = 'stando';
      } else {
        if (action.name === 'throw' || action.name === 'superPunch') anim = 'throw';
        else if (action.name === 'dodge') anim = data.animations.parry?.length ? 'parry' : 'stando';
        else if (action.name === 'block') anim = ({ left: 'blockLeft', down: 'blockDown', up: 'blockUp', right: 'blockRight' })[sportingLaneKey(action.lane || 0)] || 'blockLeft';
        else if (action.name === 'parry') anim = 'parry';
        else if (action.name === 'stando') anim = 'stando';
        else if (action.name === 'hit' && data.animations.parry?.length) anim = 'parry';
      }
      const frames = data.animations[anim];
      if (frames && frames.length && age < sportingAnimDuration(frames, fps, 0.18, 1.45)) {
        return { anim, elapsed: age, fps, loop: false };
      }
    }
    const pose = state.poses[kind === 'boyfriend' ? 'player' : 'matt'];
    const dir = sportingLaneKey((pose?.lane || 0) % 4);
    const age = performance.now() / 1000 - (pose?.time || -10);
    if (kind === 'boyfriend' && pose?.kind === 'miss' && data.animations.miss?.length && age >= 0 && age < 0.42) {
      return { anim: 'miss', elapsed: age, fps: 20, loop: false };
    }
    const anim = dir;
    const frames = data.animations[anim];
    if (frames && frames.length && age >= 0 && age < sportingAnimDuration(frames, 22, 0.18, 0.72)) {
      return { anim, elapsed: age, fps: 22, loop: false };
    }
    const localBlockKind = boxingLocalSide() === 'opp' ? 'matt' : 'boyfriend';
    if (kind === localBlockKind && bx.blockHeld) {
      const blockAnim = ({ left: 'blockLeft', down: 'blockDown', up: 'blockUp', right: 'blockRight' })[sportingLaneKey(bx.lastLane || 0)] || 'blockLeft';
      if (data.animations[blockAnim]?.length) return { anim: blockAnim, elapsed: t, fps: 12, loop: true };
    }
    return { anim: 'idle', elapsed: t + (kind === 'boyfriend' ? 0.08 : 0), fps: 12, loop: true };
  }

  function drawBoxingCharacter(kind, x, y, scale, t) {
    const data = window.BOXING_FIGHT_DATA?.sprites?.[kind];
    const image = boxingSpriteState.images[kind];
    if (!data || !image) return;
    const pose = boxingActionAnim(kind, t);
    const frame = frameFromList(data.animations[pose.anim], pose.elapsed, pose.fps, pose.loop);
    if (frame) drawAtlasTopLeft(image, frame, x, y, scale);
  }

  function drawStageCover(image, scaleMult = 1, yOffset = 0, alpha = 1) {
    if (!image?.naturalWidth) return;
    const scale = Math.max(canvas.width / image.naturalWidth, canvas.height / image.naturalHeight) * scaleMult;
    const width = image.naturalWidth * scale;
    const height = image.naturalHeight * scale;
    const x = (canvas.width - width) / 2;
    const y = (canvas.height - height) / 2 + yOffset;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(image, x, y, width, height);
    ctx.restore();
  }

  function drawBottomCentered(image, scale, y, alpha = 1, flipX = false) {
    if (!image?.naturalWidth) return;
    const width = image.naturalWidth * scale;
    const height = image.naturalHeight * scale;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    if (flipX) {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(image, (canvas.width - width) / 2, y, width, height);
    } else {
      ctx.drawImage(image, (canvas.width - width) / 2, y, width, height);
    }
    ctx.restore();
  }

  function boxingGfFrame(t) {
    const anims = boxingSpriteState.gfAnimations;
    return frameFromList(anims?.dance, t * 1.2, 12, true);
  }

  function mattStageLayout(songId) {
    return BOXING_STAGE_LAYOUTS[songId] || BOXING_STAGE_LAYOUTS.boxingMatch;
  }

  function drawMattStage(songId, t, renderCharacters) {
    const images = boxingSpriteState.images;
    const layout = mattStageLayout(songId);
    drawStageCover(images.stageRing, layout.stageScale, layout.stageYOffset, 1);
    const gfFrame = boxingGfFrame(t);
    if (boxingGfReady() && gfFrame && images.gf?.naturalWidth) {
      const gfScale = layout.gfScale;
      const gfWidth = (gfFrame.fw || gfFrame.w) * gfScale;
      const gfX = (canvas.width - gfWidth) / 2;
      drawAtlasTopLeft(images.gf, gfFrame, gfX, layout.gfY, gfScale);
    }
    renderCharacters();
  }

  function drawSportingRingStage(t) {
    const images = sportingStageState.images;
    const layout = SPORTING_STAGE_LAYOUT;
    drawStageCover(images.back, layout.stageScale, layout.stageYOffset, 1);
    drawStageCover(images.mid, layout.stageScale, layout.stageYOffset, 1);
    drawStageCover(images.front, layout.stageScale, layout.stageYOffset, 1);
    drawSportingSprite('gf', layout.gfX, layout.gfY, layout.gfScale, t);
    drawSportingSprite('matt', layout.mattX, layout.mattY, layout.mattScale, t);
    drawSportingSprite('boyfriend', layout.bfX, layout.bfY, layout.bfScale, t);
  }

  function freshBoxingState(songId) {
    return {
      active: BOXING_SONGS.has(songId),
      songId,
      lastTime: 0,
      stamina: 1,
      lastDodgeAt: -10,
      lastParryAt: -10,
      lastBlockAt: -10,
      lastLane: 1,
      prompt: '',
      promptUntil: -10,
      events: [],
      eventIndex: 0,
      echoWindowUntil: -10,
      echoRemaining: 0,
      echoPending: null,
      playerAction: { name: '', time: -10, lane: 1 },
      mattAction: { name: '', time: -10, lane: 1 },
      damageFlashAt: -10,
      blockHeld: false,
      blockCooldownUntil: -10,
      blockMissBoost: 0,
      blockHoldTime: 0,
      superCharge: 0,
      superWarnUntil: -10,
      baseScroll: SONGS.boxingMatch?.scroll || 760 * BOXING_SCROLL_MULT,
      currentDrain: 0
    };
  }

  function buildBoxingEvents(chart) {
    if (!chart?.notes?.length) return [];
    const opponent = chart.notes.filter(note => note.side === 'opp' && note.time > 16);
    const cycle = ['dodge', 'parry', 'block', 'echo', 'dodge', 'block', 'parry', 'echo'];
    const events = [];
    let cursor = 19.5;
    let index = 0;
    while (cursor < chart.totalTime - 6 && index < 18) {
      const anchor = opponent.find(note => note.time >= cursor) || opponent[opponent.length - 1];
      if (!anchor) break;
      events.push({
        type: cycle[index % cycle.length],
        lane: anchor.lane % 4,
        warnAt: Math.max(0, anchor.time - 0.95),
        fireAt: Math.max(0, anchor.time - 0.12),
        done: false,
        armed: false
      });
      cursor = anchor.time + 10.8;
      index += 1;
    }
    return events;
  }

  function guardActive() {
    return !!(state.boxing?.active && state.boxing.blockHeld);
  }

  function updateBoxingScroll() {
    const bx = state.boxing;
    if (!bx?.active || !state.currentSong) return;
    state.currentSong.scroll = bx.baseScroll * (1 + (guardActive() ? bx.blockMissBoost : 0));
  }

  function resetGuardState(resetSuper = false, applyCooldown = false) {
    const bx = state.boxing;
    if (!bx) return;
    const now = songTime();
    const wasGuarding = bx.blockHeld;
    bx.blockHeld = false;
    bx.blockHoldTime = 0;
    bx.blockMissBoost = 0;
    if (applyCooldown && wasGuarding) bx.blockCooldownUntil = Math.max(bx.blockCooldownUntil, now + BOXING_BLOCK_COOLDOWN);
    if (resetSuper) bx.superCharge = 0;
    updateBoxingScroll();
  }

  function punchScale() {
    const bx = state.boxing;
    const stamina = clamp(bx?.stamina ?? 1, 0, 1);
    return 0.62 + (1 - stamina) * 1.28;
  }

  function mattNoteDrain(kind) {
    const bx = state.boxing;
    const stamina = clamp(bx?.stamina ?? 1, 0, 1);
    const quality = kind === 'perfect' ? 1 : kind === 'good' ? 0.88 : kind === 'bad' ? 0.7 : 0;
    if (quality <= 0) return 0;
    return (0.005 + (1 - stamina) * 0.03) * quality;
  }

  function applyMattNoteDrain(amount) {
    if (!(amount > 0)) return;
    if (state.health <= 0.1) return;
    state.health = clamp(Math.max(0.1, state.health - amount), 0, 1);
  }

  function boxingDamage(baseAmount, label, lane, opts = {}) {
    const bx = state.boxing;
    let damage = baseAmount * punchScale();
    if (opts.parried) damage *= opts.superPunch ? 0.62 : 0.42;
    if (opts.blocked) damage *= opts.superPunch ? 1.18 : 0.68;
    if (opts.superPunch) damage *= 1.22;
    damage = clamp(damage, 0.015, 0.42);
    state.health = clamp(state.health - damage, 0, 1);
    state.shake = { time: performance.now() / 1000, intensity: opts.superPunch ? 7.2 : 5.5 };
    if (bx) {
      const t = songTime();
      bx.damageFlashAt = t;
      bx.currentDrain = damage;
      setLocalBoxingAction('hit', t, lane ?? bx.lastLane ?? 1);
      if (opts.superPunch) {
        bx.stamina = 0;
        bx.superWarnUntil = -10;
        resetGuardState(true, true);
      } else if (opts.staminaLoss) {
        bx.stamina = clamp(bx.stamina - opts.staminaLoss, 0, 1);
      }
    }
    feed(boxingLocalFeedSide(), label, opts.color || (opts.superPunch ? '#ff9c3d' : '#ff6d7a'));
    return damage;
  }

  function boxingReward(healthAmount, label, color, actionName, lane, staminaAmount = 0) {
    state.health = clamp(state.health + healthAmount, 0, 1);
    if (state.boxing) {
      const t = songTime();
      state.boxing.stamina = clamp(state.boxing.stamina + staminaAmount, 0, 1);
      setLocalBoxingAction(actionName, t, lane ?? state.boxing.lastLane ?? 1);
    }
    feed(boxingLocalFeedSide(), label, color);
  }

  function resolveBoxingEvent(event, t) {
    const bx = state.boxing;
    if (!bx) return;
    const dodged = bx.lastDodgeAt >= event.warnAt && bx.lastDodgeAt <= event.fireAt + 0.22;
    const parried = bx.lastParryAt >= event.warnAt && bx.lastParryAt <= event.fireAt + 0.2;
    const guarding = guardActive();

    if (event.type === 'dodge') {
      if (dodged) boxingReward(0.012, 'DODGE', '#67ff9a', 'dodge', event.lane, 0.05);
      else boxingDamage(0.14, 'DRAIN', event.lane, { staminaLoss: 0.08 });
      bx.prompt = '';
      bx.promptUntil = t + 0.15;
      bx.mattAction = { name: 'throw', time: event.warnAt, lane: event.lane };
      return;
    }

    if (event.type === 'parry') {
      if (parried) {
        boxingDamage(0.11, 'PARRY', event.lane, { parried: true, staminaLoss: 0.04, color: '#4de3ff' });
        bx.mattAction = { name: 'parry', time: t, lane: event.lane };
      } else {
        boxingDamage(0.15, 'DRAIN', event.lane, { staminaLoss: 0.1 });
      }
      bx.prompt = '';
      bx.promptUntil = t + 0.15;
      return;
    }

    if (event.type === 'block') {
      if (guarding) boxingDamage(0.12, 'BLOCK', event.lane, { blocked: true, staminaLoss: 0.06, color: '#b7ff65' });
      else boxingDamage(0.18, 'DRAIN', event.lane, { staminaLoss: 0.14 });
      bx.prompt = '';
      bx.promptUntil = t + 0.18;
      bx.mattAction = { name: 'throw', time: event.warnAt, lane: event.lane };
      return;
    }

    if (event.type === 'superPunch') {
      bx.superWarnUntil = -10;
      if (dodged) boxingReward(0.018, 'SUPER DODGE', '#ffb347', 'dodge', event.lane, 0.08);
      else boxingDamage(0.2, 'SUPER', event.lane, { superPunch: true, blocked: guarding, color: '#ff9c3d' });
      bx.prompt = '';
      bx.promptUntil = t + 0.2;
      bx.mattAction = { name: 'superPunch', time: event.warnAt, lane: event.lane };
      return;
    }

    if (event.type === 'echo') {
      bx.echoWindowUntil = t + 2.4;
      bx.echoRemaining = 2;
      bx.echoPending = null;
      bx.prompt = 'echo';
      bx.promptUntil = t + 1.1;
      feed(boxingLocalFeedSide(), 'ECHO', '#4de3ff');
    }
  }

  function maybePromoteSuperPunch(event) {
    const bx = state.boxing;
    if (!bx || event.type === 'echo' || event.type === 'superPunch') return;
    const threshold = 0.82 + Math.min(1.25, bx.blockHoldTime * 0.34) + bx.blockMissBoost * 0.55;
    if (bx.superCharge < threshold) return;
    event.type = 'superPunch';
    bx.superCharge = Math.max(0, bx.superCharge - threshold * 0.8);
    bx.superWarnUntil = event.fireAt + 0.18;
  }

  function updateBoxingState(t) {
    const bx = state.boxing;
    if (!bx?.active) return;
    if (t < bx.lastTime) bx.lastTime = t;
    const dt = Math.max(0, t - bx.lastTime);
    bx.lastTime = t;
    bx.stamina = clamp(bx.stamina + dt * (guardActive() ? BOXING_BLOCK_RESTORE : BOXING_STAMINA_REGEN), 0, 1);
    bx.currentDrain = Math.max(0, bx.currentDrain - dt * 0.12);

    if (guardActive()) {
      bx.blockHoldTime += dt;
      bx.superCharge = clamp(bx.superCharge + dt * (0.58 + bx.blockMissBoost * 0.4), 0, 3.2);
    } else {
      bx.blockHoldTime = 0;
      if (bx.blockMissBoost > 0) {
        bx.blockMissBoost = 0;
        updateBoxingScroll();
      }
      bx.superCharge = Math.max(0, bx.superCharge - dt * 0.8);
    }

    if (bx.echoPending && t > bx.echoPending.expiresAt) {
      boxingDamage(0.08, 'ECHO', bx.echoPending.lane % 4, { staminaLoss: 0.05, color: '#ff6d7a' });
      bx.echoPending = null;
    }
    if (bx.echoWindowUntil > 0 && t > bx.echoWindowUntil) {
      if (bx.echoPending || bx.echoRemaining > 0) boxingDamage(0.05 + bx.echoRemaining * 0.02, 'ECHO', bx.lastLane, { staminaLoss: 0.04, color: '#ff6d7a' });
      bx.echoPending = null;
      bx.echoRemaining = 0;
      bx.echoWindowUntil = -10;
      bx.prompt = '';
    }

    const event = bx.events[bx.eventIndex];
    if (!event) return;
    if (!event.armed && t >= event.warnAt) {
      event.armed = true;
      maybePromoteSuperPunch(event);
      bx.prompt = event.type;
      bx.promptUntil = event.fireAt + 0.12;
      bx.mattAction = { name: event.type === 'parry' ? 'parry' : event.type === 'superPunch' ? 'superPunch' : 'throw', time: event.warnAt, lane: event.lane };
    }
    if (!event.done && t >= event.fireAt) {
      event.done = true;
      resolveBoxingEvent(event, t);
      bx.eventIndex += 1;
    }
  }

  function drawBar(x, y, width, height, value, color, label) {
    ctx.save();
    ctx.fillStyle = 'rgba(7,10,18,0.88)';
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, 9);
    ctx.fill();
    ctx.stroke();
    const inner = Math.max(0, Math.min(1, value));
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(x + 2, y + 2, Math.max(0, (width - 4) * inner), Math.max(0, height - 4), 7);
    ctx.fill();
    ctx.fillStyle = '#f3f7ff';
    ctx.font = '700 12px Trebuchet MS, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(label, x, y - 6);
    ctx.restore();
  }

  function drawFallbackPrompt(text, color) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '900 30px Trebuchet MS, sans-serif';
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(4,6,10,0.92)';
    ctx.shadowBlur = 18;
    ctx.shadowColor = color;
    ctx.strokeText(text, canvas.width * 0.5, 92);
    ctx.fillStyle = color;
    ctx.fillText(text, canvas.width * 0.5, 92);
    ctx.restore();
    const warning = boxingSpriteState.images.warning;
    if (warning?.naturalWidth) {
      ctx.save();
      ctx.globalAlpha = 0.95;
      ctx.drawImage(warning, canvas.width * 0.5 - 24, 118, 48, 48);
      ctx.restore();
    }
  }

  function drawPromptText(t) {
    if (!state.boxing?.prompt || !boxingSpritesReady()) return;
    const promptKey = state.boxing.prompt;
    const frames = window.BOXING_FIGHT_DATA?.sprites?.texts?.prompts?.[promptKey];
    if (frames?.length) {
      const frame = frameFromList(frames, t * 1.2, 18, true);
      if (!frame) return;
      drawAtlasCentered(boxingSpriteState.images.texts, frame, canvas.width * 0.5, 88, 0.42, 0.96);
      const warning = boxingSpriteState.images.warning;
      if (warning?.naturalWidth) ctx.drawImage(warning, canvas.width * 0.5 - 24, 118, 48, 48);
      return;
    }
    if (promptKey === 'block') drawFallbackPrompt('BLOCK', '#b7ff65');
    else if (promptKey === 'superPunch') drawFallbackPrompt('SUPER PUNCH', '#ff9c3d');
  }

  function drawProjectedAttack(t) {
    const bx = state.boxing;
    const event = bx?.events?.[bx.eventIndex];
    if (!event || !event.armed || event.done || event.type === 'echo') return;
    const span = Math.max(0.001, event.fireAt - event.warnAt);
    const p = clamp((t - event.warnAt) / span, 0, 1);
    const startX = 360;
    const endX = 760;
    const x = startX + (endX - startX) * p;
    const y = 340 - Math.sin(p * Math.PI) * 60;
    const color = event.type === 'parry' ? '#4de3ff' : event.type === 'block' ? '#b7ff65' : event.type === 'superPunch' ? '#ff9c3d' : '#ffb347';
    ctx.save();
    ctx.globalAlpha = 0.5 + (1 - p) * 0.35;
    ctx.shadowBlur = event.type === 'superPunch' ? 26 : 18;
    ctx.shadowColor = color;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, (event.type === 'superPunch' ? 22 : 16) + (1 - p) * 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawEchoMarker(t) {
    const pending = state.boxing?.echoPending;
    if (!pending) return;
    const pulse = 0.55 + Math.sin(t * 18) * 0.2;
    const x = laneX(pending.lane);
    const y = receptorY() - 54;
    ctx.save();
    ctx.globalAlpha = 0.92;
    ctx.strokeStyle = '#4de3ff';
    ctx.lineWidth = 4;
    ctx.shadowBlur = 18;
    ctx.shadowColor = '#4de3ff';
    ctx.beginPath();
    ctx.arc(x, y, 18 + pulse * 10, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#dff8ff';
    ctx.font = '700 12px Trebuchet MS, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('ECHO', x, y + 4);
    ctx.restore();
  }

  function drawBoxingHud(t) {
    const bx = state.boxing;
    if (!bx?.active) return;
    drawBar(canvas.width - 260, 110, 200, 14, state.health, '#ff6d7a', 'LIFE');
    drawBar(canvas.width - 260, 142, 200, 12, bx.stamina, '#4de3ff', 'STAMINA');
    ctx.save();
    ctx.fillStyle = '#f3f7ff';
    ctx.font = '700 13px Trebuchet MS, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('Q dodge  |  Z parry  |  Hold Space block + restore', canvas.width - 260, 174);
    const blockCooldown = Math.max(0, bx.blockCooldownUntil - t);
    if (blockCooldown > 0 && !guardActive()) {
      ctx.fillStyle = '#ffd35b';
      ctx.fillText('Block cooldown: ' + blockCooldown.toFixed(1) + 's', canvas.width - 260, 194);
    } else if (guardActive() || bx.blockMissBoost > 0) {
      ctx.fillStyle = '#ffcf8b';
      ctx.fillText('Block misses speed notes: +' + Math.round(bx.blockMissBoost * 100) + '%', canvas.width - 260, 194);
    } else {
      ctx.fillStyle = '#a8bdd8';
      ctx.fillText('Very low stamina makes Matt note drain stronger, but notes stop at 10% HP.', canvas.width - 260, 194);
    }
    ctx.restore();
    drawPromptText(t);
    drawProjectedAttack(t);
    drawEchoMarker(t);
  }

  const originalSportingSpritesReady = sportingSpritesReady;
  sportingSpritesReady = function() {
    if (usesMattStage()) return mattStageSportingReady();
    if (usesSportingStage()) return spriteState.initialized &&
      imageReady(spriteState.images.matt) &&
      imageReady(spriteState.images.boyfriend) &&
      imageReady(spriteState.images.gf) &&
      imageReady(spriteState.images.notes);
    return originalSportingSpritesReady.apply(this, arguments);
  };

  const originalEnsureSportingAudio = ensureSportingAudio;
  ensureSportingAudio = function() {
    originalEnsureSportingAudio.apply(this, arguments);
    applyTrackRate(state.audio.inst, BOXING_RATE);
    applyTrackRate(state.audio.voices, BOXING_RATE);
  };

  const originalEnsureBoxingMatchAudio = ensureBoxingMatchAudio;
  ensureBoxingMatchAudio = function() {
    originalEnsureBoxingMatchAudio.apply(this, arguments);
    applyTrackRate(state.audio.boxingInst, BOXING_RATE);
    applyTrackRate(state.audio.boxingVoices, BOXING_RATE);
  };

  const originalStartSong = startSong;
  startSong = function() {
    const result = originalStartSong.apply(this, arguments);
    const songId = state.selectedSong;
    state.boxing = freshBoxingState(songId);
    if (state.boxing.active) {
      state.boxing.events = buildBoxingEvents(state.chart);
      state.health = 1;
      state.boxing.lastTime = songTime();
      state.boxing.baseScroll = SONGS.boxingMatch.scroll;
      updateBoxingScroll();
      ui.statusText.textContent = 'Boxing Match';
      ui.statusSub.textContent = '2x scroll, stronger low-stamina life drain, Matt note drain stops at 10% HP, very light stamina drain, 5s block cooldown, and super punches are active.';
    }
    return result;
  };

  const originalJudge = judge;
  judge = function(side, kind, lane, char) {
    const result = originalJudge.apply(this, arguments);
    if (!isBoxingSong()) return result;
    const bx = state.boxing;
    if (side === boxingLocalSide()) {
      bx.lastLane = lane % 4;
      bx.stamina = clamp(bx.stamina - (BOXING_NOTE_DRAIN[kind] || 0), 0, 1);
      if (kind === 'miss') {
        setLocalBoxingAction('hit', songTime(), lane % 4);
        if (guardActive()) {
          bx.blockMissBoost = clamp(bx.blockMissBoost + BOXING_BLOCK_MISS_BOOST, 0, BOXING_MAX_BLOCK_BOOST);
          bx.superCharge = clamp(bx.superCharge + 0.12, 0, 3.2);
          updateBoxingScroll();
          feed(boxingLocalFeedSide(), 'BLOCK MISS', '#ffb347');
        }
      }
      return result;
    }
    if (side === boxingRemoteSide() && kind !== 'miss') {
      const drain = mattNoteDrain(kind);
      applyMattNoteDrain(drain);
    }
    return result;
  };

  const originalHandleMisses = handleMisses;
  handleMisses = function(t) {
    const pendingOpp = isBoxingSong() && state.mode === 'solo' && state.chart?.notes
      ? state.chart.notes.filter(n => !n.judged && n.side === 'opp' && t >= n.time)
      : null;
    const result = originalHandleMisses.apply(this, arguments);
    if (pendingOpp?.length) {
      for (const note of pendingOpp) {
        if (note.judged && note.hit) {
          const drain = mattNoteDrain('good');
          applyMattNoteDrain(drain);
        }
      }
    }
    return result;
  };

  const originalHandlePress = handlePress;
  handlePress = function(lane) {
    const beforeJudged = boxingLocalStats()?.judged || 0;
    const beforeTime = songTime();
    const result = originalHandlePress.apply(this, arguments);
    const localLane = boxingLocalLane(lane);
    if (!isBoxingSong() || localLane == null) return result;
    state.boxing.lastLane = localLane;
    const afterJudged = boxingLocalStats()?.judged || 0;
    if (afterJudged > beforeJudged && state.boxing.echoWindowUntil > beforeTime && state.boxing.echoRemaining > 0 && !state.boxing.echoPending) {
      state.boxing.echoRemaining -= 1;
      state.boxing.echoPending = {
        lane,
        dueAt: beforeTime + 0.16,
        expiresAt: beforeTime + 0.36
      };
      feed(boxingLocalFeedSide(), 'ECHO', '#4de3ff');
    }
    return result;
  };

  const originalRefreshHUD = refreshHUD;
  refreshHUD = function(t) {
    originalRefreshHUD.apply(this, arguments);
    if (!isBoxingSong() || !state.boxing?.active) return;
    if (state.boxing.prompt === 'dodge') {
      ui.statusText.textContent = 'Dodge';
      ui.statusSub.textContent = 'Press Q to avoid the hit clean, including super punches.';
    } else if (state.boxing.prompt === 'parry') {
      ui.statusText.textContent = 'Parry';
      ui.statusSub.textContent = 'Press Z to cut the life drain on this punch.';
    } else if (state.boxing.prompt === 'block') {
      ui.statusText.textContent = 'Block';
      ui.statusSub.textContent = state.boxing.blockCooldownUntil > t ? 'Space block is cooling down.' : 'Hold Space to soften the punch and refill stamina.';
    } else if (state.boxing.prompt === 'superPunch') {
      ui.statusText.textContent = 'Super Punch';
      ui.statusSub.textContent = 'Matt is glowing orange. Dodge it or lose all stamina.';
    } else if (state.boxing.echoPending || state.boxing.echoWindowUntil > t) {
      ui.statusText.textContent = 'Echo';
      ui.statusSub.textContent = 'Repeat the same lane when the ECHO ring appears.';
    }
  };

  const originalStage = stage;
  stage = function(t) {
    if (usesSportingStage()) {
      initSportingStage();
      initSportingSprites();
      if (sportingStageReady()) {
        drawSportingRingStage(t);
        return;
      }
    }
    if (usesMattStage() && window.BOXING_FIGHT_DATA) {
      initBoxingSprites();
      initSportingSprites();
      const songId = songIdFor(state.currentSong);
      const boxingReady = boxingMatchSpritesReady();
      if (boxingStageReady() && songId === 'boxingMatch' && boxingReady) {
        drawMattStage(songId, t, () => {
          const superWarn = state.boxing?.active && (state.boxing.prompt === 'superPunch' || state.boxing.superWarnUntil > t - 0.14);
          if (superWarn) {
            const pulse = 0.55 + Math.sin(t * 18) * 0.22;
            ctx.save();
            ctx.globalAlpha = 0.35 + pulse * 0.18;
            ctx.shadowBlur = 26 + pulse * 22;
            ctx.shadowColor = '#ff9c3d';
            ctx.fillStyle = 'rgba(255,145,55,0.34)';
            ctx.beginPath();
            ctx.ellipse(402, 458, 138 + pulse * 16, 190 + pulse * 18, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          }
          drawBoxingCharacter('matt', BOXING_STAGE_LAYOUTS.boxingMatch.mattX, BOXING_STAGE_LAYOUTS.boxingMatch.mattY, 0.62, t);
          drawBoxingCharacter('boyfriend', BOXING_STAGE_LAYOUTS.boxingMatch.bfX, BOXING_STAGE_LAYOUTS.boxingMatch.bfY, 0.54, t);
        });
        return;
      }
    }
    return originalStage.apply(this, arguments);
  };

  const originalRenderScene = renderScene;
  renderScene = function(songT, previewT) {
    const activeTime = state.playing ? songT : previewT;
    if (state.playing && isBoxingSong()) updateBoxingState(songT);
    const result = originalRenderScene.apply(this, arguments);
    if (isBoxingSong()) drawBoxingHud(activeTime);
    return result;
  };

  const boxingKeyListener = e => {
    if (!state.playing || !state.boxing?.active) return;
    if (ui.settings.classList.contains('show') || ui.menu.classList.contains('show') || ui.resultsWrap.classList.contains('show')) return;
    const key = e.key.toLowerCase();
    const t = songTime();
    if (key === 'q' || key === 'e') {
      e.preventDefault();
      state.boxing.lastDodgeAt = t;
      setLocalBoxingAction('dodge', t, state.boxing.lastLane);
      resetGuardState(false, state.boxing.blockHeld);
      return;
    }
    if (key === 'z') {
      e.preventDefault();
      if (state.boxing.stamina >= 0.1) {
        state.boxing.stamina = clamp(state.boxing.stamina - 0.1, 0, 1);
        state.boxing.lastParryAt = t;
        setLocalBoxingAction('parry', t, state.boxing.lastLane);
        feed(boxingLocalFeedSide(), 'PARRY', '#4de3ff');
      } else {
        feed(boxingLocalFeedSide(), 'TIRED', '#ffd35b');
      }
      return;
    }
    if (key === ' ') {
      e.preventDefault();
      if (e.repeat) return;
      if (t < state.boxing.blockCooldownUntil) {
        feed(boxingLocalFeedSide(), 'BLOCK CD', '#ffd35b');
        return;
      }
      state.boxing.blockHeld = true;
      state.boxing.lastBlockAt = t;
      setLocalBoxingAction('block', t, state.boxing.lastLane);
      state.boxing.superCharge = clamp(state.boxing.superCharge + 0.14, 0, 3.2);
      feed(boxingLocalFeedSide(), 'BLOCK', '#b7ff65');
      updateBoxingScroll();
      return;
    }
    const lane = state.keyMap[key];
    if (lane === undefined) return;
    const localLane = boxingLocalLane(lane);
    if (localLane != null) state.boxing.lastLane = localLane;
    if (state.boxing.echoPending && lane === state.boxing.echoPending.lane && t >= state.boxing.echoPending.dueAt - 0.09 && t <= state.boxing.echoPending.dueAt + 0.14) {
      state.boxing.echoPending = null;
      state.health = clamp(state.health + 0.035, 0, 1);
      state.boxing.stamina = clamp(state.boxing.stamina + 0.04, 0, 1);
      setLocalBoxingAction('stando', t, lane % 4);
      feed(boxingLocalFeedSide(), 'ECHO', '#4de3ff');
    }
  };
  window.addEventListener('keydown', boxingKeyListener);

  const boxingKeyupListener = e => {
    if (!state.boxing?.active) return;
    if (e.key.toLowerCase() !== ' ') return;
    if (!state.boxing.blockHeld) return;
    resetGuardState(false, true);
  };
  window.addEventListener('keyup', boxingKeyupListener);

  if (typeof syncTrackToTime === 'function') {
    const originalSyncTrackToTime = syncTrackToTime;
    syncTrackToTime = function(track, targetTime, shouldPlay) {
      const boxingTrack = track === state.audio.inst || track === state.audio.voices || track === state.audio.boxingInst || track === state.audio.boxingVoices;
      const adjusted = boxingTrack && isBoxingSong() ? targetTime * BOXING_RATE : targetTime;
      return originalSyncTrackToTime.call(this, track, adjusted, shouldPlay);
    };
  }

  if (typeof songTime === 'function') {
    const originalSongTime = songTime;
    songTime = function() {
      const value = originalSongTime.apply(this, arguments);
      if (state.mode === 'online' && isBoxingSong()) return value * BOXING_RATE;
      return value;
    };
  }

  window.getImportedSongPlaybackRate = importedPlaybackRate;

  if (SONGS.sporting) {
    SONGS.sporting.tempo = 300;
    SONGS.sporting.scroll = 920 * SPORTING_SCROLL_MULT;
    SONGS.sporting.subtitle = 'Original hard chart with 1.5x scroll';
    SONGS.sporting.diff = 'Hard (Original Chart)';
    SONGS.sporting.blurb = 'Original Sporting hard chart and vocals at normal speed, with 1.5x note scroll on the boxing ring stage.';
  }
  if (SONGS.boxingMatch) {
    SONGS.boxingMatch.tempo = 339;
    SONGS.boxingMatch.scroll = 760 * BOXING_SCROLL_MULT;
    SONGS.boxingMatch.subtitle = 'Paid Boxing Fight hard chart with 2x scroll';
    SONGS.boxingMatch.diff = 'Hard (Paid Mod Chart)';
      SONGS.boxingMatch.blurb = 'Paid Boxing Fight hard chart and vocals at normal speed, with real boxer BF and Matt sprites, very light stamina drain on your note hits, stronger low-stamina Matt life drain that stops at 10% HP, Echo, a 5-second block cooldown, block speed-ups, and super punches on the boxing ring.';
  }

  initSportingSprites();
  initBoxingSprites();
  initSportingStage();

  if (typeof renderSongs === 'function') renderSongs();
})();






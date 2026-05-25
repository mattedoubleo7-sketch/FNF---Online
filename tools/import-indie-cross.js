const fs = require("fs");
const path = require("path");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const MOD_ROOT = path.resolve("C:/Users/matth/Downloads/indie-cross-build");
const ASSET_ROOT = path.join(PROJECT_ROOT, "assets", "indie-cross");

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function copyAsset(sourceRelative, targetRelative) {
  const sourcePath = path.join(MOD_ROOT, sourceRelative);
  const targetPath = path.join(PROJECT_ROOT, targetRelative);
  ensureDir(path.dirname(targetPath));
  fs.copyFileSync(sourcePath, targetPath);
  return targetRelative.replace(/\\/g, "/");
}

function readJson(sourceRelative) {
  return JSON.parse(fs.readFileSync(path.join(MOD_ROOT, sourceRelative), "utf8"));
}

function readText(sourceRelative) {
  return fs.readFileSync(path.join(MOD_ROOT, sourceRelative), "utf8");
}

function readProjectText(sourceRelative) {
  return fs.readFileSync(path.join(PROJECT_ROOT, sourceRelative), "utf8");
}

function parseFrameAttributes(block) {
  const attrs = {};
  for (const match of block.matchAll(/([A-Za-z0-9_:-]+)="([^"]*)"/g)) {
    attrs[match[1]] = match[2];
  }
  return attrs;
}

function numberAttr(attrs, key, fallback = 0) {
  const value = Number(attrs[key]);
  return Number.isFinite(value) ? value : fallback;
}

function parseSparrowFrames(xmlText) {
  const frames = [];
  for (const match of xmlText.matchAll(/<SubTexture\b([^>]*?)\/>/g)) {
    const attrs = parseFrameAttributes(match[1]);
    frames.push({
      name: String(attrs.name || ""),
      x: numberAttr(attrs, "x"),
      y: numberAttr(attrs, "y"),
      w: numberAttr(attrs, "width"),
      h: numberAttr(attrs, "height"),
      fx: numberAttr(attrs, "frameX"),
      fy: numberAttr(attrs, "frameY"),
      fw: numberAttr(attrs, "frameWidth", numberAttr(attrs, "width")),
      fh: numberAttr(attrs, "frameHeight", numberAttr(attrs, "height")),
      rotated: String(attrs.rotated || "false") === "true"
    });
  }
  return frames;
}

function frameSortValue(name) {
  const match = String(name || "").match(/(\d+)(?!.*\d)/);
  return match ? Number(match[1]) : 0;
}

function framesByPrefix(frames, prefix) {
  return frames
    .filter(frame => frame.name.startsWith(prefix))
    .sort((a, b) => frameSortValue(a.name) - frameSortValue(b.name));
}

function animationFromPrefix(frames, prefix, options = {}) {
  const list = framesByPrefix(frames, prefix);
  return {
    frames: list,
    fps: Number(options.fps || 24),
    loop: !!options.loop,
    offset: [Number(options.offset?.[0] || 0), Number(options.offset?.[1] || 0)]
  };
}

function buildSpriteData(imageRelative, xmlRelative, animations, extra = {}) {
  const image = copyAsset(imageRelative, path.join("assets", "indie-cross", path.basename(imageRelative)));
  const xmlTarget = path.join("assets", "indie-cross", path.basename(xmlRelative));
  copyAsset(xmlRelative, xmlTarget);
  const frames = parseSparrowFrames(readText(xmlRelative));
  const outputAnimations = {};
  for (const [name, definition] of Object.entries(animations)) {
    const options = typeof definition === "string" ? { prefix: definition } : definition;
    outputAnimations[name] = animationFromPrefix(frames, options.prefix, options);
  }
  return {
    image,
    scale: Number(extra.scale || 1),
    flipX: !!extra.flipX,
    singDuration: Number(extra.singDuration || 4),
    position: [0, 0],
    cameraPosition: [0, 0],
    animations: outputAnimations
  };
}

function buildStageAnimData(imageRelative, xmlRelative, animations, targetNames = {}) {
  const image = copyAsset(imageRelative, path.join("assets", "indie-cross", targetNames.image || path.basename(imageRelative)));
  const xmlTarget = path.join("assets", "indie-cross", targetNames.xml || path.basename(xmlRelative));
  copyAsset(xmlRelative, xmlTarget);
  const frames = parseSparrowFrames(readText(xmlRelative));
  const outputAnimations = {};
  for (const [name, definition] of Object.entries(animations)) {
    const options = typeof definition === "string" ? { prefix: definition } : definition;
    outputAnimations[name] = animationFromPrefix(frames, options.prefix, options);
  }
  return { image, animations: outputAnimations };
}

function buildProjectAtlasData(xmlRelative) {
  return {
    frames: parseSparrowFrames(readProjectText(xmlRelative))
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function classifySansational(group, time, lane, side) {
  if (group === 2) return { noteType: "blueDeath" };
  if (group === 4) return { noteType: "orangeBone" };
  if (group === 3) return { eventType: "dodge", lane, side, warnAt: Math.max(0, time - 0.65), fireAt: time };
  if (group === 5) return { eventType: "attack", lane, side, startAt: Math.max(0, time - 0.2), endAt: time + 0.45 };
  return null;
}

function classifyLastReel(group, time, lane, side) {
  if (group === 6) return { noteType: "ink" };
  if (group === 8) return { noteType: "shadow" };
  if (group === 7) {
    const direction = lane < 2 ? "left" : "right";
    return {
      eventType: "butcher",
      lane,
      side,
      direction,
      warnAt: Math.max(0, time - 1.05),
      fireAt: Math.max(0, time - 0.18),
      counterStartAt: time + 0.12,
      counterEndAt: time + 0.72
    };
  }
  if (group === 9) {
    return {
      eventType: "run",
      lane,
      side,
      startAt: Math.max(0, time - 0.28),
      fireAt: time,
      endAt: time + 1.05
    };
  }
  return null;
}

function pushConvertedNote(notes, options, noteIndex, time, spb, laneBase, side, sustain, special, sideCharacter) {
  const fullLane = laneBase + (side === "player" ? 4 : 0);
  notes.push({
    id: `${options.prefix}-${noteIndex}`,
    beat: time / spb,
    time,
    lane: fullLane,
    side,
    character: sideCharacter[side],
    sLen: sustain,
    specialType: special?.noteType || null
  });
}

function convertPsychChart(chartFileRelative, options) {
  const rawSong = readJson(chartFileRelative).song;
  const bpm = Number(options.bpm || rawSong.bpm || 120);
  const spb = 60 / bpm;
  const notes = [];
  const timeline = [];
  const events = [];
  let cursorBeat = 0;
  let noteIndex = 0;
  const sideCharacter = {
    opp: options.opponentCharacter || "dad",
    player: options.playerCharacter || "player"
  };

  for (let sectionIndex = 0; sectionIndex < rawSong.notes.length; sectionIndex++) {
    const section = rawSong.notes[sectionIndex];
    const beats = Math.max(0.25, Number(section.lengthInSteps || 16) / 4);
    const startBeat = cursorBeat;
    const endBeat = cursorBeat + beats;
    const baseSide = section.mustHitSection ? "player" : "opp";
    timeline.push({
      startBeat,
      endBeat,
      startTime: startBeat * spb,
      endTime: endBeat * spb,
      mustHitSection: !!section.mustHitSection,
      altAnim: !!section.altAnim
    });
    for (const rawNote of section.sectionNotes || []) {
      const time = Number(rawNote[0] || 0) / 1000;
      const rawData = Number(rawNote[1] || 0);
      const sustain = Math.max(0, Number(rawNote[2] || 0)) / 1000;
      const group = Math.floor(rawData / 4);
      const laneBase = ((rawData % 4) + 4) % 4;
      const side = group % 2 === 0 ? baseSide : (baseSide === "player" ? "opp" : "player");
      const special = options.classify ? options.classify(group, time, laneBase, side) : null;
      if (special?.eventType) {
        events.push({
          id: `${options.prefix}-event-${events.length}`,
          time,
          lane: laneBase,
          side,
          ...special
        });
      }
      pushConvertedNote(notes, options, noteIndex++, time, spb, laneBase, side, sustain, special, sideCharacter);
    }
    cursorBeat = endBeat;
  }

  notes.sort((a, b) => a.time - b.time || a.lane - b.lane);
  events.sort((a, b) => a.time - b.time || a.lane - b.lane);

  const noteEnd = notes.reduce((max, note) => Math.max(max, note.time + Math.max(0, note.sLen || 0)), 0);
  const eventEnd = events.reduce((max, event) => Math.max(max, Number(event.endAt || event.counterEndAt || event.fireAt || event.time || 0)), 0);
  const totalBeats = cursorBeat;
  const totalTime = Math.max(noteEnd, eventEnd, totalBeats * spb) + 2.5;

  return {
    chart: {
      notes,
      timeline,
      totalBeats,
      totalTime,
      songEndTime: totalTime,
      spb
    },
    mechanics: {
      events
    }
  };
}

function writeDataFile(targetName, objectName, payload) {
  const targetPath = path.join(PROJECT_ROOT, targetName);
  const source = `window.${objectName} = ${JSON.stringify(payload)};\n`;
  fs.writeFileSync(targetPath, source, "utf8");
}

function buildSansational() {
  const converted = convertPsychChart("assets/data/sansational/sansational-hard.json", {
    prefix: "sansational",
    bpm: 130,
    classify: classifySansational,
    opponentCharacter: "sans",
    playerCharacter: "player"
  });

  const payload = {
    song: {
      title: "Sansational",
      subtitle: "Indie Cross hard chart import",
      diff: "Hard (Original Chart)",
      bpm: 130,
      speed: 2.9,
      weekName: "Indie Cross"
    },
    chart: converted.chart,
    mechanics: converted.mechanics,
    noteSkin: buildProjectAtlasData("assets/NOTE_assets.xml"),
    stage: {
      hall: copyAsset("assets/sans/images/hall.png", "assets/indie-cross/hall.png"),
      hallDark: copyAsset("assets/sans/images/halldark.png", "assets/indie-cross/halldark.png"),
      waterfall: copyAsset("assets/sans/images/Waterfall.png", "assets/indie-cross/Waterfall.png"),
      main: buildStageAnimData(
        "assets/sans/images/Nightmare Sans Stage.png",
        "assets/sans/images/Nightmare Sans Stage.xml",
        {
          normal: { prefix: "Normal instance", fps: 24, loop: true },
          floor: { prefix: "dd instance", fps: 24, loop: true }
        }
      )
    },
    sprites: {
      sans: buildSpriteData(
        "assets/shared/images/characters/Sans.png",
        "assets/shared/images/characters/Sans.xml",
        {
          idle: { prefix: "Sans FNF instance", fps: 24 },
          singLEFT: { prefix: "Left instance", fps: 24 },
          singDOWN: { prefix: "Down instance", fps: 24 },
          singUP: { prefix: "Up instance", fps: 24 },
          singRIGHT: { prefix: "Right instance", fps: 24 }
        },
        { scale: 1.02, flipX: false }
      ),
      sansAlt: buildSpriteData(
        "assets/shared/images/characters/Sans.png",
        "assets/shared/images/characters/Sans.xml",
        {
          idle: { prefix: "Sans FNF 02 instance", fps: 24 },
          singLEFT: { prefix: "Left 02 instance", fps: 24 },
          singDOWN: { prefix: "Down 02 instance", fps: 24 },
          singUP: { prefix: "Up 02 instance", fps: 24 },
          singRIGHT: { prefix: "Right 02 instance", fps: 24 }
        },
        { scale: 1.02, flipX: false }
      ),
      boyfriend: buildSpriteData(
        "assets/shared/images/characters/BF-BS-shader.png",
        "assets/shared/images/characters/BF-BS-shader.xml",
        {
          idle: { prefix: "BF idle dance instance", fps: 24 },
          singLEFT: { prefix: "BF NOTE LEFT instance", fps: 24 },
          singDOWN: { prefix: "BF NOTE DOWN instance", fps: 24 },
          singUP: { prefix: "BF NOTE UP instance", fps: 24 },
          singRIGHT: { prefix: "BF NOTE RIGHT instance", fps: 24 },
          singLEFTmiss: { prefix: "BF NOTE LEFT MISS instance", fps: 24 },
          singDOWNmiss: { prefix: "BF NOTE DOWN MISS instance", fps: 24 },
          singUPmiss: { prefix: "BF NOTE UP MISS instance", fps: 24 },
          singRIGHTmiss: { prefix: "BF NOTE RIGHT MISS instance", fps: 24 },
          dodge: { prefix: "boyfriend dodge instance", fps: 24 },
          attack: { prefix: "0BF attack instance", fps: 24 },
          hurt: { prefix: "BF hit instance", fps: 24 }
        },
        { scale: 1, flipX: false }
      ),
      dodgeMechsShader: buildStageAnimData(
        "assets/sans/images/DodgeMechsBS-Shader.png",
        "assets/sans/images/DodgeMechsBS-Shader.xml",
        {
          alarm: { prefix: "Alarm instance", fps: 24, loop: true },
          bones: { prefix: "Bones boi instance", fps: 24, loop: true },
          dodge: { prefix: "Dodge instance", fps: 24, loop: false }
        }
      ),
      dodgeMechs: buildStageAnimData(
        "assets/sans/images/DodgeMechs.png",
        "assets/sans/images/DodgeMechs.xml",
        {
          alarm: { prefix: "Alarm instance", fps: 24, loop: true },
          bones: { prefix: "Bones boi instance", fps: 24, loop: true },
          dodge: { prefix: "Dodge instance", fps: 24, loop: false }
        }
      ),
      warning: buildStageAnimData(
        "assets/shared/images/Warning.png",
        "assets/shared/images/Warning.xml",
        {
          attack: { prefix: "Attack instance", fps: 24, loop: false },
          dodge: { prefix: "Dodge instance", fps: 24, loop: false }
        }
      ),
      alert: copyAsset("assets/images/sansalert.png", "assets/indie-cross/sansational-alert.png")
    },
    audio: {
      inst: copyAsset("assets/songs/sansational/Inst.ogg", "sansational-inst.ogg"),
      voices: copyAsset("assets/songs/sansational/Voices.ogg", "sansational-voices.ogg"),
      dodge: copyAsset("assets/sans/sounds/dodge.ogg", "assets/indie-cross/sansational-dodge.ogg"),
      attack: copyAsset("assets/sans/sounds/sansattack.ogg", "assets/indie-cross/sansational-attack.ogg"),
      hurt: copyAsset("assets/sans/sounds/hurt.ogg", "assets/indie-cross/sansational-hurt.ogg"),
      notice: copyAsset("assets/sans/sounds/notice.ogg", "assets/indie-cross/sansational-notice.ogg")
    }
  };

  writeDataFile("sansational-data.js", "SANSATIONAL_DATA", payload);
}

function buildLastReel() {
  const converted = convertPsychChart("assets/data/last-reel/last-reel-hard.json", {
    prefix: "last-reel",
    bpm: 195,
    classify: classifyLastReel,
    opponentCharacter: "bendy",
    playerCharacter: "player"
  });

  const payload = {
    song: {
      title: "Last Reel",
      subtitle: "Indie Cross hard chart import",
      diff: "Hard (Original Chart)",
      bpm: 195,
      speed: 3,
      weekName: "Indie Cross"
    },
    chart: converted.chart,
    mechanics: converted.mechanics,
    noteSkin: buildProjectAtlasData("assets/NOTE_assets.xml"),
    stage: {
      roomBackBack: copyAsset("assets/bendy/images/BACKBACKgROUND.png", "assets/indie-cross/last-reel-backback.png"),
      roomBackground: copyAsset("assets/bendy/images/BackgroundwhereDEEZNUTSfitINYOmOUTH.png", "assets/indie-cross/last-reel-background.png"),
      roomBackMain: copyAsset("assets/bendy/images/BackgroundwhereDEEZNUTSfitINYOmOUTH.png", "assets/indie-cross/last-reel-backmain.png"),
      roomMidGround: copyAsset("assets/bendy/images/MidGrounUTS.png", "assets/indie-cross/last-reel-midground.png"),
      roomForeground: copyAsset("assets/bendy/images/ForegroundEEZNUTS.png", "assets/indie-cross/last-reel-foreground.png"),
      roomTop: copyAsset("assets/bendy/images/NUTS.png", "assets/indie-cross/last-reel-room-top.png"),
      roomChain: copyAsset("assets/bendy/images/ChainUTS.png", "assets/indie-cross/last-reel-chain-orig.png"),
      inkyDepths: copyAsset("assets/bendy/images/inky depths.png", "assets/indie-cross/last-reel-inky-depths.png"),
      jzBoy: buildStageAnimData(
        "assets/bendy/images/third/JzBoy.png",
        "assets/bendy/images/third/JzBoy.xml",
        {
          walk: { prefix: "Jack Copper Walk by instance", fps: 24, loop: true }
        },
        { image: "last-reel-jzboy.png", xml: "last-reel-jzboy.xml" }
      ),
      sammyBg: buildStageAnimData(
        "assets/bendy/images/third/SammyBg.png",
        "assets/bendy/images/third/SammyBg.xml",
        {
          idle: { prefix: "Sam instance", fps: 24, loop: true }
        },
        { image: "last-reel-sammy-bg.png", xml: "last-reel-sammy-bg.xml" }
      ),
      roomCandles: buildStageAnimData(
        "assets/bendy/images/Candles.png",
        "assets/bendy/images/Candles.xml",
        {
          candles: { prefix: "Candless instance", fps: 24, loop: true },
          lights: { prefix: "Lights instance", fps: 24, loop: true }
        },
        { image: "last-reel-candles.png", xml: "last-reel-candles.xml" }
      ),
      back: buildStageAnimData(
        "assets/bendy/images/third/Butchergang_Bg.png",
        "assets/bendy/images/third/Butchergang_Bg.xml",
        {
          idle: { prefix: "Symbol 1 instance", fps: 24, loop: true }
        }
      ),
      rain: buildStageAnimData(
        "assets/bendy/images/third/InkRain.png",
        "assets/bendy/images/third/InkRain.xml",
        {
          idle: { prefix: "erteyd instance", fps: 24, loop: true }
        }
      ),
      inkOverlay: copyAsset("assets/bendy/images/third/Ink_shit.png", "assets/indie-cross/last-reel-ink-overlay.png")
    },
    sprites: {
      bendy: buildSpriteData(
        "assets/shared/images/characters/Bendy_remastered.png",
        "assets/shared/images/characters/Bendy_remastered.xml",
        {
          idle: { prefix: "Bendy Idle instance", fps: 24 },
          singLEFT: { prefix: "Left instance", fps: 24 },
          singDOWN: { prefix: "bendydown instance", fps: 24 },
          singUP: { prefix: "Up instance", fps: 24 },
          singRIGHT: { prefix: "B-Right instance", fps: 24 },
          transform: { prefix: "Scream instance", fps: 24 }
        },
        { scale: 0.98, flipX: false }
      ),
      boyfriend: buildSpriteData(
        "assets/shared/images/characters/BoyFriend_NM_Bendy.png",
        "assets/shared/images/characters/BoyFriend_NM_Bendy.xml",
        {
          idle: { prefix: "BF idle dance copy instance", fps: 24 },
          singLEFT: { prefix: "BF NOTE LEFT copy instance", fps: 24 },
          singDOWN: { prefix: "BF NOTE DOWN copy instance", fps: 24 },
          singUP: { prefix: "BF NOTE UP copy instance", fps: 24 },
          singRIGHT: { prefix: "BF NOTE RIGHT copy instance", fps: 24 },
          singLEFTmiss: { prefix: "L-Miss instance", fps: 24 },
          singDOWNmiss: { prefix: "D-Miss instance", fps: 24 },
          singUPmiss: { prefix: "U-Miss instance", fps: 24 },
          singRIGHTmiss: { prefix: "R-Miss instance", fps: 24 },
          dodge: { prefix: "Dodge instance", fps: 24 },
          attack: { prefix: "Attack instance", fps: 24 },
          hurt: { prefix: "Ouch instance", fps: 24 }
        },
        { scale: 0.95, flipX: false }
      ),
      piper: buildStageAnimData(
        "assets/bendy/images/third/Piper.png",
        "assets/bendy/images/third/Piper.xml",
        {
          walk: { prefix: "pip walk instance", fps: 24, loop: true },
          attack: { prefix: "PipAttack instance", fps: 24, loop: false },
          hit: { prefix: "Piper gets Hit instance", fps: 24, loop: false },
          death: { prefix: "Piper ded instance", fps: 24, loop: false },
          peek: { prefix: "Piperr instance", fps: 24, loop: false }
        }
      ),
      striker: buildStageAnimData(
        "assets/bendy/images/third/Striker.png",
        "assets/bendy/images/third/Striker.xml",
        {
          walk: { prefix: "Str walk instance", fps: 24, loop: true },
          attack: { prefix: "PunchAttack_container instance", fps: 24, loop: false },
          hit: { prefix: "Sticker  instance", fps: 24, loop: false },
          death: { prefix: "I ded instance", fps: 24, loop: false },
          peek: { prefix: "regeg instance", fps: 24, loop: false }
        }
      ),
      warning: buildStageAnimData(
        "assets/shared/images/Warning.png",
        "assets/shared/images/Warning.xml",
        {
          attack: { prefix: "Attack instance", fps: 24, loop: false },
          dodge: { prefix: "Dodge instance", fps: 24, loop: false }
        }
      ),
      alert: copyAsset("assets/images/bendyalert.png", "assets/indie-cross/last-reel-alert.png")
    },
    audio: {
      inst: copyAsset("assets/songs/last-reel/Inst.ogg", "last-reel-inst.ogg"),
      voices: copyAsset("assets/songs/last-reel/Voices.ogg", "last-reel-voices.ogg"),
      inked: copyAsset("assets/bendy/sounds/inked.ogg", "assets/indie-cross/last-reel-inked.ogg"),
      whoosh: copyAsset("assets/bendy/sounds/whoosh.ogg", "assets/indie-cross/last-reel-whoosh.ogg"),
      punched: copyAsset("assets/bendy/sounds/punched.ogg", "assets/indie-cross/last-reel-punched.ogg"),
      attack: copyAsset("assets/bendy/sounds/butcherSounds/Attack01.ogg", "assets/indie-cross/last-reel-attack.ogg"),
      hit: copyAsset("assets/bendy/sounds/butcherSounds/Hit01.ogg", "assets/indie-cross/last-reel-hit.ogg"),
      hurt: copyAsset("assets/bendy/sounds/butcherSounds/Hurt01.ogg", "assets/indie-cross/last-reel-hurt.ogg")
    }
  };

  writeDataFile("last-reel-data.js", "LAST_REEL_DATA", payload);
}

function main() {
  ensureDir(ASSET_ROOT);
  buildSansational();
  buildLastReel();
  console.log("Imported Indie Cross songs into", PROJECT_ROOT);
}

main();

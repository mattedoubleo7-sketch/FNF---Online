const fs = require("fs");
const path = require("path");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const MOD_ROOT = path.resolve(
  "C:/Users/matth/Downloads/wii_funkin_-_vs_matt_c36aa (1)/Wii Funkin' - VS Matt"
);

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

function readText(sourceRelative) {
  return fs.readFileSync(path.join(MOD_ROOT, sourceRelative), "utf8");
}

function readJson(sourceRelative) {
  return JSON.parse(readText(sourceRelative));
}

function round(value, places = 6) {
  const factor = 10 ** places;
  return Math.round(Number(value || 0) * factor) / factor;
}

function attrsFromTag(tag) {
  const attrs = {};
  for (const attr of tag.matchAll(/([\w-]+)="([^"]*)"/g)) attrs[attr[1]] = attr[2];
  return attrs;
}

function parseSparrowFrames(xmlRelative, sortByName = true) {
  const xml = readText(xmlRelative);
  const frames = [];
  for (const match of xml.matchAll(/<SubTexture\s+([^>]+?)\s*\/>/g)) {
    const attrs = attrsFromTag(match[1]);
    frames.push({
      name: attrs.name,
      x: Number(attrs.x || 0),
      y: Number(attrs.y || 0),
      w: Number(attrs.width || 0),
      h: Number(attrs.height || 0),
      fx: Number(attrs.frameX || 0),
      fy: Number(attrs.frameY || 0),
      fw: Number(attrs.frameWidth || attrs.width || 0),
      fh: Number(attrs.frameHeight || attrs.height || 0),
      rotated: String(attrs.rotated || "").toLowerCase() === "true"
    });
  }
  return sortByName
    ? frames.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
    : frames;
}

function animationFrames(allFrames, sourceAnimation) {
  const matches = allFrames.filter(frame => frame.name.startsWith(sourceAnimation.name));
  const indices = Array.isArray(sourceAnimation.indices) ? sourceAnimation.indices : [];
  if (!indices.length) return matches;

  return indices
    .map(index => {
      const numericSuffix = new RegExp(String(index).padStart(4, "0") + "$");
      return matches.find(frame => numericSuffix.test(frame.name)) || matches[index];
    })
    .filter(Boolean);
}

function importCharacter(configRelative, xmlRelative, imageRelative, targetImage, animationMap) {
  const config = readJson(configRelative);
  const sourceFrames = parseSparrowFrames(xmlRelative, false);
  const allFrames = sourceFrames.slice().sort(
    (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })
  );
  const firstFrame = sourceFrames[0] || { fw: 0, fh: 0 };
  const scale = Number(config.scale || 1);
  const animations = {};

  for (const [targetName, sourceName] of Object.entries(animationMap)) {
    const sourceAnimation = config.animations.find(animation => animation.anim === sourceName);
    if (!sourceAnimation) continue;
    animations[targetName] = {
      frames: animationFrames(allFrames, sourceAnimation),
      offsets: (sourceAnimation.offsets || [0, 0]).map(Number),
      fps: Number(sourceAnimation.fps || 24),
      loop: !!sourceAnimation.loop
    };
  }

  return {
    image: copyAsset(imageRelative, targetImage),
    position: (config.position || [0, 0]).map(Number),
    cameraPosition: (config.camera_position || [0, 0]).map(Number),
    hitbox: [firstFrame.fw * scale, firstFrame.fh * scale],
    scale,
    flipX: !!config.flip_x,
    animations
  };
}

function importNoteSkin(xmlRelative, imageRelative, targetImage) {
  const allFrames = parseSparrowFrames(xmlRelative);
  const frame = name => allFrames.find(item => item.name === name) || null;
  const frames = prefix => allFrames.filter(item => item.name.startsWith(prefix));
  const directions = {
    left: { arrow: "arrowLEFT0000", gem: "purple0000", color: "purple" },
    down: { arrow: "arrowDOWN0000", gem: "blue0000", color: "blue" },
    up: { arrow: "arrowUP0000", gem: "green0000", color: "green" },
    right: { arrow: "arrowRIGHT0000", gem: "red0000", color: "red" }
  };
  const notes = {
    image: copyAsset(imageRelative, targetImage),
    palette: {
      left: { r: [194, 75, 153], g: [255, 255, 255], b: [60, 31, 86] },
      down: { r: [0, 255, 255], g: [255, 255, 255], b: [21, 66, 183] },
      up: { r: [18, 250, 5], g: [255, 255, 255], b: [10, 68, 71] },
      right: { r: [249, 57, 63], g: [255, 255, 255], b: [101, 16, 56] }
    },
    static: {},
    gem: {},
    press: {},
    confirm: {},
    hold: {}
  };

  for (const [direction, names] of Object.entries(directions)) {
    notes.static[direction] = frame(names.arrow);
    notes.gem[direction] = frame(names.gem);
    notes.press[direction] = frames(`${direction} press`);
    notes.confirm[direction] = frames(`${direction} confirm`);
    notes.hold[direction] = {
      piece: frame(`${names.color} hold piece0000`),
      end: frame(`${names.color} hold end0000`)
    };
  }
  return notes;
}

function parseModchartEvents(xmlRelative) {
  const xml = readText(xmlRelative);
  const events = [];
  for (const match of xml.matchAll(/<Event\s+([^>]+?)\s*\/>/g)) {
    const attrs = attrsFromTag(match[1]);
    if (attrs.type === "setShaderProperty") {
      events.push({
        type: "set",
        step: round(attrs.step || 0, 3),
        duration: 0,
        name: attrs.name || "",
        property: attrs.property || "",
        value: round(attrs.value, 4),
        startValue: null,
        ease: "linear"
      });
      continue;
    }
    if (attrs.type !== "tweenShaderProperty" || attrs.step == null) continue;
    events.push({
      type: "tween",
      step: round(attrs.step, 3),
      duration: round(attrs.time, 3),
      name: attrs.name || "",
      property: attrs.property || "",
      value: round(attrs.value, 4),
      startValue: attrs.startValue == null ? null : round(attrs.startValue, 4),
      ease: attrs.ease || "linear"
    });
  }
  return events.sort((a, b) =>
    a.step - b.step ||
    (a.type === "set" ? -1 : 1) ||
    a.name.localeCompare(b.name) ||
    a.property.localeCompare(b.property)
  );
}

function oggDuration(sourceRelative) {
  const data = fs.readFileSync(path.join(MOD_ROOT, sourceRelative));
  const vorbisHeader = data.indexOf(Buffer.from("\x01vorbis", "binary"));
  const lastPage = data.lastIndexOf(Buffer.from("OggS"));
  if (vorbisHeader < 0 || lastPage < 0 || lastPage + 14 > data.length) return 0;
  const sampleRate = data.readUInt32LE(vorbisHeader + 12);
  const granule = data.readBigUInt64LE(lastPage + 6);
  return sampleRate > 0 ? Number(granule) / sampleRate : 0;
}

function convertPsychChart(chartRelative, modchartRelative, audioRelative, options) {
  const rawSong = readJson(chartRelative).song;
  const bpm = Number(rawSong.bpm || options.bpm);
  const spb = 60 / bpm;
  const notes = [];
  const timeline = [];
  let cursorBeat = 0;
  let noteIndex = 0;

  for (const section of rawSong.notes || []) {
    const beats = Math.max(
      0.25,
      Number(section.lengthInSteps || section.sectionBeats * 4 || 16) / 4
    );
    const startBeat = cursorBeat;
    const endBeat = cursorBeat + beats;
    const baseSide = section.mustHitSection ? "player" : "opp";

    timeline.push({
      startBeat: round(startBeat),
      endBeat: round(endBeat),
      turn: baseSide,
      label: `${options.title} original hard section`,
      style: "rush",
      int: options.intensity,
      startTime: round(startBeat * spb),
      endTime: round(endBeat * spb),
      mustHitSection: !!section.mustHitSection,
      gfSection: !!section.gfSection,
      altAnim: !!section.altAnim
    });

    for (const rawNote of section.sectionNotes || []) {
      const time = Number(rawNote[0] || 0) / 1000;
      const rawData = Number(rawNote[1] || 0);
      const sustain = Math.max(0, Number(rawNote[2] || 0)) / 1000;
      const group = Math.floor(rawData / 4);
      const laneBase = ((rawData % 4) + 4) % 4;
      const side = group % 2 === 0
        ? baseSide
        : (baseSide === "player" ? "opp" : "player");
      notes.push({
        id: noteIndex++,
        beat: round(time / spb),
        time: round(time),
        lane: laneBase + (side === "player" ? 4 : 0),
        side,
        character: side === "player" ? "player" : "matt",
        noteType: typeof rawNote[3] === "string" ? rawNote[3] : "",
        sLen: round(sustain)
      });
    }
    cursorBeat = endBeat;
  }

  notes.sort((a, b) => a.time - b.time || a.lane - b.lane);
  notes.forEach((note, index) => { note.id = index; });
  const shaderEvents = parseModchartEvents(modchartRelative);
  const noteEnd = notes.reduce(
    (max, note) => Math.max(max, note.time + Math.max(0, note.sLen || 0)),
    0
  );
  const shaderEnd = shaderEvents.reduce(
    (max, event) => Math.max(max, (event.step + event.duration) * spb / 4),
    0
  );
  const audioDuration = oggDuration(audioRelative);
  const totalTime = Math.max(noteEnd, shaderEnd, audioDuration);

  return {
    notes,
    timeline,
    shaderEvents,
    totalBeats: round(totalTime / spb),
    totalTime: round(totalTime),
    bpm,
    speed: Number(rawSong.speed || options.speed),
    spb: round(spb),
    source: {
      chart: chartRelative.replace(/\\/g, "/"),
      modchart: modchartRelative.replace(/\\/g, "/"),
      stage: rawSong.stage,
      player1: rawSong.player1,
      player2: rawSong.player2,
      gfVersion: rawSong.gfVersion
    }
  };
}

function writeDataFile(targetName, objectName, payload) {
  const targetPath = path.join(PROJECT_ROOT, targetName);
  fs.writeFileSync(targetPath, `window.${objectName}=${JSON.stringify(payload)};\n`, "utf8");
}

function main() {
  const sporting = convertPsychChart(
    "mods/data/sporting/sporting-hard.json",
    "mods/data/sporting/modchart.xml",
    "mods/songs/sporting/Inst.ogg",
    { title: "Sporting", bpm: 300, speed: 3.2, intensity: 0.98 }
  );
  const boxingMatch = convertPsychChart(
    "mods/data/boxing-match/boxing-match-hard.json",
    "mods/data/boxing-match/modchart.xml",
    "mods/songs/boxing-match/Inst.ogg",
    { title: "Boxing Match", bpm: 339, speed: 3.1, intensity: 0.98 }
  );

  writeDataFile("sporting-chart.js", "SPORTING_CHART", sporting);
  writeDataFile("boxing-match-chart.js", "BOXING_MATCH_CHART", boxingMatch);

  copyAsset("mods/songs/sporting/Inst.ogg", "sporting-inst.ogg");
  copyAsset("mods/songs/sporting/Voices.ogg", "sporting-voices.ogg");
  copyAsset("mods/songs/boxing-match/Inst.ogg", "boxing-match-inst.ogg");
  copyAsset("mods/songs/boxing-match/Voices.ogg", "boxing-match-voices.ogg");
  const midcutscene = copyAsset("mods/videos/BM_midcutscene.mp4", "BM_midcutscene.mp4");

  const matt = importCharacter(
    "mods/characters/boxingmatt.json",
    "mods/images/characters/Boxing_Matt.xml",
    "mods/images/characters/Boxing_Matt.png",
    "assets/vsmatt-original/boxingmatt.png",
    {
      idle: "idle",
      left: "singLEFT",
      down: "singDOWN",
      up: "singUP",
      right: "singRIGHT"
    }
  );
  const boyfriend = importCharacter(
    "mods/characters/boxing_bf.json",
    "mods/images/characters/boxing_bf.xml",
    "mods/images/characters/boxing_bf.png",
    "assets/vsmatt-original/boxing-bf.png",
    {
      idle: "idle",
      left: "singLEFT",
      down: "singDOWN",
      up: "singUP",
      right: "singRIGHT",
      leftMiss: "singLEFTmiss",
      downMiss: "singDOWNmiss",
      upMiss: "singUPmiss",
      rightMiss: "singRIGHTmiss"
    }
  );
  boyfriend.flipX = false;
  const sportingMatt = importCharacter(
    "mods/characters/mattrap.json",
    "mods/images/characters/MattRap.xml",
    "mods/images/characters/MattRap.png",
    "assets/vsmatt-original/mattrap.png",
    {
      idle: "idle",
      left: "singLEFT",
      down: "singDOWN",
      up: "singUP",
      right: "singRIGHT"
    }
  );
  const sportingBoyfriend = importCharacter(
    "mods/characters/sportsbf.json",
    "mods/images/characters/sportsbf.xml",
    "mods/images/characters/sportsbf.png",
    "assets/vsmatt-original/sportsbf.png",
    {
      idle: "idle",
      left: "singLEFT",
      down: "singDOWN",
      up: "singUP",
      right: "singRIGHT",
      leftMiss: "singLEFTmiss",
      downMiss: "singDOWNmiss",
      upMiss: "singUPmiss",
      rightMiss: "singRIGHTmiss"
    }
  );
  sportingBoyfriend.flipX = false;
  const gf = importCharacter(
    "mods/characters/sportsgf.json",
    "mods/images/characters/sportsgf.xml",
    "mods/images/characters/sportsgf.png",
    "assets/vsmatt-original/sportsgf.png",
    {
      danceLeft: "danceLeft",
      danceRight: "danceRight",
      sad: "sad"
    }
  );
  const notes = importNoteSkin(
    "assets/shared/images/noteSkins/NOTE_assets.xml",
    "assets/shared/images/noteSkins/NOTE_assets.png",
    "assets/vsmatt-original/combat-NOTE_assets.png"
  );
  const stageConfig = readJson("mods/stages/boxingnightnew.json");

  writeDataFile("vsmatt-original-data.js", "VSMATT_ORIGINAL_DATA", {
    meta: {
      title: "Wii Funkin original Sporting and Boxing Match",
      shaderStack: [
        "GreyscaleEffect",
        "BlurEffect",
        "BloomEffect",
        "MirrorRepeatWarpEffect",
        "SpeedEffect",
        "BarsEffect",
        "ColorFillEffect"
      ],
      boxingMidcutsceneStep: 1536,
      boxingHudHideBeat: 385,
      boxingHudShowBeat: 450
    },
    songs: {
      sporting: {
        bpm: sporting.bpm,
        spb: sporting.spb,
        speed: sporting.speed,
        totalTime: sporting.totalTime,
        shaderEventCount: sporting.shaderEvents.length
      },
      boxingMatch: {
        bpm: boxingMatch.bpm,
        spb: boxingMatch.spb,
        speed: boxingMatch.speed,
        totalTime: boxingMatch.totalTime,
        shaderEventCount: boxingMatch.shaderEvents.length
      }
    },
    stage: {
      defaultZoom: Number(stageConfig.defaultZoom || 0.7),
      cameraSpeed: Number(stageConfig.camera_speed || 1),
      positions: {
        boyfriend: stageConfig.boyfriend.map(Number),
        girlfriend: stageConfig.girlfriend.map(Number),
        opponent: stageConfig.opponent.map(Number)
      },
      cameraOffsets: {
        boyfriend: (stageConfig.camera_boyfriend || [0, 0]).map(Number),
        girlfriend: (stageConfig.camera_girlfriend || [0, 0]).map(Number),
        opponent: (stageConfig.camera_opponent || [0, 0]).map(Number)
      },
      layers: {
        bg: { x: -500, y: -125, scale: 1.8, scroll: 0.7 },
        crowd1: { x: -500, y: 35, scale: 1.8, scroll: 0.3 },
        crowd2: { x: -500, y: 251.9, scale: 1.8, scroll: 0.5 },
        crowd3: { x: -500, y: 366.2, scale: 1.8, scroll: 0.7 },
        ring: { x: -600, y: 135.6, scale: 0.9, scroll: 1 }
      },
      images: {
        bg: copyAsset(
          "mods/images/boxingnight_/bg.png",
          "assets/vsmatt-original/boxingnight-bg.png"
        ),
        crowd1: copyAsset(
          "mods/images/boxingnight_/crowd1.png",
          "assets/vsmatt-original/boxingnight-crowd1.png"
        ),
        crowd2: copyAsset(
          "mods/images/boxingnight_/crowd2.png",
          "assets/vsmatt-original/boxingnight-crowd2.png"
        ),
        crowd3: copyAsset(
          "mods/images/boxingnight_/crowd3.png",
          "assets/vsmatt-original/boxingnight-crowd3.png"
        ),
        ring: copyAsset(
          "mods/images/boxingnight_/ring.png",
          "assets/vsmatt-original/boxingnight-ring.png"
        )
      }
    },
    sprites: { matt, boyfriend, sportingMatt, sportingBoyfriend, gf },
    notes,
    videos: { boxingMidcutscene: midcutscene }
  });

  console.log(
    `Sporting: ${sporting.notes.length} notes, ${sporting.shaderEvents.length} shader events, ${sporting.totalTime}s`
  );
  console.log(
    `Boxing Match: ${boxingMatch.notes.length} notes, ${boxingMatch.shaderEvents.length} shader events, ${boxingMatch.totalTime}s`
  );
}

main();

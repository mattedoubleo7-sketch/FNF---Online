const fs = require("fs");
const path = require("path");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const MOD_ROOT = path.resolve("C:/Users/matth/Downloads/dustin-windows/mods/dustin");
const ASSET_ROOT = path.join(PROJECT_ROOT, "assets", "overthrone");

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

function copyFromAbsolute(sourcePath, targetRelative) {
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

function parseSparrowFrames(xmlText, imageKey = "main") {
  const frames = [];
  for (const match of xmlText.matchAll(/<SubTexture\b([^>]*?)\/>/g)) {
    const attrs = parseFrameAttributes(match[1]);
    frames.push({
      name: String(attrs.name || ""),
      image: imageKey,
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
  return {
    frames: framesByPrefix(frames, prefix),
    fps: Number(options.fps || 24),
    loop: options.loop !== false,
    offset: [Number(options.offset?.[0] || 0), Number(options.offset?.[1] || 0)]
  };
}

function buildAtlas(imageRelative, xmlRelative, targetBase, animations) {
  const image = copyAsset(imageRelative, path.join("assets", "overthrone", `${targetBase}.png`));
  copyAsset(xmlRelative, path.join("assets", "overthrone", `${targetBase}.xml`));
  const frames = parseSparrowFrames(readText(xmlRelative));
  const outputAnimations = {};
  for (const [name, definition] of Object.entries(animations || {})) {
    const options = typeof definition === "string" ? { prefix: definition } : definition;
    outputAnimations[name] = animationFromPrefix(frames, options.prefix, options);
  }
  return { image, animations: outputAnimations };
}

function buildSprite(imageRelative, xmlRelative, targetBase, animations, extra = {}) {
  const data = buildAtlas(imageRelative, xmlRelative, targetBase, animations);
  return {
    ...data,
    scale: Number(extra.scale || 1),
    flipX: !!extra.flipX,
    baseOffset: extra.baseOffset || [0, 0]
  };
}

function buildMultiAtlasSprite(prefixRelative, targetBase, imageNames, animations, extra = {}) {
  const images = {};
  let frames = [];
  for (const imageName of imageNames) {
    const key = path.basename(imageName, ".png");
    images[key] = copyAsset(
      path.join(prefixRelative, imageName),
      path.join("assets", "overthrone", `${targetBase}-${key}.png`)
    );
    const xmlName = imageName.replace(/\.png$/i, ".xml");
    copyAsset(path.join(prefixRelative, xmlName), path.join("assets", "overthrone", `${targetBase}-${key}.xml`));
    frames = frames.concat(parseSparrowFrames(readText(path.join(prefixRelative, xmlName)), key));
  }
  const outputAnimations = {};
  for (const [name, definition] of Object.entries(animations || {})) {
    const options = typeof definition === "string" ? { prefix: definition } : definition;
    outputAnimations[name] = animationFromPrefix(frames, options.prefix, options);
  }
  return {
    images,
    animations: outputAnimations,
    scale: Number(extra.scale || 1),
    flipX: !!extra.flipX,
    baseOffset: extra.baseOffset || [0, 0]
  };
}

function buildNotes() {
  const image = copyAsset("images/game/notes/dustfell.png", "assets/overthrone/dustfell-notes.png");
  copyAsset("images/game/notes/dustfell.xml", "assets/overthrone/dustfell-notes.xml");
  const frames = parseSparrowFrames(readText("images/game/notes/dustfell.xml"));
  const dirFrames = {
    left: {
      static: framesByPrefix(frames, "arrowLEFT")[0],
      gem: framesByPrefix(frames, "purple")[0],
      press: framesByPrefix(frames, "left press"),
      confirm: framesByPrefix(frames, "left confirm"),
      hold: {
        end: framesByPrefix(frames, "pruple end hold")[0],
        piece: framesByPrefix(frames, "purple hold piece")[0]
      }
    },
    down: {
      static: framesByPrefix(frames, "arrowDOWN")[0],
      gem: framesByPrefix(frames, "blue")[0],
      press: framesByPrefix(frames, "down press"),
      confirm: framesByPrefix(frames, "down confirm"),
      hold: {
        end: framesByPrefix(frames, "blue hold end")[0],
        piece: framesByPrefix(frames, "blue hold piece")[0]
      }
    },
    up: {
      static: framesByPrefix(frames, "arrowUP")[0],
      gem: framesByPrefix(frames, "green")[0],
      press: framesByPrefix(frames, "up press"),
      confirm: framesByPrefix(frames, "up confirm"),
      hold: {
        end: framesByPrefix(frames, "green hold end")[0],
        piece: framesByPrefix(frames, "green hold piece")[0]
      }
    },
    right: {
      static: framesByPrefix(frames, "arrowRIGHT")[0],
      gem: framesByPrefix(frames, "red")[0],
      press: framesByPrefix(frames, "right press"),
      confirm: framesByPrefix(frames, "right confirm"),
      hold: {
        end: framesByPrefix(frames, "red hold end")[0],
        piece: framesByPrefix(frames, "red hold piece")[0]
      }
    }
  };

  const madnessImage = copyAsset("images/game/notes/types/Madness_NOTE_assets.png", "assets/overthrone/madness-note.png");
  copyAsset("images/game/notes/types/Madness_NOTE_assets.xml", "assets/overthrone/madness-note.xml");
  const madnessFrames = parseSparrowFrames(readText("images/game/notes/types/Madness_NOTE_assets.xml"));
  const madness = {
    image: madnessImage,
    anims: {
      left: framesByPrefix(madnessFrames, "purple"),
      down: framesByPrefix(madnessFrames, "blue"),
      up: framesByPrefix(madnessFrames, "green"),
      right: framesByPrefix(madnessFrames, "red")
    }
  };

  return { image, dirs: dirFrames, madness };
}

function convertChart() {
  const raw = readJson("songs/overthrone/charts/hard.json");
  const bpm = 138;
  const spb = 60 / bpm;
  const notes = [];
  const timeline = [];
  let noteIndex = 0;
  const lineMap = [
    { side: "opp", character: "sans", invisible: true },
    { side: "player", character: "player", invisible: false },
    { side: "opp", character: "gf", invisible: true },
    { side: "opp", character: "spirits", invisible: true }
  ];

  for (let lineIndex = 0; lineIndex < raw.strumLines.length; lineIndex++) {
    const line = raw.strumLines[lineIndex];
    const meta = lineMap[lineIndex] || lineMap[0];
    for (const rawNote of line.notes || []) {
      const typeIndex = Number(rawNote.type || 0);
      const time = Number(rawNote.time || 0) / 1000;
      const sustain = Math.max(0, Number(rawNote.sLen || 0)) / 1000;
      const laneBase = Number(rawNote.id || 0);
      const specialType = typeIndex === 2 ? "madness" : typeIndex === 1 ? "noAnim" : null;
      notes.push({
        id: `overthrone-${noteIndex++}`,
        beat: time / spb,
        time,
        lane: laneBase + (meta.side === "player" ? 4 : 0),
        side: meta.side,
        character: specialType === "noAnim" ? null : meta.character,
        sLen: sustain,
        specialType,
        avoid: specialType === "madness",
        invisible: !!meta.invisible
      });
    }
  }
  notes.sort((a, b) => a.time - b.time || a.lane - b.lane);

  const noteEnd = notes.reduce((max, note) => Math.max(max, Number(note.time || 0) + Math.max(0, Number(note.sLen || 0))), 0);
  const bars = Math.ceil((noteEnd / spb) / 16);
  for (let bar = 0; bar < bars; bar++) {
    const startBeat = bar * 16;
    const endBeat = startBeat + 16;
    const startTime = startBeat * spb;
    const endTime = endBeat * spb;
    let opp = 0;
    let player = 0;
    for (const note of notes) {
      if (note.time < startTime || note.time >= endTime || note.invisible || note.avoid) continue;
      if (note.side === "opp") opp++;
      if (note.side === "player") player++;
    }
    const turn = opp && player ? "both" : player ? "player" : opp ? "opp" : "both";
    timeline.push({
      startBeat,
      endBeat,
      startTime,
      endTime,
      turn,
      label: `Overthrone bar ${bar + 1}`,
      style: "dustin",
      int: 0.9
    });
  }

  return {
    notes,
    timeline,
    totalBeats: Math.ceil(noteEnd / spb) + 8,
    totalTime: noteEnd + 3.5,
    spb
  };
}

function convertEvents() {
  const raw = readJson("songs/overthrone/charts/hard.json");
  return (raw.events || [])
    .map((event, index) => ({
      id: `overthrone-event-${index}`,
      time: Number(event.time || 0) / 1000,
      name: event.name || "",
      params: event.params || []
    }))
    .sort((a, b) => a.time - b.time);
}

function writeDataFile(targetName, objectName, payload) {
  const targetPath = path.join(PROJECT_ROOT, targetName);
  fs.writeFileSync(targetPath, `window.${objectName} = ${JSON.stringify(payload)};\n`, "utf8");
}

function main() {
  ensureDir(ASSET_ROOT);
  const data = {
    song: {
      title: "Overthrone",
      subtitle: "Dustin hard chart import",
      diff: "Hard (Original Dustin Chart)",
      bpm: 138,
      speed: 2.6,
      weekName: "Dustin"
    },
    chart: convertChart(),
    events: convertEvents(),
    stage: {
      rest: copyAsset("images/stages/throne_room_fell/rest_of_bg.png", "assets/overthrone/rest_of_bg.png"),
      trees: copyAsset("images/stages/throne_room_fell/behind_part_2.png", "assets/overthrone/behind_part_2.png"),
      back: copyAsset("images/stages/throne_room_fell/behind_part_1.png", "assets/overthrone/behind_part_1.png"),
      ground: copyAsset("images/stages/throne_room_fell/throne_room.png", "assets/overthrone/throne_room.png"),
      candles: copyAsset("images/stages/throne_room_fell/candles.png", "assets/overthrone/candles.png"),
      shade: copyAsset("images/stages/throne_room_fell/shade_overthrone_tutorial.png", "assets/overthrone/shade_overthrone_tutorial.png"),
      asgore: buildAtlas(
        "images/stages/throne_room_fell/ASGOREOT.png",
        "images/stages/throne_room_fell/ASGOREOT.xml",
        "asgoreot",
        {
          idle: { prefix: "ASGOREIDLE", fps: 24, loop: true },
          stomp: { prefix: "ASGORESTOMP", fps: 24, loop: false }
        }
      ),
      rocks: buildAtlas(
        "images/stages/throne_room_fell/rocks_falling.png",
        "images/stages/throne_room_fell/rocks_falling.xml",
        "rocks_falling",
        { fall: { prefix: "rocks_falling", fps: 12, loop: false } }
      ),
      finalRocks: buildAtlas(
        "images/stages/throne_room_fell/overthrone_rocks_ending.png",
        "images/stages/throne_room_fell/overthrone_rocks_ending.xml",
        "overthrone_rocks_ending",
        { ending: { prefix: "rocks_ending", fps: 12, loop: false } }
      )
    },
    hud: {
      madnessBar: buildAtlas(
        "images/stages/throne_room_fell/madnessbar_assetsOVERTHRONE.png",
        "images/stages/throne_room_fell/madnessbar_assetsOVERTHRONE.xml",
        "madnessbar_assetsOVERTHRONE",
        {
          idle: { prefix: "madnessbar_idle", fps: 24, loop: true },
          1: { prefix: "madnessbar_1_fill", fps: 24, loop: true },
          2: { prefix: "madnessbar_2_fill", fps: 24, loop: true },
          3: { prefix: "madnessbar_3_fill", fps: 24, loop: true },
          4: { prefix: "madnessbar_4_fill", fps: 24, loop: true },
          5: { prefix: "madnessbar_5_fill", fps: 24, loop: true },
          6: { prefix: "madnessbar_6_fill", fps: 24, loop: true },
          7: { prefix: "madnessbar_7_fill", fps: 24, loop: true }
        }
      ),
      icon: buildAtlas(
        "images/stages/throne_room_fell/icon_fell.png",
        "images/stages/throne_room_fell/icon_fell.xml",
        "icon_fell",
        {
          idle: { prefix: "icon_idle", fps: 24, loop: true },
          angry: { prefix: "icon_angry", fps: 24, loop: true }
        }
      ),
      warning: buildAtlas(
        "images/stages/throne_room_fell/warning_OVERTHRONE.png",
        "images/stages/throne_room_fell/warning_OVERTHRONE.xml",
        "warning_OVERTHRONE",
        {
          warn: { prefix: "warning_OVERTHRONE", fps: 24, loop: true }
        }
      )
    },
    sprites: {
      sans: buildMultiAtlasSprite(
        "images/characters/dustfell/sans_dustfell",
        "sans_dustfell",
        ["1.png", "2.png", "3.png"],
        {
          idle: { prefix: "idle0", fps: 24, loop: true },
          singLEFT: { prefix: "left0", fps: 24, loop: false, offset: [249, 130] },
          singDOWN: { prefix: "down0", fps: 24, loop: false, offset: [65, -58] },
          singUP: { prefix: "up0", fps: 24, loop: false, offset: [0, 123] },
          singRIGHT: { prefix: "right0", fps: 24, loop: false, offset: [24, -5] },
          hell: { prefix: "bitch", fps: 24, loop: false, offset: [0, 9] },
          laugh: { prefix: "2", fps: 24, loop: false, offset: [0, -1] },
          bitch: { prefix: "3", fps: 24, loop: false, offset: [0, -1] },
          it: { prefix: "4", fps: 24, loop: false, offset: [1, 2] }
        },
        { scale: 0.95, baseOffset: [-625, 250] }
      ),
      boyfriend: buildSprite(
        "images/characters/dustfell/bf_dustfell.png",
        "images/characters/dustfell/bf_dustfell.xml",
        "bf_dustfell",
        {
          idle: { prefix: "idle0", fps: 24, loop: true },
          singLEFT: { prefix: "left0", fps: 24, loop: false, offset: [48, -34] },
          singDOWN: { prefix: "down0", fps: 24, loop: false, offset: [0, -63] },
          singUP: { prefix: "up0", fps: 24, loop: false, offset: [-10, 88] },
          singRIGHT: { prefix: "right0", fps: 24, loop: false, offset: [-17, 3] },
          singLEFTmiss: { prefix: "miss_left", fps: 24, loop: false, offset: [50, -34] },
          singDOWNmiss: { prefix: "miss_down", fps: 24, loop: false, offset: [-1, -77] },
          singUPmiss: { prefix: "miss_up", fps: 24, loop: false, offset: [-10, 77] },
          singRIGHTmiss: { prefix: "miss_right", fps: 24, loop: false, offset: [-17, -2] }
        },
        { scale: 1, flipX: true, baseOffset: [300, 500] }
      ),
      girlfriend: buildSprite(
        "images/characters/dustfell/gf_dustfell.png",
        "images/characters/dustfell/gf_dustfell.xml",
        "gf_dustfell",
        {
          idle: { prefix: "idle", fps: 24, loop: true, offset: [-1, 2] },
          singDOWN: { prefix: "down", fps: 24, loop: false, offset: [22, -14] },
          singRIGHT: { prefix: "right", fps: 24, loop: false, offset: [12, 4] },
          singLEFT: { prefix: "left", fps: 24, loop: false, offset: [31, 3] },
          singUP: { prefix: "up", fps: 24, loop: false, offset: [-5, 25] }
        },
        { scale: 1.2, baseOffset: [400, 1140] }
      ),
      spirits: buildSprite(
        "images/characters/dustfell/SOULSOT.png",
        "images/characters/dustfell/SOULSOT.xml",
        "soulsot",
        {
          idle: { prefix: "IDLESOULS", fps: 24, loop: true },
          singLEFT: { prefix: "LEFTSOULS", fps: 24, loop: false },
          singDOWN: { prefix: "DOWNSOULS", fps: 24, loop: false, offset: [-6, 2] },
          singUP: { prefix: "UPSOULS", fps: 24, loop: false, offset: [-5, 73] },
          singRIGHT: { prefix: "RIGHTSOULS", fps: 24, loop: false, offset: [12, 14] }
        },
        { scale: 1, baseOffset: [-625, 250] }
      )
    },
    notes: buildNotes(),
    audio: {
      inst: copyAsset("songs/overthrone/song/Inst.ogg", "overthrone-inst.ogg"),
      voices: copyAsset("songs/overthrone/song/Voices.ogg", "overthrone-voices.ogg")
    },
    video: {
      cutscene: copyAsset("videos/overthrone-cutscene.mp4", "overthrone-cutscene.mp4")
    }
  };

  writeDataFile("overthrone-data.js", "OVERTHRONE_DATA", data);
  console.log("Imported Overthrone into", PROJECT_ROOT);
}

main();

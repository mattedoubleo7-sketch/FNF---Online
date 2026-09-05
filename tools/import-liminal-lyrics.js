const fs = require("fs");
const path = require("path");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const MOD_ROOT = path.resolve(
  process.argv[2] ||
  "C:/Users/matth/Downloads/tmp-musicalempire-source/MusicalEmpire-V1.0/backrooms"
);
const ASSET_ROOT = path.join(PROJECT_ROOT, "assets", "liminal-lyrics");

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readText(relativePath) {
  return fs.readFileSync(path.join(MOD_ROOT, relativePath), "utf8");
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

function copyFile(sourceRelative, targetRelative) {
  const source = path.join(MOD_ROOT, sourceRelative);
  const target = path.join(PROJECT_ROOT, targetRelative);
  ensureDir(path.dirname(target));
  fs.copyFileSync(source, target);
  return targetRelative.replace(/\\/g, "/");
}

function parseAttributes(text) {
  const attrs = {};
  for (const match of text.matchAll(/([A-Za-z0-9_:-]+)="([^"]*)"/g)) attrs[match[1]] = match[2];
  return attrs;
}

function numberAttr(attrs, key, fallback = 0) {
  const value = Number(attrs[key]);
  return Number.isFinite(value) ? value : fallback;
}

function parseAtlasText(xmlText) {
  const frames = [];
  for (const match of xmlText.matchAll(/<SubTexture\b([^>]*?)\/>/g)) {
    const attrs = parseAttributes(match[1]);
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
      rotated: String(attrs.rotated || "false").toLowerCase() === "true"
    });
  }
  return frames;
}

function frameNumber(name) {
  const match = String(name || "").match(/(\d+)(?!.*\d)/);
  return match ? Number(match[1]) : 0;
}

function framesByPrefix(frames, prefix) {
  return frames
    .filter(frame => frame.name.startsWith(prefix))
    .sort((a, b) => frameNumber(a.name) - frameNumber(b.name));
}

function parseCharacter(configName, outputName) {
  const config = readText(`data/characters/${configName}.xml`);
  const rootMatch = config.match(/<character\b([^>]*)>/);
  const root = parseAttributes(rootMatch ? rootMatch[1] : "");
  const sprite = String(root.sprite || configName);
  const frames = parseAtlasText(readText(`images/characters/${sprite}.xml`));
  const animations = {};
  for (const match of config.matchAll(/<anim\b([^>]*?)\/>/g)) {
    const attrs = parseAttributes(match[1]);
    const name = String(attrs.name || attrs.anim || "idle");
    const prefix = String(attrs.anim || name);
    animations[name] = {
      frames: framesByPrefix(frames, prefix),
      fps: numberAttr(attrs, "fps", 24),
      loop: String(attrs.loop || "false").toLowerCase() === "true",
      offset: [numberAttr(attrs, "x"), numberAttr(attrs, "y")]
    };
  }
  return {
    image: copyFile(`images/characters/${sprite}.png`, `assets/liminal-lyrics/${outputName}.png`),
    animations,
    position: [numberAttr(root, "x"), numberAttr(root, "y")],
    camera: [numberAttr(root, "camx"), numberAttr(root, "camy")],
    scale: numberAttr(root, "scale", 1),
    flipX: String(root.flipX || "false").toLowerCase() === "true",
    // Character.isPlayer, straight off the character file. It picks the
    // -100/+150 side of getCameraPosition and is unrelated to the stage's
    // draw-only flipX.
    isPlayer: String(root.isPlayer || "false").toLowerCase() === "true",
    antialias: String(root.antialiasing || "true").toLowerCase() !== "false"
  };
}

function parseAmbientAtlas(xmlRelative, prefix, imageRelative, outputName, fps) {
  const frames = parseAtlasText(readText(xmlRelative));
  return {
    image: copyFile(imageRelative, `assets/liminal-lyrics/${outputName}.png`),
    frames: framesByPrefix(frames, prefix),
    fps
  };
}

function beatAt(time) {
  const switchTime = 131.162790697674;
  if (time <= switchTime) return time / (60 / 86);
  return switchTime / (60 / 86) + (time - switchTime) / (60 / 92);
}

function convertChart() {
  const raw = readJson("songs/liminal lyrics/charts/hard.json");
  const sourceEvents = readJson("songs/liminal lyrics/events.json").events || [];
  const notes = [];
  let noteIndex = 0;
  const lineMeta = [
    { side: "opp", character: "clarkTable", invisible: true },
    { side: "player", character: "player", invisible: false },
    { side: "opp", character: "pirate", invisible: true }
  ];

  raw.strumLines.forEach((line, lineIndex) => {
    const meta = lineMeta[lineIndex] || lineMeta[0];
    for (const sourceNote of line.notes || []) {
      const time = Number(sourceNote.time || 0) / 1000;
      notes.push({
        id: `liminal-lyrics-${noteIndex++}`,
        beat: beatAt(time),
        time,
        lane: Number(sourceNote.id || 0) + (meta.side === "player" ? 4 : 0),
        side: meta.side,
        character: meta.character,
        sLen: Math.max(0, Number(sourceNote.sLen || 0)) / 1000,
        invisible: meta.invisible,
        sourceLine: lineIndex
      });
    }
  });
  notes.sort((a, b) => a.time - b.time || a.lane - b.lane);

  const events = sourceEvents.map((event, index) => ({
    id: `liminal-event-${index}`,
    time: Number(event.time || 0) / 1000,
    name: String(event.name || ""),
    params: event.params || []
  })).sort((a, b) => a.time - b.time);

  const cameraChanges = events.filter(event => event.name === "Camera Movement");
  const noteEnd = notes.reduce((max, note) => Math.max(max, note.time + note.sLen), 0);
  const endTime = noteEnd + 3.5;
  const timeline = [];
  const starts = [...new Set([0, ...cameraChanges.map(event => event.time), endTime])].sort((a, b) => a - b);
  for (let index = 0; index < starts.length - 1; index += 1) {
    const startTime = starts[index];
    const endTime = starts[index + 1];
    const event = [...cameraChanges].reverse().find(item => item.time <= startTime + 0.001);
    const sourceLine = Number(event?.params?.[0] ?? 1);
    const turn = sourceLine === 1 ? "player" : "opp";
    timeline.push({
      startTime,
      endTime,
      startBeat: beatAt(startTime),
      endBeat: beatAt(endTime),
      turn,
      sourceLine,
      label: sourceLine === 2 ? "Captain" : sourceLine === 1 ? "Clark" : "Table Clark",
      style: "liminal",
      int: 0.84
    });
  }

  return {
    notes,
    events,
    timeline,
    spb: 60 / 86,
    bpmChanges: [{ time: 0, bpm: 86 }, { time: 131.162790697674, bpm: 92 }],
    totalBeats: beatAt(endTime),
    totalTime: endTime,
    sourceScrollSpeed: Number(raw.scrollSpeed || 2.9)
  };
}

ensureDir(ASSET_ROOT);

const data = {
  song: {
    title: "Liminal Lyrics",
    subtitle: "Cap’n Clark’s Musical Empire by Floofum",
    diff: "Hard (Original Chart)",
    bpm: 86,
    scrollSpeed: 2.9
  },
  audio: {
    inst: copyFile("songs/liminal lyrics/song/Inst.ogg", "liminal-lyrics-inst.ogg"),
    voices: copyFile("songs/liminal lyrics/song/Voices.ogg", "liminal-lyrics-voices.ogg")
  },
  video: {
    source: copyFile("videos/backroom.mp4", "liminal-lyrics-backroom.mp4"),
    start: 25.1162790697674,
    end: 67.3255813953488
  },
  chart: convertChart(),
  stage: {
    viewport: [1280, 720],
    defaultZoom: 0.9,
    startCamera: [500, 200],
    layers: {
      basement: { image: copyFile("images/stages/backroom/basement_closeup.png", "assets/liminal-lyrics/basement.png"), x: 197.77779334593, y: -250, scale: 1.3, scroll: 0.7 },
      dinner: { image: copyFile("images/stages/backroom/Background.png", "assets/liminal-lyrics/dinner.png"), x: -237.841423082786, y: -158.560948774914, scale: 1 },
      chairs: { image: copyFile("images/stages/backroom/Chairs.png", "assets/liminal-lyrics/chairs.png"), x: -240, y: -160, scale: 1 },
      table: { image: copyFile("images/stages/backroom/Table_arm.png", "assets/liminal-lyrics/table-arm.png"), x: -240, y: -160, scale: 1 },
      kane: { image: copyFile("images/stages/backroom/kane.png", "assets/liminal-lyrics/kane.png"), x: 197.77779334593, y: 113.333335805936, scale: 1.4 },
      crack: { image: copyFile("images/stages/backroom/crack_closeup.png", "assets/liminal-lyrics/crack.png"), x: -300, y: -200, scale: 1 },
      logoBack: { image: copyFile("images/stages/backroom/logo_back.png", "assets/liminal-lyrics/logo-back.png"), x: -300, y: -200, scale: 1.1 },
      logo: { image: copyFile("images/stages/backroom/logo_transp.png", "assets/liminal-lyrics/logo.png"), x: -330, y: 100, scale: 0.8 },
      flesh: { image: copyFile("images/stages/backroom/flesh.png", "assets/liminal-lyrics/flesh.png"), x: 400, y: 100, scaleX: 4.5, scaleY: 3, alpha: 0.8 },
      watermark: { image: copyFile("images/stages/backroom/watermark.png", "assets/liminal-lyrics/watermark.png"), x: 330, y: 250, scale: 1 }
    },
    ambient: {
      redhead: { ...parseAmbientAtlas("images/stages/backroom/redhead_sheet.xml", "redhead instance", "images/stages/backroom/redhead_sheet.png", "redhead", 24), x: 639.515395274384, y: 228.077345742098, scale: 0.506821770284395 },
      bearded: { ...parseAmbientAtlas("images/stages/backroom/Bearded_sheet.xml", "Bearded instance", "images/stages/backroom/Bearded_sheet.png", "bearded", 24), x: -55, y: 239, scale: 0.52, angle: -2.07 }
    },
    characters: {
      // stage.flipX is Codename's draw-only mirror; the camera side comes from
      // each character file's own isPlayer attribute, parsed above.
      clarkRoom: { ...parseCharacter("clark_room", "clark-room"), stage: { x: 480, y: 150, scale: 1.1, flipX: true } },
      clarkTable: { ...parseCharacter("clark_table", "clark-table"), stage: { x: 880, y: 325.669047558312, scale: 0.6, flipX: true } },
      pirate: { ...parseCharacter("pirate", "pirate"), stage: { x: 903.084002016037, y: 333.040279725318, scale: 0.6, flipX: false } }
    }
  },
  shaders: {
    vhs: copyFile("shaders/vhs.frag", "shaders/musical-empire-vhs.frag"),
    colorAdjust: copyFile("shaders/color_adjust.frag", "shaders/musical-empire-color-adjust.frag"),
    bulge: copyFile("shaders/bulge.frag", "shaders/musical-empire-bulge.frag")
  },
  source: {
    stageXml: readText("data/stages/backroom.xml"),
    stageScript: readText("data/stages/backroom.hx"),
    songScripts: {
      boppin: readText("songs/liminal lyrics/scripts/boppin.hx"),
      camera: readText("songs/liminal lyrics/scripts/cam_move.hx"),
      visibility: readText("songs/liminal lyrics/scripts/hidethings.hx"),
      video: readText("songs/liminal lyrics/scripts/ingamecutscenepoop.hx")
    }
  }
};

const output = `window.LIMINAL_LYRICS_DATA=${JSON.stringify(data)};\n`;
fs.writeFileSync(path.join(PROJECT_ROOT, "liminal-lyrics-data.js"), output);
console.log(`Imported Liminal Lyrics from ${MOD_ROOT}`);
console.log(`Wrote ${path.join(PROJECT_ROOT, "liminal-lyrics-data.js")}`);

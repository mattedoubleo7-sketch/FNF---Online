const fs = require("fs");
const path = require("path");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const MOD_ROOT = path.resolve("C:/Users/matth/Downloads/gumballs_5cca5/gumballs");
const ASSET_ROOT = path.join(PROJECT_ROOT, "assets", "snowed-in");

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

function parseAttributes(text) {
  const attrs = {};
  for (const match of text.matchAll(/([A-Za-z0-9_:-]+)="([^"]*)"/g)) attrs[match[1]] = match[2];
  return attrs;
}

function numberAttr(attrs, key, fallback = 0) {
  const value = Number(attrs[key]);
  return Number.isFinite(value) ? value : fallback;
}

function parseAtlas(xmlRelative) {
  const frames = [];
  for (const match of readText(xmlRelative).matchAll(/<SubTexture\b([^>]*?)\/>/g)) {
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

function parseCharacter(characterName) {
  const configRelative = `data/characters/${characterName}.xml`;
  const imageRelative = `images/characters/${characterName}.png`;
  const atlasRelative = `images/characters/${characterName}.xml`;
  const config = readText(configRelative);
  const rootMatch = config.match(/<character\b([^>]*)>/);
  const rootAttrs = parseAttributes(rootMatch ? rootMatch[1] : "");
  const frames = parseAtlas(atlasRelative);
  const animations = {};
  for (const match of config.matchAll(/<anim\b([^>]*?)\/>/g)) {
    const attrs = parseAttributes(match[1]);
    const name = String(attrs.name || attrs.anim || "idle");
    animations[name] = {
      frames: framesByPrefix(frames, String(attrs.anim || name)),
      fps: numberAttr(attrs, "fps", 24),
      loop: String(attrs.loop || "false").toLowerCase() === "true",
      offset: [numberAttr(attrs, "x"), numberAttr(attrs, "y")]
    };
  }
  return {
    image: copyAsset(imageRelative, `assets/snowed-in/${characterName}.png`),
    animations,
    flipX: String(rootAttrs.flipX || "false").toLowerCase() === "true",
    antialias: String(rootAttrs.antialiasing || "true").toLowerCase() !== "false",
    camera: [numberAttr(rootAttrs, "camx"), numberAttr(rootAttrs, "camy")]
  };
}

function buildHoldCover() {
  const frames = parseAtlas("images/UI/holdcover.xml");
  const colors = ["purple", "blue", "green", "red"];
  const lanes = {};
  colors.forEach((color, lane) => {
    lanes[lane] = {
      start: framesByPrefix(frames, `${color} holdCover Start`),
      holding: framesByPrefix(frames, `${color} holdCover0`),
      end: framesByPrefix(frames, `${color} splat`)
    };
  });
  return {
    image: copyAsset("images/UI/holdcover.png", "assets/snowed-in/holdcover.png"),
    lanes
  };
}

function convertChart() {
  const raw = readJson("songs/snowed in/charts/normal.json");
  const bpm = 130;
  const spb = 60 / bpm;
  const notes = [];
  let noteIndex = 0;
  const lineMeta = [
    { side: "opp", character: "sans", invisible: true },
    { side: "player", character: "player", invisible: false },
    { side: "opp", character: "gf", invisible: true }
  ];

  raw.strumLines.forEach((line, lineIndex) => {
    const meta = lineMeta[lineIndex] || lineMeta[0];
    for (const sourceNote of line.notes || []) {
      const time = Number(sourceNote.time || 0) / 1000;
      notes.push({
        id: `snowed-in-${noteIndex++}`,
        beat: time / spb,
        time,
        lane: Number(sourceNote.id || 0) + (meta.side === "player" ? 4 : 0),
        side: meta.side,
        character: meta.character,
        sLen: Math.max(0, Number(sourceNote.sLen || 0)) / 1000,
        invisible: meta.invisible
      });
    }
  });
  notes.sort((a, b) => a.time - b.time || a.lane - b.lane);

  const events = (raw.events || []).map((event, index) => ({
    id: `snowed-in-event-${index}`,
    time: Number(event.time || 0) / 1000,
    name: String(event.name || ""),
    params: event.params || []
  })).sort((a, b) => a.time - b.time);

  const noteEnd = notes.reduce((max, note) => Math.max(max, note.time + note.sLen), 0);
  const timeline = [];
  const segmentStarts = [...new Set([0, ...events.filter(event => event.name === "Camera Movement").map(event => event.time), noteEnd + 3.5])].sort((a, b) => a - b);
  for (let index = 0; index < segmentStarts.length - 1; index++) {
    const startTime = segmentStarts[index];
    const endTime = segmentStarts[index + 1];
    const cameraEvent = [...events].reverse().find(event => event.name === "Camera Movement" && event.time <= startTime + 0.001);
    const turn = Number(cameraEvent?.params?.[0] || 0) === 1 ? "player" : "opp";
    timeline.push({
      startTime,
      endTime,
      startBeat: startTime / spb,
      endBeat: endTime / spb,
      turn,
      label: turn === "player" ? "Boyfriend" : "Sans",
      style: "snowdin",
      int: 0.82
    });
  }

  return {
    notes,
    events,
    timeline,
    spb,
    totalBeats: Math.ceil((noteEnd + 3.5) / spb),
    totalTime: noteEnd + 3.5,
    sourceScrollSpeed: Number(raw.scrollSpeed || 2.3)
  };
}

function main() {
  ensureDir(ASSET_ROOT);
  const data = {
    song: {
      title: "Snowed In",
      subtitle: "Gumballs original chart import",
      diff: "Normal (Original Chart)",
      bpm: 130,
      speed: 2.3,
      stage: "snowdin",
      color: "#941653"
    },
    audio: {
      inst: copyAsset("songs/snowed in/song/Inst.ogg", "snowed-in-inst.ogg"),
      voices: copyAsset("songs/snowed in/song/Voices.ogg", "snowed-in-voices.ogg")
    },
    chart: convertChart(),
    stage: {
      viewport: [960, 720],
      camera: [600, 400],
      zoom: 1,
      layers: [
        { key: "sky", image: copyAsset("images/stages/snowdin/sky.png", "assets/snowed-in/sky.png"), x: -112, y: -146.05, scroll: 0.1 },
        { key: "forest", image: copyAsset("images/stages/snowdin/forest.png", "assets/snowed-in/forest.png"), x: -165, y: 3, scroll: 0.5 },
        { key: "trees", image: copyAsset("images/stages/snowdin/trees.png", "assets/snowed-in/trees.png"), x: -82, y: -121, scroll: 0.8 },
        { key: "snow", image: copyAsset("images/stages/snowdin/snow.png", "assets/snowed-in/snow.png"), x: -116, y: 455.1, scroll: 1 }
      ],
      positions: {
        sans: [197, 273],
        boyfriend: [749, 338],
        girlfriend: [490, 274]
      },
      blackout: { startBeat: 28, endBeat: 32 },
      comicSans: [0, 1, 2, 3].map(index => copyAsset(`images/stages/snowdin/comicsans/${index}.png`, `assets/snowed-in/comicsans-${index}.png`))
    },
    sprites: {
      sans: parseCharacter("sans"),
      boyfriend: parseCharacter("bf")
    },
    notes: {
      tap: copyAsset("images/UI/fuck.png", "assets/snowed-in/notes.png"),
      hold: copyAsset("images/UI/shit.png", "assets/snowed-in/holds.png"),
      holdCover: buildHoldCover()
    },
    hud: {
      background: copyAsset("images/UI/customBarBG.png", "assets/snowed-in/custom-bar-bg.png"),
      opponent: copyAsset("images/UI/healthbars/sans.png", "assets/snowed-in/health-sans.png"),
      player: copyAsset("images/UI/healthbars/bf.png", "assets/snowed-in/health-bf.png"),
      pointer: copyAsset("images/UI/healthPointer.png", "assets/snowed-in/health-pointer.png")
    },
    dialogue: [
      { character: "bf", text: "whew! how lucky we are to have runned away from your big bad brother", speed: 0.049 },
      { character: "gf", text: "mhm", speed: 0.05 },
      { character: "bf", text: "say.. where are we? it feels as if we have fallen into a deep cavern inside of an mountain..", speed: 0.04 },
      { character: "sans", text: "*how was it. how was the fall", speed: 0.055 },
      { character: "gf", text: "Hooooooooooooooooooooly fucking Shit", speed: 0.02 }
    ]
  };

  fs.writeFileSync(path.join(PROJECT_ROOT, "snowed-in-data.js"), `window.SNOWED_IN_DATA=${JSON.stringify(data)};\n`, "utf8");
  console.log(`Snowed In imported: ${data.chart.notes.length} notes, ${data.chart.notes.filter(note => note.sLen > 0).length} holds, ${data.chart.events.length} events.`);
}

main();

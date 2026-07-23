const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const modRoot = path.resolve("C:/Users/matth/Downloads/Outskritz/Outskritz");
const mods = path.join(modRoot, "mods");
const outAssets = path.join(root, "assets", "outskirtz");
const outShaders = path.join(root, "shaders", "outskirtz");

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copyFile(src, dest) {
  if (!fs.existsSync(src)) return false;
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
  return true;
}

function rel(file) {
  return file.replace(root + path.sep, "").replace(/\\/g, "/");
}

function attrs(tag) {
  const result = {};
  tag.replace(/([A-Za-z_][\w:-]*)="([^"]*)"/g, (_, key, value) => {
    result[key] = value;
    return "";
  });
  return result;
}

function parseAtlas(file) {
  if (!fs.existsSync(file)) return [];
  const text = fs.readFileSync(file, "utf8");
  return Array.from(text.matchAll(/<SubTexture\b[^>]*\/?>/g), match => {
    const a = attrs(match[0]);
    const frame = {
      name: a.name || "",
      x: Number(a.x) || 0,
      y: Number(a.y) || 0,
      w: Number(a.width) || 0,
      h: Number(a.height) || 0,
      fx: Number(a.frameX) || 0,
      fy: Number(a.frameY) || 0,
      fw: Number(a.frameWidth) || Number(a.width) || 0,
      fh: Number(a.frameHeight) || Number(a.height) || 0
    };
    if (a.rotated === "true") frame.rotated = true;
    return frame;
  });
}

function frameIndex(name) {
  const match = String(name).match(/(\d+)(?!.*\d)/);
  return match ? Number(match[1]) : 0;
}

function framesByPrefix(frames, prefix) {
  const clean = String(prefix || "").toLowerCase();
  return frames
    .filter(frame => String(frame.name || "").toLowerCase().startsWith(clean))
    .sort((a, b) => frameIndex(a.name) - frameIndex(b.name) || a.name.localeCompare(b.name))
    .map(({ name, ...frame }) => frame);
}

function parseCharacter(jsonName, xmlName, imageOut) {
  const config = readJson(path.join(mods, "characters", jsonName));
  const atlas = parseAtlas(path.join(mods, "images", "characters", xmlName));
  const animations = {};
  for (const anim of config.animations || []) {
    const frames = framesByPrefix(atlas, anim.name);
    animations[anim.anim] = {
      frames,
      fps: Number(anim.fps) || 24,
      loop: !!anim.loop,
      offsets: (anim.offsets || [0, 0]).map(Number)
    };
  }
  return {
    image: imageOut,
    position: (config.position || [0, 0]).map(Number),
    cameraPosition: (config.camera_position || [0, 0]).map(Number),
    scale: Number(config.scale) || 1,
    flipX: !!config.flip_x,
    singDuration: Number(config.sing_duration) || 4,
    animations
  };
}

const chartFile = path.join(mods, "data", "outskirtz", "outskirtz-hard.json");
const chartJson = readJson(chartFile).song;
const bpm = Number(chartJson.bpm) || 200;
const spb = 60 / bpm;
const stepSec = spb / 4;

const notes = [];
const timeline = [];
let sectionStartBeat = 0;
for (let i = 0; i < chartJson.notes.length; i++) {
  const section = chartJson.notes[i];
  const steps = Number(section.lengthInSteps) || 16;
  const sectionBeats = steps / 4;
  const baseSide = section.mustHitSection ? "player" : "opp";
  const swappedSide = baseSide === "player" ? "opp" : "player";
  const turn = section.gfSection ? "both" : baseSide;
  const startTime = sectionStartBeat * spb;
  const endTime = (sectionStartBeat + sectionBeats) * spb;
  timeline.push({
    index: i,
    startBeat: sectionStartBeat,
    endBeat: sectionStartBeat + sectionBeats,
    startTime,
    endTime,
    mustHitSection: !!section.mustHitSection,
    gfSection: !!section.gfSection,
    altAnim: !!section.altAnim,
    turn,
    label: turn === "player" ? "BF Wii" : turn === "opp" ? "Alex" : "Duet"
  });
  for (const rawNote of section.sectionNotes || []) {
    const noteData = Number(rawNote[1]) || 0;
    const laneBase = ((noteData % 4) + 4) % 4;
    const group = Math.floor(noteData / 4);
    const side = group % 2 === 0 ? baseSide : swappedSide;
    const lane = laneBase + (side === "player" ? 4 : 0);
    const time = Number(rawNote[0]) / 1000;
    const sustain = Math.max(0, Number(rawNote[2]) / 1000 || 0);
    notes.push({
      time,
      beat: time / spb,
      lane,
      side,
      character: side === "player" ? "outskirtzBf" : "alex",
      sLen: sustain,
      noteType: rawNote[3] || "",
      alt: !!section.altAnim
    });
  }
  sectionStartBeat += sectionBeats;
}
notes.sort((a, b) => a.time - b.time || a.lane - b.lane);

const events = [];
for (const eventBlock of chartJson.events || []) {
  const time = Number(eventBlock[0]) / 1000;
  for (const event of eventBlock[1] || []) {
    events.push({ time, name: event[0] || "", value1: event[1] || "", value2: event[2] || "" });
  }
}
events.sort((a, b) => a.time - b.time);

const chart = {
  notes,
  timeline,
  totalBeats: sectionStartBeat,
  totalTime: Math.max(80, ...notes.map(note => note.time + (note.sLen || 0) + 2)),
  spb,
  bpm,
  speed: Number(chartJson.speed) || 3.2
};

ensureDir(outAssets);
ensureDir(outShaders);

const copied = {
  inst: copyFile(path.join(mods, "songs", "Outskirtz", "inst.ogg"), path.join(root, "outskirtz-inst.ogg")),
  grounds: copyFile(path.join(mods, "images", "grounds_Night.png"), path.join(outAssets, "grounds_Night.png")),
  overlay: copyFile(path.join(mods, "images", "overlay_Night.png"), path.join(outAssets, "overlay_Night.png")),
  notesPng: copyFile(path.join(mods, "images", "NOTE_assets.png"), path.join(outAssets, "NOTE_assets.png")),
  notesXml: copyFile(path.join(mods, "images", "NOTE_assets.xml"), path.join(outAssets, "NOTE_assets.xml")),
  splashesPng: copyFile(path.join(mods, "images", "noteSplashes.png"), path.join(outAssets, "noteSplashes.png")),
  splashesXml: copyFile(path.join(mods, "images", "noteSplashes.xml"), path.join(outAssets, "noteSplashes.xml")),
  healthBar: copyFile(path.join(mods, "images", "newHealthBar.png"), path.join(outAssets, "newHealthBar.png")),
  timeBar: copyFile(path.join(mods, "images", "timeBarBG.png"), path.join(outAssets, "timeBarBG.png")),
  name: copyFile(path.join(mods, "images", "name.png"), path.join(outAssets, "name.png")),
  letgo: copyFile(path.join(mods, "images", "letgo.png"), path.join(outAssets, "letgo.png")),
  filterPng: copyFile(path.join(mods, "images", "filter.png"), path.join(outAssets, "filter.png")),
  filterXml: copyFile(path.join(mods, "images", "filter.xml"), path.join(outAssets, "filter.xml")),
  boiPng: copyFile(path.join(mods, "images", "Boi.png"), path.join(outAssets, "Boi.png")),
  boiXml: copyFile(path.join(mods, "images", "Boi.xml"), path.join(outAssets, "Boi.xml")),
  alexPng: copyFile(path.join(mods, "images", "characters", "Alex.png"), path.join(outAssets, "Alex.png")),
  alexXml: copyFile(path.join(mods, "images", "characters", "Alex.xml"), path.join(outAssets, "Alex.xml")),
  bfPng: copyFile(path.join(mods, "images", "characters", "dlowingbfmii.png"), path.join(outAssets, "dlowingbfmii.png")),
  bfXml: copyFile(path.join(mods, "images", "characters", "dlowingbfmii.xml"), path.join(outAssets, "dlowingbfmii.xml")),
  emptyPng: copyFile(path.join(mods, "images", "characters", "empty.png"), path.join(outAssets, "empty.png")),
  emptyXml: copyFile(path.join(mods, "images", "characters", "empty.xml"), path.join(outAssets, "empty.xml")),
  iconAlex: copyFile(path.join(mods, "images", "icons", "icon-alex.png"), path.join(outAssets, "icon-alex.png"))
};

for (const file of fs.readdirSync(path.join(mods, "shaders"))) {
  if (file.toLowerCase().endsWith(".frag")) {
    copyFile(path.join(mods, "shaders", file), path.join(outShaders, file));
  }
}

const noteAtlas = parseAtlas(path.join(mods, "images", "NOTE_assets.xml"));
const notePrefixes = {
  left: { static: "arrowLEFT", press: "A press", confirm: "A confirm", gem: "A", holdPiece: "A hold", holdEnd: "A tail" },
  down: { static: "arrowDOWN", press: "B press", confirm: "B confirm", gem: "B", holdPiece: "B hold", holdEnd: "B tail" },
  up: { static: "arrowUP", press: "C press", confirm: "C confirm", gem: "C", holdPiece: "C hold", holdEnd: "C tail" },
  right: { static: "arrowRIGHT", press: "D press", confirm: "D confirm", gem: "D", holdPiece: "D hold", holdEnd: "D tail" }
};
const noteSkin = {};
for (const [dir, prefix] of Object.entries(notePrefixes)) {
  noteSkin[dir] = {
    static: framesByPrefix(noteAtlas, prefix.static)[0] || null,
    press: framesByPrefix(noteAtlas, prefix.press),
    confirm: framesByPrefix(noteAtlas, prefix.confirm),
    gem: framesByPrefix(noteAtlas, prefix.gem)[0] || null,
    holdPiece: framesByPrefix(noteAtlas, prefix.holdPiece)[0] || null,
    holdEnd: framesByPrefix(noteAtlas, prefix.holdEnd)[0] || null
  };
}

const data = {
  meta: {
    title: chartJson.song || "Outskirtz",
    subtitle: "Outskritz Psych Engine hard chart",
    bpm,
    speed: chart.speed,
    source: rel(chartFile),
    needsVoices: !!chartJson.needsVoices,
    copied
  },
  audio: {
    inst: "outskirtz-inst.ogg"
  },
  chart,
  events,
  stage: {
    defaultZoom: 0.8,
    cameraSpeed: 3,
    boyfriend: [-300, 180],
    girlfriend: [-550, 50],
    opponent: [-1000, 50],
    sprites: {
      ground: { image: "assets/outskirtz/grounds_Night.png", x: -1800, y: -200, scale: 1.4, scrollX: 1, scrollY: 1 },
      overlay: { image: "assets/outskirtz/overlay_Night.png", x: -1700, y: -300, scale: 1.3, scrollX: 1, scrollY: 1 },
      fire: { image: null, x: -900, y: 150, scale: 1.7, alpha: 0 }
    }
  },
  sprites: {
    alex: parseCharacter("alex.json", "Alex.xml", "assets/outskirtz/Alex.png"),
    boyfriend: parseCharacter("BF-Wii.json", "dlowingbfmii.xml", "assets/outskirtz/dlowingbfmii.png")
  },
  notes: {
    image: "assets/outskirtz/NOTE_assets.png",
    skin: noteSkin
  },
  shaders: fs.readdirSync(outShaders).filter(file => file.toLowerCase().endsWith(".frag")).sort().map(file => `shaders/outskirtz/${file}`)
};

const output = `window.OUTSKIRTZ_DATA = ${JSON.stringify(data)};\n`;
fs.writeFileSync(path.join(root, "outskirtz-data.js"), output);
console.log(`Imported Outskirtz: ${notes.length} notes, ${events.length} events, ${data.shaders.length} shaders`);

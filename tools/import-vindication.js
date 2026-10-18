const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const sourceRoot = path.resolve(
  process.argv[2] || "C:/Users/matth/Downloads/dustin-1.2.1/DUSTIN 1.2.1/mods/dustin"
);

function ensureDir(dir) { fs.mkdirSync(dir, { recursive: true }); }
function sourcePath(relative) { return path.join(sourceRoot, relative); }
function read(relative) { return fs.readFileSync(sourcePath(relative), "utf8"); }
function readJson(relative) { return JSON.parse(read(relative)); }
function copy(relative, output) {
  const target = path.join(root, output);
  ensureDir(path.dirname(target));
  fs.copyFileSync(sourcePath(relative), target);
  return output.replace(/\\/g, "/");
}
function copyDirectory(relative, output) {
  const input = sourcePath(relative);
  const target = path.join(root, output);
  ensureDir(target);
  for (const entry of fs.readdirSync(input, { withFileTypes: true })) {
    if (entry.isFile()) fs.copyFileSync(path.join(input, entry.name), path.join(target, entry.name));
  }
}
function attrs(tag) {
  const result = {};
  for (const match of String(tag || "").matchAll(/([\w:-]+)="([^"]*)"/g)) result[match[1]] = match[2];
  return result;
}
function parseAtlas(relative) {
  return [...read(relative).matchAll(/<SubTexture\s+([^>]+?)\s*\/?\s*>/g)].map(match => {
    const a = attrs(match[1]);
    return {
      name: a.name || "",
      x: Number(a.x || 0), y: Number(a.y || 0),
      w: Number(a.width || 0), h: Number(a.height || 0),
      fx: Number(a.frameX || 0), fy: Number(a.frameY || 0),
      fw: Number(a.frameWidth || a.width || 0), fh: Number(a.frameHeight || a.height || 0),
      rotated: a.rotated === "true"
    };
  });
}
function frameNumber(frame) {
  const match = String(frame?.name || "").match(/(\d+)(?!.*\d)/);
  return match ? Number(match[1]) : 0;
}
function framesFor(atlas, prefix) {
  return atlas.filter(frame => frame.name.startsWith(prefix))
    .sort((a, b) => frameNumber(a) - frameNumber(b) || a.name.localeCompare(b.name, undefined, { numeric: true }));
}
function parseCharacter(configRelative, atlasRelative, image) {
  const xml = read(configRelative);
  const rootMatch = xml.match(/<character\s+([^>]+)>/);
  const rootAttrs = attrs(rootMatch?.[1]);
  const atlas = parseAtlas(atlasRelative);
  const animations = {};
  for (const match of xml.matchAll(/<anim\s+([^>]+?)\s*\/?\s*>/g)) {
    const a = attrs(match[1]);
    animations[a.name] = {
      frames: framesFor(atlas, a.anim || a.name || "idle"),
      fps: Number(a.fps || 24),
      loop: a.loop === "true",
      offset: [Number(a.x || 0), Number(a.y || 0)]
    };
  }
  return {
    image,
    x: Number(rootAttrs.x || 0), y: Number(rootAttrs.y || 0),
    camX: Number(rootAttrs.camx || 0), camY: Number(rootAttrs.camy || 0),
    scale: Number(rootAttrs.scale || 1), flipX: rootAttrs.flipX === "true",
    animations
  };
}
function clone(value) { return JSON.parse(JSON.stringify(value)); }

const raw = readJson("songs/vindication/charts/hard.json");
const bpm = 180;
const spb = 60 / bpm;
const lineDefs = [
  { side: "opp", character: "sans", sourceLine: 0 },
  { side: "player", character: "player", sourceLine: 1 },
  // The source chart's third line is explicitly hidden and belongs to Thero.
  // Preserve it in the import for provenance, but do not turn it into extra
  // playable Sans arrows in the two-lane browser renderer.
  { side: "opp", character: "thero", sourceLine: 2, thirdPlayer: true }
];
const notes = [];
for (const [lineIndex, line] of (raw.strumLines || []).entries()) {
  const def = lineDefs[lineIndex] || lineDefs[0];
  for (const note of line.notes || []) {
    const time = Number(note.time || 0) / 1000;
    notes.push({
      id: notes.length,
      time,
      beat: time / spb,
      lane: ((Number(note.id || 0) % 4) + 4) % 4 + (def.side === "player" ? 4 : 0),
      side: def.side,
      character: def.character,
      sourceLine: def.sourceLine,
      thirdPlayer: !!def.thirdPlayer,
      hidden: line.visible === false,
      noteType: Number(note.type || 0),
      sLen: Math.max(0, Number(note.sLen || 0) / 1000)
    });
  }
}
notes.sort((a, b) => a.time - b.time || a.lane - b.lane || a.sourceLine - b.sourceLine);
notes.forEach((note, index) => { note.id = index; });
const events = (raw.events || []).map(event => ({
  time: Number(event.time || 0) / 1000,
  name: event.name || "",
  params: Array.isArray(event.params) ? clone(event.params) : []
})).sort((a, b) => a.time - b.time);
const totalTime = Math.max(
  0,
  ...notes.map(note => note.time + note.sLen),
  ...events.map(event => event.time)
) + 2.5;
const totalBeats = totalTime / spb;
const timeline = [];
for (let startBeat = 0; startBeat < totalBeats; startBeat += 4) {
  const startTime = startBeat * spb;
  const endTime = Math.min(totalTime, (startBeat + 4) * spb);
  const hasPlayer = notes.some(note => note.side === "player" && note.time >= startTime && note.time < endTime);
  const hasOpponent = notes.some(note => note.side === "opp" && note.time >= startTime && note.time < endTime);
  timeline.push({
    startBeat, endBeat: Math.min(totalBeats, startBeat + 4), startTime, endTime,
    turn: hasPlayer && hasOpponent ? "both" : hasPlayer ? "player" : "opp",
    label: hasPlayer && hasOpponent ? "Duet" : hasPlayer ? "Boyfriend" : "Sans"
  });
}
const chart = {
  bpm, spb, speed: Number(raw.scrollSpeed || 3.4), notes, events, timeline,
  totalBeats, totalTime,
  bpmChanges: events.filter(event => event.name === "BPM Change")
    .map(event => ({ time: event.time, bpm: Number(event.params?.[0] || bpm) }))
};

const assetRoot = "assets/vindication";
copyDirectory("images/stages/vin", `${assetRoot}/stage`);
copyDirectory("images/characters/vin", `${assetRoot}/characters`);
copyDirectory("images/game/notes", `${assetRoot}/notes`);
copy("songs/vindication/song/Inst.ogg", "vindication-inst.ogg");
copy("songs/vindication/song/Voices.ogg", "vindication-voices.ogg");
copy("images/menus/freeplay/portraits/vindication.png", `${assetRoot}/ui/vindication.png`);
copy("images/gallery/songs/Vindication.jpg", `${assetRoot}/ui/Vindication.jpg`);

const noteAtlas = parseAtlas("images/game/notes/vin_notes.xml");
const notePrefixes = {
  left: { static: "arrowLEFT", press: "left press", confirm: "left confirm", gem: "purple", piece: "purple hold piece", end: "pruple end hold" },
  down: { static: "arrowDOWN", press: "down press", confirm: "down confirm", gem: "blue", piece: "blue hold piece", end: "blue hold end" },
  up: { static: "arrowUP", press: "up press", confirm: "up confirm", gem: "green", piece: "green hold piece", end: "green hold end" },
  right: { static: "arrowRIGHT", press: "right press", confirm: "right confirm", gem: "red", piece: "red hold piece", end: "red hold end" }
};
const noteSkin = {};
for (const [direction, prefixes] of Object.entries(notePrefixes)) {
  noteSkin[direction] = {
    static: framesFor(noteAtlas, prefixes.static)[0] || null,
    press: framesFor(noteAtlas, prefixes.press),
    confirm: framesFor(noteAtlas, prefixes.confirm),
    gem: framesFor(noteAtlas, prefixes.gem)[0] || null,
    piece: framesFor(noteAtlas, prefixes.piece)[0] || null,
    end: framesFor(noteAtlas, prefixes.end)[0] || null
  };
}
const noteTypeSkins = {};
for (const [typeId, relative] of [[1, "images/game/notes/types/NOTE_karma.xml"], [2, "images/game/notes/types/NOTE_hate.xml"]]) {
  const atlas = parseAtlas(relative);
  noteTypeSkins[typeId] = {
    image: `${assetRoot}/notes/types/NOTE_${typeId === 1 ? "karma" : "hate"}.png`,
    left: framesFor(atlas, "purple")[0] || null,
    down: framesFor(atlas, "blue")[0] || null,
    up: framesFor(atlas, "green")[0] || null,
    right: framesFor(atlas, "red")[0] || null
  };
}
copy("images/game/notes/types/NOTE_karma.png", `${assetRoot}/notes/types/NOTE_karma.png`);
copy("images/game/notes/types/NOTE_hate.png", `${assetRoot}/notes/types/NOTE_hate.png`);

const stage = {
  // Codename Engine uses a 1280x720 world. The source art is intentionally
  // larger than the camera view and must stay at its source scale.
  viewport: [1280, 720],
  zoom: 1.1,
  layers: {
    background: { image: `${assetRoot}/stage/background.png`, x: 0, y: 0, scrollX: 1, scrollY: 1 },
    legacy: { image: `${assetRoot}/stage/bg.png`, x: 400, y: 420, scrollX: 1, scrollY: 1 },
    illumination: { image: `${assetRoot}/stage/ilumination.png`, x: 200, y: 420, scrollX: 1, scrollY: 1 },
    foreground: { image: `${assetRoot}/stage/foreground.png`, x: 0, y: 0, scrollX: 1, scrollY: 1 },
    sansesBack: { image: `${assetRoot}/stage/sanses_bg.png`, x: 1000, y: 850, scrollX: 1, scrollY: 1, atlas: "sansesBack" },
    sansesFront: { image: `${assetRoot}/stage/sanses_front.png`, x: 2500, y: 1200, scrollX: 1, scrollY: 1, atlas: "sansesFront" },
    vignette: { image: `${assetRoot}/stage/hate_vignette.png`, x: -330, y: -200, scale: 0.68, screen: true },
    bars: { image: `${assetRoot}/stage/cinematic_bars_vin.png`, x: -330, y: -200, scale: 0.68, screen: true },
    thero: { image: `${assetRoot}/stage/thero_appear.png`, x: 1450, y: 700, scale: 1, atlas: "thero_appear" },
    blaster: { image: `${assetRoot}/stage/gasterBlaster.png`, x: -500, y: 30, scale: 0.9, atlas: "gasterBlaster" }
  },
  characters: { sans: [570, 1200], player: [2000, 1235] },
  // Stage positions plus the camx/camy offsets from sans_vin.xml and bf_vin.xml.
  camera: {
    sans: [890, 1030], player: [1600, 1045], center: [1245, 1038],
    oldSans: [1180, 1080], oldPlayer: [1650, 1135], oldCenter: [1415, 1107.5]
  }
};
const atlasFiles = {
  sansesBack: "images/stages/vin/sanses_bg.xml",
  sansesFront: "images/stages/vin/sanses_front.xml",
  thero_appear: "images/stages/vin/thero_appear.xml",
  gasterBlaster: "images/stages/vin/gasterBlaster.xml"
};
const atlases = {};
for (const [key, relative] of Object.entries(atlasFiles)) atlases[key] = parseAtlas(relative);

const sprites = {
  characters: {
    sans: parseCharacter("data/characters/sans_vin.xml", "images/characters/vin/vin_sans.xml", `${assetRoot}/characters/vin_sans.png`),
    player: parseCharacter("data/characters/bf_vin.xml", "images/characters/vin/vin_bf.xml", `${assetRoot}/characters/vin_bf.png`),
    sansOld: parseCharacter("data/characters/sans_vin_old.xml", "images/characters/vin/sans_mad.xml", `${assetRoot}/characters/sans_mad.png`),
    playerOld: parseCharacter("data/characters/bf_vin_old.xml", "images/characters/vin/BOYFRIEND-CHARA.xml", `${assetRoot}/characters/BOYFRIEND-CHARA.png`)
  },
  atlases
};
const meta = readJson("songs/vindication/meta.json");
const output = {
  meta: {
    title: meta.displayName || "Vindication",
    subtitle: "Friday Night Dustin hard chart",
    bpm,
    source: "Dustin 1.2.1",
    color: meta.color || "#9271FD",
    credits: meta.customValues?.credits || null,
    stats: meta.customValues?.stats || null
  },
  audio: { inst: "vindication-inst.ogg", voices: "vindication-voices.ogg" },
  chart, stage, sprites,
  notes: { image: `${assetRoot}/notes/vin_notes.png`, skin: noteSkin, typeSkins: noteTypeSkins },
  source: {
    intro: "we meet again.",
    steps: { legacyStart: 784, legacyEnd: 1040, fadeOut: 1296, fadeIn: 1424, glitchStart: 1680, glitchEnd: 1936, sansesStart: 2192, finalGlitchEnd: 2704 },
    blasts: [16, 272, 528, 848, 976, 1040, 1936, 2224, 2448, 2624, 2656, 2676, 2696],
    turnCamera: [272, 304, 336, 368, 400, 432, 464, 496, 576, 592, 704, 720, 2064, 2192, 2448, 2480, 2512, 2544, 2560, 2569, 2608, 2640, 2696]
  }
};
fs.writeFileSync(path.join(root, "vindication-data.js"), `window.VINDICATION_DATA=${JSON.stringify(output)};\n`, "utf8");
console.log(`Imported Vindication: ${notes.length} notes, ${events.length} events, ${Math.round(totalTime)} seconds.`);

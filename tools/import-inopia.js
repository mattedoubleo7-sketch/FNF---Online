const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
// Use the installed Dustin 1.2.1 source. The older dustin-windows copy has a
// different Inopia chart/event stream and different BF flip offsets.
const sourceRoot = path.resolve("C:/Users/matth/Downloads/dustin-1.2.1/DUSTIN 1.2.1/mods/dustin");

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copy(sourceRelative, targetRelative) {
  const source = path.join(sourceRoot, sourceRelative);
  const target = path.join(root, targetRelative);
  ensureDir(path.dirname(target));
  fs.copyFileSync(source, target);
  return targetRelative.replace(/\\/g, "/");
}

function read(relative) {
  return fs.readFileSync(path.join(sourceRoot, relative), "utf8");
}

function readJson(relative) {
  return JSON.parse(read(relative));
}

function attrs(tag) {
  const result = {};
  for (const match of tag.matchAll(/([\w:-]+)="([^"]*)"/g)) result[match[1]] = match[2];
  return result;
}

function parseAtlas(relative) {
  return [...read(relative).matchAll(/<SubTexture\s+([^>]+?)\s*\/?\s*>/g)].map(match => {
    const a = attrs(match[1]);
    return {
      name: a.name || "",
      x: Number(a.x || 0),
      y: Number(a.y || 0),
      w: Number(a.width || 0),
      h: Number(a.height || 0),
      fx: Number(a.frameX || 0),
      fy: Number(a.frameY || 0),
      fw: Number(a.frameWidth || a.width || 0),
      fh: Number(a.frameHeight || a.height || 0),
      rotated: a.rotated === "true"
    };
  });
}

function frameNumber(frame) {
  const match = String(frame.name || "").match(/(\d+)(?!.*\d)/);
  return match ? Number(match[1]) : 0;
}

function framesFor(atlas, prefix) {
  return atlas
    .filter(frame => frame.name.startsWith(prefix))
    .sort((a, b) => frameNumber(a) - frameNumber(b) || a.name.localeCompare(b.name, undefined, { numeric: true }));
}

function parseCharacter(configRelative, atlasRelative, image, defaults = {}) {
  const xml = read(configRelative);
  const character = attrs(xml.match(/<character\s+([^>]+)>/)?.[1] || "");
  const atlas = parseAtlas(atlasRelative);
  const animations = {};
  for (const match of xml.matchAll(/<anim\s+([^>]+?)\s*\/?\s*>/g)) {
    const a = attrs(match[1]);
    animations[a.name] = {
      frames: framesFor(atlas, a.anim || ""),
      fps: Number(a.fps || 24),
      loop: a.loop === "true",
      offset: [Number(a.x || 0), Number(a.y || 0)]
    };
  }
  return {
    image,
    x: Number(character.x ?? defaults.x ?? 0),
    y: Number(character.y ?? defaults.y ?? 0),
    camX: Number(character.camx ?? 0),
    camY: Number(character.camy ?? 0),
    scale: Number(character.scale ?? defaults.scale ?? 1),
    flipX: character.flipX === "true",
    animations
  };
}

function convertChart(raw) {
  const bpm = 132;
  const spb = 60 / bpm;
  const notes = [];
  const lineDefs = [
    { side: "opp", character: "sans", sourceLine: 0 },
    { side: "player", character: "player", sourceLine: 1 },
    { side: "opp", character: "papyrus", sourceLine: 2, thirdPlayer: true }
  ];
  for (const [lineIndex, line] of raw.strumLines.entries()) {
    const def = lineDefs[lineIndex] || lineDefs[0];
    for (const note of line.notes || []) {
      const time = Number(note.time || 0) / 1000;
      const sLen = Math.max(0, Number(note.sLen || 0) / 1000);
      const laneBase = ((Number(note.id || 0) % 4) + 4) % 4;
      notes.push({
        id: notes.length,
        time,
        beat: time / spb,
        lane: laneBase + (def.side === "player" ? 4 : 0),
        side: def.side,
        character: def.character,
        sourceLine: def.sourceLine,
        thirdPlayer: !!def.thirdPlayer,
        noteType: Number(note.type || 0),
        sLen
      });
    }
  }
  notes.sort((a, b) => a.time - b.time || a.lane - b.lane || a.sourceLine - b.sourceLine);
  notes.forEach((note, index) => { note.id = index; });
  const totalTime = Math.max(
    ...notes.map(note => note.time + note.sLen),
    ...raw.events.map(event => Number(event.time || 0) / 1000),
    0
  ) + 2.5;
  const totalBeats = totalTime / spb;
  const timeline = [];
  for (let startBeat = 0; startBeat < totalBeats; startBeat += 4) {
    const startTime = startBeat * spb;
    const endTime = Math.min(totalTime, (startBeat + 4) * spb);
    const hasPlayer = notes.some(note => note.time >= startTime && note.time < endTime && note.side === "player");
    const hasOpp = notes.some(note => note.time >= startTime && note.time < endTime && note.side === "opp");
    timeline.push({
      startBeat,
      endBeat: Math.min(totalBeats, startBeat + 4),
      startTime,
      endTime,
      turn: hasPlayer && hasOpp ? "both" : hasPlayer ? "player" : "opp",
      label: hasPlayer && hasOpp ? "Duet" : hasPlayer ? "Boyfriend" : "Inopia"
    });
  }
  return {
    bpm,
    spb,
    speed: Number(raw.scrollSpeed || 2.8),
    notes,
    timeline,
    events: (raw.events || []).map(event => ({
      time: Number(event.time || 0) / 1000,
      name: event.name || "",
      params: Array.isArray(event.params) ? event.params.slice() : []
    })).sort((a, b) => a.time - b.time),
    totalBeats,
    totalTime,
    bpmChanges: (raw.events || [])
      .filter(event => event.name === "BPM Change")
      .map(event => ({ time: Number(event.time || 0) / 1000, bpm: Number(event.params?.[0] || bpm) }))
  };
}

function copyDirectoryFiles(sourceRelative, targetRelative) {
  const sourceDir = path.join(sourceRoot, sourceRelative);
  const targetDir = path.join(root, targetRelative);
  ensureDir(targetDir);
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    fs.copyFileSync(path.join(sourceDir, entry.name), path.join(targetDir, entry.name));
  }
}

const raw = readJson("songs/inopia/charts/hard.json");
const chart = convertChart(raw);
function sourceStepTime(stepNumber) {
  const target = Math.max(0, Number(stepNumber) || 0);
  const changes = (chart.bpmChanges || []).slice().sort((a, b) => a.time - b.time);
  let time = 0;
  let step = 0;
  let bpm = Number(chart.bpm || 132);
  for (const change of changes) {
    if (change.time <= time + 0.000001 || change.bpm === bpm) continue;
    const endStep = step + (change.time - time) * bpm / 15;
    if (target <= endStep + 0.000001) return time + Math.max(0, target - step) * 15 / bpm;
    time = change.time;
    step = endStep;
    bpm = change.bpm;
  }
  return time + Math.max(0, target - step) * 15 / bpm;
}
const assetRoot = "assets/inopia";
copyDirectoryFiles("images/stages/inopia", `${assetRoot}/stage`);
copyDirectoryFiles("images/characters/inopia", `${assetRoot}/characters`);
copyDirectoryFiles("images/game/notes", `${assetRoot}/notes-source`);
copyDirectoryFiles("images/game/ui", `${assetRoot}/ui-source`);
copyDirectoryFiles("images/icons", `${assetRoot}/icons`);
copy("songs/inopia/song/Inst.ogg", "inopia-inst.ogg");
copy("songs/inopia/song/Voices.ogg", "inopia-voices.ogg");

const notesAtlas = parseAtlas("images/game/notes/inopia.xml");
const inopiaFrame = framesFor(parseAtlas("images/stages/inopia/marco.xml"), "marco")[0] || null;
const inopiaVignette = framesFor(parseAtlas("images/stages/inopia/inopia vignette.xml"), "vignette")[0] || null;
const inopiaRed = framesFor(parseAtlas("images/stages/inopia/red.xml"), "red")[0] || null;
const inopiaAltVignette = {
  name: "vignette_2",
  x: 0,
  y: 0,
  w: 1920,
  h: 1080,
  fx: 0,
  fy: 0,
  fw: 1920,
  fh: 1080,
  rotated: false
};
const notePrefix = {
  left: { static: "arrowLEFT", press: "left press", confirm: "left confirm", gem: "purple", holdPiece: "purple hold piece", holdEnd: "pruple end hold" },
  down: { static: "arrowDOWN", press: "down press", confirm: "down confirm", gem: "blue", holdPiece: "blue hold piece", holdEnd: "blue hold end" },
  up: { static: "arrowUP", press: "up press", confirm: "up confirm", gem: "green", holdPiece: "green hold piece", holdEnd: "green hold end" },
  right: { static: "arrowRIGHT", press: "right press", confirm: "right confirm", gem: "red", holdPiece: "red hold piece", holdEnd: "red hold end" }
};
const noteSkin = {};
for (const [direction, prefixes] of Object.entries(notePrefix)) {
  const gem = notesAtlas.find(frame => frame.name === `${prefixes.gem}0000`)
    || framesFor(notesAtlas, prefixes.gem)[0]
    || null;
  noteSkin[direction] = {
    static: framesFor(notesAtlas, prefixes.static)[0] || null,
    press: framesFor(notesAtlas, prefixes.press),
    confirm: framesFor(notesAtlas, prefixes.confirm),
    gem,
    holdPiece: framesFor(notesAtlas, prefixes.holdPiece)[0] || null,
    holdEnd: framesFor(notesAtlas, prefixes.holdEnd)[0] || null
  };
}

const stage = {
  zoom: 0.55,
  playerZoom: 0.6,
  characterCameraOffsets: {
    sans: [0, -30],
    papyrus: [700, -130],
    player: [-450, 0]
  },
  papyrusAppear: sourceStepTime(1008),
  redStart: sourceStepTime(1672),
  layers: [
    { image: `${assetRoot}/stage/fondo.png`, x: -800, y: -800, scrollX: 0.4, scrollY: 0.7 },
    { image: `${assetRoot}/stage/arbol_5.png`, x: -1450, y: 180, scrollX: 0.5, scrollY: 0.75 },
    { image: `${assetRoot}/stage/arbol_4.png`, x: -1200, y: 170, scrollX: 0.6, scrollY: 0.8 },
    { image: `${assetRoot}/stage/arbol_3.png`, x: -950, y: 120, scrollX: 0.7, scrollY: 0.85 },
    { image: `${assetRoot}/stage/arbol_2.png`, x: -600, y: 70, scrollX: 0.8, scrollY: 0.9 },
    { image: `${assetRoot}/stage/arbol_1.png`, x: -400, y: 0, scrollX: 0.9, scrollY: 0.95 },
    { image: `${assetRoot}/stage/suelo.png`, x: -400, y: 1100, scrollX: 1, scrollY: 1 }
  ],
  redLayers: [
    { image: `${assetRoot}/stage/rojo_fondo.png`, x: -800, y: -800, scrollX: 0.4, scrollY: 0.7 },
    { image: `${assetRoot}/stage/arbol_5.png`, x: -1450, y: 180, scrollX: 0.5, scrollY: 0.75 },
    { image: `${assetRoot}/stage/rojo_arbol_4.png`, x: -1200, y: 170, scrollX: 0.6, scrollY: 0.8 },
    { image: `${assetRoot}/stage/rojo_arbol_3.png`, x: -950, y: 120, scrollX: 0.7, scrollY: 0.85 },
    { image: `${assetRoot}/stage/rojo_arbol_2.png`, x: -600, y: 70, scrollX: 0.8, scrollY: 0.9 },
    { image: `${assetRoot}/stage/rojo_arbol_1.png`, x: -400, y: 0, scrollX: 0.9, scrollY: 0.95 },
    { image: `${assetRoot}/stage/rojo_suelo.png`, x: -400, y: 1100, scrollX: 1, scrollY: 1 }
  ],
  characters: { sans: [1040, 660], papyrus: [300, 630], player: [1900, 660] },
  animals: {
    deer: { image: `${assetRoot}/stage/deer.png`, atlas: "images/stages/inopia/deer.xml", x: 2600, y: 1050, appear: 88.86, scrollX: 1.5, scrollY: 1.5, idleOffset: [0, -55] },
    mouse: { image: `${assetRoot}/stage/mouse.png`, atlas: "images/stages/inopia/mouse.xml", x: 2000, y: 1650, appear: 94.55, scrollX: 1.5, scrollY: 1.5, idleOffset: [-10, -40] },
    bunny: { image: `${assetRoot}/stage/bunny.png`, atlas: "images/stages/inopia/bunny.xml", x: 1300, y: 1550, appear: 91.82, scrollX: 1.5, scrollY: 1.5, idleOffset: [0, -30] },
    bear: { image: `${assetRoot}/stage/bear.png`, atlas: "images/stages/inopia/bear.xml", x: 200, y: 1350, appear: 102.73, scrollX: 1.5, scrollY: 1.5, idleOffset: [-370, -30] },
    monster: { image: `${assetRoot}/stage/monster.png`, atlas: "images/stages/inopia/monster.xml", x: 200, y: 1250, appear: 88.86, scrollX: 1.5, scrollY: 1.5, idleOffset: [0, 0] },
    bunny2: { image: `${assetRoot}/stage/bunny2.png`, atlas: "images/stages/inopia/bunny2.xml", x: 1400, y: 800, appear: 105.45, scrollX: 0.9, scrollY: 0.95, idleOffset: [0, 0] },
    cat: { image: `${assetRoot}/stage/cat.png`, atlas: "images/stages/inopia/cat.xml", x: 800, y: 950, appear: 109.09, scrollX: 0.9, scrollY: 0.95, idleOffset: [0, 0] }
  }
};

const characterData = {
  sans: parseCharacter("data/characters/inopia_sans.xml", "images/characters/inopia/inopia_sans.xml", `${assetRoot}/characters/inopia_sans.png`, { x: 1040, y: 660 }),
  // Papyrus has no position in his character XML. His source position comes
  // from the stage's <gf x="300" y="630"/> entry; using that as the XML
  // fallback would add it twice and place him at (600, 1260).
  papyrus: parseCharacter("data/characters/inopia_papyrus.xml", "images/characters/inopia/paps_inopia.xml", `${assetRoot}/characters/paps_inopia.png`, { x: 0, y: 0 }),
  player: parseCharacter("data/characters/bf_inopia.xml", "images/characters/inopia/inopia_bf.xml", `${assetRoot}/characters/inopia_bf.png`, { x: 1900, y: 660 }),
  sansMad: parseCharacter("data/characters/inopia_sans_mad.xml", "images/characters/inopia/sans_inopia_mad.xml", `${assetRoot}/characters/sans_inopia_mad.png`, { x: 1040, y: 660 }),
  papyrusMad: parseCharacter("data/characters/inopia_papyrus_mad.xml", "images/characters/inopia/inopia_paps_red.xml", `${assetRoot}/characters/inopia_paps_red.png`, { x: 0, y: 0 }),
  playerMad: parseCharacter("data/characters/bf_inopia_mad.xml", "images/characters/inopia/bf_inopia_red.xml", `${assetRoot}/characters/bf_inopia_red.png`, { x: 1900, y: 660 })
};

const animals = {};
for (const [name, item] of Object.entries(stage.animals)) {
  const atlas = parseAtlas(item.atlas);
  animals[name] = {
    ...item,
    animations: {
      appear: framesFor(atlas, `${name}_appear`),
      idle: framesFor(atlas, `${name}_idle`)
    }
  };
}

const output = {
  meta: { title: "Inopia", subtitle: "Friday Night Dustin hard chart", bpm: 132, source: "Dustin 1.2.1" },
  audio: { inst: "inopia-inst.ogg", voices: "inopia-voices.ogg" },
  chart,
  stage,
  sprites: { characters: characterData, animals },
  notes: { image: `${assetRoot}/notes-source/inopia.png`, skin: noteSkin },
  ui: {
    vignette: `${assetRoot}/stage/inopia vignette.png`,
    vignetteFrame: inopiaVignette,
    altVignette: `${assetRoot}/stage/vignette_2.png`,
    altVignetteFrame: inopiaAltVignette,
    frame: `${assetRoot}/stage/marco.png`,
    frameData: inopiaFrame,
    red: `${assetRoot}/stage/red.png`,
    redFrame: inopiaRed,
    healthBar: `${assetRoot}/ui-source/healthbar_inopia.png`,
    timeBar: `${assetRoot}/ui-source/timebar_inopia.png`,
    timeBarFill: `${assetRoot}/ui-source/timebar_fill_inopia.png`
  }
};

fs.writeFileSync(path.join(root, "inopia-data.js"), `window.INOPIA_DATA=${JSON.stringify(output)};\n`, "utf8");
console.log(`Imported Inopia: ${chart.notes.length} notes, ${chart.events.length} events, ${Math.round(chart.totalTime)} seconds.`);

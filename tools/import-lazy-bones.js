const fs = require("fs");
const path = require("path");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const MOD_ROOT = path.resolve(
  process.env.LAZY_BONES_SOURCE ||
  "C:/Users/matth/Downloads/lazybones-source/lazybones/bin/mods/LAZYBONES"
);
const ENGINE_ROOT = path.resolve(MOD_ROOT, "..", "..");
const ASSET_ROOT = path.join(PROJECT_ROOT, "assets", "lazy-bones");

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
  const attributes = {};
  for (const match of text.matchAll(/([A-Za-z0-9_:-]+)="([^"]*)"/g)) {
    attributes[match[1]] = match[2];
  }
  return attributes;
}

function numberAttribute(attributes, key, fallback = 0) {
  const value = Number(attributes[key]);
  return Number.isFinite(value) ? value : fallback;
}

function frameNumber(name) {
  const match = String(name || "").match(/(\d+)(?!.*\d)/);
  return match ? Number(match[1]) : 0;
}

function parseAtlas(sourceRelative) {
  return parseAtlasText(readText(sourceRelative));
}

function parseAtlasText(xmlText) {
  const frames = [];
  for (const match of xmlText.matchAll(/<SubTexture\b([^>]*?)\/>/g)) {
    const attributes = parseAttributes(match[1]);
    frames.push({
      name: String(attributes.name || ""),
      x: numberAttribute(attributes, "x"),
      y: numberAttribute(attributes, "y"),
      w: numberAttribute(attributes, "width"),
      h: numberAttribute(attributes, "height"),
      fx: numberAttribute(attributes, "frameX"),
      fy: numberAttribute(attributes, "frameY"),
      fw: numberAttribute(attributes, "frameWidth", numberAttribute(attributes, "width")),
      fh: numberAttribute(attributes, "frameHeight", numberAttribute(attributes, "height"))
    });
  }
  return frames;
}

function framesByPrefix(frames, prefix) {
  return frames
    .filter(frame => frame.name.startsWith(prefix))
    .sort((a, b) => frameNumber(a.name) - frameNumber(b.name));
}

function convertCharacter(configName, imageName) {
  const config = readJson(`characters/${configName}.json`);
  const frames = parseAtlas(`images/characters/${imageName}.xml`);
  const animations = {};
  for (const sourceAnimation of config.animations || []) {
    const animationName = String(sourceAnimation.anim || "idle");
    animations[animationName] = {
      frames: framesByPrefix(frames, String(sourceAnimation.name || "")),
      fps: Number(sourceAnimation.fps || 12),
      loop: !!sourceAnimation.loop,
      offset: (sourceAnimation.offsets || [0, 0]).map(Number)
    };
  }
  return {
    image: copyAsset(`images/characters/${imageName}.png`, `assets/lazy-bones/${imageName}.png`),
    position: (config.position || [0, 0]).map(Number),
    camera: (config.camera_position || [0, 0]).map(Number),
    flipX: !!config.flip_x,
    scale: Number(config.scale || 1),
    singDuration: Number(config.sing_duration || 4),
    animations
  };
}

function convertChart(sourceRelative, difficulty) {
  const raw = readJson(sourceRelative);
  const bpm = Number(raw.bpm || 158);
  const spb = 60 / bpm;
  const notes = [];
  const timeline = [];
  let sectionBeat = 0;
  let noteIndex = 0;

  for (const section of raw.notes || []) {
    const sectionBeats = Number(section.sectionBeats || 4);
    const startBeat = sectionBeat;
    const endBeat = startBeat + sectionBeats;
    const turn = section.mustHitSection ? "player" : "opp";
    timeline.push({
      startBeat,
      endBeat,
      startTime: startBeat * spb,
      endTime: endBeat * spb,
      turn,
      label: turn === "player" ? "Boyfriend" : "Sans",
      style: "lazybones",
      int: 0.82
    });
    for (const sourceNote of section.sectionNotes || []) {
      const rawLane = Number(sourceNote[1] || 0);
      const localLane = ((rawLane % 4) + 4) % 4;
      let mustPress = rawLane > 3;
      if (section.mustHitSection) mustPress = !mustPress;
      const side = mustPress ? "player" : "opp";
      notes.push({
        id: `lazy-bones-${difficulty}-${noteIndex++}`,
        beat: Number(sourceNote[0] || 0) / 1000 / spb,
        time: Number(sourceNote[0] || 0) / 1000,
        lane: localLane + (side === "player" ? 4 : 0),
        side,
        character: side === "player" ? "player" : "sans",
        sLen: Math.max(0, Number(sourceNote[2] || 0)) / 1000,
        noteType: sourceNote[3] || ""
      });
    }
    sectionBeat = endBeat;
  }
  notes.sort((a, b) => a.time - b.time || a.lane - b.lane);

  const events = [];
  for (const sourceEvent of raw.events || []) {
    const eventTime = Number(sourceEvent[0] || 0) / 1000;
    for (const eventData of sourceEvent[1] || []) {
      events.push({
        time: eventTime,
        name: String(eventData[0] || ""),
        value1: String(eventData[1] || ""),
        value2: String(eventData[2] || "")
      });
    }
  }
  events.sort((a, b) => a.time - b.time);

  const noteEnd = notes.reduce((maximum, note) => Math.max(maximum, note.time + note.sLen), 0);
  const eventEnd = events.reduce((maximum, event) => Math.max(maximum, event.time), 0);
  return {
    difficulty,
    bpm,
    spb,
    speed: Number(raw.speed || 2.6),
    totalBeats: sectionBeat,
    totalTime: Math.max(noteEnd + 3.2, eventEnd + 1),
    notes,
    events,
    timeline
  };
}

function main() {
  ensureDir(ASSET_ROOT);
  const stage = readJson("stages/bonely.json");
  const noteAtlasPath = path.join(ENGINE_ROOT, "assets", "shared", "images", "noteSkins", "NOTE_assets.xml");
  const noteImagePath = path.join(ENGINE_ROOT, "assets", "shared", "images", "noteSkins", "NOTE_assets.png");
  const noteFrames = parseAtlasText(fs.readFileSync(noteAtlasPath, "utf8"));
  const noteImageTarget = path.join(ASSET_ROOT, "NOTE_assets.png");
  fs.copyFileSync(noteImagePath, noteImageTarget);
  const directionNames = ["left", "down", "up", "right"];
  const colorNames = ["purple", "blue", "green", "red"];
  const data = {
    song: {
      title: "Lazy Bones",
      subtitle: "FNF x Undertale source mod",
      diff: "Boned (Original Chart)",
      bpm: 158,
      color: "#bca6ff"
    },
    audio: {
      inst: copyAsset("songs/lazybones/Inst.ogg", "lazy-bones-inst.ogg")
    },
    charts: {
      boned: convertChart("data/lazybones/lazybones-boned.json", "boned"),
      alt: convertChart("data/lazybones/lazybones-alt.json", "alt")
    },
    stage: {
      viewport: [1280, 720],
      defaultZoom: Number(stage.defaultZoom || 0.9),
      cameraSpeed: Number(stage.camera_speed || 1),
      background: {
        image: copyAsset("images/bg.png", "assets/lazy-bones/bg.png"),
        x: Number(stage.objects?.[0]?.x || 13),
        y: Number(stage.objects?.[0]?.y || -5),
        scale: Number(stage.objects?.[0]?.scale?.[0] || 0.7)
      },
      stand: {
        image: copyAsset("images/stand.png", "assets/lazy-bones/stand.png"),
        x: Number(stage.objects?.[3]?.x || 13),
        y: Number(stage.objects?.[3]?.y || -2),
        scale: Number(stage.objects?.[3]?.scale?.[0] || 0.7)
      },
      positions: {
        boyfriend: (stage.boyfriend || [770, 100]).map(Number),
        sans: (stage.opponent || [100, 100]).map(Number)
      }
    },
    sprites: {
      boyfriend: convertCharacter("bf-bonely", "bfz"),
      sans: convertCharacter("sanz-bonely", "sanz")
    },
    hud: {
      boyfriendIcon: copyAsset("images/icons/bf.png", "assets/lazy-bones/icon-bf.png"),
      sansIcon: copyAsset("images/icons/sans.png", "assets/lazy-bones/icon-sans.png")
    },
    notes: {
      image: "assets/lazy-bones/NOTE_assets.png",
      lanes: directionNames.map((direction, lane) => ({
        receptor: framesByPrefix(noteFrames, `arrow${direction.toUpperCase()}`),
        press: framesByPrefix(noteFrames, `${direction} press`),
        confirm: framesByPrefix(noteFrames, `${direction} confirm`),
        tap: framesByPrefix(noteFrames, `${colorNames[lane]}0`),
        holdPiece: framesByPrefix(noteFrames, `${colorNames[lane]} hold piece`),
        holdEnd: framesByPrefix(noteFrames, `${colorNames[lane]} hold end`)
      }))
    },
    receptors: {
      playerX: [90, 205, 315, 425],
      playerY: 50,
      opponentX: [745, 850, 955, 1060],
      opponentY: 525
    },
    source: {
      shaders: [],
      cameraOffset: 40,
      cameraTweenDuration: 1.7
    }
  };

  fs.writeFileSync(
    path.join(PROJECT_ROOT, "lazy-bones-data.js"),
    `window.LAZY_BONES_DATA=${JSON.stringify(data)};\n`,
    "utf8"
  );
  console.log(`Lazy Bones imported: ${data.charts.boned.notes.length} Boned notes, ${data.charts.alt.notes.length} Alt notes.`);
}

main();

const fs = require("fs");
const path = require("path");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const MOD_ROOT = path.resolve("C:/Users/matth/Downloads/wii_funkin_-_vs_matt_c36aa/Wii Funkin' - VS Matt");

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

function convertPsychChart(chartFileRelative, options) {
  const rawSong = readJson(chartFileRelative).song;
  const bpm = Number(options.bpm || rawSong.bpm || 120);
  const spb = 60 / bpm;
  const notes = [];
  const timeline = [];
  let cursorBeat = 0;
  let noteIndex = 0;

  for (const section of rawSong.notes || []) {
    const beats = Math.max(0.25, Number(section.lengthInSteps || section.sectionBeats * 4 || 16) / 4);
    const startBeat = cursorBeat;
    const endBeat = cursorBeat + beats;
    const baseSide = section.mustHitSection ? "player" : "opp";
    timeline.push({
      startBeat,
      endBeat,
      turn: baseSide,
      label: `${options.title} hard section`,
      style: "rush",
      int: options.intensity,
      startTime: round(startBeat * spb),
      endTime: round(endBeat * spb),
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
      notes.push({
        id: noteIndex++,
        beat: round(time / spb),
        time: round(time),
        lane: laneBase + (side === "player" ? 4 : 0),
        side,
        character: side === "player" ? "player" : "matt",
        sLen: round(sustain)
      });
    }
    cursorBeat = endBeat;
  }

  notes.sort((a, b) => a.time - b.time || a.lane - b.lane);
  const noteEnd = notes.reduce((max, note) => Math.max(max, note.time + Math.max(0, note.sLen || 0)), 0);
  const totalBeats = cursorBeat;
  const totalTime = Math.max(noteEnd + 2.5, totalBeats * spb);
  return { notes, timeline, totalBeats, totalTime: round(totalTime), spb };
}

function parseChartEvents(chartFileRelative) {
  const rawSong = readJson(chartFileRelative).song;
  const dialogueEvents = [];
  let notBadStart = null;
  let notBadEnd = null;
  const parts = [];

  for (const [timeMs, commands] of rawSong.events || []) {
    const time = round(Number(timeMs || 0) / 1000);
    for (const command of commands || []) {
      const [name, arg1, arg2] = command;
      if (name === "Play Animation" && arg1 === "shimmer") notBadStart = time;
      if (name === "subtitle") {
        const action = String(arg1 || "");
        if (action.includes("add")) {
          const text = String(arg2 || "");
          parts.push(text);
          dialogueEvents.push({ time, action: "add", text });
        } else if (action.includes("remove")) {
          notBadEnd = time;
          dialogueEvents.push({ time, action: "remove" });
        }
      }
    }
  }

  return {
    dialogueEvents,
    notBadKid: {
      start: notBadStart ?? (dialogueEvents[0]?.time || 0),
      textStart: dialogueEvents.find(event => event.action === "add")?.time || notBadStart || 0,
      end: notBadEnd ?? ((dialogueEvents.at(-1)?.time || notBadStart || 0) + 1.2),
      line: parts.join("")
    }
  };
}

function attrsFromTag(tag) {
  const attrs = {};
  for (const attr of tag.matchAll(/([\w-]+)="([^"]*)"/g)) attrs[attr[1]] = attr[2];
  return attrs;
}

function parseModchartEvents(xmlRelative) {
  const xml = readText(xmlRelative);
  const events = [];
  for (const match of xml.matchAll(/<Event\s+([^>]+?)\s*\/>/g)) {
    const attrs = attrsFromTag(match[1]);
    if (attrs.type !== "tweenShaderProperty" || attrs.step == null) continue;
    events.push({
      step: round(attrs.step, 3),
      duration: round(attrs.time, 3),
      name: attrs.name || "",
      property: attrs.property || "",
      value: round(attrs.value, 4),
      startValue: round(attrs.startValue, 4),
      ease: attrs.ease || "linear"
    });
  }
  return events.sort((a, b) => a.step - b.step || a.name.localeCompare(b.name) || a.property.localeCompare(b.property));
}

function parseSparrowFrames(xmlRelative) {
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
      rotated: false
    });
  }
  return frames.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}

function writeDataFile(targetName, objectName, payload) {
  const targetPath = path.join(PROJECT_ROOT, targetName);
  fs.writeFileSync(targetPath, `window.${objectName}=${JSON.stringify(payload)};\n`, "utf8");
}

function main() {
  const chart = convertPsychChart("mods/data/shimmy/shimmy-hard.json", {
    title: "Shimmy",
    bpm: 167,
    intensity: 0.92
  });
  Object.assign(chart, parseChartEvents("mods/data/shimmy/shimmy-hard.json"));
  chart.shaderEvents = parseModchartEvents("mods/data/shimmy/modchart.xml");
  writeDataFile("shimmy-chart.js", "SHIMMY_CHART", chart);

  copyAsset("mods/songs/shimmy/Inst.ogg", "shimmy-inst.ogg");
  copyAsset("mods/songs/shimmy/Voices.ogg", "shimmy-voices.ogg");
  const shimmerImage = copyAsset("mods/images/characters/shimmer.png", "assets/combat/shimmer.png");
  writeDataFile("shimmy-visual-data.js", "SHIMMY_VISUAL_DATA", {
    shimmer: {
      image: shimmerImage,
      fps: 18,
      scale: 0.66,
      offsets: [83, -249],
      frames: parseSparrowFrames("mods/images/characters/shimmer.xml")
    }
  });

  console.log("Imported Shimmy into", PROJECT_ROOT);
}

main();

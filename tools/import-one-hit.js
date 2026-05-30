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

function readJson(sourceRelative) {
  return JSON.parse(fs.readFileSync(path.join(MOD_ROOT, sourceRelative), "utf8"));
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
      notes.push({
        id: noteIndex++,
        beat: time / spb,
        time,
        lane: laneBase + (side === "player" ? 4 : 0),
        side,
        character: side === "player" ? "player" : "matt",
        sLen: sustain
      });
    }
    cursorBeat = endBeat;
  }

  notes.sort((a, b) => a.time - b.time || a.lane - b.lane);
  const noteEnd = notes.reduce((max, note) => Math.max(max, note.time + Math.max(0, note.sLen || 0)), 0);
  const totalBeats = cursorBeat;
  const totalTime = Math.max(noteEnd + 2.5, totalBeats * spb);
  return { notes, timeline, totalBeats, totalTime, spb };
}

function parseOneHitCameraEvents() {
  const raw = readJson("mods/data/one-hit/events.json").song?.events || [];
  const cameraEvents = [];
  for (const [timeMs, commands] of raw) {
    const time = Number(timeMs || 0) / 1000;
    for (const command of commands || []) {
      const [name, arg1, arg2] = command;
      if (name === "Set Property" && arg1 === "duetCamera") {
        cameraEvents.push({
          type: "duetCamera",
          time,
          enabled: String(arg2) === "1"
        });
      } else if (name === "Better Zoom" && String(arg1 || "").startsWith("camGame")) {
        const [amount, duration] = String(arg2 || "")
          .split(",")
          .map(value => Number(value.trim()));
        cameraEvents.push({
          type: "betterZoom",
          time,
          amount: Number.isFinite(amount) ? amount : 0,
          duration: Number.isFinite(duration) ? duration : 0.5
        });
      } else if (name === "Flash Camera") {
        cameraEvents.push({ type: "flash", time });
      }
    }
  }
  return cameraEvents.sort((a, b) => a.time - b.time);
}

function writeDataFile(targetName, objectName, payload) {
  const targetPath = path.join(PROJECT_ROOT, targetName);
  fs.writeFileSync(targetPath, `window.${objectName}=${JSON.stringify(payload)};\n`, "utf8");
}

function main() {
  const chart = convertPsychChart("mods/data/one-hit/one-hit-hard.json", {
    title: "One Hit",
    bpm: 342,
    intensity: 0.96
  });
  chart.cameraEvents = parseOneHitCameraEvents();
  writeDataFile("one-hit-chart.js", "ONE_HIT_CHART", chart);
  copyAsset("mods/songs/one-hit/Inst.ogg", "one-hit-inst.ogg");
  copyAsset("mods/songs/one-hit/Voices.ogg", "one-hit-voices.ogg");
  console.log("Imported One Hit into", PROJECT_ROOT);
}

main();

// Retarget the "Silly Billy" song so it plays the Test of Time HARD chart
// + Test of Time instrumental, while keeping the Silly Billy voices, stage,
// characters and note skins.
//
// It surgically rewrites ONLY the chart/audio/song fields inside
// silly-billy-data.js and replaces silly-billy-inst.ogg. Everything else
// (embedded sprite/atlas/stage data, videos) is preserved.
//
// Run:  node tools/retarget-silly-billy-test-of-time.js

const fs = require("fs");
const path = require("path");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const TOT_ROOT = path.resolve(
  "C:/Users/matth/Downloads/test_of_time_073_final_build_bc015/Test of Time 0.7.3"
);
const TOT_CHART = path.join(TOT_ROOT, "data/test-of-time/test-of-time-hard.json");
const TOT_INST = path.join(TOT_ROOT, "songs/test-of-time/Inst.ogg");

const DATA_FILE = path.join(PROJECT_ROOT, "silly-billy-data.js");
const INST_FILE = path.join(PROJECT_ROOT, "silly-billy-inst.ogg");
const VOICES_FILE = "silly-billy-voices.ogg"; // kept as requested

function round(value, places = 6) {
  const factor = 10 ** places;
  return Math.round(Number(value || 0) * factor) / factor;
}

// --- Get the true duration of an Ogg/Vorbis file (granulePos / sampleRate) ---
function oggDurationSeconds(file) {
  const buf = fs.readFileSync(file);
  // sample rate from the Vorbis identification header: \x01 "vorbis" ...
  const idMarker = Buffer.from([0x01, 0x76, 0x6f, 0x72, 0x62, 0x69, 0x73]);
  const idIdx = buf.indexOf(idMarker);
  if (idIdx < 0) return null;
  const sampleRate = buf.readUInt32LE(idIdx + 12);
  if (!sampleRate) return null;
  // largest granule position across all OggS pages = final sample count
  const oggs = Buffer.from("OggS");
  let maxGranule = 0n;
  let pos = buf.indexOf(oggs, 0);
  while (pos >= 0) {
    if (pos + 14 <= buf.length) {
      const g = buf.readBigUInt64LE(pos + 6);
      if (g !== 0xffffffffffffffffn && g > maxGranule) maxGranule = g;
    }
    pos = buf.indexOf(oggs, pos + 4);
  }
  if (maxGranule === 0n) return null;
  return Number(maxGranule) / sampleRate;
}

// --- Convert a legacy FNF (Psych Engine) chart into Silly Billy note format ---
function convertChart() {
  const raw = JSON.parse(fs.readFileSync(TOT_CHART, "utf8")).song;
  const bpm = Number(raw.bpm || 150);
  const spb = 60 / bpm;
  const notes = [];
  const sections = [];
  let cursorBeat = 0;
  let noteIndex = 0;

  for (const section of raw.notes || []) {
    const beats = Math.max(
      0.25,
      Number(section.lengthInSteps || section.sectionBeats * 4 || 16) / 4
    );
    const startBeat = cursorBeat;
    const endBeat = cursorBeat + beats;
    const baseSide = section.mustHitSection ? "player" : "opp";

    let firstNoteTime = null;
    for (const rawNote of section.sectionNotes || []) {
      const time = Number(rawNote[0] || 0) / 1000;
      const rawData = Number(rawNote[1] || 0);
      const sustain = Math.max(0, Number(rawNote[2] || 0)) / 1000;
      const noteType = String(rawNote[3] || "");
      const group = Math.floor(rawData / 4);
      const laneBase = ((rawData % 4) + 4) % 4;
      const side = group % 2 === 0 ? baseSide : baseSide === "player" ? "opp" : "player";
      const noAnim = noteType === "No Animation";
      if (firstNoteTime == null || time < firstNoteTime) firstNoteTime = time;
      notes.push({
        id: `silly-billy-${noteIndex++}`,
        beat: round(time / spb),
        time: round(time),
        lane: laneBase + (side === "player" ? 4 : 0),
        side,
        character: noAnim ? null : side === "player" ? "player" : "dad",
        sLen: round(sustain),
        alt: !!section.altAnim || noteType === "Alt Animation",
        noteType,
        hurt: noteType === "Hurt Note",
        avoid: noteType === "Hurt Note",
        noAnim
      });
    }

    sections.push({
      startBeat: round(startBeat),
      endBeat: round(endBeat),
      baseSide,
      altAnim: !!section.altAnim,
      mustHitSection: !!section.mustHitSection,
      firstNoteTime
    });
    cursorBeat = endBeat;
  }

  notes.sort((a, b) => a.time - b.time || a.lane - b.lane);
  const noteEnd = notes.reduce(
    (max, n) => Math.max(max, n.time + Math.max(0, n.sLen || 0)),
    0
  );

  // Build a camera timeline anchored to ACTUAL note times so the camera turns
  // line up with the audio (section indices in the source chart don't map
  // cleanly onto bpm*beat time).
  const anchored = sections.filter(s => s.firstNoteTime != null);
  const timeline = anchored.map((s, i) => {
    const startTime = i === 0 ? 0 : round(s.firstNoteTime);
    return {
      turn: s.baseSide,
      style: s.altAnim ? "alt" : "normal",
      int: s.altAnim ? 0.96 : 0.86,
      label: "Test of Time section",
      mustHitSection: s.mustHitSection,
      altAnim: s.altAnim,
      startTime,
      _rawStart: s.firstNoteTime
    };
  });
  const songEnd = round(Math.max(noteEnd + 1, oggDurationSeconds(TOT_INST) || noteEnd + 1));
  for (let i = 0; i < timeline.length; i++) {
    timeline[i].endTime = i < timeline.length - 1 ? timeline[i + 1].startTime : songEnd;
    timeline[i].startBeat = round(timeline[i].startTime / spb);
    timeline[i].endBeat = round(timeline[i].endTime / spb);
    delete timeline[i]._rawStart;
  }

  return {
    bpm,
    spb: round(spb),
    notes,
    timeline,
    totalBeats: round(cursorBeat),
    totalTime: songEnd,
    holds: notes.filter(n => n.sLen > 0).length
  };
}

function main() {
  if (!fs.existsSync(TOT_CHART)) throw new Error("Missing chart: " + TOT_CHART);
  if (!fs.existsSync(TOT_INST)) throw new Error("Missing inst: " + TOT_INST);

  // Parse existing data object (preserve everything we don't touch).
  const text = fs.readFileSync(DATA_FILE, "utf8");
  const eq = text.indexOf("=");
  let jsonText = text.slice(eq + 1).trim();
  if (jsonText.endsWith(";")) jsonText = jsonText.slice(0, -1);
  const data = JSON.parse(jsonText);

  // Backups (only once).
  if (!fs.existsSync(DATA_FILE + ".bak")) fs.copyFileSync(DATA_FILE, DATA_FILE + ".bak");
  if (!fs.existsSync(INST_FILE + ".bak") && fs.existsSync(INST_FILE)) {
    fs.copyFileSync(INST_FILE, INST_FILE + ".bak");
  }

  const chart = convertChart();
  const dur = oggDurationSeconds(TOT_INST);

  // Replace the instrumental file (keep the same filename the mode expects).
  fs.copyFileSync(TOT_INST, INST_FILE);

  // Patch song metadata.
  data.song = data.song || {};
  data.song.bpm = chart.bpm;
  data.song.diff = "Hard";
  data.song.subtitle = "Test of Time chart + instrumental, Silly Billy (FLP) vocals";

  // Audio: keep inst filename, point voices at the .ogg that actually exists.
  data.audio = data.audio || {};
  data.audio.inst = "silly-billy-inst.ogg";
  data.audio.voices = VOICES_FILE;

  // Replace ONLY the chart body. Leave the original Silly Billy visual
  // scripting (commandEvents / lyricEvents) untouched: the vocals are the same
  // recording at the same BPM, so those visual cues still line up. Per the
  // "don't change any of the visuals" requirement, nothing visual is modified.
  data.chart = data.chart || {};
  data.chart.bpm = chart.bpm;
  data.chart.spb = chart.spb;
  data.chart.notes = chart.notes;
  data.chart.timeline = chart.timeline;
  data.chart.totalBeats = chart.totalBeats;
  data.chart.totalTime = chart.totalTime;
  data.chart.lyricEvents = data.chart.lyricEvents || [];
  data.chart.commandEvents = data.chart.commandEvents || [];

  // Keep top-level notes mirror (if present) consistent.
  if (Array.isArray(data.notes)) data.notes = chart.notes;

  data.source = data.source || {};
  data.source.chart = "Test of Time 0.7.3/data/test-of-time/test-of-time-hard.json";
  data.source.audio =
    "Test of Time 0.7.3/songs/test-of-time/Inst.ogg + silly-billy-voices.ogg (FLP)";

  fs.writeFileSync(DATA_FILE, `window.SILLY_BILLY_DATA=${JSON.stringify(data)};\n`, "utf8");

  console.log("Retargeted Silly Billy -> Test of Time (hard).");
  console.log(`  notes: ${chart.notes.length} (holds: ${chart.holds})`);
  console.log(`  bpm: ${chart.bpm}, spb: ${chart.spb}`);
  console.log(`  timeline segments: ${chart.timeline.length}`);
  console.log(`  inst duration: ${dur ? dur.toFixed(2) + "s" : "unknown"}, totalTime: ${chart.totalTime}s`);
  console.log("  voices: " + VOICES_FILE);
}

main();

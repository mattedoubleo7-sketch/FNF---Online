// Re-time Silly Billy's shrink/unshrink transformation and lyrics to match
// Test of Time, while keeping the "I'LL MAKE YOU SAY HOW PROUD YOU ARE OF ME"
// pride lyric (ToT sings it too). Idempotent: safe to re-run.
//
// Run:  node tools/retune-silly-billy-tot-events.js

const fs = require("fs");
const path = require("path");
const DATA_FILE = path.resolve(__dirname, "..", "silly-billy-data.js");

// --- Test of Time "Change Character" (shrink / short / unshrink) timeline ---
// value2 is mapped by the mode: transLookalike->smallizeDad (shrink),
// bf-lookalike->shortDad, translookalike2->unshrinkDad, else->dad.
const TOT_CHARACTER_CHANGES = [
  [135.954, "transLookalike"],   // shrink begins
  [137.341, "bf-lookalike"],
  [148.439, "dad"],
  [172.023, "bf-lookalike"],
  [172.543, "dad"],
  [173.064, "bf-lookalike"],
  [173.41,  "dad"],
  [174.798, "dad"],
  [175.318, "bf-lookalike"],
  [175.838, "dad"],
  [181.734, "bf-lookalike"],
  [191.445, "translookalike2"],  // unshrink
  [192.832, "evilLookalike"],    // back to normal
  [374.566, "bf-lookalike"],     // ending beat
  [375.954, "dad"],
  [376.647, "evilLookalike"]
];
const SHRINK_ANIM_TIME = 135.954; // trigger the squash anim at shrink start

// --- Lyrics: Test of Time's two lines (cyan build-up -> red payoff). ---
// The "I'LL MAKE YOU SAY HOW PROUD..." part is NOT a text overlay here; it
// lives inside the SO_STAY_FINAL video, which the mode plays at step 3534.
const LYRICS = [
  // "Your Time Is Over..."
  { time: 191.272, text: "Your", color: "00FFFF" },
  { time: 191.445, text: "Your Time", color: "00FFFF" },
  { time: 191.792, text: "Your Time Is", color: "00FFFF" },
  { time: 192.139, text: "Your Time Is Ov", color: "00FFFF" },
  { time: 192.486, text: "Your Time Is Over...", color: "FF0000" },
  { time: 192.832, text: "" },
  // "Count Your Seconds!"
  { time: 281.618, text: "Count", color: "00FFFF" },
  { time: 282.052, text: "Your", color: "00FFFF" },
  { time: 282.399, text: "Se", color: "00FFFF" },
  { time: 282.659, text: "Seconds!", color: "FF0000" },
  { time: 283.006, text: "" }
];

// --- BlackOut windows (Test of Time): screen goes black during these. ---
// Count Your Seconds = 281.618s on -> 283.006s off (per ToT's BlackOut event).
const BLACKOUTS = [
  [281.618, "true"],
  [283.006, "false"]
];

function round(v) { return Math.round(Number(v || 0) * 1e6) / 1e6; }
function isDadRole(v) { return ["dad", "opponent"].includes(String(v || "").trim().toLowerCase()); }
function isSmallizeAnim(e) {
  return e.action === "Play Animation" && String(e.value || "").toLowerCase() === "smallize" && isDadRole(e.value2);
}

function main() {
  const text = fs.readFileSync(DATA_FILE, "utf8");
  const eq = text.indexOf("=");
  const data = JSON.parse(text.slice(eq + 1).trim().replace(/;$/, ""));
  data.chart = data.chart || {};

  // 1) Rebuild lyrics.
  data.chart.lyricEvents = LYRICS.map(l => ({ time: round(l.time), text: l.text, color: l.color || null }));

  // 2) Re-time shrink/unshrink + blackout: drop existing Change Character,
  //    Smallize anim and BlackOut events, keep everything else, then add ToT's.
  const kept = (data.chart.commandEvents || []).filter(
    e => !(e.action === "Change Character" && isDadRole(e.value)) &&
         !isSmallizeAnim(e) &&
         e.action !== "BlackOut"
  );
  const added = [];
  for (const [time, char] of TOT_CHARACTER_CHANGES) {
    added.push({ time: round(time), action: "Change Character", value: "dad", value2: char });
  }
  added.push({ time: round(SHRINK_ANIM_TIME), action: "Play Animation", value: "Smallize", value2: "dad" });
  for (const [time, value] of BLACKOUTS) {
    added.push({ time: round(time), action: "BlackOut", value });
  }
  data.chart.commandEvents = kept.concat(added).sort((a, b) => a.time - b.time);

  fs.writeFileSync(DATA_FILE, `window.SILLY_BILLY_DATA=${JSON.stringify(data)};\n`, "utf8");

  const cc = data.chart.commandEvents.filter(e => e.action === "Change Character").length;
  const bo = data.chart.commandEvents.filter(e => e.action === "BlackOut");
  console.log("Lyrics events:", data.chart.lyricEvents.length, "(ToT lines only; ill-make is in the SO_STAY video)");
  console.log("Change Character events (ToT timeline):", cc);
  console.log("BlackOut events:", bo.map(e => `${e.time}s=${e.value}`).join(", "));
  console.log("Total command events:", data.chart.commandEvents.length);
  console.log("Shrink @135.954s, unshrink @191.445s, back @192.832s; ending 374-376s.");
}

main();

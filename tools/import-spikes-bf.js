// Import the spikes-bf character into Silly Billy as a dad-role sprite for the
// shrink phase, using its real Psych character.json (correct anim mapping,
// per-animation offsets, flip_x, scale). Position matches bf-lookalike (the
// "shrunk yourself" form it toggles with). Re-maps the shrink toggle so the
// opponent never goes tall before the unshrink. Idempotent.
//
// Run: node tools/import-spikes-bf.js

const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
const SRC = "C:/Users/matth/Downloads/silly_bf_v2/Silly BF V2/mods/Silly BF V2";
const DATA = path.join(ROOT, "silly-billy-data.js");

// Match bf-lookalike (shortDad). Idle uses the neutral "bruh" frame (not the
// JSON-default "spikes-bf left" which is a sing-like pose), so the character
// doesn't visually "hold the last note" between sings. Bruh-idle offset is
// computed so its trim top-left lands at bf-lookalike's idle trim top-left.
const POSITION = [130, 280];
const SCALE = 1.0;
const IDLE_OFFSET = [17, 47]; // align bruh trim TL with bf-lookalike idle trim TL

function attrs(tag) { const a = {}; for (const m of tag.matchAll(/([A-Za-z0-9_:-]+)="([^"]*)"/g)) a[m[1]] = m[2]; return a; }
function parseFrames(xml) {
  const frames = [];
  for (const m of xml.matchAll(/<SubTexture\b([^>]*?)\/>/g)) {
    const a = attrs(m[1]);
    frames.push({
      name: String(a.name || ""), image: "spikesBf",
      x: +a.x || 0, y: +a.y || 0, w: +a.width || 0, h: +a.height || 0,
      fx: +a.frameX || 0, fy: +a.frameY || 0,
      fw: +(a.frameWidth || a.width) || 0, fh: +(a.frameHeight || a.height) || 0,
      rotated: String(a.rotated || "false") === "true"
    });
  }
  return frames;
}
function idx(name) { const m = String(name).match(/(\d+)(?!.*\d)/); return m ? +m[1] : 0; }
function byPrefix(frames, prefix) {
  return frames.filter(f => f.name.startsWith(prefix)).sort((a, b) => idx(a.name) - idx(b.name));
}

function main() {
  const xml = fs.readFileSync(path.join(SRC, "images/characters/spikes-bf.xml"), "utf8");
  const cfg = JSON.parse(fs.readFileSync(path.join(SRC, "characters/spikes-bf.json"), "utf8"));
  const frames = parseFrames(xml);

  const animations = {};
  for (const a of cfg.animations || []) {
    if (a.anim === "idle") continue; // override below with the neutral bruh frame
    const fr = byPrefix(frames, a.name);
    if (!fr.length) continue;
    animations[a.anim] = {
      frames: fr,
      fps: Number(a.fps || 24),
      loop: !!a.loop,
      offset: [Number(a.offsets?.[0] || 0), Number(a.offsets?.[1] || 0)]
    };
  }
  // Neutral idle (bruh) so the char doesn't hold a sing pose between notes.
  animations.idle = { frames: byPrefix(frames, "spikes-bf bruh"), fps: 24, loop: true, offset: IDLE_OFFSET };

  const sprite = {
    image: "assets/silly-billy/spikes-bf.png",
    animations,
    scale: SCALE,
    flipX: !!cfg.flip_x,
    isPlayer: false,
    noAntialiasing: !!cfg.no_antialiasing,
    position: POSITION
  };

  fs.copyFileSync(path.join(SRC, "images/characters/spikes-bf.png"), path.join(ROOT, "assets/silly-billy/spikes-bf.png"));

  const text = fs.readFileSync(DATA, "utf8");
  const data = JSON.parse(text.slice(text.indexOf("=") + 1).trim().replace(/;$/, ""));
  data.sprites.spikesBf = sprite;

  // Re-map shrink-phase toggle: tall before the unshrink (191.445s) -> spikes-bf.
  let remapped = 0;
  for (const e of data.chart.commandEvents || []) {
    if (e.action !== "Change Character") continue;
    const v = String(e.value2 || "").toLowerCase();
    if (e.time < 191.445 && (v === "dad" || v === "evillookalike")) { e.value2 = "spikes-bf"; remapped++; }
  }

  fs.writeFileSync(DATA, "window.SILLY_BILLY_DATA=" + JSON.stringify(data) + ";\n", "utf8");

  console.log("spikesBf: scale", SCALE, "flipX", sprite.flipX, "pos", JSON.stringify(POSITION));
  console.log("anims:", Object.entries(animations).map(([k, a]) => `${k}(${a.frames.length}f,off${JSON.stringify(a.offset)})`).join(" "));
  console.log("shrink switches remapped:", remapped);
}
main();

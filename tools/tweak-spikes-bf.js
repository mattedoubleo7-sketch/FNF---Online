// Tweak spikes-bf: bump scale so he reads as a bit bigger when singing.
// Idle is intercepted at render time (see drawSprite in silly-billy-mode.js)
// and replaced with the shortDad "shrunk yourself" sprite — fully darkened —
// so this scale only affects the sing/move poses.
// Run: node tools/tweak-spikes-bf.js

const fs = require("fs");
const path = require("path");
const DATA = path.resolve(__dirname, "..", "silly-billy-data.js");

const TARGET_SCALE = 1.15;

function main() {
  const text = fs.readFileSync(DATA, "utf8");
  const data = JSON.parse(text.slice(text.indexOf("=") + 1).trim().replace(/;$/, ""));
  if (!data.sprites.spikesBf) { console.error("spikesBf not found in data"); process.exit(1); }
  const before = data.sprites.spikesBf.scale;
  data.sprites.spikesBf.scale = TARGET_SCALE;
  fs.writeFileSync(DATA, "window.SILLY_BILLY_DATA=" + JSON.stringify(data) + ";\n", "utf8");
  console.log("spikesBf.scale:", before, "->", TARGET_SCALE);
}
main();

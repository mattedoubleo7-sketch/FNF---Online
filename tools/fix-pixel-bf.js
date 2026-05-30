// Pixel BF (pixelPlayer) fixes for the Silly Billy pixel-break area:
//  1) Position it on-screen (its old [4000,3500] put it off the bottom-right).
//  2) ANCHOR it: drawSprite positions by `worldX - animOffset*scale`, so each
//     sing animation's different offset (x scale 12) made the BF jump every
//     note. Force all animations to the idle offset => constant position.
// Idempotent.  Run:  node tools/fix-pixel-bf.js

const fs = require("fs");
const path = require("path");
const DATA_FILE = path.resolve(__dirname, "..", "silly-billy-data.js");

const PIXEL_BF_POSITION = [1980, 1500];

function main() {
  const text = fs.readFileSync(DATA_FILE, "utf8");
  const data = JSON.parse(text.slice(text.indexOf("=") + 1).trim().replace(/;$/, ""));

  data.stage.positions.pixelPlayer = PIXEL_BF_POSITION;

  const bf = data.sprites.pixelPlayer;
  const anchor = (bf.animations.idle && bf.animations.idle.offset) || [-150, -180];
  let count = 0;
  for (const anim of Object.values(bf.animations || {})) {
    anim.offset = [anchor[0], anchor[1]];
    count++;
  }

  fs.writeFileSync(DATA_FILE, `window.SILLY_BILLY_DATA=${JSON.stringify(data)};\n`, "utf8");
  console.log("pixelPlayer position:", JSON.stringify(PIXEL_BF_POSITION));
  console.log("anchored", count, "animations to offset", JSON.stringify(anchor), "(no more per-note jumping)");
}

main();

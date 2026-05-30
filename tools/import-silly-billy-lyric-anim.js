// Convert the Adobe Animate texture-atlas lyric animation
// (story_of_yourtalebilly) into a compact form the game can render, and copy
// the spritemap image.  Run: node tools/import-silly-billy-lyric-anim.js

const fs = require("fs");
const path = require("path");

const SRC = path.resolve(
  "C:/Users/matth/Downloads/silly_billy_remastered_036f3/SILLY BILLY REMASTERED/assets/shared/images/lyric"
);
const PROJECT_ROOT = path.resolve(__dirname, "..");
const OUT_DATA = path.join(PROJECT_ROOT, "silly-billy-lyric-data.js");
const OUT_IMG = path.join(PROJECT_ROOT, "assets/silly-billy/lyric-spritemap1.png");

const r4 = v => Math.round(Number(v || 0) * 1e4) / 1e4;
function mat(M) {
  return [r4(M.m00), r4(M.m01), r4(M.m10), r4(M.m11), r4(M.m30), r4(M.m31)];
}
function convEl(e) {
  if (e.ATLAS_SPRITE_instance) {
    const a = e.ATLAS_SPRITE_instance;
    return ["a", String(a.name), ...mat(a.Matrix3D)];
  }
  if (e.SYMBOL_Instance) {
    const s = e.SYMBOL_Instance;
    const lc = s.loop === "loop" ? 0 : s.loop === "playonce" ? 1 : 2; // 2 = singleframe
    return ["s", String(s.SYMBOL_name), Number(s.firstFrame || 0), lc, ...mat(s.Matrix3D)];
  }
  return null;
}
function convLayers(layers) {
  return (layers || []).map(L => {
    const frames = L.Frames || L.FRAMES || [];
    return frames.map(f => [f.index, f.duration, (f.elements || []).map(convEl).filter(Boolean)]);
  });
}

function main() {
  const rd = f => JSON.parse(fs.readFileSync(path.join(SRC, f), "utf8").replace(/^﻿/, ""));
  const anim = rd("Animation.json");
  const sheet = rd("spritemap1.json");

  const atlas = {};
  for (const entry of sheet.ATLAS.SPRITES) {
    const s = entry.SPRITE;
    atlas[String(s.name)] = [s.x, s.y, s.w, s.h, s.rotated ? 1 : 0];
  }

  const symbols = {};
  for (const sym of anim.SYMBOL_DICTIONARY.Symbols) {
    symbols[String(sym.SYMBOL_name)] = convLayers(sym.TIMELINE.LAYERS);
  }
  const main = convLayers(anim.ANIMATION.TIMELINE.LAYERS);

  const payload = {
    fps: Number(anim.metadata && anim.metadata.framerate) || 24,
    image: "lyric-spritemap1.png",
    atlas,
    symbols,
    main
  };

  fs.writeFileSync(OUT_DATA, `window.SILLY_BILLY_LYRIC=${JSON.stringify(payload)};\n`, "utf8");
  fs.mkdirSync(path.dirname(OUT_IMG), { recursive: true });
  fs.copyFileSync(path.join(SRC, "spritemap1.png"), OUT_IMG);

  const bytes = fs.statSync(OUT_DATA).size;
  // longest main layer => animation length in frames
  const mainLen = main.reduce((mx, layer) => {
    const last = layer[layer.length - 1];
    return last ? Math.max(mx, last[0] + last[1]) : mx;
  }, 0);
  console.log("Wrote", OUT_DATA, (bytes / 1e6).toFixed(2) + "MB");
  console.log("atlas sprites:", Object.keys(atlas).length, "| symbols:", Object.keys(symbols).length, "| main layers:", main.length);
  console.log("main length:", mainLen, "frames =", (mainLen / payload.fps).toFixed(2) + "s @ " + payload.fps + "fps");
  console.log("copied image ->", OUT_IMG);
}

main();

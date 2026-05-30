// Compute the lyric animation's bounding box (in animation space) by walking
// the timeline matrices, so we can center/scale it precisely.
const fs = require("fs");
const path = require("path");
const txt = fs.readFileSync(path.resolve(__dirname, "..", "silly-billy-lyric-data.js"), "utf8");
const W = JSON.parse(txt.slice(txt.indexOf("=") + 1).trim().replace(/;$/, ""));

const symLenCache = {};
function tlen(layers) {
  let n = 1;
  for (const L of layers) { const k = L[L.length - 1]; if (k) n = Math.max(n, k[0] + k[1]); }
  return n;
}
function symLen(name) { return symLenCache[name] || (symLenCache[name] = tlen(W.symbols[name])); }
function kfAt(layer, f) {
  for (const kf of layer) if (f >= kf[0] && f < kf[0] + kf[1]) return kf;
  const last = layer[layer.length - 1];
  return last && f >= last[0] ? last : null;
}
// canvas affine [a,b,c,d,e,f]: x'=a*x+c*y+e, y'=b*x+d*y+f
function mul(A, B) {
  return [A[0]*B[0]+A[2]*B[1], A[1]*B[0]+A[3]*B[1], A[0]*B[2]+A[2]*B[3], A[1]*B[2]+A[3]*B[3], A[0]*B[4]+A[2]*B[5]+A[4], A[1]*B[4]+A[3]*B[5]+A[5]];
}
function ap(M, x, y) { return [M[0]*x+M[2]*y+M[4], M[1]*x+M[3]*y+M[5]]; }

function walk(layers, frame, M, bb, depth) {
  if (depth > 12) return;
  for (const layer of layers) {
    const kf = kfAt(layer, frame);
    if (!kf) continue;
    for (const el of kf[2]) {
      if (el[0] === "a") {
        const m = mul(M, [el[2], el[3], el[4], el[5], el[6], el[7]]);
        const a = W.atlas[el[1]]; if (!a) continue;
        const w = a[2], h = a[3];
        for (const [cx, cy] of [[0, 0], [w, 0], [0, h], [w, h]]) {
          const [sx, sy] = ap(m, cx, cy);
          bb.minX = Math.min(bb.minX, sx); bb.maxX = Math.max(bb.maxX, sx);
          bb.minY = Math.min(bb.minY, sy); bb.maxY = Math.max(bb.maxY, sy);
        }
      } else {
        const sub = W.symbols[el[1]]; if (!sub) continue;
        const len = symLen(el[1]), ff = el[2], lc = el[3], elapsed = frame - kf[0];
        const sf = lc === 2 ? ff : lc === 1 ? Math.min(len - 1, ff + elapsed) : (((ff + elapsed) % len) + len) % len;
        walk(sub, sf, mul(M, [el[4], el[5], el[6], el[7], el[8], el[9]]), bb, depth + 1);
      }
    }
  }
}

const mainLen = tlen(W.main);
const bb = { minX: 1e9, minY: 1e9, maxX: -1e9, maxY: -1e9 };
for (let f = 0; f < mainLen; f += 4) walk(W.main, f, [1, 0, 0, 1, 0, 0], bb, 0);
const cx = (bb.minX + bb.maxX) / 2, cy = (bb.minY + bb.maxY) / 2;
const w = bb.maxX - bb.minX, h = bb.maxY - bb.minY;
console.log("mainLen:", mainLen, "frames");
console.log("bbox:", bb.minX.toFixed(0), bb.minY.toFixed(0), bb.maxX.toFixed(0), bb.maxY.toFixed(0));
console.log("size:", w.toFixed(0) + " x " + h.toFixed(0), "| center:", cx.toFixed(0) + "," + cy.toFixed(0));
console.log("=> ox =", (-cx).toFixed(0), " oy =", (-cy).toFixed(0));
console.log("=> to fit 520px tall, scale =", (520 / h).toFixed(3));

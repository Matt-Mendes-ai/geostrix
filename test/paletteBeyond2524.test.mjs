// TASKS.csv #2524 / #2940 — codes past the 16-colour palette got near-identical hashed colours (SC = CAV, GR ~ NS, six violets, seven
// magentas), and sub-divided codes (DID_U, DID_M, DID_L) had nothing in common with their parent (DID)
import test from "node:test";
import assert from "node:assert/strict";
import { colorForLithology, beyondPalette } from "../src/lib/layers.js";

const toRgb = (c) => {
  const m = /^hsl\((\d+), (\d+)%, (\d+)%\)$/.exec(c);
  if (!m) { const x = c.replace("#", ""); return [0, 2, 4].map((i) => parseInt(x.slice(i, i + 2), 16)); }
  const h = +m[1] / 360, s = +m[2] / 100, l = +m[3] / 100;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = (t) => { t = (t + 1) % 1; return 255 * (t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p); };
  return [f(h + 1 / 3), f(h), f(h - 1 / 3)];
};
const dist = (a, b) => { const x = toRgb(a), y = toRgb(b); return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]); };

test("the review's strand codes past the palette are told apart, and a sub-divided code follows its parent", () => {
  const first = ["ALU", "DIW", "CLA", "BNAM", "SONAM", "HNAM", "TNAM", "ONAM", "SNAM", "CID", "DID", "XA", "XB", "XC", "XD", "XE"]; // the 16 palette slots
  first.forEach((c) => colorForLithology(c));
  const later = ["NAM", "SC", "CAV", "DM", "CC", "GR", "NS", "SD", "QV", "PC"];
  const cols = later.map((c) => colorForLithology(c));
  assert.equal(new Set(cols).size, cols.length, "no two identical");
  let worst = Infinity;
  for (let i = 0; i < cols.length; i++) for (let j = i + 1; j < cols.length; j++) worst = Math.min(worst, dist(cols[i], cols[j]));
  assert.ok(worst > 40, `the closest pair is ${worst.toFixed(1)} apart in RGB`);
  // DID_U / DID_M / DID_L: DID's hue, different lightness
  const did = colorForLithology("DID"), subs = ["DID_U", "DID_M", "DID_L"].map((c) => colorForLithology(c));
  assert.equal(new Set(subs).size, 3);
  for (const c of subs) assert.match(c, /^hsl\(/);
  const hueOf = (c) => +/^hsl\((\d+)/.exec(c)[1];
  const parentHue = (() => { const [r, g, b] = toRgb(did).map((v) => v / 255), mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; return h < 0 ? h + 360 : h; })();
  for (const c of subs) assert.ok(Math.abs(hueOf(c) - parentHue) <= 1, `${c} vs ${did}`);
});

test("beyondPalette: deterministic by slot; a parent from another family is not borrowed", () => {
  const cache = new Map(Array.from({ length: 16 }, (_, i) => [`c${i}`, "#000000"]));
  const a = beyondPalette(cache, "zz"); cache.set("zz", a);
  const b = beyondPalette(cache, "yy");
  assert.notEqual(a, b);
  assert.equal(beyondPalette(new Map([...cache].slice(0, 17)), "yy"), b, "the same slot, the same colour");
  assert.match(beyondPalette(cache, "zz_upper"), /^hsl\(/);
});

// TASKS.csv #3946 (Matt's first-time test: "still have steps in the GEM-15") — the gap fill's offset field is solved coarse to fine, so a gap hundreds of nodes wide settles within
// the finest level's sweeps: no constant blocks from the old pull-push start, and close to the fully settled fill. SYNTHETIC: a rolling surface, a rough offset (forest stands), one wide gap.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { deltaField, fillWithDelta } from "../src/lib/gapFill.js";

const W = 420, H = 420;
function scene() {
  let seed = 3; const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const n = W * H, truth = new Float32Array(n), off = new Float32Array(n);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { truth[y * W + x] = 500 + 60 * Math.sin(x / 70) * Math.cos(y / 90) + 15 * Math.sin((x + y) / 25); off[y * W + x] = -12 + 6 * Math.sin(x / 150); }
  for (let k = 0; k < 160; k++) { const cx = Math.floor(rnd() * W), cy = Math.floor(rnd() * H), r = 4 + Math.floor(rnd() * 20), v = (rnd() - 0.3) * 30; for (let y = Math.max(0, cy - r); y < Math.min(H, cy + r); y++) for (let x = Math.max(0, cx - r); x < Math.min(W, cx + r); x++) off[y * W + x] += v; }
  const gap = new Uint8Array(n); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const dx = x - 210, dy = y - 210; if (dx * dx + dy * dy < 170 * 170) gap[y * W + x] = 1; }
  const gem = new Float32Array(n), cop = new Float32Array(n);
  for (let i = 0; i < n; i++) { cop[i] = truth[i] - off[i]; gem[i] = gap[i] ? NaN : truth[i]; }
  return { gem, cop, gap };
}

test("#3946 a wide gap settles: within 0.2 m of the fully relaxed fill after the usual sweeps", () => {
  const { gem, cop, gap } = scene();
  const r = fillWithDelta(gem, cop, W, H), ref = fillWithDelta(gem, cop, W, H, { sweeps: 5000 });
  let mx = 0; for (let i = 0; i < W * H; i++) if (gap[i]) mx = Math.max(mx, Math.abs(r.out[i] - ref.out[i]));
  assert.ok(mx < 0.2, `${mx.toFixed(3)} m from the settled fill`);
  assert.ok(r.iterations <= 80);
});

test("#3946 no constant blocks: inside the gap the offset changes smoothly from node to node", () => {
  const { gem, cop, gap } = scene();
  const { delta } = deltaField(gem, cop, W, H);
  let worst = 0;
  for (let y = 40; y < H - 40; y++) for (let x = 40; x < W - 41; x++) { const i = y * W + x, dx = x - 210, dy = y - 210; if (dx * dx + dy * dy < 120 * 120) worst = Math.max(worst, Math.abs(delta[i + 1] - delta[i]), Math.abs(delta[i + W] - delta[i])); }
  assert.ok(worst < 0.25, `the largest step between neighbours deep inside the gap: ${worst.toFixed(3)} m`);
});

test("#3946 the pull-push start is gone; GEM-15's own steps are said in Help", () => {
  const g = fs.readFileSync(new URL("../src/lib/gapFill.js", import.meta.url), "utf8");
  assert.doesNotMatch(g, /function pullPush/);
  assert.match(g, /a BILINEAR sample of\s*\n?\/\/ the level above/);
  assert.match(fs.readFileSync(new URL("../src/help/pages/geophysics.js", import.meta.url), "utf8"), /its own model has straight steps on flat snow, ice and other low-texture ground, most in the surface band/);
});

test("#3946 the surface option says it holds trees and buildings, and, while chosen, what shows as steps and that bare earth has the same 15 m", () => {
  const m = fs.readFileSync(new URL("../src/modules/GeophysicsModule.jsx", import.meta.url), "utf8");
  assert.match(m, /<option value="gem15dsm">\{tr\("Google GEM-15 surface \(15 m, trees and buildings\)"\)\}<\/option>/);
  assert.match(m, /\{terrainSource === "gem15dsm" && <div data-gem-surface-note=""[^\n]*tr\("Trees, buildings, cut blocks and flat snow or ice show as steps\. GEM-15 bare earth has the same 15 m\."\)/);
});

// TASKS.csv #3950 — the optional smoothing of GEM-15's own steps on flat ground: the straight steps are feathered, real relief is left alone, the change is said, and the code
// loads only when used. SYNTHETIC: plateaus with grid-aligned steps (a 15 m step sampled on ~3 m nodes ramps over ~7 nodes), a hillside and a ridge.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { smoothSteps, stepStrength } from "../src/lib/stepSmooth.js";

const W = 400, H = 400, nodeM = 3;
const ramp = (t) => Math.min(1, Math.max(0, t / 7)); // a 7-node ramp
function scene() {
  const z = new Float32Array(W * H), relief = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (x < 200) { // flat ground with a plateau: steps of 12 m along x = 60 and y = 80, 6 m along x = 140
      let v = 1000 + 0.01 * x + 0.05 * Math.sin(x / 3) * Math.cos(y / 4);
      if (y > 80 && x > 60 && x < 140) v += 12 * ramp(x - 60) * ramp(y - 80);
      if (y > 80 && x >= 140) v += 12 * ramp(y - 80) - 6 * ramp(x - 140);
      z[i] = v;
    } else if (x < 300) { z[i] = 1000 + (x - 200) * nodeM * Math.tan((30 * Math.PI) / 180); relief[i] = 1; } // a 30° hillside
    else { z[i] = 1000 + 173 - Math.abs(x - 350) * nodeM * 0.9 + 0.2 * Math.sin(y / 5); relief[i] = 1; } // a ridge
  }
  return { z, relief };
}

test("#3950 the plateau's straight steps are feathered: step strength falls by most, the change is said, the hillside and the ridge do not move", () => {
  const { z, relief } = scene();
  const before = stepStrength(z, W, H, { nodeM });
  assert.ok(before.steps >= 3 && before.strength > 0, JSON.stringify(before));
  const r = smoothSteps(z, W, H, { nodeM });
  const after = stepStrength(r.out, W, H, { nodeM });
  assert.ok(after.strength < 0.25 * before.strength, `step strength ${before.strength.toFixed(0)} -> ${after.strength.toFixed(0)} m`);
  assert.ok(r.changed > 0 && r.maxM > 0 && r.maxM <= 12 && r.medianM > 0);
  let moved = 0; for (let i = 0; i < W * H; i++) if (relief[i] && Math.abs(r.out[i] - z[i]) > 1e-4) moved++;
  assert.equal(moved, 0, "the hillside and the ridge are left alone");
  // the steps' height difference stays: far from the steps both plateaus keep their heights
  assert.ok(Math.abs(r.out[300 * W + 100] - z[300 * W + 100]) < 1e-4 && Math.abs(r.out[20 * W + 100] - z[20 * W + 100]) < 1e-4);
  assert.ok(Math.abs(r.out[300 * W + 100] - r.out[20 * W + 100]) > 11.5);
});

test("#3950 a window that touches no value is skipped; nothing found, nothing changed; 2 M nodes well under a few seconds", () => {
  const { z } = scene();
  for (let y = 0; y < H; y++) for (let x = 55; x < 58; x++) z[y * W + x] = NaN; // a gap beside the step at x = 60
  const r = smoothSteps(z, W, H, { nodeM });
  for (let y = 0; y < H; y++) for (let x = 55; x < 58; x++) assert.ok(Number.isNaN(r.out[y * W + x]));
  const flat = new Float32Array(W * H).fill(500), r2 = smoothSteps(flat, W, H, { nodeM });
  assert.equal(r2.changed, 0); assert.equal(r2.maxM, 0);
  const big = new Float32Array(1064 * 2049); for (let i = 0; i < big.length; i++) big[i] = 1000 + (i % 1064) * 0.01;
  const t0 = Date.now(); smoothSteps(big, 1064, 2049, { nodeM }); assert.ok(Date.now() - t0 < 4000, `${Date.now() - t0} ms`);
});

test("#3950 wiring: off by default beside a GEM-15 source; on the raw GEM-15 grid before the gap fill; said; Smooth its steps with Undo; loaded on demand", () => {
  const g = fs.readFileSync(new URL("../src/lib/gem15Dem.js", import.meta.url), "utf8"), m = fs.readFileSync(new URL("../src/modules/GeophysicsModule.jsx", import.meta.url), "utf8");
  assert.match(g, /gapFill = "delta", smoothSteps = false \}\)/);
  assert.ok(g.indexOf("smoothGemSteps(out, gridW, gridH") < g.indexOf("fillWithDelta(out, cop.elevations"), "before the gap fill");
  assert.match(g, /\.\.\.\(stepSmooth \? \{ stepSmooth \} : \{\}\)/);
  assert.match(m, /const \[gemSmooth, setGemSmooth\] = useState\(false\);/);
  assert.match(m, /\{\(terrainSource === "gem15" \|\| terrainSource === "gem15dsm"\) && \(/);
  assert.match(m, /source: src, smoothSteps: gem && gemSmooth,/);
  assert.match(m, /if \(parsed\.source\?\.stepSmooth\) msg \+= stepSmoothNote\(parsed\.source\.stepSmooth\);/);
  assert.match(m, /const \{ smoothSteps \} = await import\("\.\.\/lib\/stepSmooth\.js"\);/);
  assert.match(m, /gemOriginal\.current\.set\(terrain\.id, terrain\.elevations\);/);
  assert.match(m, /updateTerrain\(\{ elevations: orig, source: src \}\)/);
  assert.doesNotMatch(m, /^import [^\n]*stepSmooth/m, "never imported at startup");
  for (const f of fs.readdirSync(new URL("../src/", import.meta.url), { recursive: true }).filter((f) => /\.(jsx?|mjs)$/.test(f) && !/gem15Dem\.js$|stepSmooth\.js$/.test(f))) {
    assert.doesNotMatch(fs.readFileSync(new URL(`../src/${f.replace(/\\/g, "/")}`, import.meta.url), "utf8"), /^import [^\n]*stepSmooth/m, f);
  }
});

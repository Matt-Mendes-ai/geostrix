// TASKS.csv #2992 (WA iron review) — Generate contours froze the window 3.3-3.7 s for 32 levels and 6.9-8.4 s for 129 on a 1,025 x 822
// terrain from collars, 98 % fill: every level scanned every cell. The cells with ground are now listed once (with their lowest and
// highest corner) and each level visits only those it can cross, in the same order, so the lines are exactly the same; the fill mask is
// decoded once. SYNTHETIC terrain: ground in four round patches.
import { test } from "node:test";
import assert from "node:assert/strict";
import { contourTerrain, contourLevel, contourCells } from "../src/lib/contours.js";
import { fillNoData } from "../src/lib/demFill.js";

function patches(gw, gh) {
  const el = new Float32Array(gw * gh);
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
    const g = [[0.2, 0.35, 0.04], [0.6, 0.6, 0.05], [0.83, 0.18, 0.03], [0.4, 0.85, 0.035]].some(([cx, cy, r]) => (i / gw - cx) ** 2 + (j / gh - cy) ** 2 < r * r);
    el[j * gw + i] = g ? 420 + 30 * Math.sin(i / 17) * Math.cos(j / 13) + 0.02 * i : NaN;
  }
  const f = fillNoData(el);
  return { bbox: [0, 0, 10000, 8000], gridW: gw, gridH: gh, elevations: f.elevations, noDataMask: f.noDataMask, raw: el };
}

test("the indexed pass gives exactly the full scan's lines, level by level", () => {
  const t = patches(260, 210), terrain = { ...t, elevations: t.raw }; // NaN where there is no ground, as contourTerrain makes it
  const index = contourCells(terrain);
  assert.ok(index.cells.length > 0 && index.cells.length < 0.2 * 259 * 209);
  for (const lv of [400, 410.5, 420, 433, 449.9, 460]) assert.deepEqual(contourLevel(terrain, lv, index), contourLevel(terrain, lv), `level ${lv}`);
});

test("contourTerrain: the same levels through the mask, and much faster than a scan of every cell per level", () => {
  const t = patches(513, 411);
  const r = contourTerrain(t, { interval: 1 });
  assert.ok(r.levels.length >= 50, `${r.levels.length} levels`);
  // the full scan of the old code, on the same NaN terrain and levels (timed in the same run, so a busy machine slows both)
  const terrain = { ...t, elevations: Float64Array.from(t.raw) };
  let t0 = performance.now();
  const full = r.levels.map((l) => ({ level: l.level, polylines: contourLevel(terrain, l.level) }));
  const fullMs = performance.now() - t0;
  t0 = performance.now();
  const again = contourTerrain(t, { interval: 1 });
  const ms = performance.now() - t0;
  assert.deepEqual(again.levels, full);
  assert.ok(ms < 0.5 * fullMs, `indexed ${ms.toFixed(0)} ms against ${fullMs.toFixed(0)} ms for the full scans`);
});

// TASKS.csv #3929 — "Fit at each point" in Match to terrain: a piecewise vertical warp of a section PICTURE through the points clicked on its drawn ground
// (src/lib/sectionWarp.js). A SYNTHETIC picture and terrain only: 1 m per pixel, the drawn ground a wavy line, the terrain that line raised by 10 m and tilted.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { warpPlan, destRow, sourceRow, warpedCorners, warpArray, interp } from "../src/lib/sectionWarp.js";
import { pxToWorld } from "../src/lib/sectionVertical.js";

const W = 200, H = 100;
const im = { width: W, height: H, corners: [[1000, 0, 200], [1200, 0, 200], [1200, 0, 100], [1000, 0, 100]] }; // TL TR BR BL: z 200 at the top, 1 m / px
const g = (x) => 30 + 5 * Math.sin(x / 20); // the drawn ground's row
const terrain = (x) => 200 - g(x) + 10 + 0.05 * x; // the terrain under column x: the drawn ground 10 m low and tilted 5 %
const rows = [20, 70, 120, 180].map((px, i) => ({ id: `p${i}`, px, py: g(px), diff: terrain(px) - (200 - g(px)) }));

test("at every click the drawn ground lands on the terrain; between clicks it follows the straight line between their bends", () => {
  const plan = warpPlan(im, rows, { depthM: 40 });
  assert.ok(!plan.error, plan.error);
  const c = warpedCorners({ ...im }, plan), zTop = c[0][2], mPx = plan.mPerPx;
  const zOfDest = (d) => zTop - d * mPx; // the warped picture's heights, row by row (its corners are extended by the margins)
  for (const r of rows) assert.ok(Math.abs(zOfDest(destRow(plan, r.px, r.py)) - terrain(r.px)) < 1e-9, r.id);
  // halfway between two clicks, the bend is the average of theirs: the tilt is linear, so the fit is exact there too
  assert.ok(Math.abs(zOfDest(destRow(plan, 95, g(95))) - terrain(95)) < 0.2);
  // the rigid part is the mean difference; the corners keep their place along the line
  assert.ok(Math.abs(plan.mean - rows.reduce((t, r) => t + r.diff, 0) / rows.length) < 1e-12);
  assert.deepEqual(c.map((p) => [p[0], p[1]]), [[1000, 0], [1200, 0], [1200, 0], [1000, 0]]);
});

test("the bend fades with depth: below the chosen depth the picture only moves rigidly, so drawn holes stay straight", () => {
  const plan = warpPlan(im, rows, { depthM: 40 });
  const deep = g(60) + plan.fadePx + 5; // a row below the fade
  // below the fade every column moves alike (only the margin and the mean), so a vertical line drawn there stays vertical
  assert.equal(destRow(plan, 20, deep) - destRow(plan, 180, deep), 0);
  // half way down the fade the bend is half
  const s = interp(plan.bend, 120), half = g(120) + plan.fadePx / 2;
  assert.ok(Math.abs((half + plan.upPx - destRow(plan, 120, half)) - s / 2) < 1e-9);
  assert.ok(plan.fadePx >= 2 * Math.max(...plan.bend.map((b) => Math.abs(b.v)))); // no column folds back
});

test("the resampling: sourceRow inverts destRow, and a synthetic picture keeps its pixels", () => {
  const plan = warpPlan(im, rows, { depthM: 30 });
  for (const x of [5, 64.5, 133, 199]) for (const y of [0, 12, g(x), g(x) + 7.5, 80, 99]) {
    const d = destRow(plan, x, y), back = sourceRow(plan, x, d);
    assert.ok(back != null && Math.abs(back - y) < 1e-9, `${x}, ${y}: ${back}`);
  }
  const src = Array.from({ length: W * H }, (_, i) => Math.floor(i / W)); // each pixel holds its row
  const out = warpArray(plan, src);
  assert.equal(out.length, W * plan.newH);
  assert.equal(out.filter((v) => v != null).length >= W * H * 0.98, true); // almost every pixel lands (rounding at the bends' edges)
  assert.equal(out[(H - 1 + plan.upPx) * W + 100], H - 1); // the bottom row, below the fade, stays the bottom row (moved by the margin only)
});

test("residuals: a click off the drawn line stands out by its distance from the straight trend; too few clicks is a plain error", () => {
  const off = rows.map((r) => (r.id === "p1" ? { ...r, diff: r.diff + 15 } : r)); // a click 15 m off
  const plan = warpPlan(im, off, { depthM: 40 });
  const worst = plan.residuals.reduce((a, b) => (Math.abs(b.offTrendM) > Math.abs(a.offTrendM) ? b : a));
  assert.equal(worst.id, "p1");
  assert.ok(Math.abs(worst.offTrendM) > 5);
  assert.ok(warpPlan(im, rows, { depthM: 40 }).residuals.every((r) => Math.abs(r.offTrendM) < 0.5)); // the tilted terrain is a straight trend: no click stands out
  assert.match(warpPlan(im, rows.slice(0, 1)).error, /at least 2 points/);
  assert.ok(Math.abs(pxToWorld(im, 0, 0).z - 200) < 1e-9);
});

test("the terrain is never edited: the warp only returns a picture's corners and pixels", () => {
  const src = readFileSync(new URL("../src/lib/sectionWarp.js", import.meta.url), "utf8");
  assert.doesNotMatch(src, /terrain\s*\.\s*(z|data|values|grid)\s*\[|setTerrain/);
});

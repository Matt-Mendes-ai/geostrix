// TASKS.csv #2983 (WA iron review) — reprojecting the project eroded value grids and the terrain: after GDA94 -> GDA2020 -> GDA94 the Fe
// grid kept 12,455 of 17,479 cells and the terrain lost 22 % of its ground nodes. GDA94 and GDA2020 have the same definition here (no
// shift), so the round trip is an identity: what was lost was the sampling's doing. bilinearSample returns NaN as soon as ONE of its four
// corners is NaN, so every pass ate one node off every no-data edge (and the terrain's filled cells are set to NaN before resampling).
// Value grids and the terrain are now sampled NaN-aware: the finite corners are averaged when the nearest corner is finite. SYNTHETIC.
import { test } from "node:test";
import assert from "node:assert/strict";
import { getProj4DefSync, reprojectGrid, bilinearSample, bilinearSampleNaN } from "../src/lib/reproject.js";
import { reprojectValueGrid, reprojectProject } from "../src/lib/projectReproject.js";
import { f32ToB64, b64ToF32 } from "../src/lib/inversion.js";
import { fillNoData } from "../src/lib/demFill.js";

const GDA94 = getProj4DefSync(28350), GDA2020 = getProj4DefSync(7850);
// a soil-geochem-like grid: values inside an irregular outline, NaN outside, with a NaN hole
function synthGrid(nx = 120, ny = 90) {
  const v = new Float32Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const inside = ((i - 60) / 52) ** 2 + ((j - 45) / 38) ** 2 < 1 && !(((i - 70) / 9) ** 2 + ((j - 40) / 7) ** 2 < 1);
    v[j * nx + i] = inside ? 30 + 20 * Math.sin(i / 9) * Math.cos(j / 7) : NaN;
  }
  return { nx, ny, x0: 400000, yTop: 7400000, dx: 25, dy: 25, values: f32ToB64(v) };
}
const validOf = (g) => b64ToF32(g.values).reduce((n, v) => n + (Number.isFinite(v) ? 1 : 0), 0);

test("the sampler: one NaN corner no longer blanks the sample; a NaN nearest corner still does", () => {
  const band = new Float32Array([1, NaN, 3, 5]); // 2 x 2, row 0 north
  assert.ok(Number.isNaN(bilinearSample(band, 2, 2, 0, 0, 1, 1, 0.2, 0.8))); // the old rule
  assert.ok(Math.abs(bilinearSampleNaN(band, 2, 2, 0, 0, 1, 1, 0.2, 0.8) - (1 * 0.8 * 0.8 + 3 * 0.8 * 0.2 + 5 * 0.2 * 0.2) / (0.64 + 0.16 + 0.04)) < 1e-6);
  assert.ok(Number.isNaN(bilinearSampleNaN(band, 2, 2, 0, 0, 1, 1, 0.9, 0.9))); // nearest is the NaN corner
  const full = new Float32Array([1, 2, 3, 4]);
  assert.equal(bilinearSampleNaN(full, 2, 2, 0, 0, 1, 1, 0.3, 0.6), bilinearSample(full, 2, 2, 0, 0, 1, 1, 0.3, 0.6));
});

test("a value grid keeps its cells through GDA94 -> GDA2020 -> GDA94 (it lost about 29 % before)", () => {
  const g = synthGrid(), before = validOf(g);
  const back = reprojectValueGrid(reprojectValueGrid(g, GDA94, GDA2020), GDA2020, GDA94);
  const after = validOf(back);
  assert.ok(after >= 0.99 * before && after <= 1.01 * before, `${after} of ${before}`);
  // the values where both are finite are unchanged (an identity transform)
  const a = b64ToF32(g.values), b = b64ToF32(back.values);
  let worst = 0;
  for (let k = 0; k < a.length; k++) if (Number.isFinite(a[k]) && Number.isFinite(b[k])) worst = Math.max(worst, Math.abs(a[k] - b[k]));
  assert.ok(worst < 0.5, `worst ${worst}`);
});

test("the old sampler is what eroded it (the bug, reproduced on the same grid)", () => {
  const g = synthGrid(), before = validOf(g);
  const pass = (gg, f, t) => {
    const vals = b64ToF32(gg.values);
    const rp = reprojectGrid({ xmin: gg.x0, xmax: gg.x0 + (gg.nx - 1) * gg.dx, ymax: gg.yTop, ymin: gg.yTop - (gg.ny - 1) * gg.dy, gridW: gg.nx, gridH: gg.ny, band: vals }, f, t, gg.nx, gg.ny);
    const [bx0, by0, bx1, by1] = rp.bbox;
    return { ...gg, x0: bx0, yTop: by1, dx: (bx1 - bx0) / (gg.nx - 1), dy: (by1 - by0) / (gg.ny - 1), values: f32ToB64(rp.elevations) };
  };
  let h = g;
  for (let r = 0; r < 2; r++) h = pass(pass(h, GDA94, GDA2020), GDA2020, GDA94);
  assert.ok(validOf(h) < 0.95 * before, `old sampler kept ${validOf(h)} of ${before}`);
});

test("the terrain keeps its ground nodes through the round trip", () => {
  const W = 100, H = 80, el = new Float32Array(W * H);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) el[j * W + i] = ((i - 50) / 46) ** 2 + ((j - 40) / 36) ** 2 < 1 ? 400 + 30 * Math.sin(i / 11) : NaN;
  const ground = el.reduce((n, v) => n + (Number.isFinite(v) ? 1 : 0), 0);
  const fill = fillNoData(el); // as a terrain is stored: filled, with the no-data mask
  const terrain = { bbox: [400000, 7397500, 402475, 7399475], gridW: W, gridH: H, elevations: fill.elevations, noDataMask: fill.noDataMask };
  const live = { terrain, project: { epsg: 28350 } };
  const once = reprojectProject(live, 28350, 7850).fields;
  const twice = reprojectProject({ ...live, terrain: once.terrain }, 7850, 28350).fields;
  const t2 = twice.terrain;
  // a node is ground unless the no-data mask says it was filled
  const mask = t2.noDataMask ? Uint8Array.from(Buffer.from(t2.noDataMask, "base64")) : null;
  let kept = 0;
  for (let k = 0; k < t2.elevations.length; k++) if (Number.isFinite(t2.elevations[k]) && !(mask && (mask[k >> 3] >> (k & 7)) & 1)) kept++;
  assert.ok(kept >= 0.99 * ground, `${kept} of ${ground} ground nodes`);
});

// TASKS.csv #873 — stack order of a dipping top and base picked over different footprints
import { test } from "node:test";
import assert from "node:assert/strict";
import { stackOrder, heightGrid } from "../src/lib/stackOrder.js";
import { surfacesToBlock } from "../src/lib/surfaceSolids.js";
import { splitByElevation } from "../src/lib/explicitUnits.js";

const t30 = Math.tan((30 * Math.PI) / 180);
const zA = (x) => 1000 - t30 * x, zB = (x) => zA(x) - 50;
const sheet = (id, x0, x1, zf, role) => ({ id, name: id, unit: "Sst", role, positions: Float64Array.from([x0, 0, zf(x0), x1, 0, zf(x1), x1, 300, zf(x1), x0, 300, zf(x0)]), indices: Uint32Array.from([0, 1, 2, 0, 2, 3]) });
// the #855 review's pair: top over x 200-800, base over x 0-600, both dipping 30 deg E, 50 m apart
const A = sheet("top", 200, 800, zA, "top"), B = sheet("base", 0, 600, zB, "base");

test("#873 the median puts the base first; the pairwise order puts the top first", () => {
  const med = (s) => [...s.positions].filter((_, i) => i % 3 === 2).sort((p, q) => p - q)[2];
  assert.ok(med(B) > med(A), "the review's trap: the base's median is the higher one");
  const r = stackOrder([B, A]);
  assert.deepEqual(r.order, ["top", "base"]);
  assert.equal(r.pairs, 1, "compared on the columns both cover");
});

test("#873 in that order Solid blocks codes nothing below the base", () => {
  const extent = [0, 800, 0, 300, 400, 1050], cell = 10;
  const { order } = stackOrder([B, A]);
  const r = surfacesToBlock({ tops: order.map((id) => (id === "top" ? A : B)), extent, cell });
  const { resolution: [, ny, nz], ids, labels } = r.block;
  const at = (x, y, z) => { const i = Math.floor(x / cell), j = Math.floor(y / cell), k = Math.floor((z - 400) / cell); const id = ids[i * ny * nz + j * nz + k]; return id === 0 ? "outside" : labels[id - 1]; };
  let below = 0, between = 0;
  for (let z = 405; z < zB(400); z += cell) if (at(400, 150, z) === "Sst") below++;
  for (let z = zB(400) + 5; z < zA(400); z += cell) if (at(400, 150, z) === "Sst") between++;
  assert.equal(below, 0);
  assert.equal(between, 5);
});

test("#873 a pair with no shared column falls back to the medians; heightGrid is NaN off the surface", () => {
  const far = sheet("far", 2000, 2100, () => 50, "top");
  assert.deepEqual(stackOrder([far, A]).order, ["top", "far"]);
  const H = heightGrid(A.positions, A.indices, [0, 800, 0, 300], 8);
  assert.ok(Number.isNaN(H[0]) && Math.abs(H[7] - zA(750)) < 1e-6);
});

test("#873 splitByElevation follows ranks: one layer, not two", () => {
  const { rank } = stackOrder([B, A]);
  const byMedian = splitByElevation([{ id: "top", contact: "upper", z: 711 }, { id: "base", contact: "lower", z: 777 }]);
  assert.notEqual(byMedian.top, byMedian.base, "the old behaviour: two layers");
  const byRank = splitByElevation([{ id: "top", contact: "upper", z: 711, rank: rank.top }, { id: "base", contact: "lower", z: 777, rank: rank.base }]);
  assert.deepEqual(byRank, { top: "A", base: "A" });
});

import { thicknessBetween } from "../src/lib/stackOrder.js";
test("#896 thickness between a top and a base: min / mean / max on the shared columns, and where they cross", () => {
  const sheet = (zf) => ({ positions: Float64Array.from([0, 0, zf(0), 100, 0, zf(100), 100, 100, zf(100), 0, 100, zf(0)]), indices: Uint32Array.from([0, 1, 2, 0, 2, 3]) });
  const r = thicknessBetween(sheet(() => 100), sheet((x) => 70 + 0.2 * x), { n: 50 }); // base rises from 70 to 90 m: 30 to 10 m thick
  assert.ok(Math.abs(r.min - 10) < 0.5 && Math.abs(r.max - 30) < 0.5 && Math.abs(r.mean - 20) < 0.5, JSON.stringify(r));
  assert.equal(r.negativePct, 0);
  const x = thicknessBetween(sheet(() => 100), sheet((x) => 80 + 0.4 * x), { n: 50 }); // base crosses the top at x = 50
  assert.ok(x.negativePct > 45 && x.negativePct < 55 && x.min < 0, JSON.stringify(x));
  assert.equal(thicknessBetween(sheet(() => 1), { positions: Float64Array.from([500, 500, 0, 600, 500, 0, 600, 600, 0]), indices: Uint32Array.from([0, 1, 2]) }, { n: 10 }), null);
});

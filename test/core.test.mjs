// TASKS.csv #443 — calculator, spread-safe min/max, stereonet fabric, IDW, reprojection (run: npm test).
import test from "node:test";
import assert from "node:assert/strict";
import { compileCalc } from "../src/lib/calcExpr.js";
import { arrMin, arrMax } from "../src/lib/arrayStats.js";
import { fisherStats, fabricShape } from "../src/lib/stereonet.js";
import { idwGrid } from "../src/lib/idw.js";
import { reprojectXY } from "../src/lib/reproject.js";

test("#344 field calculator evaluates arithmetic and never runs code from column names", () => {
  const cols = ["Au_ppm", "Ag", "{x=globalThis.PWNED=1}"];
  const row = { Au_ppm: 2, Ag: "30", "{x=globalThis.PWNED=1}": 5 };
  assert.equal(compileCalc("Au_ppm + Ag*0.01", cols)(row), 2.3);
  assert.equal(compileCalc("-Au_ppm^2", cols)(row), -4);
  assert.equal(compileCalc("max(Au_ppm, Ag, 1)", cols)(row), 30);
  assert.ok(Number.isNaN(compileCalc("Au_ppm * 2", ["Au_ppm"])({})));
  for (const bad of ["alert(1)", "constructor", "__proto__", "Au_ppm;1", "Au_ppm)"]) assert.throws(() => compileCalc(bad, cols), bad);
  assert.equal(globalThis.PWNED, undefined);
});

test("#371 arrMin/arrMax match Math.min/max and survive 1M values", () => {
  assert.equal(arrMin([5, 2, 9]), Math.min(5, 2, 9));
  assert.equal(arrMax([]), -Infinity);
  assert.ok(Number.isNaN(arrMin([1, NaN])));
  const big = Float64Array.from({ length: 1e6 }, (_, i) => Math.sin(i) * i);
  assert.ok(arrMin(big) < -999000 && arrMax(big) > 999000);
});

test("#425 open folds are girdles, clusters stay clusters", () => {
  const limbs = (a) => a.map((x) => ({ dip: Math.abs(x), azimuth: x >= 0 ? 90 : 270 }));
  for (const set of [[30, -30], [40, -40], [60, -20]]) {
    const f = fisherStats(limbs([...Array(10).fill(set[0]), ...Array(10).fill(set[1])]));
    assert.equal(fabricShape(f.s1, f.s2, f.s3).shape, "girdle", set.join("/"));
  }
  const tight = fisherStats(Array.from({ length: 20 }, (_, i) => ({ dip: 45 + (i % 3), azimuth: 90 + (i % 4) })));
  assert.equal(fabricShape(tight.s1, tight.s2, tight.s3).shape, "cluster");
});

test("#370 IDW bucket search equals a brute-force nearest-k scan", () => {
  let seed = 3; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const pts = Array.from({ length: 400 }, () => ({ x: rnd() * 1000, y: rnd() * 1000, value: rnd() * 100 }));
  const box = { xmin: 0, ymin: 0, xmax: 1000, ymax: 1000, cellSize: 40, maxPoints: 8 };
  const { gridW, gridH, values } = idwGrid(pts, box);
  for (let row = 0; row < gridH; row += 5) for (let col = 0; col < gridW; col += 5) {
    const cx = (col + 0.5) * 40, cy = 1000 - (row + 0.5) * 40;
    const near = pts.map((p) => ({ d: Math.hypot(p.x - cx, p.y - cy), v: p.value })).sort((a, b) => a.d - b.d).slice(0, 8);
    let w = 0, s = 0; for (const n of near) { const k = 1 / n.d ** 2; w += k; s += k * n.v; }
    assert.ok(Math.abs(values[row * gridW + col] - s / w) < 1e-3, `${row},${col}`);
  }
});

test("#416 reprojection still gives the same coordinates", () => {
  const p = reprojectXY(-130.1, 56.5, 4326, 3156);
  assert.ok(Math.abs(p.x - 432287.3539) < 0.01 && Math.abs(p.y - 6262271.5643) < 0.01);
});

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

import proj4 from "proj4";
import { reprojectGrid, bilinearSample, getProj4DefSync } from "../src/lib/reproject.js";
test("#450 approximate grid warp matches exact per-pixel projection", () => {
  const N = 300, from = getProj4DefSync(4326), to = getProj4DefSync(32609);
  const src = { xmin: -131, ymin: 56, xmax: -130, ymax: 57, gridW: N, gridH: N, band: new Float32Array(N * N).map((_, i) => Math.sin((i % N) / 7) * 100 + ((i / N) | 0)) };
  const a = reprojectGrid(src, from, to, N, N);
  const multi = reprojectGrid({ ...src, band: undefined, bands: [src.band] }, from, to, N, N);
  const [txmin, tymin, txmax, tymax] = a.bbox, inv = proj4(to, from);
  let maxd = 0;
  for (let row = 0; row < N; row += 7) for (let col = 0; col < N; col++) {
    const [lon, lat] = inv.forward([txmin + (col / (N - 1)) * (txmax - txmin), tymax - (row / (N - 1)) * (tymax - tymin)]);
    const v = bilinearSample(src.band, N, N, src.xmin, src.ymin, src.xmax, src.ymax, lon, lat);
    const got = a.elevations[row * N + col];
    if (v !== null && !Number.isNaN(got)) maxd = Math.max(maxd, Math.abs(got - v));
    assert.ok(Object.is(multi.bandsOut[0][row * N + col], got));
  }
  assert.ok(maxd < 0.05, `max diff ${maxd}`);
});

import { azimuthToGridOffset } from "../src/lib/azimuthRef.js";
test("#396 azimuth reference offsets at the Harry property", () => {
  const x = 463333, y = 6178148;
  assert.equal(azimuthToGridOffset("grid", x, y, 3156).offset, 0);
  const t = azimuthToGridOffset("true", x, y, 3156);
  assert.ok(Math.abs(t.offset - 0.483) < 0.01, `convergence ${t.offset}`); // textbook gamma = atan(tan(dlon) sin(lat)) -> 0.483
  const m = azimuthToGridOffset("magnetic", x, y, 3156, "2026-09-01");
  assert.ok(m.declination > 17 && m.declination < 18, `declination ${m.declination}`);
  assert.equal(azimuthToGridOffset("magnetic", x, y, 3156, ""), null); // no date, no guess
  assert.equal(azimuthToGridOffset("magnetic", x, y, 3156, "1850-01-01"), null); // outside IGRF
});

import { orientFromAlphaBeta, alphaBetaFromPole, poleFromDipDD, holeDirection, referenceLine } from "../src/lib/coreOrientation.js";
test("#427 alpha/beta -> dip/dip direction round-trips through the forward model", () => {
  for (const [hAz, hDip, dd, dip] of [[90, 60, 270, 45], [0, 55, 120, 70], [215, 75, 30, 20], [45, 50, 225, 85]]) {
    const hd = holeDirection(hAz, hDip), rl = referenceLine(hd, false);
    const { alphaDeg, betaDeg } = alphaBetaFromPole(poleFromDipDD(dd, dip), hd, rl);
    const r = orientFromAlphaBeta({ alphaDeg, betaDeg, holeAzDeg: hAz, holeDipDeg: hDip });
    assert.ok(Math.abs(r.dipDeg - dip) < 1e-6 && Math.abs(((r.dipDirDeg - dd + 540) % 360) - 180) < 1e-6, JSON.stringify({ hAz, hDip, dd, dip, r }));
  }
  assert.ok(orientFromAlphaBeta({ alphaDeg: 40, betaDeg: 100, holeAzDeg: 0, holeDipDeg: 89.5 }).error); // near-vertical: refused
});

import { unitAt, unitVolumes, checkAgainstLogs } from "../src/lib/modelCheck.js";
test("#356 model check: block lookup (z fastest), volumes, logged-vs-modelled metres", () => {
  // 2 x 1 x 4 block over x 0..200, y 0..100, z -400..0; ids per column (z fastest): 3,2,2,1 bottom->top
  const block = { extent: [0, 200, 0, 100, -400, 0], resolution: [2, 1, 4], ids: [3, 2, 2, 1, 3, 3, 2, 1], labels: [null, "DACT", "VCL"] };
  assert.equal(unitAt(block, 50, 50, -50), null);
  assert.equal(unitAt(block, 50, 50, -150), "DACT");
  assert.equal(unitAt(block, 150, 50, -250), "VCL");
  assert.equal(unitAt(block, 250, 50, -50), undefined);
  const v = Object.fromEntries(unitVolumes(block).map((u) => [u.name, u.volume]));
  assert.equal(v.DACT, 3 * 100 * 100 * 100);
  const r = checkAgainstLogs(block, [{ hole_id: "A", x: 50, y: 50, z: -150, metres: 10, logged: "DACT" }, { hole_id: "A", x: 150, y: 50, z: -250, metres: 5, logged: "DACT" }, { hole_id: "B", x: 999, y: 0, z: 0, metres: 2, logged: "VCL" }]);
  assert.deepEqual([r.total, r.matched, r.outside], [15, 10, 2]);
  assert.equal(r.units[0].mostOftenModelledAs, "VCL");
});

import { magColorRGB } from "../src/lib/layers.js";
test("#382 default ramp rises monotonically in lightness (CIE L*)", () => {
  const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const Lstar = ([r, g, b]) => { const Y = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b); return Y > 0.008856 ? 116 * Math.cbrt(Y) - 16 : 903.3 * Y; };
  let prev = -1;
  for (let i = 0; i <= 50; i++) { const L = Lstar(magColorRGB(i, 0, 50)); assert.ok(L >= prev - 0.5, `L* dropped at ${i}: ${prev} -> ${L}`); prev = L; }
  assert.ok(Lstar(magColorRGB(50, 0, 50)) - Lstar(magColorRGB(0, 0, 50)) > 60);
});

import { makeStretch } from "../src/lib/idw.js";
test("#372 colour stretch: percentile clip resists outliers, equalise is rank-uniform", () => {
  const vals = Array.from({ length: 1000 }, (_, i) => i % 100).concat([100000]); // one intrusive high
  const lin = makeStretch(vals, "linear"), p = makeStretch(vals, "p2-98"), eq = makeStretch(vals, "equalise");
  assert.ok(lin.t(99) < 0.001, "linear squeezes the real range into ~0");
  assert.ok(p.t(50) > 0.4 && p.t(50) < 0.6 && p.t(100000) === 1);
  assert.ok(Math.abs(eq.t(50) - 0.5) < 0.02);
  assert.equal(makeStretch([NaN, NaN]).lo, null);
});

// TASKS.csv #3673 — the grade shell's envelope mode (lib/viewer/shellEnvelope.js, the worker's post in shellPost.js, the run's wiring).
// Synthetic data only.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { indicatorPoints, envelopeSearch, cleanField, taubinSmooth, coarsenFactor, coarsenField, ENVELOPE_RANGES, chooseShell, AUTO_ENVELOPE_SHARE } from "../src/lib/viewer/shellEnvelope.js";
import { shellPost } from "../src/lib/viewer/shellPost.js";
import { estimateDenseGrid } from "../src/lib/estimation.js";

// a dipping mineralized sheet (60° towards 090) cut by 25 holes 40 m apart; inside it two thirds of the composites are at or above the cut-off
// (the dilution), outside a few stray high ones
const rad = Math.PI / 180, dipN = { x: Math.sin(60 * rad), y: 0, z: Math.cos(60 * rad) };
const comps = [];
for (let hx = 0; hx < 5; hx++) for (let hy = 0; hy < 5; hy++) {
  const id = `H${hx}${hy}`;
  for (let d = 0; d < 160; d += 2) {
    const x = hx * 40 - 80, y = hy * 40 - 80, z = 60 - d, off = x * dipN.x + z * dipN.z; // signed distance to the sheet's mid-plane
    const inSheet = Math.abs(off) < 12, k = (hx * 7 + hy * 3 + d) % 3;
    comps.push({ hole_id: id, x, y, z, length: 2, value: inSheet ? (k === 0 ? 0.12 : 0.8) : (d % 37 === 0 ? 0.6 : 0.05) });
  }
}

test("indicators at the cut-off, and the envelope's search along the plane of the composites at it", () => {
  const ind = indicatorPoints(comps, 0.3);
  assert.equal(ind.length, comps.length);
  assert.deepEqual([...new Set(ind.map((p) => p.value))].sort(), [0, 1]);
  const at = comps.filter((p) => p.value >= 0.3).filter((p) => Math.abs(p.x * dipN.x + p.z * dipN.z) < 12);
  const se = envelopeSearch(at, 40);
  assert.ok(Math.abs(se.trend.dip - 60) < 6, `dip ${se.trend.dip}`);
  assert.deepEqual(se.axesM, [ENVELOPE_RANGES.major * 40, ENVELOPE_RANGES.semi * 40, ENVELOPE_RANGES.minor * 40]);
  assert.equal(envelopeSearch(at.slice(0, 10), 40), null, "too few: a sphere");
  assert.equal(envelopeSearch(at, 0), null);
});

test("clean-up: a small part held by one hole is dropped, one two holes agree on is kept, a void is filled", () => {
  const nx = 12, ny = 12, nz = 12, v = new Float64Array(nx * ny * nz), at = (i, j, k) => i + nx * (j + ny * k);
  for (let i = 2; i < 9; i++) for (let j = 2; j < 9; j++) for (let k = 2; k < 9; k++) v[at(i, j, k)] = 1; // the body
  v[at(5, 5, 5)] = 0; // a void inside it
  v[at(10, 10, 10)] = 1; // a one-node blob
  v[at(10, 1, 1)] = 1; // another, held by two holes
  const grid = { nx, ny, nz, origin: { x: 0, y: 0, z: 0 }, cellSize: { dx: 10, dy: 10, dz: 10 } };
  const keep = [{ x: 100, y: 10, z: 10, hole_id: "A" }, { x: 100, y: 10, z: 10, hole_id: "B" }, { x: 100, y: 100, z: 100, hole_id: "A" }];
  const r = cleanField(v, grid, 0.5, { keepPoints: keep });
  assert.equal(r.values[at(10, 10, 10)] < 0.5, true, "the one-hole blob dropped");
  assert.equal(r.values[at(10, 1, 1)] >= 0.5, true, "the two-hole lens kept");
  assert.equal(r.values[at(5, 5, 5)] >= 0.5, true, "the void filled");
  assert.deepEqual([r.report.parts, r.report.dropped, r.report.voids], [3, 1, 1]);
  assert.equal(v[at(10, 10, 10)], 1, "the input is not changed");
});

test("Taubin smoothing keeps the volume and leaves an open edge where it is", () => {
  // a closed blocky field -> marching cubes -> smoothed
  const nx = 14, v = new Float64Array(nx ** 3);
  for (let i = 3; i < 11; i++) for (let j = 3; j < 11; j++) for (let k = 3; k < 11; k++) v[i + nx * (j + nx * k)] = 1;
  const post = shellPost({ nx, ny: nx, nz: nx, origin: { x: 0, y: 0, z: 0 }, cellSize: { dx: 1, dy: 1, dz: 1 }, values: v }, { iso: 0.5, closeOutside: true, envelope: { smooth: { iterations: 10 } } });
  const raw = shellPost({ nx, ny: nx, nz: nx, origin: { x: 0, y: 0, z: 0 }, cellSize: { dx: 1, dy: 1, dz: 1 }, values: v }, { iso: 0.5, closeOutside: true });
  const vol = (P, F) => { let s = 0; for (let f = 0; f < F.length; f += 3) { const a = 3 * F[f], b = 3 * F[f + 1], c = 3 * F[f + 2]; s += (P[a] * (P[b + 1] * P[c + 2] - P[b + 2] * P[c + 1]) - P[a + 1] * (P[b] * P[c + 2] - P[b + 2] * P[c]) + P[a + 2] * (P[b] * P[c + 1] - P[b + 1] * P[c])) / 6; } return Math.abs(s); };
  const v0 = vol(raw.positions, raw.faces), v1 = vol(post.positions, post.faces);
  assert.ok(Math.abs(v1 - v0) / v0 < 0.05, `${v0} -> ${v1}`);
  assert.notDeepEqual([...post.positions.slice(0, 9)], [...raw.positions.slice(0, 9)], "smoothed");
  // an open strip: its boundary vertices stay
  const P = Float64Array.from([0, 0, 0, 1, 0, 0, 2, 0, 0, 0, 1, 0, 1, 1, 1, 2, 1, 0]), F = Uint32Array.from([0, 1, 3, 1, 4, 3, 1, 2, 4, 2, 5, 4]);
  assert.deepEqual([...taubinSmooth(P, F)], [...P]);
});

test("decimation by the field: the factor from the triangle count, the averaged grid", () => {
  assert.equal(coarsenFactor(90000, 100000), 1);
  assert.equal(coarsenFactor(400000, 100000), 2);
  assert.equal(coarsenFactor(500000, 100000), 3);
  const g = { nx: 4, ny: 2, nz: 2, origin: { x: 0, y: 0, z: 0 }, cellSize: { dx: 10, dy: 10, dz: 10 } };
  const v = Float64Array.from({ length: 16 }, (_, i) => (i % 4 < 2 ? 1 : NaN));
  const c = coarsenField(v, g, 2);
  assert.deepEqual([c.grid.nx, c.grid.ny, c.grid.nz, c.grid.cellSize.dx, c.grid.origin.x], [2, 1, 1, 20, 5]);
  assert.equal(c.values[0], 1);
  assert.ok(Number.isNaN(c.values[1]), "no finite node: NaN");
});

test("on the sheet: the envelope is one body that keeps the dilution; the grades inside are the composites'", () => {
  const at = comps.filter((p) => p.value >= 0.3 && Math.abs(p.x * dipN.x + p.z * dipN.z) < 12);
  const se = envelopeSearch(at, 40);
  const bounds = { xmin: -110, xmax: 110, ymin: -110, ymax: 110, zmin: -120, zmax: 80 }, cellSize = { dx: 10, dy: 10, dz: 10 };
  const g = estimateDenseGrid(indicatorPoints(comps, 0.3), { bounds, cellSize, method: "idw2", searchRadius: se.majorM, minSamples: 1, maxSamples: 32, minHoles: 1, trend: { basis: se.basis, scales: se.scales } });
  const out = shellPost(g, { iso: 0.5, closeOutside: true, inShellPoints: at.map((p) => ({ ...p, value: 1 })), envelope: { clean: { keepPoints: at }, targetTriangles: 100000, smooth: { iterations: 10 }, gradePoints: comps, cutoff: 0.3 } });
  assert.ok(out.faces.length > 0);
  assert.equal(out.envelope.coarsen, 1);
  const e = out.envelope.grades;
  assert.ok(e.n > 0 && e.atCut < e.n, "the dilution is kept inside");
  assert.ok(e.atCut / e.n > 0.5, `${e.atCut} / ${e.n}`);
  assert.ok(out.inShell.inside / out.inShell.above > 0.7, `${out.inShell.inside} / ${out.inShell.above}`);
  assert.ok(out.envelope.clean.kept >= 1);
});

test("the wiring: the default envelope, the tight shell a choice; the pane; the record", () => {
  const r = readFileSync(new URL("../src/modules/viewer/modellingRuns.js", import.meta.url), "utf8");
  assert.match(r, /return m === "envelope" \|\| m === "tight" \? m : "auto";/);
  assert.match(r, /envelopeMode = shellPref !== "tight" && !anisotropy\.enabled && !numSrc\?\.logScale/);
  assert.match(r, /const boxChoice = gridBoxes\.map\(\(b\) => \(envLib && workerPost \? envLib\.chooseShell\(b\.idx\.map\(\(k\) => gridPoints\[k\]\), numericCutoff, shellPref\)/);
  assert.match(r, /runEstimation\("dense", envBox\[bi\] \? indPoints : estPoints,/);
  assert.match(r, /planeLib && !envBox\[bi\] \? planeLib\.shellPlaneSearch/);
  assert.match(r, /maxSamples: envBox\[bi\] \? envLib\.ENVELOPE_MAX_SAMPLES : 16/);
  assert.match(r, /minHoles: envBox\[bi\] \? 1 : Math\.max\(1, numericMinHoles\)/);
  assert.match(r, /shellByArea: boxChoice\.map/);
  const p = readFileSync(new URL("../src/modules/viewer/ModellingPanes.jsx", import.meta.url), "utf8");
  assert.match(p, /<option value="auto">\{tr\("Automatic \(by the drilling\)"\)\}<\/option>/);
  assert.match(p, /<option value="envelope">\{tr\("Envelope \(a domain\)"\)\}<\/option>/);
  assert.match(p, /return m === "tight" \|\| m === "envelope" \? m : "auto";/);
  assert.match(p, /shellMode !== "envelope" && <>\{\/\* TASKS\.csv #3655/);
  const s = readFileSync(new URL("../src/lib/viewer/shellPost.js", import.meta.url), "utf8");
  assert.match(s, /const cleaned = env\?\.clean \? cleanField\(cut\.values, grid, iso, env\.clean\) : null/);
});

// Main's decision: Automatic by the share of an area's composites at the cut-off
test("Automatic: a disseminated sheet at a low cut-off gets the envelope, a narrow high-grade zone the tight shell", () => {
  assert.equal(AUTO_ENVELOPE_SHARE, 1 / 3);
  // a thick disseminated body most of the drilling is in: 0.6 g/t with a third of its composites at 0.1 (the dilution), barren below 150 m
  const dissem = [];
  for (let h = 0; h < 10; h++) for (let d = 0; d < 200; d += 2) dissem.push({ hole_id: `D${h}`, x: h * 40, y: 0, z: -d, value: d >= 150 ? 0.02 : (d + h) % 6 < 2 ? 0.1 : 0.6 });
  const sheet = chooseShell(dissem, 0.3);
  assert.equal(sheet.mode, "envelope", `share ${sheet.share}`);
  assert.ok(sheet.share >= 1 / 3);
  // a narrow high-grade zone: 2 m in every 40 m of hole at 15, the rest 0.2
  const narrow = [];
  for (let h = 0; h < 10; h++) for (let d = 0; d < 200; d += 2) narrow.push({ hole_id: `N${h}`, x: h * 30, y: 0, z: -d, value: d % 40 === 0 ? 15 : 0.2 });
  const n = chooseShell(narrow, 5);
  assert.equal(n.mode, "tight");
  assert.ok(n.share < 0.1, `share ${n.share}`);
  // forced
  assert.equal(chooseShell(narrow, 5, "envelope").mode, "envelope");
  assert.equal(chooseShell(dissem, 0.3, "tight").mode, "tight");
  assert.deepEqual(chooseShell([], 1), { mode: "tight", share: null });
  assert.equal(chooseShell([{ value: 1 }, { value: 1 }, { value: 0 }], 1).mode, "envelope", "two thirds");
  assert.equal(chooseShell([{ value: 1 }, { value: 0 }, { value: 0 }, { value: 0 }], 1).mode, "tight", "a quarter");
});

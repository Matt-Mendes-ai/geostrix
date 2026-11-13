// TASKS.csv #3144 (the rest of #3117 / #3055, WA iron) — a level of detail for assays drawn along the hole: when a typical sample is a few
// pixels on screen, a hole's consecutive same-colour samples are one marker. Built the first time it is needed, switched with a margin,
// never picked while hidden, and it keeps the holes hidden in the Holes list.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as THREE from "three";
import { sampleRuns, runSize, typicalSampleM, lodWanted, LOD_ON_PX, LOD_OFF_PX } from "../src/lib/viewer/assayLod.js";
import { syncAssayElements, setAssayLod, assayLodTick } from "../src/lib/viewer/assayKeep.js";
import { makeAssayBatcher } from "../src/lib/viewer/assayBatcher.js";
import { buildLayerBatches, eachPickTarget, batchTag } from "../src/lib/viewer/layerBatches.js";
import { assayProto, placeAssayMarker } from "../src/lib/viewer/assayShape.js";
import { traceLookup } from "../src/lib/viewer/modelHelpers.js";

const row = (from, to, fe, extra = {}) => ({ from, to, values: { Fe: fe }, ...extra });
const colour = (v) => (v == null ? null : v >= 55 ? "#7a2e00" : v >= 40 ? "#d98b2b" : v >= 0 ? "#f2e3c4" : null);

test("runs: consecutive samples of one colour merge; a gap, a new colour, a missing value or a pXRF reading breaks them", () => {
  const rows = [row(4, 6, 57), row(0, 2, 30), row(2, 4, 35), row(6, 8, 60), row(8.5, 10, 61), row(10, 12, null), row(12, 14, 62), row(14, 14, 63, { px: true }), row(14, 16, 64)];
  const runs = sampleRuns(rows, "Fe", colour, (r) => !!r.px);
  assert.deepEqual(runs.map((r) => [r.from, r.to, r.rows.length, r.px]), [[0, 4, 2, false], [4, 8, 2, false], [8.5, 10, 1, false], [12, 14, 1, false], [14, 14, 1, true], [14, 16, 1, false]]);
  assert.deepEqual([runs[1].lo, runs[1].hi], [57, 60]);
  assert.equal(runSize({ rows: [row(0, 1, 1), row(1, 4, 1)] }, (r) => (r.to - r.from === 1 ? 1 : 3)), 2.5, "length-weighted");
});

test("the switch: a typical sample under 3 px goes coarse, back above 4.5 px (no flicker at the threshold)", () => {
  assert.equal(typicalSampleM([row(0, 2, 1), row(2, 4, 1), row(4, 7, 1)]), 2);
  assert.equal(typicalSampleM([]), null);
  assert.equal(lodWanted(2, 2 / (LOD_ON_PX - 0.1), false), true);
  assert.equal(lodWanted(2, 2 / (LOD_ON_PX + 0.5), false), false);
  assert.equal(lodWanted(2, 2 / (LOD_ON_PX + 0.5), true), true, "stays coarse inside the margin");
  assert.equal(lodWanted(2, 2 / (LOD_OFF_PX + 0.1), true), false);
  assert.equal(lodWanted(null, 1, false), false);
});

// one element's full and coarse sets through the real batcher, kept by syncAssayElements
const at = traceLookup([{ md: 0, x: 0, y: 100, z: 0 }, { md: 200, x: 0, y: -100, z: 0 }]).at;
const holes = { A: Array.from({ length: 60 }, (_, i) => row(i * 2, i * 2 + 2, i < 30 ? 30 : 60)), B: Array.from({ length: 60 }, (_, i) => row(i * 2, i * 2 + 2, 45)) };
const full = (sym, into) => { const b = makeAssayBatcher(); for (const [h, rows] of Object.entries(holes)) for (const r of rows) b.add(assayProto("trace"), { color: colour(r.values.Fe) }, (t) => placeAssayMarker(t, "trace", at, r, 1, 0, 0), () => ({ holeId: h, tip: `${h} ${r.from}` })); b.finish(into); buildLayerBatches(into); };
let coarseBuilds = 0;
const coarse = (sym, into, offX, offZ) => { coarseBuilds++; const b = makeAssayBatcher({ minBatch: 1 }); for (const [h, rows] of Object.entries(holes)) for (const run of sampleRuns(rows, "Fe", colour)) b.add(assayProto("trace"), { color: run.color }, (t) => placeAssayMarker(t, "trace", at, run, 1, offX, offZ), () => ({ holeId: h, tip: `${h} run ${run.rows.length}` })); b.finish(into); };

test("built the first time it is needed; one set drawn at a time; the hidden set is not picked and the pick tag changes", () => {
  const g = new THREE.Group(), kept = new Map();
  kept.lodSampleM = 2;
  syncAssayElements(g, kept, [{ sym: "Fe", key: ["k"], offX: 0, offZ: 0, buildCoarse: coarse }], full);
  const k = kept.get("Fe");
  assert.equal(coarseBuilds, 0, "not built while the view is close");
  const fullCount = k.kids.reduce((n, c) => n + (c.userData.compact?.rows.length || 0), 0);
  assert.equal(fullCount, 120);
  const picks = () => { const out = []; eachPickTarget(g, (c) => out.push(c)); return out; };
  const tagsBefore = g.children.map(batchTag).join();
  assayLodTick(g, kept, 1); // 2 m samples at 1 m/px: 2 px -> coarse
  assert.equal(coarseBuilds, 1);
  assert.equal(g.userData.lodOn, true);
  const runs = k.coarse.reduce((n, c) => n + c.userData.compact.rows.length, 0);
  assert.equal(runs, 3, "hole A: two runs (30 %, 60 %), hole B: one");
  assert.ok(k.kids.every((c) => c.visible === false) && k.coarse.every((c) => c.visible === true));
  assert.ok(picks().every((c) => k.coarse.includes(c)), "only the drawn set is picked");
  assert.notEqual(g.children.map(batchTag).join(), tagsBefore, "the pick index is rebuilt");
  assayLodTick(g, kept, 2 / 4); // 4 px: inside the margin, stays coarse
  assert.equal(g.userData.lodOn, true);
  assayLodTick(g, kept, 2 / 5); // 5 px: full again
  assert.equal(g.userData.lodOn, false);
  assert.ok(k.kids.every((c) => c.visible) && k.coarse.every((c) => c.visible === false));
  assayLodTick(g, kept, 1);
  assert.equal(coarseBuilds, 1, "built once");
  // a ring move moves both sets
  syncAssayElements(g, kept, [{ sym: "Fe", key: ["k"], offX: 3, offZ: 0, buildCoarse: coarse }], full);
  const x = new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().fromArray(k.coarse[0].userData.compact.base, 0));
  assert.ok(Math.abs(x.x - 3) < 1e-4, "the coarse set moved with the element");
});

test("a coarse set built after holes were hidden keeps them hidden", () => {
  const g = new THREE.Group(), kept = new Map();
  kept.lodSampleM = 2;
  syncAssayElements(g, kept, [{ sym: "Fe", key: ["k"], offX: 0, offZ: 0, buildCoarse: coarse }], full);
  for (const c of kept.get("Fe").kids) { const cp = c.userData.compact; cp.rows.forEach((r, i) => { if (r.holeId === "B") cp.hidden[i] = 1; }); } // the Holes list hid B
  setAssayLod(g, kept, true);
  const cps = kept.get("Fe").coarse.map((c) => c.userData.compact);
  const states = cps.flatMap((cp) => cp.rows.map((r, i) => `${r.holeId}:${cp.hidden[i]}`)).sort();
  assert.deepEqual(states, ["A:0", "A:0", "B:1"]);
});

test("wiring: ViewerModule builds the coarse set for an element drawn along the hole and ticks the switch every frame", () => {
  const v = fs.readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.match(v, /buildCoarse: assayShapeFor\(assayStyle\[sym\], drawnAssays\) === "trace" \? coarseOf : null/);
  assert.match(v, /for \(const run of sampleRuns\(rows, sym, \(v\) => \(assayPassesCutoff\(v, style\) \? assayColorFor\(v, idx, style\) : null\), isPxrfRow\)\)/);
  assert.match(v, /assayLodTick\(ag, assayKeptRef\.current, metresPerPixel\(camera, camState\.current\?\.radius, mount\.clientHeight\)\)/);
  assert.match(v, /assayKeptRef\.current\.lodSampleM = typicalSampleM\(assays\);/);
});

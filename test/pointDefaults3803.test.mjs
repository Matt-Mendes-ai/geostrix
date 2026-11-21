// TASKS.csv #3883 (#3803) — the Point survey panes' defaults (Grid to raster, Sample along the drillholes) run in the survey-checks worker and are kept per
// survey: pointDefaults gives exactly what the panes worked out on the main thread before (the same functions), and the pane reads it through the client.
// SYNTHETIC clouds.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pointDefaults, packSurvey } from "../src/lib/surveyChecks.js";
import { pointDefaultsFor } from "../src/lib/surveyChecksClient.js";
import { cloudShape } from "../src/lib/cloudShape.js";
import { surveyGridDefaults, proposeSlice } from "../src/lib/surveyGridDefaults.js";
import { suggestHoleSampling } from "../src/lib/surveyOnHoles.js";

// a 3D cloud (25 m cells, 21 levels) and a flat ground survey on lines
const cloud = [];
for (let x = 0; x <= 500; x += 25) for (let y = 0; y <= 500; y += 25) for (let z = 0; z <= 500; z += 25) cloud.push({ x, y, z, value: z });
const flat = [];
for (let l = 0; l < 20; l++) for (let s = 0; s < 100; s++) flat.push({ x: s * 10, y: l * 100, z: 300, line: `L${l}`, value: s });

test("#3803 pointDefaults gives what the panes computed before: the shape, the proposed slice, the hole sampling, the slice's grid defaults", () => {
  const d = pointDefaults(packSurvey(cloud, { values: true }), { holes: true, slice: { lo: 240, hi: 260 } });
  assert.deepEqual(d.shape, cloudShape(cloud));
  assert.equal(d.shape.is3D, true);
  assert.deepEqual(d.sliceProp, proposeSlice(cloud));
  assert.deepEqual(d.hole, suggestHoleSampling(cloud));
  assert.deepEqual(d.grid, surveyGridDefaults(cloud.filter((r) => r.z >= 240 && r.z <= 260), { stacked: true }));
  const f = pointDefaults(packSurvey(flat, { values: true }), { holes: true, slice: { lo: -Infinity, hi: Infinity } });
  assert.equal(f.shape.is3D, false);
  assert.equal(f.sliceProp, null); assert.equal(f.hole, null);
  assert.deepEqual(f.grid, surveyGridDefaults(flat, { stacked: false }), "a flat survey's line column reaches the grid defaults");
});

test("#3803 the client keeps one answer per survey and options (no worker in Node: it runs after a tick)", async () => {
  const a = pointDefaultsFor("k1", cloud, {}), b = pointDefaultsFor("k1", cloud, {});
  assert.equal(a, b, "the same promise: worked out once");
  assert.notEqual(pointDefaultsFor("k1", cloud, { holes: true }), a);
  assert.equal((await a).shape.is3D, true);
});

test("#3803 the pane reads them through the worker hook, not on the main thread", () => {
  const g = readFileSync(new URL("../src/modules/GeophysicsModule.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.ok(!/cloudShape\(|proposeSlice\(|surveyGridDefaults\(|suggestHoleSampling\(/.test(g), "none of the four runs in the pane");
  assert.match(g, /const holeDefaults = usePointDefaults\(legendRows, \{ holes: true \}, holeOpen && legendRows\.length > 0\);/);
  assert.match(g, /const idwDefaults = usePointDefaults\(idwRows, \{\}, idwRows\.length > 0\);/);
  assert.match(g, /usePointDefaults\(idwRows, \{ slice: \{ lo: idwZLo, hi: idwZHi \} \}, !!idwDefaults && idwSlice\.length > 0\)\?\.grid/);
  assert.match(readFileSync(new URL("../src/lib/surveyChecks.worker.js", import.meta.url), "utf8"), /kind === "points" \? pointDefaults\(packed, opts\)/);
});

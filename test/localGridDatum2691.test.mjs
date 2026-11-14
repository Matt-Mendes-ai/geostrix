// TASKS.csv #2691 / #2661 — a local grid's RL datum offset and, untied, its typed north: kept on project.localGrid, saved (version 26)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { rlOffsetOf, untiedNorthOf, trueToUntiedGrid, elevationToRl, rlToElevation, datumPatch } from "../src/lib/localGridDatum.js";
import { PROJECT_VERSION, payloadFromFields, fieldsFromPayload, emptyFields } from "../src/lib/projectFields.js";

const grid = (lg) => ({ name: "p", epsg: 3156, crsSet: false, localGrid: { name: "Wallaby mine grid", ...lg } });

test("the datum and the north read back, only on a local grid; the north only without a tie", () => {
  assert.equal(rlOffsetOf(grid({ rlOffset: 1000 })), 1000);
  assert.equal(rlOffsetOf({ crsSet: true, localGrid: null }), null);
  assert.equal(untiedNorthOf(grid({ northDeg: 15.1 })), 15.1);
  assert.equal(untiedNorthOf(grid({ northDeg: 15.1, tie: { epsg: 28350 } })), null); // the tie's own rotation wins
  assert.equal(untiedNorthOf(grid({})), null);
  // a true bearing 100 on a grid whose north is 15.1 east of true north reads 84.9 on the grid; 10 -> 354.9
  assert.ok(Math.abs(trueToUntiedGrid(100, 15.1) - 84.9) < 1e-9 && Math.abs(trueToUntiedGrid(10, 15.1) - 354.9) < 1e-9 && Math.abs(trueToUntiedGrid(10, -20) - 30) < 1e-9);
  assert.equal(elevationToRl(250, 1000), 1250); assert.equal(rlToElevation(1250, 1000), 250);
  assert.deepEqual(datumPatch({ rlOffset: "1000", northDeg: "" }), { rlOffset: 1000, northDeg: null });
  assert.deepEqual(datumPatch({ northDeg: "200" }), { northDeg: null });
  assert.deepEqual(datumPatch({ rlOffset: "x" }), { rlOffset: null });
});

test("saved and loaded with the project (PROJECT_VERSION 26)", () => {
  assert.ok(PROJECT_VERSION >= 26, "the version that added rlOffset / northDeg");
  const live = { ...emptyFields(), project: grid({ rlOffset: -1000, northDeg: -3.5 }) };
  const back = fieldsFromPayload(JSON.parse(JSON.stringify(payloadFromFields(live))), "t.geostrix.json");
  assert.equal(back.project.localGrid.rlOffset, -1000); assert.equal(back.project.localGrid.northDeg, -3.5);
});

test("the store's setter, the panel's fields and the import's true-north conversion on an untied grid", () => {
  const s = fs.readFileSync("src/lib/store.jsx", "utf8");
  assert.match(s, /const setLocalGridDatum = useCallback\(\(patch\) => setProject\(\(p\) => \(p\.localGrid \? \{ \.\.\.p, localGrid: \{ \.\.\.p\.localGrid, \.\.\.datumPatch\(patch\) \} \} : p\)\), \[\]\);/);
  const p = fs.readFileSync("src/components/LocalGridPanel.jsx", "utf8");
  assert.match(p, /onBlur=\{\(\) => setLocalGridDatum\(\{ rlOffset: rl \}\)\}/);
  assert.match(p, /disabled=\{!!saved\} onChange=\{\(e\) => setNorth\(e\.target\.value\)\} onBlur=\{\(\) => setLocalGridDatum\(\{ northDeg: north \}\)\}/);
  const i = fs.readFileSync("src/modules/viewer/importPipelineImpl.js", "utf8");
  assert.match(i, /const typedNorth = !tie \? untiedNorthOf\(live\) : null;/);
  assert.match(i, /azimuth: trueToUntiedGrid\(r\.azimuth, typedNorth\)/);
});

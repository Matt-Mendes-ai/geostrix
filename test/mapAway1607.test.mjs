// TASKS.csv #1607 — a map table that misses the project says how far and in which direction.
import test from "node:test";
import assert from "node:assert/strict";
import { awayFrom, classifyTables } from "../src/lib/mapImportReview.js";

test("gap between the boxes and the 8-point direction from the project", () => {
  const project = [0, 0, 10000, 10000];
  assert.equal(awayFrom([2000, 2000, 3000, 3000], project), null); // overlaps
  const se = awayFrom([300000, -400000, 550000, -150000], project); // the review's case: a sheet ~500 km away
  assert.equal(se.dir, 3); // south-east
  assert.ok(Math.abs(se.distM - Math.hypot(290000, 150000)) < 1);
  assert.equal(awayFrom([0, 20000, 10000, 30000], project).dir, 0); // north, 10 km
  assert.equal(awayFrom([0, 20000, 10000, 30000], project).distM, 10000);
  assert.equal(awayFrom([-30000, 0, -20000, 10000], project).dir, 6); // west
});

test("classifyTables carries it on a row only when there is a project box", () => {
  const t = { name: "overlay_polygons", epsg: 3005, layers: [{ geomType: "polygon", features: [{ parts: [[[300000, -400000], [550000, -400000], [550000, -150000], [300000, -400000]]] }] }] };
  const [row] = classifyTables([t], { toCommon: (b) => b, refBox: [0, 0, 10000, 10000] });
  assert.equal(row.cls, "regional");
  assert.equal(row.away.dir, 3);
  const [noRef] = classifyTables([t], { toCommon: (b) => b });
  assert.equal(noRef.away, null);
});

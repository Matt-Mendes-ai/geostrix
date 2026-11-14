// TASKS.csv #3421 / #3422 — a 3D survey with no Level took the readings nearest in plan at every depth, mixed: a stated reduction now (the highest
// or the mean in each map cell). And the 'Plan a hole to here' tooltip said 'and the Level' whether or not a Level was set.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { surveyColumns } from "../src/lib/evidenceSources.js";

test("surveyColumns: one reading per map cell, the highest or the mean, at the cell's mean position", () => {
  const pts = [
    { x: 1, y: 1, z: 900, value: 5 }, { x: 3, y: 3, z: 800, value: 20 }, { x: 4, y: 2, z: 700, value: 11 }, // one 10 m cell
    { x: 15, y: 5, z: 900, value: 7 }, { x: NaN, y: 5, z: 900, value: 9 }, { x: 15, y: 5, z: 900, value: NaN },
  ];
  const max = surveyColumns(pts, 10, "max"), mean = surveyColumns(pts, 10, "mean");
  assert.equal(max.length, 2); assert.equal(mean.length, 2);
  assert.deepEqual(max.map((p) => p.value), [20, 7]);
  assert.deepEqual(mean.map((p) => +p.value.toFixed(6)), [12, 7]);
  assert.deepEqual([max[0].x, max[0].y, max[0].z], [8 / 3, 2, null]);
  assert.deepEqual(surveyColumns([], 10), []);
});

test("wiring: the cloud card's choice without a Level; the tooltip's Level words only with a Level; keys", () => {
  const p = readFileSync(new URL("../src/components/EvidenceOverlayPane.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(p, /if \(cloud && !lv && \(opts\.field === "column"\) && \(opts\.value === "max" \|\| opts\.value === "mean"\)\) pts = surveyColumns\(all, Math\.max\(grid\.dx, grid\.dy\), opts\.value\);/);
  assert.match(p, /cloudInfo\(l\.ref\)\?\.cloud && !levelSet\(level\) && <select value=\{l\.field === "column" && l\.value \? l\.value : "mixed"\}/);
  assert.match(p, /zs\[k\]\?\.from === "point" \? \(levelSet\(level\) \? tr\(/);
  assert.match(p, /\(that point is \{d\} m away in plan\)\. Check it there\./);
  const keys = ["Opens Planned holes with this easting and northing as the target, at RL {z} m: the highest value of the first grade / numeric card within {r} m of this cell (that point is {d} m away in plan). Check it there.", "Opens Planned holes with this easting and northing as the target, at RL {z} m: no point of the first grade / numeric card lies under this cell, so it is the distance-weighted mean elevation of the {n} points within {r} m. Check it there.", "How the readings of a map cell are reduced", "every reading, every depth (mixed)", "the highest in each map cell", "the mean in each map cell"];
  for (const l of ["es", "pt", "fr", "ar"]) { const d = JSON.parse(readFileSync(new URL(`../src/locales/${l}.json`, import.meta.url), "utf8")); for (const k of keys) assert.ok(d[k], `${l}: ${k}`); }
});

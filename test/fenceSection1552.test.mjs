// TASKS.csv #1552 — the fence panel along a saved section (its line and corridor), and a large project opens on the holes near the line.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { lineFromSection, holesInCorridor, initialFenceSelection, buildFencePanel, FENCE_MANY } from "../src/lib/fence.js";

const vertical = (id, x, y) => ({ hole_id: id, md: [0, 100], wx: [x, x], wy: [y, y], wz: [1000, 900] });

test("a saved section gives the line from its start; its corridor picks the holes", () => {
  const sec = { id: "s1", ax: 0, ay: 0, bx: 1000, by: 0, corridor: 50 };
  const line = lineFromSection(sec);
  assert.equal(line.azimuth, 90);
  assert.equal(line.length, 1000);
  const traces = [vertical("A", 100, 10), vertical("B", 500, -40), vertical("C", 500, 80), vertical("D", 1040, 0), vertical("E", 1100, 0),
    { hole_id: "F", md: [0, 100, 200], wx: [300, 300, 300], wy: [200, 115, 30], wz: [1000, 900, 800] }, // only its toe is in the corridor: crosses it, not on it
    { hole_id: "G", md: [0, 100, 200], wx: [600, 600, 600], wy: [20, -20, -100], wz: [1000, 900, 860] }]; // its upper half on the section: kept
  assert.deepEqual(holesInCorridor(traces, line, 50), ["A", "B", "D", "G"]);
  const p = buildFencePanel(traces.filter((t) => ["A", "B"].includes(t.hole_id)), { line });
  assert.equal(p.line.azimuth, 90);
  assert.deepEqual(p.holes.map((h) => Math.round(h.s)), [100, 500]); // s from the section's start
  assert.equal(lineFromSection({ ax: 1, ay: 1, bx: 1, by: 1 }), null);
});

test("over 40 holes: open on those within 100 m of the best-fit line; 40 or fewer: all", () => {
  const few = Array.from({ length: 10 }, (_, i) => vertical(`H${i}`, i * 50, i * 300));
  assert.equal(initialFenceSelection(few).ids.length, 10);
  // 35 holes on an east-west line 3.4 km long, 12 a few hundred metres north and south of it
  const many = [...Array.from({ length: 35 }, (_, i) => vertical(`L${i}`, i * 100, (i % 3) * 10)),
    ...Array.from({ length: 12 }, (_, i) => vertical(`X${i}`, 300 + i * 250, (i % 2 ? 1 : -1) * (400 + i * 20)))];
  assert.ok(many.length > FENCE_MANY);
  const r = initialFenceSelection(many, 100);
  assert.equal(r.ids.length, 35);
  assert.equal(r.trimmed, 12);
});

test("the modal offers the saved sections and ViewerModule passes them", () => {
  const m = fs.readFileSync("src/components/FenceDiagramModal.jsx", "utf8");
  assert.match(m, /<option value="section">\{tr\("Along a saved section…"\)\}<\/option>/);
  assert.match(m, /holesInCorridor\(traces, lineFromSection\(s\), Number\(s\.corridor\) \|\| 100\)/);
  assert.doesNotMatch(m, /within 100 m of the best-fit line/);
  assert.match(fs.readFileSync("src/modules/ViewerModule.jsx", "utf8"), /patternOverride=\{legendOverride\.litho\} sections=\{sections\}/);
});

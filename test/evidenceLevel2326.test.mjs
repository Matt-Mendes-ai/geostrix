// TASKS.csv #2326 (review #2174, WA gold) — the evidence overlay's Level (RL from / to) for hole-based cards, and the target's elevation
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { holeGradePoints, structureParts, zoneParts, layerFieldPoints, targetElevation, inLevel } from "../src/lib/evidenceSources.js";

// one vertical hole at (100, 100) collared at RL 300, 300 m deep; one at (400, 100) the same
const tr = (x) => [{ md: 0, x, y: 100, z: 300 }, { md: 300, x, y: 100, z: 0 }];
const traces = new Map([["A", tr(100)], ["B", tr(400)]]);
const assays = [
  { hole_id: "A", from: 10, to: 12, values: { Au: 1 } },   // RL ~289
  { hole_id: "A", from: 200, to: 202, values: { Au: 9 } }, // RL ~99
  { hole_id: "B", from: 150, to: 152, values: { Au: 4 } }, // RL ~149
];
const units = { Au: "ppm" };

test("grade points keep their elevation and the level keeps only its depths", () => {
  const all = holeGradePoints(assays, "Au", "ppm", units, traces);
  assert.equal(all.length, 2); // A's two samples share a 25 m plan bin: the highest (9 at RL 99) is kept
  assert.ok(all.every((p) => Number.isFinite(p.z)));
  const lv = holeGradePoints(assays, "Au", "ppm", units, traces, undefined, { zMin: 250, zMax: 300 });
  assert.equal(lv.length, 1); assert.equal(lv[0].value, 1); assert.ok(Math.abs(lv[0].z - 289) < 1e-6);
  assert.equal(holeGradePoints(assays, "Au", "ppm", units, traces, undefined, { zMin: 120, zMax: null }).length, 2); // RL 289 at A, 149 at B
});

test("zones are clipped to the level (a part per stretch inside it); structures and numeric points filtered", () => {
  const rows = [{ hole_id: "A", from: 0, to: 300, value: "Q" }];
  const whole = zoneParts(rows, "Q", traces);
  assert.equal(whole.length, 1);
  const inside = zoneParts(rows, "Q", traces, 5, { zMin: 100, zMax: 150 });
  assert.equal(inside.length, 1); assert.ok(inside[0].length >= 10 && inside[0].length <= 12); // 150..200 m downhole, a vertex every 5 m
  assert.equal(zoneParts(rows, "Q", traces, 5, { zMin: 400, zMax: 500 }).length, 0);
  const picks = [{ hole_id: "A", depth: 20, value: "F" }, { hole_id: "B", depth: 250, value: "F" }];
  assert.equal(structureParts(picks, "F", traces).length, 2);
  assert.equal(structureParts(picks, "F", traces, { zMin: 0, zMax: 100 }).length, 1);
  const logs = [{ hole_id: "A", depth: 50, ms: 3 }, { hole_id: "B", depth: 290, ms: 8 }];
  assert.deepEqual(layerFieldPoints(logs, "ms", traces, undefined, { zMin: 0, zMax: 50 }).map((p) => p.value), [8]);
  assert.equal(inLevel(10, null), true); assert.equal(inLevel(10, { zMin: 20, zMax: null }), false);
});

test("the target's elevation: the highest point of the first point card in the cell, else the level's middle, else none", () => {
  const grid = { dx: 10, dy: 10 };
  const pts = holeGradePoints(assays, "Au", "ppm", units, traces);
  const atA = targetElevation({ x: 100, y: 100 }, [pts], grid);
  assert.equal(atA.from, "point"); assert.ok(Math.abs(atA.z - 99) < 1e-6); assert.equal(atA.within, 25);
  assert.equal(targetElevation({ x: 120, y: 100 }, [pts], grid).from, "point"); // 20 m off: within one 25 m grade bin
  // with the card's reach: a cell 150 m from hole A takes A's best point (RL 99), and the level narrows it to B's (RL 149)
  const far = targetElevation({ x: 250, y: 100 }, [{ pts, reach: 200 }], grid);
  assert.equal(far.from, "point"); assert.equal(far.within, 200); assert.ok(Math.abs(far.z - 99) < 1e-6);
  assert.ok(Math.abs(targetElevation({ x: 250, y: 100 }, [{ pts: holeGradePoints(assays, "Au", "ppm", units, traces, undefined, { zMin: 120, zMax: 200 }), reach: 200 }], grid, { zMin: 120, zMax: 200 }).z - 149) < 1e-6);
  assert.deepEqual(targetElevation({ x: 1000, y: 1000 }, [pts], grid, { zMin: 100, zMax: 200 }), { z: 150, from: "level" });
  assert.equal(targetElevation({ x: 1000, y: 1000 }, [pts], grid), null);
});

test("the pane: a Level control, read by every hole-based card and handed to Planned holes", () => {
  const p = readFileSync(new URL("../src/components/EvidenceOverlayPane.jsx", import.meta.url), "utf8");
  assert.match(p, /aria-label=\{tr\("Level from \(m RL\)"\)\}/);
  assert.match(p, /const LEVEL_KINDS = new Set\(\["grade", "pxrf", "numeric", "zone", "pick", "voxel"\]\);/);
  for (const re of [/structureParts\(structurePicks, src\.ref, traces, lv\)/, /layerFieldPoints\(rows, field, traces, undefined, lv\)/, /traces, undefined, lv\)\); \}/, /assayUnits, traces, undefined, lv(, !!opts\.lowest)?\), \{/ /* lowest: #2578 */]) assert.match(p, re);
  assert.match(p, /onPlanTo\(\{ x: c\.x, y: c\.y, z: zs\[k\]\?\.z \?\? null \}\)/);
  assert.match(p, /\.\.\.\(level \? \{ level \} : \{\}\), \/\/ #2326/);
});

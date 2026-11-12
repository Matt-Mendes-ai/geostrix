// TASKS.csv #2894 — the undo history keeps at most a few big dropped tables: removed custom layers (by their rows array) and replaced
// assay tables, as #2806 did for map layers.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { capUndoTables, tableCapNotice, KEEP_REMOVED, BIG_ROWS } from "../src/lib/undoTableCap.js";

const rows = (n) => new Array(n).fill(0);
const layer = (name, n) => ({ id: name, name, rows: rows(n) });

test("removed big custom layers: the newest three stay, older ones leave every step; small ones and live ones stay", () => {
  const L = ["a", "b", "c", "d", "e"].map((x) => layer(x, BIG_ROWS)), small = layer("small", 10), live = layer("live", BIG_ROWS);
  // step i still had layers i..4 (each later step removed one)
  const steps = L.map((_, i) => ({ customLayers: [...L.slice(i), small, live], assays: [] }));
  const now = { customLayers: [small, live], assays: [] };
  const r = capUndoTables(steps, [now]);
  assert.deepEqual(r.layers.sort(), ["a", "b"]);
  for (const s of r.steps) assert.ok(!s.customLayers.some((l) => l.name === "a" || l.name === "b"));
  assert.ok(r.steps.every((s) => s.customLayers.includes(small) && s.customLayers.includes(live)));
  assert.equal(new Set(r.steps.flatMap((s) => s.customLayers.map((l) => l.name))).size, KEEP_REMOVED + 2);
  // a renamed copy that shares rows is the same table
  const renamed = { ...L[4], name: "e renamed" };
  assert.equal(capUndoTables([{ customLayers: [L[4]] }], [{ customLayers: [renamed] }]).layers.length, 0);
});

test("replaced assay tables: the newest one stays; an older step takes the next kept table, never an empty one", () => {
  const A1 = rows(BIG_ROWS), A2 = rows(BIG_ROWS), A3 = rows(BIG_ROWS), now = rows(BIG_ROWS);
  const steps = [{ assays: A1, collars: "c1" }, { assays: A2, collars: "c2" }, { assays: A3, collars: "c3" }];
  const r = capUndoTables(steps, [{ assays: now }]);
  assert.deepEqual(r.assayRows, [BIG_ROWS, BIG_ROWS]);
  assert.equal(r.steps[2].assays, A3, "the newest replaced table stays");
  assert.equal(r.steps[1].assays, A3);
  assert.equal(r.steps[0].assays, A3);
  assert.equal(r.steps[0].collars, "c1", "the rest of the step is as it was");
  // nothing to drop: the same array back
  const small = [{ assays: rows(5) }, { assays: rows(5) }];
  assert.equal(capUndoTables(small, [{ assays: [] }]).steps, small);
});

test("the notice says what left the history", () => {
  assert.match(tableCapNotice({ layers: ["Density log"] }), /"Density log" is too large/);
  assert.match(tableCapNotice({ assayRows: [147891] }), /147,891 rows/);
  assert.equal(tableCapNotice({}), "");
});

test("store.jsx runs it wherever the map-layer cap runs", () => {
  const s = fs.readFileSync("src/lib/store.jsx", "utf8");
  assert.match(s, /const capTables = \(held\) => \{ const r = capUndoTables\(undoPast\.current, held\);/);
  assert.equal((s.match(/capTables\(\[/g) || []).length, 2); // after a new step, and when Undo commits a burst
  // the confirms for removing a custom or map layer no longer say it can't be undone: both are in Undo
  const v = fs.readFileSync("src/modules/ViewerModule.jsx", "utf8");
  assert.equal((v.match(/Remove the (custom layer|map layer) [^\n]*?\{ undoable: true \}\)/g) || []).length, 4);
});

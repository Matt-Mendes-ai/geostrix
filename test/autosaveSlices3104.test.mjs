// TASKS.csv #3104 (review #2876) — the autosave serialized a large project (146,970 assays) in one ~1.2 s main-thread task, landing inside an
// estimate run. It is now built a piece at a time (a column, 16,384 rows at most, per step), with the same text.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { projectParts, projectPartsSliced, joinParts, emptyFields } from "../src/lib/projectFields.js";
import { compactTable, compactTableSliced } from "../src/lib/compactTable.js";

const rowsOf = (n, tag) => Array.from({ length: n }, (_, k) => ({ hole_id: `H${k % 311}`, from: k % 40, to: (k % 40) + 1, values: { Fe: 30 + (k % 350) / 10, SiO2: (k % 600) / 10, P: k % 7 ? (k % 200) / 1000 : undefined }, source: "assay", sample_id: `${tag}${k}` }));

test("the sliced encoding is the same table, and pauses inside a column", async () => {
  const rows = rowsOf(50000, "S");
  let pauses = 0;
  const sliced = await compactTableSliced(rows, async () => { pauses++; });
  const fresh = compactTable(rowsOf(50000, "S"));
  assert.deepEqual(sliced, fresh);
  assert.equal(compactTable(rows), sliced, "and cached for the next save");
  // 50,000 rows: the row scans pause every 16,384 rows, so far more steps than the 9 columns
  assert.ok(pauses >= 9 * 3, `${pauses} pauses`);
});

test("the sliced project text equals projectParts', field for field", async () => {
  const base = emptyFields();
  const mk = () => { const l = { ...base, assays: rowsOf(30000, "A"), surfaceSamples: rowsOf(3000, "R") }; l.layers = { ...l.layers, litho: rowsOf(30000, "L").map(({ values: _v, ...r }) => ({ ...r, value: "BIF" })) }; l.customLayers = [{ id: "g", name: "gamma", rows: rowsOf(4000, "G") }]; return l; };
  let steps = 0;
  const sliced = joinParts(await projectPartsSliced(mk(), { activeDirty: true }, async () => { steps++; }));
  assert.equal(sliced, joinParts(projectParts(mk(), { activeDirty: true })));
  assert.ok(steps > 20, `${steps} steps`);
});

test("the autosave tick builds its parts sliced and waits for the last write", () => {
  const s = fs.readFileSync(new URL("../src/lib/store.jsx", import.meta.url), "utf8");
  assert.ok(s.includes("projectPartsSliced(payload, { activeDirty: activeWorth }).then((parts) => {"));
  assert.ok(s.includes("if (autosaveBuildingRef.current) return;") && s.includes(".finally(() => { autosaveBuildingRef.current = false; });"));
  assert.ok(!/const parts = projectParts\(payload/.test(s));
});

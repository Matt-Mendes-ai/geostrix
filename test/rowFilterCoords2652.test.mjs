// TASKS.csv #2652 (from #2492) — the row filter offers no coordinate column (MGA_Z, GBMG_RL) and no measurement column; flags and codes stay
import test from "node:test";
import assert from "node:assert/strict";
import { rowFilterColumns, defaultRowFilter } from "../src/lib/importRowFilter.js";

test("collar file: RLs and depths are not offered; Superseded, a 0 / 1 flag and a type code are", () => {
  const rows = [0, 1, 2, 3, 4].map((i) => ({ Hole: `H${i}`, MGA_Z: 250 + (i % 3), GBMG_RL: 1250 + (i % 3), Superseded: i % 2 ? "TRUE" : "FALSE", Flag: i % 2, Type: i % 2 ? "RC" : "DD", Depth: [10, 20, 30][i % 3] }));
  assert.deepEqual(rowFilterColumns(Object.keys(rows[0]), rows).map((c) => c.col), ["Hole", "Superseded", "Flag", "Type"]);
  assert.equal(defaultRowFilter(Object.keys(rows[0]), rows).col, "Superseded"); // #2330's preset unchanged
});

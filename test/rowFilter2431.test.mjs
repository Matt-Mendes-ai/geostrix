// TASKS.csv #2431 (review #2325) — the row filter's 'they are left out' line follows the ticks, and Import is disabled while the filter keeps no row
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("the line shows only while a value the preset leaves out is unticked; Import 0 rows is disabled", () => {
  const b = readFileSync(new URL("../src/components/RowFilterBox.jsx", import.meta.url), "utf8");
  assert.match(b, /preset && f && f\.col === preset\.col && col && col\.values\.some\(\(\[v\]\) => !preset\.keep\.includes\(v\) && !f\.keep\.includes\(v\)\) && \(/);
  const m = readFileSync(new URL("../src/components/ImportMappingModal.jsx", import.meta.url), "utf8");
  assert.match(m, /const blocked = missingRequired\.length > 0 \|\| needsDate \|\| importCount\(modal\) === 0;/); // needsDate: #2895
  assert.match(m, /disabled=\{blocked\}/);
  assert.match(m, /The row filter keeps no row: tick at least one value under Rows\./);
});

// TASKS.csv #2608 — Best intercepts on a sheet printed intercepts that start at the collar or end at the bottom of the hole like closed ones
// (49 of 60); the last row pointed at a CSV the sheet's reader does not have; a second send landed exactly on the first.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { interceptOpenEnds } from "../src/lib/geochem.js";

test("open at the first sample, at the last sample or at the end of the hole", () => {
  const assays = [{ hole_id: "A", from: 2, to: 4, values: { Li: 1 } }, { hole_id: "A", from: 4, to: 30, values: { Li: 2 } }, { hole_id: "B", from: 0, to: 50, values: { Li: 1 } }];
  const rows = [{ hole_id: "A", from: 2, to: 10 }, { hole_id: "A", from: 12, to: 30 }, { hole_id: "B", from: 10, to: 20 }, { hole_id: "C", from: 5, to: 40 }];
  const o = interceptOpenEnds(rows, assays, "Li", [{ hole_id: "C", length: 40 }]);
  assert.deepEqual(o, [{ top: true, bottom: false }, { top: false, bottom: true }, { top: false, bottom: false }, { top: false, bottom: true }]);
});

test("the Layout table marks them, says why, does not point at a CSV, and steps a second table", () => {
  const b = readFileSync(new URL("../src/components/BestIntercepts.jsx", import.meta.url), "utf8");
  assert.match(b, /open\[i\]\.top \|\| open\[i\]\.bottom \? "\+" : ""/);
  assert.match(b, /tr\("\+: the intercept starts at the hole's first sample/);
  assert.match(b, /tr\("… and \{n\} more intercept\(s\), not shown on this sheet"/);
  // #2479 — a second send takes the next free spot of the page (interceptTablePlan), not 24 px along from (60, 60)
  assert.match(b, /x: plan\.x, y: plan\.y/);
});

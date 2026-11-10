// TASKS.csv #2370 (review #2325, WA uranium) — a one-element assay legend names its element: 'U (ppm)' above '≤ 8.00 ppm …'
import test from "node:test";
import assert from "node:assert/strict";
import { assayLegendGroups, legendGroupsToItems, allocateLegendRows } from "../src/lib/legendGroups.js";

test("U alone: the group heading is printed", () => {
  const assays = [{ hole_id: "A", from: 0, to: 1, values: { U: 5 } }, { hole_id: "A", from: 1, to: 2, values: { U: 950 } }];
  const gs = assayLegendGroups({ assays, assayElements: [{ symbol: "U", unit: "ppm" }], assayVisible: true, assayDisplayElements: ["U"], assayStyle: { U: { breaks: [{ max: 8, color: "#eee" }, { max: 223, color: "#ca0" }, { max: 900, color: "#850" }, { max: Infinity, color: "#420" }] } } });
  assert.equal(gs.length, 1);
  assert.equal(gs[0].label, "U (ppm)");
  assert.equal(gs[0].alwaysHead, true);
  const items = legendGroupsToItems(gs);
  assert.deepEqual(items[0], ["U (ppm)", null, { heading: true }]);
  const { rows } = allocateLegendRows(gs, 32);
  assert.equal(rows.find((r) => r.head)?.group, "U (ppm)");
});

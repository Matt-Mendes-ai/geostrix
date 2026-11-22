// TASKS.csv #4008 (Matt, v0.2.7, his project, made-up data here) — a wide-form Mineralization layer (py_sum, sph_sum … fields, no code column worth drawing)
// with every code chip off: the 3D view still draws its bars (Total sulphides, py_sum), so the section must too, and its header must not read "0 intervals".
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { sectionBarSets, drawnIntervalCount } from "../src/lib/sectionBars.js";
import { TOTAL_SULPHIDES_FIELD } from "../src/lib/mineralFields.js";

// wide form: one row per interval, a mineral per field; a code that every chip has switched off
const rows = [
  { hole_id: "DH-1", from: 0, to: 2, value: "Mineralised", py_sum: 4, sph_sum: 1, [TOTAL_SULPHIDES_FIELD]: 5 },
  { hole_id: "DH-1", from: 2, to: 5, value: "Mineralised", py_sum: 10, sph_sum: 0, [TOTAL_SULPHIDES_FIELD]: 10 },
  { hole_id: "DH-2", from: 0, to: 3, value: "Mineralised", py_sum: 2, sph_sum: 6, [TOTAL_SULPHIDES_FIELD]: 8 },
  { hole_id: "DH-9", from: 0, to: 3, value: "Mineralised", py_sum: 9, sph_sum: 9, [TOTAL_SULPHIDES_FIELD]: 18 }, // a hole off this section
];
const chosen = [TOTAL_SULPHIDES_FIELD, "py_sum"];

test("wide-form fields and Total sulphides as bars draw on the section with every code chip off (the section does not apply the code chips to bars)", () => {
  // the 3D view is given no row filter: the section is, too
  const s = sectionBarSets({ holeIds: new Set(["DH-1", "DH-2"]), mnlgy: { rows, chosen, on: true, codeColour: () => "#000" } });
  assert.ok(s.mineralBars, "bars on the section");
  assert.deepEqual(s.mineralBars.lanes.map((l) => l.label), ["Total sulphides", "py_sum"]);
  assert.equal(s.mineralBars.bars.length, 6, "3 intervals on the two holes x 2 lanes");
  assert.deepEqual([...new Set(s.mineralBars.bars.map((b) => b.hole_id))].sort(), ["DH-1", "DH-2"]);
  assert.equal(s.keyRows.length, 2);
  // a row filter from the code chips would hide every row: that is what made the bars disappear
  const off = sectionBarSets({ holeIds: new Set(["DH-1", "DH-2"]), mnlgy: { rows, chosen, on: true, shown: () => false, codeColour: () => "#000" } });
  assert.equal(off.mineralBars.bars.length, 0, "sectionBarSets still honours a shown() (no bars drawn): the payload simply does not pass one");
});

test("the section's header counts the intervals that carry bars (no tube drawn: not '0 intervals'), a tube and its bars once", () => {
  const { mineralBars } = sectionBarSets({ holeIds: new Set(["DH-1", "DH-2"]), mnlgy: { rows, chosen, on: true, codeColour: () => "#000" } });
  assert.equal(drawnIntervalCount([], mineralBars), 3);
  assert.equal(drawnIntervalCount([{ hole_id: "DH-1", from: 0, to: 2 }], mineralBars), 3, "DH-1 0-2 is a tube and has bars: once");
  assert.equal(drawnIntervalCount([{ hole_id: "DH-1", from: 7, to: 9 }, { hole_id: "DH-7", from: 0, to: 1 }], null), 2, "no bars: the tubes only");
  assert.equal(drawnIntervalCount(undefined, undefined), 0);
});

test("the wiring: the payload passes no code-chip filter to the bars; the header uses the count", () => {
  const pay = fs.readFileSync(new URL("../src/modules/viewer/sectionPayload.js", import.meta.url), "utf8");
  const call = pay.slice(pay.indexOf("sectionBarSets({"), pay.indexOf("sectionBarSets({") + 700);
  assert.doesNotMatch(call.slice(0, call.indexOf("assay:")), /shown:/, "no row filter on the mineral bars");
  assert.match(fs.readFileSync(new URL("../src/components/SectionWindow.jsx", import.meta.url), "utf8"), /drawnIntervalCount\(data\.intervals, data\.mineralBars\)/);
});

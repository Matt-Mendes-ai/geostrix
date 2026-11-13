// TASKS.csv #2200 / #2479 — Best intercepts says how many intercepts it found, and 'To Layout' puts a table that fits a free spot of the
// page, with the grade x length column it is ranked by
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { interceptTablePlan, interceptCount } from "../src/lib/interceptTable.js";
import { elementBox } from "../src/lib/layoutPlace.js";
import { collarTableHeight } from "../src/lib/collarTable.js";

const A4L = { w: 1123, h: 794 };
const starter = [
  { id: "title", type: "title", x: 40, y: 20, w: 600, h: 50 },
  { id: "scale", type: "scale", x: 40, y: 720, w: 260, h: 50 },
];

test("a long result list: a free spot clear of the title, as many rows as fit, the rest counted", () => {
  const p = interceptTablePlan(starter, A4L, { total: 291 });
  assert.ok(p.shown >= 5 && p.shown < 291, String(p.shown));
  assert.equal(p.shown + p.more, 291);
  const box = { x: p.x, y: p.y, w: 560, h: collarTableHeight(p.shown + 1 + 4, 7) };
  assert.ok(box.y + box.h <= A4L.h, `bottom ${box.y + box.h}`); // on the sheet, with the closing row and the note
  const t = elementBox(starter[0]);
  assert.ok(box.y >= t.y + t.h || box.x >= t.x + t.w, "clear of the title");
});

test("a short list fits whole", () => {
  assert.deepEqual((({ shown, more }) => ({ shown, more }))(interceptTablePlan(starter, A4L, { total: 8 })), { shown: 8, more: 0 });
});

test("the count line: intercepts and holes", () => {
  assert.deepEqual(interceptCount([{ hole_id: "A" }, { hole_id: "A" }, { hole_id: "B" }]), { n: 3, holes: 2 });
  assert.deepEqual(interceptCount([]), { n: 0, holes: 0 });
});

test("wired: the plan's place and rows, the grade x length column, the count line", () => {
  const b = readFileSync(new URL("../src/components/BestIntercepts.jsx", import.meta.url), "utf8");
  assert.match(b, /let plan = interceptTablePlan\(layoutElements, pageSize, \{ total: results\.length, w: tableW \}\);/); // #3019: the page size and the widened table
  assert.match(b, /tr\("Grade × length \(\{unit\} × m\)", \{ unit: dispUnit \}\)/);
  assert.match(b, /fGT\(dg\(interceptGradeLength\(r\)\)\) \/\* #2479; fixed decimals: #3019 \*\//); // #3019: one number of decimals per column
  assert.match(b, /x: plan\.x, y: plan\.y/);
  assert.doesNotMatch(b, /results\.slice\(0, 60\)/);
  assert.match(b, /interceptCount\(results\)/);
});

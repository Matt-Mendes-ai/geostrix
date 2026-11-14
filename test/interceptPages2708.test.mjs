// TASKS.csv #2708 (split from #2200 / #2479; #2709 the same) — Best intercepts 'To Layout' can put the intercepts that do not fit the sheet
// on new pages (the collar table's 'Continue on new pages', #1638) instead of the closing count row
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { continuationRanges, interceptTablePlan } from "../src/lib/interceptTable.js";

const page = { w: 1123, h: 794 };

test("the ranges cover every intercept after the first table's, once, in order; a cut table leaves a row to say it carries on", () => {
  const first = 30, total = 400;
  const r = continuationRanges(first, total, page);
  assert.equal(r[0][0], first);
  for (let i = 1; i < r.length; i++) assert.equal(r[i][0], r[i - 1][1]);
  assert.equal(r[r.length - 1][1], total);
  const full = interceptTablePlan([], page, { total: total - first, noteRows: 0 });
  assert.ok(full.more > 0, "a page holds fewer than 370 rows");
  assert.equal(r[0][1] - r[0][0], full.shown, "a fresh page's rows, one kept for 'Continued on the next page'");
  assert.ok(r.length > 1);
  assert.deepEqual(continuationRanges(10, 10, page), [], "nothing left over");
  const last = continuationRanges(0, 3, page);
  assert.deepEqual(last, [[0, 3]]);
});

test("wiring: the tick, every intercept printed with it, the closing row, the pages, back to the first page", () => {
  const b = readFileSync(new URL("../src/components/BestIntercepts.jsx", import.meta.url), "utf8");
  assert.match(b, /useKeptState\(keptScope, "bi\.continuePages", false\)/);
  assert.match(b, /const cont = continuePages && plan\.more > 0 && typeof addLayoutPages === "function";/);
  assert.match(b, /const printed = cont \? results\.length : plan\.shown;/);
  assert.match(b, /cont \? carriesOn : tail\(tr\("… and \{n\} more intercept\(s\), not shown on this sheet"/);
  assert.match(b, /const ranges = cont \? continuationRanges\(plan\.shown, results\.length, pageSize, \{ w: tableW \}\) : \[\];/);
  assert.match(b, /if \(contPages\.length\) \{ addLayoutPages\(contPages\); switchLayoutPage\?\.\(activeLayoutPageId\); \}/);
  assert.match(b, /tr\("Continue on new pages"\)/);
});

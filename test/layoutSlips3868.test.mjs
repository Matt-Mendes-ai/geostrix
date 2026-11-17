// TASKS.csv #3868 (Scottie Gold review) — small slips in Layout: pins on the ones fixed here (1, 2, 6, 11); 4 was fixed by #3710; 3 (the status-bar credit is one line with a tooltip, #3661), 5, 7-10,
// 12 and 13 are not changed (see the note).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { collarTableFieldChoices } from "../src/lib/collarTable.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("(11) the collar table offers every collar field that holds a value: the pick-list ones first, then dates and the rest", () => {
  const collars = Array.from({ length: 40 }, (_, i) => ({ hole_id: `H${i}`, attrs: { zone: i % 3 ? "A" : "B", status: "complete", drilling_start: `2023-05-${String((i % 28) + 1).padStart(2, "0")}`, drilling_finished: `2023-06-${String((i % 28) + 1).padStart(2, "0")}`, empty: "" } }));
  const ch = collarTableFieldChoices(collars);
  assert.deepEqual(ch.slice(0, 1), ["zone"], "the pick-list field first");
  assert.ok(ch.includes("drilling_start") && ch.includes("drilling_finished") && ch.includes("status"), ch.join());
  assert.ok(!ch.includes("empty"));
  assert.deepEqual(collarTableFieldChoices([]), []);
});

test("(1) (2) (6) wiring", () => {
  const l = read("../src/modules/LayoutModule.jsx");
  assert.match(l, /const tbH = titleBlockHeight\(\{ credit: !!credits, creditText: credits, w: base\.w \}\); if \(!spotIsFree\(elements, base, base\.w, tbH\)\)/);
  assert.ok(l.includes(String.raw`String(label).trim().toLowerCase() === "data" ? fillText(value, ctx).replace(/^\s*Data:\s*/i, "")`));
  assert.match(l, /base\.symbol = \(assayElements \|\| \[\]\)\.map\(\(a\) => a\.symbol\)\.find/);
  // the strip of 'Data:' acts on the filled text only
  const filled = "Data: BC ARIS assessment reports";
  assert.equal(filled.replace(/^\s*Data:\s*/i, ""), "BC ARIS assessment reports");
});

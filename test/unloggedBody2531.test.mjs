// TASKS.csv #2531 — a closed body of P grew through grade-control holes logged pegmatite-or-nothing (1.84 Mm³ against 0.74-0.77): their
// unlogged metres were unknown and nothing said so. The share is reported, and 'Treat unlogged metres as outside' closes the body there.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { unloggedDrilling } from "../src/lib/unloggedGaps.js";

const collars = [{ hole_id: "GC1", length: 30 }, { hole_id: "GC2", length: 20 }, { hole_id: "RC9", length: 50 }, { hole_id: "X", length: 0 }];
const litho = [
  { hole_id: "GC1", from: 4, to: 10, value: "P" }, { hole_id: "GC1", from: 18, to: 22, value: "P" },
  { hole_id: "GC2", from: 0, to: 20, value: "P" },
  { hole_id: "Z", from: 0, to: 5, value: "P" }, // a log with no collar: not drilled here
];

test("the drilled metres with no row: gaps, the tail, holes with no log", () => {
  const u = unloggedDrilling(collars, litho, () => true);
  assert.equal(u.drilled, 100);
  assert.deepEqual(u.rows, [{ hole_id: "GC1", from: 0, to: 4 }, { hole_id: "GC1", from: 10, to: 18 }, { hole_id: "GC1", from: 22, to: 30 }, { hole_id: "RC9", from: 0, to: 50 }]);
  assert.equal(u.metres, 70); assert.equal(u.holes, 2); assert.equal(u.noLog, 1);
});

test("a blank code is not a code with the default test; overlapping rows count once", () => {
  const u = unloggedDrilling([{ hole_id: "H", length: 10 }], [{ hole_id: "H", from: 0, to: 6, value: "P" }, { hole_id: "H", from: 3, to: 8, value: "P" }, { hole_id: "H", from: 8, to: 10, value: " " }]);
  assert.deepEqual(u.rows, [{ hole_id: "H", from: 8, to: 10 }]);
  assert.equal(unloggedDrilling([{ hole_id: "H", length: 10 }], [{ hole_id: "H", from: 0, to: 10, value: "P" }]).metres, 0);
});

test("wired: the unit body reports the share, adds outside samples when asked; the pane has the tick", () => {
  const r = readFileSync(new URL("../src/modules/viewer/modellingRuns.js", import.meta.url), "utf8");
  assert.match(r, /if \(isCode && !customSrc\) \{/);
  assert.match(r, /if \(bodyOpts\.unloggedOutside\) un\.rows\.forEach/);
  assert.match(r, /counted as unknown, not outside \{code\}, so nothing stops the body there/);
  const p = readFileSync(new URL("../src/components/ModellingCodesPane.jsx", import.meta.url), "utf8");
  assert.match(p, /checked=\{!!unitBody\.unloggedOutside\}/);
  for (const l of ["es", "pt", "fr", "ar"]) assert.ok(JSON.parse(readFileSync(new URL(`../src/locales/${l}.json`, import.meta.url), "utf8"))["Treat unlogged metres as outside"], l);
});

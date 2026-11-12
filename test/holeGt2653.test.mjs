// TASKS.csv #2653 — evidence from a grade's per-hole grade × thickness or metres above a cut-off (Best intercepts' rules, #2419's totals)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { holeIntervalPoints, gtRef, parseGtRef } from "../src/lib/evidenceSources.js";
import { computeBestIntercepts } from "../src/lib/geochem.js";
import { holeTotals } from "../src/lib/accumulation.js";
import { evidenceDeps } from "../src/lib/evidenceCache.js";

const vertical = (x, y, z, len) => [{ x, y, z, md: 0 }, { x, y, z: z - len, md: len }];
const traces = new Map([["A", vertical(0, 0, 100, 50)], ["B", vertical(100, 0, 100, 50)], ["C", vertical(200, 0, 100, 50)]]);
const units = { U: "ppm" };
const rows = [];
for (let d = 0; d < 20; d += 2) rows.push({ hole_id: "A", from: d, to: d + 2, values: { U: d >= 10 && d < 16 ? 500 : 20 } }); // 6 m at 500
for (let d = 0; d < 20; d += 2) rows.push({ hole_id: "B", from: d, to: d + 2, values: { U: d >= 4 && d < 6 ? 300 : 20 } }); // 2 m at 300
for (let d = 0; d < 20; d += 2) rows.push({ hole_id: "C", from: d, to: d + 2, values: { U: 20 } }); // nothing at the cut-off

test("per hole: GT and metres at or above 200 ppm; a hole assayed with nothing above is a 0 at its assayed middle", () => {
  const opts = { cutoff: 200, computeBestIntercepts, holeTotals };
  const gt = holeIntervalPoints(rows, "U", "ppm", units, traces, { ...opts, how: "gt" });
  const by = Object.fromEntries(gt.map((p) => [p.hole_id, p]));
  assert.equal(by.A.value, 3000); assert.equal(by.B.value, 600); assert.equal(by.C.value, 0);
  assert.equal(by.A.x, 0); assert.equal(by.B.x, 100); assert.equal(by.C.z, 90); // C at 10 m, the middle of its 0-20 m
  const m = holeIntervalPoints(rows, "U", "ppm", units, traces, { ...opts, how: "m" });
  assert.deepEqual(Object.fromEntries(m.map((p) => [p.hole_id, p.value])), { A: 6, B: 2, C: 0 });
});

test("the ref carries the cut-off; the cache follows the assays", () => {
  assert.equal(gtRef("U", "gt", 200), "gt:U:gt:200");
  assert.deepEqual(parseGtRef("gt:U:m:0.5"), { symbol: "U", how: "m", cutoff: 0.5 });
  assert.equal(parseGtRef("gt:U:x:1"), null); assert.equal(parseGtRef("gt:U:gt:abc"), null); assert.equal(parseGtRef("litho:value"), null);
  const d = { assays: [1], assayElements: [2], collars: [3], survey: [4], desurveyMethod: "m" };
  assert.deepEqual(evidenceDeps({ kind: "numeric", ref: "gt:U:gt:200" }, {}, d), [d.assays, d.assayElements, d.collars, d.survey, d.desurveyMethod]);
});

test("the pane: one list entry per lab element opens the cut-off form; the card is a numeric card with that ref", () => {
  const p = fs.readFileSync("src/components/EvidenceOverlayPane.jsx", "utf8");
  assert.match(p, /key: `gtpick:\$\{e\.symbol\}`/);
  assert.match(p, /if \(k\.startsWith\("gtpick:"\)\) setGtPick\(\{ symbol: k\.slice\(7\), how: "gt", cut: "" \}\); else if \(k\.startsWith\("gtlpick:"\)\)/); // a numeric log since #2781
  assert.match(p, /\/\* #2781 \*\/ else addLayer\(k\);/);
  assert.match(p, /kind: "numeric", ref: gtRef\(pick\.symbol, how, cut\) \};/); // #2961: one builder (perHoleSource) for the form and the restore
  assert.match(p, /const gtz = parseGtRef\(ref\);/);
});

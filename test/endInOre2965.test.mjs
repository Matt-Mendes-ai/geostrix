// TASKS.csv #2965 (review #2876, WA iron) — which holes stopped in ore had no route at all in Targeting (6 of 6,031 assayed holes there end
// with their last Fe sample at or above 55 %). Evidence overlay now lists them for a typed cut-off, each with 'Plan a deeper hole here'.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { holesEndingAbove } from "../src/lib/evidenceSources.js";

const vertical = (z0) => [{ md: 0, x: 0, y: 0, z: z0 }, { md: 100, x: 0, y: 0, z: z0 - 100 }];
const traces = new Map([["A", vertical(440)], ["B", vertical(440)], ["C", vertical(440)], ["D", vertical(440)]]);
const rows = [
  { hole_id: "A", from: 54, to: 56, g: 50 }, { hole_id: "A", from: 56, to: 58, g: 56.3 },              // ends in ore at 58 m of 58 m
  { hole_id: "B", from: 20, to: 22, g: 62 }, { hole_id: "B", from: 26, to: 28, g: 40 },                // ore above, last sample barren
  { hole_id: "C", from: 50, to: 52, g: 57 }, { hole_id: "C", from: 52, to: 54, g: null },              // the last sample with a value counts
  { hole_id: "D", from: 52, to: 54, g: 55 },                                                           // exactly the cut-off, short of its 60 m
  { hole_id: "NOTRACE", from: 0, to: 2, g: 70 },
];
const len = { A: 58, B: 28, C: 54, D: 60 };

test("#2965 the holes whose last sample of the element is at or above the cut-off, highest first", () => {
  const r = holesEndingAbove(rows, (a) => a.g, 55, traces, (h) => len[h] ?? null);
  assert.deepEqual(r.map((h) => h.hole_id), ["C", "A", "D"]);
  const a = r.find((h) => h.hole_id === "A");
  assert.deepEqual([a.from, a.to, a.value, a.length, a.atEnd], [56, 58, 56.3, 58, true]);
  assert.equal(a.z, 440 - 58, "the target is the sample's end");
  assert.equal(r.find((h) => h.hole_id === "D").atEnd, false, "2 m short of its 60 m");
  assert.equal(r.find((h) => h.hole_id === "C").to, 52, "a later row without a value is not the last sample");
  assert.deepEqual(holesEndingAbove(rows, (a) => a.g, NaN, traces), [], "no cut-off: no list (none is chosen for you)");
  assert.equal(holesEndingAbove(rows, (a) => a.g, 55, traces)[0].atEnd, null, "no length known: not said");
});

test("#2965 the list in Evidence overlay: a typed cut-off, Plan a deeper hole here", () => {
  const p = fs.readFileSync(new URL("../src/components/EvidenceOverlayPane.jsx", import.meta.url), "utf8");
  assert.ok(p.includes("<EndInOreList assays={cleanAssays} elements={labElements} units={assayUnits} traces={traces} collars={collars} survey={survey} onPlanTo={onPlanTo}"));
  const c = fs.readFileSync(new URL("../src/components/EndInOreList.jsx", import.meta.url), "utf8");
  assert.ok(c.includes('const [cut, setCut] = useState("");'), "the cut-off starts blank");
  assert.ok(c.includes("onPlanTo({ x: h.x, y: h.y, z: h.z })"));
  assert.ok(c.includes("checkableHoleLengths(collars, survey)"), "the hole's length from the collar or survey (#2167)");
});

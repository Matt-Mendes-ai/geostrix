// TASKS.csv #2049 (review #2013, 3D Modelling) — the halo's intensity floor offered logged_tstamp, iteration and rank but not the
// alteration intensity, which Woodjam stores as text ('1'..'5').
import test from "node:test";
import assert from "node:assert/strict";
import { numericLayerFields, numericCell, layerFieldPoints } from "../src/lib/evidenceSources.js";

const rows = Array.from({ length: 12 }, (_, i) => ({ hole_id: "DH24-119", from: i * 2, to: i * 2 + 2, value: "Pot", intensity: i === 3 ? "" : String(1 + (i % 5)),
  logged_tstamp: 45468.35 + i, iteration: 1, rank: 1, objectid: 100 + i, level: "", note: i ? "Top of hole is mod clay" : "3", width_m: 0.5 + i }));

test("text numbers count; time stamps, iterations, ranks and ids do not; intensity comes first", () => {
  assert.deepEqual(numericLayerFields(rows, { min: 3 }), ["intensity", "width_m"]);
});
test("a free-text field with a stray number is not numeric (90 % of the filled values must be numbers)", () => {
  assert.ok(!numericLayerFields(rows, { min: 1 }).includes("note"));
});
test("numericCell reads numbers and number-like text only", () => {
  assert.equal(numericCell("3"), 3); assert.equal(numericCell(" 2.5 "), 2.5); assert.equal(numericCell(4), 4);
  assert.equal(numericCell("3a"), null); assert.equal(numericCell(""), null); assert.equal(numericCell(NaN), null);
});
test("the evidence points read a text intensity", () => {
  const trace = [{ md: 0, x: 0, y: 0, z: 0 }, { md: 100, x: 0, y: 0, z: -100 }];
  const pts = layerFieldPoints(rows, "intensity", new Map([["DH24-119", trace]]));
  assert.equal(pts.length, 1); assert.equal(pts[0].value, 5);
});

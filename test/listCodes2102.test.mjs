// TASKS.csv #2102 — logged lists ('Py; Cpy') are each of their codes, and 'Unknown' is no code
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { codesOf, foldedCodes, zoneParts, zoneHolePoints } from "../src/lib/evidenceSources.js";

const trace = (x) => [{ x, y: 0, z: 100, md: 0 }, { x, y: 0, z: 0, md: 100 }];
const traces = new Map([["A", trace(0)], ["B", trace(100)], ["C", trace(200)]]);
const rows = [
  { hole_id: "A", from: 0, to: 10, value: "Cpy" }, { hole_id: "A", from: 10, to: 20, value: "Py; Cpy" },
  { hole_id: "B", from: 0, to: 10, value: "Cpy; Py; Py" }, { hole_id: "B", from: 10, to: 20, value: "Py, Mo + Cpy" },
  { hole_id: "C", from: 0, to: 10, value: "Unknown" }, { hole_id: "C", from: 10, to: 20, value: "Py" },
];

test("a list's codes, without the blank fill", () => {
  assert.deepEqual(codesOf({ value: "Py; Cpy" }), ["Py", "Cpy"]);
  assert.deepEqual(codesOf({ value: "Py, Mo + Cpy" }), ["Py", "Mo", "Cpy"]);
  assert.deepEqual(codesOf({ value: "Unknown" }), []);
  assert.deepEqual(codesOf({ value: " n/a " }), []);
  assert.deepEqual(codesOf({ value: "py" }, "value", true), ["PY"]);
});

test("one card per mineral, matching every list that holds it", () => {
  assert.deepEqual(foldedCodes(rows, traces, { min: 1 }).map((c) => [c.key, c.n]), [["CPY", 4], ["MO", 1], ["PY", 4]]); // 'Cpy; Py; Py' counts Py once
  assert.equal(zoneParts(rows, "Cpy", traces).length, 4);
  assert.equal(zoneParts(rows, "Py", traces).length, 4);
  const thick = zoneHolePoints(rows, "Cpy", traces, "thick");
  assert.deepEqual(thick.map((p) => [p.x, p.value]).sort((a, b) => a[0] - b[0]), [[0, 20], [100, 20], [200, 0]]);
});

test("the mineral percent sources take rows naming one mineral only", () => {
  assert.match(fs.readFileSync("src/components/EvidenceOverlayPane.jsx", "utf8"), /codesOf\(r\)\.length === 1 && codesOf\(r\)\[0\] === code/);
});

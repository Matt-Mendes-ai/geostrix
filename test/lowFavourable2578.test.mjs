// TASKS.csv #2578 — K/Rb is low where the pegmatite is fractionated, but a drillhole card favourable when low still mapped each 25 m bin's
// HIGHEST value: a hole with host rock at 100 and spodumene pegmatite at 7 read 100, like a barren hole. It now maps the lowest.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { holeGradePoints } from "../src/lib/evidenceSources.js";

const traces = new Map([["H1", [{ md: 0, x: 10, y: 10, z: 300 }, { md: 200, x: 10, y: 10, z: 100 }]]]);
const assays = [{ hole_id: "H1", from: 0, to: 100, values: { KRb: 100 } }, { hole_id: "H1", from: 100, to: 120, values: { KRb: 7 } }];

test("highest by default, lowest when asked", () => {
  assert.deepEqual(holeGradePoints(assays, "KRb", "ratio", {}, traces).map((p) => p.value), [100]);
  assert.deepEqual(holeGradePoints(assays, "KRb", "ratio", {}, traces, undefined, null, true).map((p) => p.value), [7]);
});

test("the card asks for the lowest when its membership is favourable when low, and keeps it when saved", () => {
  const p = readFileSync(new URL("../src/components/EvidenceOverlayPane.jsx", import.meta.url), "utf8");
  assert.match(p, /updateLayer\(l\.id, \{ shape, \.\.\.\(hole \? \{ lowest: shape === "decreasing" \} : \{\}\) \}, hole\)/);
  assert.match(p, /traces, undefined, lv, !!opts\.lowest\)/);
  assert.match(p, /\|\$\{opts\.lowest \? "lo" : ""\}\|L\$\{/);
  assert.match(p, /\.\.\.\(l\.lowest \? \{ lowest: true \} : \{\}\) \/\* #2578 \*\/,/);
});

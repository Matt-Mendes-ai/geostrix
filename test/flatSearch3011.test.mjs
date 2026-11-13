// TASKS.csv #3011 (WA iron review) — the flat search offered on the flattest deposit: holes 22 m apart sampled over 50 m across 21 km
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { flatSearchProposal } from "../src/lib/estimationShape.js";

test("22 m spacing, 50 m sampled, a 21 km field: offered, with the depth and width it rests on", () => {
  const traces = Array.from({ length: 60 }, (_, i) => [{ x: (i % 30) * 700, y: Math.floor(i / 30) * 22, z: 440 }, { x: (i % 30) * 700, y: Math.floor(i / 30) * 22, z: 390 }]);
  const p = flatSearchProposal({ traces, spans: Array(60).fill(50), spacingM: 22, compositeM: 2 });
  assert.ok(p, "offered");
  assert.equal(p.depthM, 50); assert.equal(p.widthM, 29 * 700);
  assert.equal(p.radius, 55); assert.equal(p.reachV, 3); assert.equal(p.cell, 6); assert.equal(p.cellHeight, 2);
});

test("the dialog says depth and width, not 'a small part of the hole spacing'", () => {
  const m = readFileSync(new URL("../src/components/GradeEstimationModal.jsx", import.meta.url), "utf8");
  assert.match(m, /drilled over \{d\} m of depth across \{w\} m \(the holes \{sp\} m apart, sampled over a median \{span\} m\)/);
});

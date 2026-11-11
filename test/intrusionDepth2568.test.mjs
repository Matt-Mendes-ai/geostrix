// TASKS.csv #2568 — 'Intrusions as bodies' filled in a depth of 500 m before the user said anything; the depth is now blank until set, with
// the deepest logged intercept of the unit offered.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { deepestUnitIntercept } from "../src/lib/holeMapContacts.js";

test("the deepest logged interval of the intrusive unit's codes", () => {
  const rows = [{ hole_id: "A", from: 0, to: 40, value: "PEG" }, { hole_id: "B", from: 120, to: 187.5, value: "PEG" }, { hole_id: "B", from: 187.5, to: 400, value: "AMP" }, { hole_id: "C", from: 0, to: 90, value: "peg2" }];
  assert.deepEqual(deepestUnitIntercept(rows, { PEG: "P", peg2: "P", AMP: "A" }, ["P"]), { unit: "P", depth: 187.5, hole: "B" });
  assert.equal(deepestUnitIntercept(rows, { PEG: "P" }, ["Q"]), null);
  assert.equal(deepestUnitIntercept(null, {}, ["P"]), null);
});

test("the depth starts blank, Build waits for it, and the logged depth is offered", () => {
  const p = readFileSync(new URL("../src/components/MapModelPanel.jsx", import.meta.url), "utf8");
  assert.match(p, /const \[bodyDepth, setBodyDepth\] = useState\(""\);/);
  assert.match(p, /disabled=\{!groundAt \|\| !bodyUnits\.length \|\| !\(Number\(bodyDepth\) >= 10\)\}/);
  assert.match(p, /tr\("Use \{d\} m \(deepest logged\)"/);
  assert.doesNotMatch(p, /\|\| 500\)/);
});

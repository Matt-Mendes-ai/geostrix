// TASKS.csv #1703 (review #1645, Copley) — 'East Dome' in the 3D View's Holes filter found nothing although every collar carries PROSPECT.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { holesForFilter, collarsMatching } from "../src/lib/holeFilter.js";

const collars = [
  { hole_id: "COP-23-0001", attrs: { PROSPECT: "North Dome" } },
  { hole_id: "COP-23-0002", attrs: { PROSPECT: "East Dome", year: "2023" } },
  { hole_id: "COP-23-0003", attrs: { PROSPECT: "East_Dome" } },
  { hole_id: "COP-23-0004", attrs: { PROSPECT: "Thunder Dome" } },
];
const ids = (r) => r.holes.map((c) => c.hole_id);

test("hole id terms answer first, as before", () => {
  const r = holesForFilter(collars, "0001, 0004");
  assert.deepEqual(ids(r), ["COP-23-0001", "COP-23-0004"]); assert.equal(r.byField, false);
  assert.deepEqual(ids(holesForFilter(collars, "")), collars.map((c) => c.hole_id));
});

test("text that matches no hole id lists the holes with it in a collar field ('_' reads as a space)", () => {
  const r = holesForFilter(collars, "East Dome");
  assert.deepEqual(ids(r), ["COP-23-0002", "COP-23-0003"]); assert.equal(r.byField, true);
  assert.deepEqual(ids(holesForFilter(collars, "dome")), collars.map((c) => c.hole_id));
  const none = holesForFilter(collars, "Halfway");
  assert.deepEqual(ids(none), []); assert.equal(none.byField, false);
});

test("a field=value term keeps its exact meaning (no fallback), and collarsMatching (the Layout drill plan's) is unchanged", () => {
  assert.deepEqual(ids(holesForFilter(collars, "prospect=west_dome")), []);
  assert.deepEqual(collarsMatching(collars, "East Dome"), []);
});

test("the 3D View's list and bar use it", () => {
  const v = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.match(v, /const tickedShown = \(collars, f\) => holesForFilter\(collars, f\)\.holes;/);
  const b = readFileSync(new URL("../src/modules/viewer/HoleFilterBar.jsx", import.meta.url), "utf8");
  assert.match(b, /const found = holesForFilter\(collars, filter\);/);
  assert.match(b, /\{found\.byField && <div role="status"/);
});

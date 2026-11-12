// TASKS.csv #2959 (WA iron review) — Model from map says before the run how many contact points and measurements have terrain under them
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mapGroundCount, thinLine } from "../src/lib/mapGroundCount.js";

test("thinLine: a point at the start and every step along, as the run thins the contacts", () => {
  assert.equal(thinLine([[0, 0], [100, 0]], 25).length, 5);
  assert.deepEqual(thinLine([[0, 0], [30, 0], [30, 30]], 25).map(([x, y]) => [x, y]), [[0, 0], [25, 0], [30, 20]]);
});

test("contact points between units of the order, and measurements, counted on and off the terrain", () => {
  const groundAt = (x) => (x < 50 ? 440 : NaN); // terrain only west of x = 50
  const contacts = [{ units: ["A", "B"], lines: [[[0, 0], [100, 0]]] }, { units: ["B", "C"], lines: [[[0, 10], [100, 10]]] }];
  const r = mapGroundCount({ contacts, order: ["A", "B"], groundAt, measurements: [{ x: 10, y: 0, dip: 5, dipDir: 0 }, { x: 80, y: 0, dip: 5, dipDir: 0 }, { x: 80, y: 0, dip: NaN, dipDir: 0 }] });
  assert.deepEqual(r, { points: 5, pointsOnGround: 2, measurements: 2, measurementsOnGround: 1 });
});

test("the pane says it before the Build button", () => {
  const p = readFileSync(new URL("../src/components/MapModelPanel.jsx", import.meta.url), "utf8");
  assert.match(p, /mapGroundCount\(\{ contacts: extractMapContacts\(layer, unitField\)\.contacts, order, groundAt, measurements: \[\.\.\.bedding, \.\.\.planes\] \}\)/);
  assert.ok(p.indexOf('tr("Terrain under the inputs:') < p.indexOf("<button onClick={() => onRun({ layer, field: unitField, order,"));
});

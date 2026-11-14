// TASKS.csv #3132 (split from #3078) — Downhole logs keep their readings to the holes checked in the 3D View, or to the collars inside an area
// (a closed boundary), instead of always reading the whole project.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { logHoleChoices, holesForChoice, filterLogData, isAreaBoundary } from "../src/lib/logHoleFilter.js";

const collars = Array.from({ length: 12 }, (_, i) => ({ hole_id: i < 6 ? `A${i}` : i, x: 100 * (i % 4), y: 100 * Math.floor(i / 4) })); // 4 x 3 at 100 m; numeric ids too
const square = { id: "b1", name: "North block", polylines: [[{ x: -50, y: 50 }, { x: 350, y: 50 }, { x: 350, y: 250 }, { x: -50, y: 250 }]], closedFlags: [true] }; // rows y = 100, 200
const holed = { id: "b2", name: "Ring", polylines: [square.polylines[0], [{ x: 50, y: 150 }, { x: 150, y: 150 }, { x: 150, y: 250 }, { x: 50, y: 250 }]] }; // a hole over (100, 200)
const line = { id: "b3", name: "Fault", polylines: [[{ x: 0, y: 0 }, { x: 300, y: 300 }]], closedFlags: [false] };
const visibleHoles = { A1: false, 7: false };

test("the choices: every hole, the holes checked in the 3D View (when some are unchecked), and each closed boundary; an open line is no area", () => {
  const ch = logHoleChoices({ collars, boundaries: [square, holed, line], visibleHoles });
  assert.deepEqual(ch.map((c) => c.key), ["all", "checked", "area:b1", "area:b2"]);
  assert.deepEqual(logHoleChoices({ collars, boundaries: [], visibleHoles: null }).map((c) => c.key), ["all"], "nothing unchecked, no area: no choice");
  assert.equal(isAreaBoundary(line), false); assert.equal(isAreaBoundary(holed), true);
});

test("the holes each choice keeps: checked ones (a hole absent from the list is checked), collars inside an area (a hole in the boundary is outside)", () => {
  const ctx = { collars, boundaries: [square, holed, line], visibleHoles };
  assert.equal(holesForChoice("all", ctx), null);
  const checked = holesForChoice("checked", ctx);
  assert.equal(checked.size, 10); assert.ok(!checked.has("A1") && !checked.has("7") && checked.has("A0") && checked.has("8"));
  assert.deepEqual([...holesForChoice("area:b1", ctx)].sort(), ["10", "11", "6", "7", "8", "9", "A4", "A5"], "the rows at y = 100 (A4, A5, 6, 7) and y = 200 (8 to 11)");
  const ring = holesForChoice("area:b2", ctx);
  assert.ok(!ring.has("9"), "the collar at (100, 200) sits in the boundary's hole");
  assert.equal(holesForChoice("area:gone", ctx), null, "an area since removed: every hole");
});

test("the readings kept to those holes, with the counts the pane says", () => {
  const data = { symbol: "Gamma", assays: [{ hole_id: "A0", from: 0, to: 1, values: { Gamma: 1 } }, { hole_id: "A1", from: 0, to: 1, values: { Gamma: 2 } }, { hole_id: 7, from: 0, to: 1, values: { Gamma: 3 } }, { hole_id: 8, from: 0, to: 1, values: { Gamma: 4 } }] };
  assert.equal(filterLogData(data, null), data);
  const kept = filterLogData(data, new Set(["A0", "8", "11"]));
  assert.deepEqual(kept.assays.map((r) => r.values.Gamma), [1, 4]);
  assert.deepEqual(kept.holeFilter, { holes: 3, holesWithReadings: 2, readings: 2, of: 4 });
  const p = readFileSync(new URL("../src/components/DownholeLogsPane.jsx", import.meta.url), "utf8");
  assert.match(p, /const data = useMemo\(\(\) => filterLogData\(dataAll, keptHoles\), \[dataAll, keptHoles\]\);/);
  assert.match(p, /useKeptState\(keptScope, "dhlogs\.holes", "all"\)/);
  assert.doesNotMatch(p, /useState\(/, "#2394 — kept state only");
});

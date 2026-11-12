// TASKS.csv #2428 (review #2325, WA uranium) — a new structural trend opened at dip 45° → 90° on 430 vertical holes through flat
// strata, and 'Set the plane from…' was an empty list. A new trend starts from the tops of the unit logged in the most holes (or
// flat), and the list always offers 'Horizontal' and the tops of each logged unit.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { startingTrendPlane } from "../src/lib/trendStart.js";

// tops on a grid of holes: flat (z = -20 ± 0.3) or dipping 20° towards the east (z falls with x)
const grid = (zAt) => { const pts = []; let s = 5; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647 - 0.5);
  for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) { const x = i * 100, y = j * 100; pts.push({ x, y, z: zAt(x, y) + r() * 0.6 }); } return pts; };

test("flat-lying tops start the trend flat", () => {
  const s = startingTrendPlane([{ code: "LIG", pts: grid(() => -20) }, { code: "SAND", pts: grid(() => -5).slice(0, 4) }]);
  assert.equal(s.code, "LIG", "the unit in the most holes");
  assert.equal(s.n, 36);
  assert.ok(s.dip < 1, "near flat: " + s.dip);
});

test("dipping tops give their dip and dip direction", () => {
  const t20 = Math.tan((20 * Math.PI) / 180);
  const s = startingTrendPlane([{ code: "BASALT", pts: grid((x) => -x * t20) }]);
  assert.ok(Math.abs(s.dip - 20) < 1, "dip " + s.dip);
  assert.ok(Math.abs(s.dipAzimuth - 90) < 2, "towards the east: " + s.dipAzimuth);
});

test("no unit fixes a plane: flat, with no unit named", () => {
  assert.deepEqual(startingTrendPlane([]), { dip: 0, dipAzimuth: null, code: null, n: 0, planarity: null });
  assert.equal(startingTrendPlane([{ code: "A", pts: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }] }]).code, null, "two holes");
  const line = Array.from({ length: 8 }, (_, i) => ({ x: i * 50, y: 0, z: -10 - i }));
  assert.equal(startingTrendPlane([{ code: "A", pts: line }]).code, null, "one fence of holes fixes no plane");
});

test("the panel starts from the data and offers Horizontal and unit tops", () => {
  const src = readFileSync(new URL("../src/components/TrendsPanel.jsx", import.meta.url), "utf8");
  assert.match(src, /const start = startingTrendPlane\(unitTopPoints \?/);
  assert.match(src, /dip: start\.dip, \.\.\.\(start\.dipAzimuth != null \? \{ dipAzimuth: start\.dipAzimuth \} : \{\}\)/);
  assert.match(src, /are a starting guess, not measured/);
  assert.match(src, /<option value="flat">\{tr\("Horizontal \(dip 0°\)"\)\}<\/option>/);
  assert.match(src, /value=\{`tops:\$\{u\}`\}/);
  assert.match(src, /kind === "tops"/);
  const panes = readFileSync(new URL("../src/modules/viewer/ModellingPanes.jsx", import.meta.url), "utf8");
  assert.match(panes, /units=\{litho_units\} unitTopPoints=\{\(code\) => \(topsOfUnit\(code\)\?\.tops \|\| \[\]\)\.map\(\(t\) => sheetPositionAt\(t\.hole_id, t\.md\)\)/);
});

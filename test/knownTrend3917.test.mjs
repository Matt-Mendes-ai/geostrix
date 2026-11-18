// TASKS.csv #3917 — "I know my trend" from three points clicked in the 3D view, or from a modelled or imported surface (lib/trendCandidates.js
// planeFromThreePoints, surfaceTrend), in words like the typed one, with the disc; points nearly in a line, or a surface along a line or lying
// flat, said plainly. SYNTHETIC points only.
import test from "node:test";
import assert from "node:assert/strict";
import { planeFromThreePoints, surfaceTrend } from "../src/lib/trendCandidates.js";
const tan30 = Math.tan(Math.PI / 6);

test("#3917 three points: the plane through them, in words and numbers", () => {
  // a plane dipping 30° to the east: z = -tan(30°) x
  const c = planeFromThreePoints([{ x: 0, y: 0, z: 0 }, { x: 100, y: 0, z: -100 * tan30 }, { x: 0, y: 200, z: 0 }]);
  assert.ok(Math.abs(c.dip - 30) < 1e-6 && Math.abs(c.dipAzimuth - 90) < 1e-6, JSON.stringify(c));
  assert.equal(c.words, "Runs north–south and tilts gently to the east.");
  assert.equal(c.numbers, "dip 30° → 090°");
  assert.equal(c.id, "typed");
  // the order of the clicks does not matter
  const r = planeFromThreePoints([{ x: 0, y: 200, z: 0 }, { x: 100, y: 0, z: -100 * tan30 }, { x: 0, y: 0, z: 0 }]);
  assert.ok(Math.abs(r.dip - 30) < 1e-6 && Math.abs(r.dipAzimuth - 90) < 1e-6);
});

test("#3917 three points nearly in a line, in one place, or too few: said plainly", () => {
  assert.match(planeFromThreePoints([{ x: 0, y: 0, z: 0 }, { x: 100, y: 0, z: 0 }, { x: 200, y: 5, z: 0 }]).error, /nearly in a line/);
  assert.match(planeFromThreePoints([{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 50, y: 10, z: 0 }]).error, /same place/);
  assert.equal(planeFromThreePoints([{ x: 0, y: 0, z: 0 }]).error, "Click three points: 1 so far.");
  const flat = planeFromThreePoints([{ x: 0, y: 0, z: 0 }, { x: 100, y: 0, z: 1 }, { x: 0, y: 100, z: 0 }]);
  assert.ok(!flat.error && /lies flat/.test(flat.note));
});

test("#3917 a surface: its best-fit plane, its spread as the strength; along a line said", () => {
  let s = 7;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647 - 0.5);
  const smooth = [], rough = [];
  for (let x = 0; x <= 500; x += 25) for (let y = 0; y <= 500; y += 25) {
    smooth.push({ x, y, z: -tan30 * x + rnd() });
    rough.push({ x, y, z: -tan30 * x + 400 * Math.sin(x / 40) * Math.cos(y / 50) });
  }
  const a = surfaceTrend("Unit B top", smooth);
  assert.ok(Math.abs(a.dip - 30) < 1 && Math.abs(a.dipAzimuth - 90) < 1, JSON.stringify(a));
  assert.equal(a.strength, "strong");
  assert.match(a.spread, /^It strays \d+ % of its extent from that plane on average\.$/);
  assert.equal(a.reason, "The best-fit plane of Unit B top.");
  assert.equal(surfaceTrend("Folded", rough).strength, "weak");
  assert.match(surfaceTrend("A line", [{ x: 0, y: 0, z: 0 }, { x: 10, y: 10, z: 1 }, { x: 20, y: 20, z: 2 }, { x: 30, y: 30, z: 3 }]).error, /lies along a line/);
  assert.match(surfaceTrend("Empty", []).error, /too few points/);
});

// TASKS.csv #1952 / #1948 (Vulcan review) — a benched pit design with faces and berms by wall sector, and a ramp spiralling up the
// wall at a typed gradient and width, its rock in the design
import test from "node:test";
import assert from "node:assert/strict";
import { shellFloors, benchedPit, benchStringFeatures } from "../src/lib/pitDesign.js";

// a 90 x 90 m floor at 940 m under flat ground at 1,000 m (as test/pitDesign1874)
function squareShell(floorZ = 940) {
  const pos = [];
  for (let y = -70; y <= 70; y += 10) for (let x = -70; x <= 70; x += 10) pos.push(500000 + x, 5000000 + y, Math.abs(x) <= 45 && Math.abs(y) <= 45 ? floorZ : 1000);
  return Float64Array.from(pos);
}
const GROUND = () => 1000;
const extentOf = (d, rl, kind, axis) => { const s = d.strings.find((x) => x.kind === kind && x.rl === rl); return s ? Math.max(...s.lines.flat().map((p) => p[axis] - (axis === 0 ? 500000 : 5000000))) : NaN; };

test("a flatter face and a wider berm on the east wall push the east crest out and leave the west as it was", () => {
  const s = shellFloors(squareShell(), GROUND);
  const plain = benchedPit(s, { groundAt: GROUND, benchH: 10, berm: 5, batterDeg: 60 });
  const d = benchedPit(s, { groundAt: GROUND, benchH: 10, berm: 5, batterDeg: 60, sectors: { E: { batterDeg: 45, berm: 10 } } });
  assert.deepEqual(d.sectorsUsed.E, { batterDeg: 45, berm: 10 }); assert.deepEqual(d.sectorsUsed.W, { batterDeg: 60, berm: 5 });
  const topE = extentOf(d, 1000, "crest", 0), topEplain = extentOf(plain, 1000, "crest", 0);
  assert.ok(topE > topEplain + 15, `east crest ${topE} vs ${topEplain}`); // 6 faces of 10 m at 45 instead of 60 (+4.2 m each) and 5 berms 5 m wider
  const west = (dd) => { const c = dd.strings.find((x) => x.kind === "crest" && x.rl === 1000); return Math.min(...c.lines.flat().map((p) => p[0] - 500000)); };
  assert.ok(Math.abs(west(d) - west(plain)) < 2 * d.cell, "the west wall is unchanged");
  assert.ok(d.totals.rockT > plain.totals.rockT);
});

test("a ramp widens the benches along its arc, descends bench by bench, and its rock is counted", () => {
  const s = shellFloors(squareShell(), GROUND);
  const plain = benchedPit(s, { groundAt: GROUND, benchH: 10, berm: 5, batterDeg: 60 });
  const d = benchedPit(s, { groundAt: GROUND, benchH: 10, berm: 5, batterDeg: 60, ramp: { azimuthDeg: 0, turn: "clockwise", gradientPct: 10, widthM: 10 } });
  assert.ok(d.ramp && d.ramp.benches >= 1, "a ramp");
  assert.equal(d.ramp.needsSwitchback, false);
  // each bench climbs 10 m at 10 %: a 100 m run per bench
  for (const a of d.ramp.arcs) assert.ok(Math.abs(a.runM - 100) < 2, `run ${a.runM}`);
  assert.ok(Math.abs(d.ramp.lengthM - 100 * d.ramp.benches) < 2 * d.ramp.benches);
  assert.ok(d.ramp.rockT > 0);
  assert.ok(d.totals.rockT > plain.totals.rockT, "the road's rock is in the design");
  // the road's centreline descends along each arc, and the strings export under RAMP layers
  const cl = d.strings.filter((x) => x.kind === "ramp_centre");
  assert.equal(cl.length, d.ramp.benches);
  for (const c of cl) { const z = c.lines[0].map((p) => p[2]); for (let i = 1; i < z.length; i++) assert.ok(z[i] <= z[i - 1] + 1e-9); assert.ok(Math.abs(z[0] - z[z.length - 1] - 10) < 1e-6); }
  assert.ok(benchStringFeatures(d.strings).some((f) => /^RAMP_CL_/.test(f.attributes.name)) && benchStringFeatures(d.strings).some((f) => /^RAMP_EDGE_/.test(f.attributes.name)));
  // the arcs follow the turn: clockwise climbing means the bearing goes down the way from one bench to the next
  for (const a of d.ramp.arcs) assert.ok(a.sweepDeg > 0 && a.sweepDeg < 350);
  // a wall too short for the run: a 2 % gradient needs 500 m per bench, more than this pit's perimeter
  const steep = benchedPit(s, { groundAt: GROUND, benchH: 10, berm: 5, batterDeg: 60, ramp: { azimuthDeg: 90, turn: "anticlockwise", gradientPct: 2, widthM: 10 } });
  assert.equal(steep.ramp.needsSwitchback, true);
  assert.equal(steep.ramp.benches, 0);
});

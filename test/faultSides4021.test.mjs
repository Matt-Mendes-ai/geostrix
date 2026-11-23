// TASKS.csv #4021 — Model from map, Erosional with faults was singular: a fault offset tops whose points all lay on one side of it. Each fault
// now offsets only the tops with points on both of its sides. Made-up faults and tops only.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { faultSide, faultOffsetsBySides } from "../src/lib/faultSides.js";

// a north-south fault trace at x = 0 on flat ground (z 100), dipping 60 towards 090 (east)
const trace = [{ x: 0, y: -1000, z: 100 }, { x: 0, y: 0, z: 100 }, { x: 0, y: 1000, z: 100 }];

test("#4021 the side of a fault: the way it dips is positive, and at depth the plane has moved down dip", () => {
  assert.ok(faultSide({ x: 200, y: 0, z: 100 }, trace, 60, 90) > 0, "east of the trace, at the surface: hangingwall");
  assert.ok(faultSide({ x: -200, y: 300, z: 100 }, trace, 60, 90) < 0, "west: footwall");
  // 300 m down, the plane is 300 / tan 60 = 173 m east: a point 100 m east of the trace there is on the footwall side
  const d = faultSide({ x: 100, y: 0, z: -200 }, trace, 60, 90);
  assert.ok(Math.abs(d - (100 - 300 / Math.tan(Math.PI / 3))) < 1e-9, `at depth: ${d}`);
  assert.ok(faultSide({ x: 300, y: 5000, z: 100 }, trace, 60, 90) > 0, "past the trace's end, still the hangingwall (GemPy extends the fault)");
});

test("#4021 a fault offsets only the tops with points on both of its sides", () => {
  const line = (x0, n, y0 = -900) => Array.from({ length: n }, (_, i) => ({ x: x0, y: y0 + i * 200, z: 100 }));
  const tops = [
    { meshName: "Both", points: [...line(-500, 5), ...line(500, 5)] },
    { meshName: "West only", points: line(-500, 8) },
    { meshName: "Barely across", points: [...line(-500, 6), ...line(500, 2)] }, // 2 east: fewer than 3
    { meshName: "On the fault", points: [...line(-500, 4), ...line(20, 6)] }, // the east ones within 50 m of the trace
  ];
  const r = faultOffsetsBySides([{ meshName: "Fault A", points: trace, orientations: [{ dip: 60, azimuth: 90 }] }], tops);
  assert.deepEqual(r["Fault A"].offsets, ["Both"]);
  assert.deepEqual(r["Fault A"].oneSided, ["West only", "Barely across", "On the fault"]);
  // no orientation or no trace: nothing to judge by, GemPy's default (every top)
  const n = faultOffsetsBySides([{ meshName: "F", points: [trace[0]], orientations: [] }], tops);
  assert.deepEqual(n.F.offsets, tops.map((t) => t.meshName));
});

test("#4021 Model from map sends each fault the tops it offsets, and says which a fault leaves alone", () => {
  const r = fs.readFileSync(new URL("../src/modules/viewer/modellingRuns.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(r, /const \{ faultOffsetsBySides \} = await import\("\.\.\/\.\.\/lib\/faultSides\.js"\);/);
  assert.match(r, /const sides = faultOffsetsBySides\(faultSpecs, specs\);/);
  assert.match(r, /for \(const f of faultSpecs\) f\.offsets = sides\[f\.meshName\]\.offsets;/);
});

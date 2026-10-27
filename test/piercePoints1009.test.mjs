// TASKS.csv #1009 — where a planned hole crosses the modelled surfaces: depth, vertical depth and angle.
import test from "node:test";
import assert from "node:assert/strict";
import { piercePoints, piercePointRows } from "../src/lib/piercePoints.js";

// a horizontal surface at elevation 900 and a vertical one at x = 60, both 2 km wide
const flat = { id: "s1", name: "Top of VCL", positions: [-1000, -1000, 900, 1000, -1000, 900, 1000, 1000, 900, -1000, 1000, 900], indices: [0, 1, 2, 0, 2, 3] };
const wall = { id: "s2", name: "Fault", positions: [60, -1000, 0, 60, 1000, 0, 60, 1000, 2000, 60, -1000, 2000], indices: [0, 1, 2, 0, 2, 3] };
// a straight hole from (0, 0, 1000) dipping 45 deg east, 300 m, sampled every 10 m
const s = Math.SQRT1_2;
const trace = Array.from({ length: 31 }, (_, i) => ({ md: i * 10, x: i * 10 * s, y: 0, z: 1000 - i * 10 * s }));

test("#1009: the hole crosses the flat surface at 141.4 m (100 m vertical) at 45 deg, and the wall at 84.9 m", () => {
  const ps = piercePoints(trace, [flat, wall]);
  assert.deepEqual(ps.map((p) => p.surfaceName), ["Fault", "Top of VCL"]); // sorted by depth
  const [f, v] = ps;
  assert.ok(Math.abs(f.md - 60 / s) < 1e-6, `${f.md}`);
  assert.ok(Math.abs(v.md - 100 / s) < 1e-6 && Math.abs(v.verticalDepth - 100) < 1e-6 && Math.abs(v.z - 900) < 1e-9);
  assert.ok(Math.abs(v.angle - 45) < 1e-6 && Math.abs(f.angle - 45) < 1e-6);
});

test("#1009: no crossing, a crossing on a trace vertex counted once, and the CSV rows", () => {
  assert.deepEqual(piercePoints(trace.slice(0, 5), [flat]), []);
  const onVertex = { ...flat, id: "s3", positions: flat.positions.map((v, i) => (i % 3 === 2 ? 1000 - 100 * s : v)) }; // z = trace[10].z
  assert.equal(piercePoints(trace, [onVertex]).length, 1);
  const rows = piercePointRows([{ hole: { name: "PSB-03-014" }, pierces: piercePoints(trace, [flat]) }]);
  assert.deepEqual(Object.keys(rows[0]), ["hole", "surface", "depth_m", "vertical_depth_m", "easting", "northing", "elevation", "angle_to_surface_deg"]);
  assert.equal(rows[0].depth_m, 141.42);
});

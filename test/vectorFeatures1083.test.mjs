// TASKS.csv #1083 — the Shapefile / GeoPackage / DXF feature builder, now lib/viewer/vectorFeatures.js.
import test from "node:test";
import assert from "node:assert/strict";
import { buildVectorFeatures } from "../src/lib/viewer/vectorFeatures.js";

// one vertical hole at (1000, 2000) from z 500 down to z 400: world arrays beside the depth list (the viewer's tracesRef)
const trace = { hole_id: "H1", pts: [{ md: 0 }, { md: 50 }, { md: 100 }], wx: [1000, 1000, 1000], wy: [2000, 2000, 2000], wz: [500, 450, 400] };
const collars = [
  { hole_id: "H1", x: 1000, y: 2000, z: 500, azimuth: 45, dip: 60, length: 100, year: 2023, _internal: "x" }, // dip stored positive-down
  { hole_id: "BAD", x: NaN, y: 1, z: 1 },
];

test("#1083 collars: points, dip written negative-down, grid and true azimuth, custom fields kept, internals not", () => {
  const { features, geomType } = buildVectorFeatures("collars", null, { collars, epsg: 26910 });
  assert.equal(geomType, "point");
  assert.equal(features.length, 1); // the collar without coordinates is left out
  const a = features[0].attributes;
  assert.deepEqual(features[0].geometry, [[1000, 2000, 500]]);
  assert.equal(a.dip, -60);
  assert.equal(a.azim_grid, 45);
  assert.ok(Number.isFinite(a.azim_true) && Math.abs(a.azim_true - 45) < 5); // differs by the grid convergence
  assert.equal(a.year, 2023);
  assert.ok(!("_internal" in a) && !("x" in a));
  assert.equal(buildVectorFeatures("collars", null, { collars }).features[0].attributes.azim_true, null); // no CRS: no true bearing
});

test("#1083 survey: the desurveyed trace, one polyline per hole", () => {
  const { features, geomType } = buildVectorFeatures("survey", null, { traces: [trace, { hole_id: "ONE", pts: [{ md: 0 }], wx: [0], wy: [0], wz: [0] }] });
  assert.equal(geomType, "polyline");
  assert.equal(features.length, 1);
  assert.deepEqual(features[0].geometry, [[1000, 2000, 500], [1000, 2000, 450], [1000, 2000, 400]]);
});

test("#1083 drillhole layers: intervals as 2-vertex lines, points at mid depth, planes at their depth, geophysics as is", () => {
  const layers = {
    litho: [{ hole_id: "H1", from: 10, to: 30, value: "VCL", _row: 3 }, { hole_id: "NOPE", from: 0, to: 1, value: "X" }],
    mnlgy: [{ hole_id: "H1", from: 20, to: 40, value: "py" }],
    structure: [{ hole_id: "H1", depth: 75, type: "FLT", dip: 60, azimuth: 120 }],
    geophys_pts: [{ x: 1, y: 2, z: 3, value: 9 }, { x: "", y: 2 }],
  };
  const li = buildVectorFeatures("layer", "litho", { traces: [trace], layers });
  assert.equal(li.geomType, "polyline");
  assert.equal(li.features.length, 1); // a hole with no trace is skipped
  assert.deepEqual(li.features[0].geometry, [[1000, 2000, 490], [1000, 2000, 470]]);
  assert.deepEqual(li.features[0].attributes, { hole_id: "H1", from: 10, to: 30, value: "VCL" });
  const mn = buildVectorFeatures("layer", "mnlgy", { traces: [trace], layers });
  assert.deepEqual(mn.features[0].geometry, [[1000, 2000, 470]]); // mid of 20-40
  const st = buildVectorFeatures("layer", "structure", { traces: [trace], layers, epsg: 26910 });
  assert.deepEqual(st.features[0].geometry, [[1000, 2000, 425]]);
  assert.equal(st.features[0].attributes.dip, 60);
  assert.ok("dipdir_grid" in st.features[0].attributes && "strike_rhr" in st.features[0].attributes, JSON.stringify(st.features[0].attributes));
  const gp = buildVectorFeatures("layer", "geophys_pts", { layers });
  assert.equal(gp.features.length, 1);
  assert.deepEqual(gp.features[0].geometry, [[1, 2, 3]]);
  assert.deepEqual(buildVectorFeatures("layer", "no_such_layer", { layers }), { features: [], geomType: "point" });
});

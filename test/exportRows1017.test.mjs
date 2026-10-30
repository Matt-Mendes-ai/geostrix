// TASKS.csv #1017 — the last data exports that were built inline in their dialogs, now in lib with tests: the swath
// check, the grade-tonnage table, a reprojected table, the catchment GeoTIFF bands, the drillhole-layer DXF, and the
// outcrop-structure features behind the KML / GeoPackage export.
import test from "node:test";
import assert from "node:assert/strict";
import { swathRows } from "../src/lib/estimateCheck.js";
import { gradeTonnageRows } from "../src/lib/gradeTonnage.js";
import { reprojectTableRows } from "../src/lib/fileReproject.js";
import { catchmentBands } from "../src/lib/catchments.js";
import { vectorDxfText } from "../src/lib/viewer/vectorDxf.js";
import { surfaceStructureFeatures, surfaceStructureRows } from "../src/lib/overlayExport.js";

test("#1017 swath rows: depths to 2 dp, means to 5 significant figures, blanks where a bin is empty", () => {
  const rows = swathRows([{ from: 0, to: 25.004, mid: 12.5, compositeN: 4, composite: 1.234567, blocks: 10, nn: 1.1, estimate: 1.2 }, { from: 25, to: 50, compositeN: 0, composite: null, blocks: 0, nn: null, estimate: null }], { axis: "x", symbol: "Au" });
  assert.deepEqual(rows[0], { axis: "x", from_m: 0, to_m: 25, composites: 4, composite_mean_Au: 1.2346, blocks: 10, nn_mean_Au: 1.1, estimate_mean_Au: 1.2 });
  assert.deepEqual([rows[1].composite_mean_Au, rows[1].nn_mean_Au, rows[1].estimate_mean_Au], ["", "", ""]);
});

test("#1017 grade-tonnage rows: tonnes and metal only with a density", () => {
  const t = [{ cutoff: 0.5, blocks: 120, volumeM3: 1234.6, meanGrade: 1.234567, tonnes: 3333.4, metal: 4115.2 }, { cutoff: 5, blocks: 0, volumeM3: 0, meanGrade: null, tonnes: 0, metal: null }];
  assert.deepEqual(Object.keys(gradeTonnageRows(t, { vname: "Au_gpt" })[0]), ["cutoff", "blocks", "volume_m3", "mean_Au_gpt"]);
  const full = gradeTonnageRows(t, { vname: "Au_gpt", density: 2.7, metal: { unit: "g" } });
  assert.deepEqual(full[0], { cutoff: 0.5, blocks: 120, volume_m3: 1235, mean_Au_gpt: 1.2346, tonnes: 3333, metal_g: 4115 });
  assert.deepEqual([full[1].mean_Au_gpt, full[1].metal_g], ["", ""]);
});

test("#1017 a reprojected table: every row kept, blanks (not 0) for a missing coordinate, decimals by CRS kind", () => {
  const rows = [{ id: "A", E: "500000", N: "6000000" }, { id: "B", E: "", N: "6000000" }, { id: "C", E: "abc", N: "1" }];
  const T = (x, y) => [x / 1e5 + 0.123456789123, y / 1e5];
  const geo = reprojectTableRows(rows, { xCol: "E", yCol: "N", xName: "E_EPSG4326", yName: "N_EPSG4326", T, geographic: true });
  assert.equal(geo.bad, 2);
  assert.deepEqual(geo.rows[0], { id: "A", E: "500000", N: "6000000", E_EPSG4326: 5.12345679, N_EPSG4326: 60 });
  assert.deepEqual([geo.rows[1].E_EPSG4326, geo.rows[2].N_EPSG4326], ["", ""]);
  assert.equal(reprojectTableRows(rows, { xCol: "E", yCol: "N", xName: "x", yName: "y", T, geographic: false }).rows[0].x, 5.123);
});

test("#1017 catchment bands: class 1 / 2 / 3, rank and productivity per node, no data outside placed catchments", () => {
  const a = { background: 20, label: [0, 1, 2, -1, 3], results: [
    { placed: true, anomalous: true, value: 90, rank: 1, productivity: 2.5 },
    { placed: true, anomalous: false, value: 30, rank: 2, productivity: null },
    { placed: true, anomalous: false, value: 10, rank: 3, productivity: 0.4 },
    { placed: false, value: 99 },
  ] };
  const { cls, rank, prod } = catchmentBands(a, 5);
  assert.deepEqual(Array.from(cls.slice(0, 3)), [3, 2, 1]);
  assert.ok(Number.isNaN(cls[3]) && Number.isNaN(cls[4])); // no site / not placed
  assert.deepEqual(Array.from(rank.slice(0, 3)), [1, 2, 3]);
  assert.ok(Number.isNaN(prod[1]));
  assert.ok(Math.abs(prod[0] - 2.5) < 1e-6);
});

test("#1017 drillhole-layer DXF: one layer per logged value, structure picks labelled dip/ddd, the CRS comment record", () => {
  const lines = { geomType: "polyline", features: [{ geometry: [[0, 0, 100], [0, 0, 90]], attributes: { value: "VCL" } }, { geometry: [[0, 0, 90], [0, 0, 80]], attributes: { value: "DACT" } }] };
  const li = vectorDxfText(lines, { kind: "layer", key: "litho", label: "Lithology", crs: "EPSG:26910" });
  assert.ok(li.perValue && !li.picks);
  assert.ok(li.text.startsWith("999\nGeoStrix Lithology | Project CRS: EPSG:26910\n"));
  assert.match(li.text, /\nLITHO_VCL\n/);
  assert.match(li.text, /\nLITHO_DACT\n/);
  const st = vectorDxfText({ geomType: "point", features: [{ geometry: [[1, 2, 3]], attributes: { type: "FLT", dip: 59.6, dipdir_grid: 7.2 } }] }, { kind: "layer", key: "structure", label: "Structures", crs: "not set" });
  assert.ok(st.picks);
  assert.match(st.text, /\n60\/007\n/); // dip / zero-padded dip direction
  assert.match(st.text, /\nSTRUCTURE_FLT\n/);
  const collars = vectorDxfText({ geomType: "point", features: [{ geometry: [[1, 2, 3]], attributes: { hole_id: "H1" } }] }, { kind: "collars", key: null, label: "Collars", crs: "not set" });
  assert.ok(!collars.perValue && !collars.picks);
});

test("#1017 outcrop structures to KML / GeoPackage: one Z point per measurement, the same attributes as the CSV", () => {
  const set = { name: "Mapping", rows: [{ x: 500000, y: 6000000, z: 950, dip: 60, dipDir: 120, type: "bedding" }, { x: 500010, y: 6000010, dip: 45, dipDir: 300, type: "joint" }] };
  const rows = surfaceStructureRows(set, 26910);
  const f = surfaceStructureFeatures(set, 26910);
  assert.equal(f.geomType, "point");
  assert.equal(f.features.length, rows.length);
  assert.deepEqual(f.features[0].geometry, [[500000, 6000000, 950]]);
  assert.equal(f.features[1].geometry[0][2], 0); // no elevation recorded: 0, not NaN
  assert.deepEqual(Object.keys(f.features[0].attributes).sort(), Object.keys(rows[0]).filter((k) => !["x", "y", "z"].includes(k)).sort().concat().sort());
});

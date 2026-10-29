// TASKS.csv #1083 / #1017 — catchment, boundary-intercept and Voronoi CSV rows and the layer style file, now in lib/tableExports.js.
import test from "node:test";
import assert from "node:assert/strict";
import { catchmentRows, boundaryInterceptRows, voronoiRows, layerStylePayload, layerStyleEntries } from "../src/lib/tableExports.js";
import { toExportCsv, crsCell } from "../src/lib/tabular.js";

const crs = crsCell({ epsg: 26909 });

test("#1083 catchment rows: placed and unplaced samples, value column named by element and unit", () => {
  const a = { background: 12, threshold: 40, thresholdLabel: "P95", results: [
    { rank: 1, sample_id: "S1", x: 400000, y: 6200000, value: 88, placed: true, areaKm2: 3.14159, ownKm2: 1.23456, order: 2, moved: 37.4, productivity: 1.23456, anomalous: true, reachM: 812.6, lith: [{ unit: "VCL", pct: 61.2 }, { unit: "DACT", pct: 30 }, { unit: "FINT", pct: 5 }, { unit: "X", pct: 3.8 }] },
    { sample_id: "S2", x: 1, y: 2, placed: false, anomalous: false },
  ] };
  const rows = catchmentRows(a, { symbol: "Cu", unit: "ppm", crs });
  assert.equal(rows[0].Cu_ppm, 88);
  assert.equal(rows[0].crs, "EPSG:26909");
  assert.equal(rows[0].catchment_km2, "3.1416");
  assert.equal(rows[0].snapped_m, "37");
  assert.equal(rows[0].productivity, "1.235");
  assert.equal(rows[0].anomalous, "yes");
  assert.equal(rows[0].follow_up_reach_m, "813");
  assert.equal(rows[0].lithology, "VCL 61%; DACT 30%; FINT 5%"); // the three largest
  assert.equal(rows[0].rule, "P95");
  assert.deepEqual([rows[1].rank, rows[1].Cu_ppm, rows[1].catchment_km2, rows[1].productivity, rows[1].anomalous], ["", "", "", "", "no"]);
  assert.equal(rows[1].note, "outside the terrain / not placed");
});

test("#1083 boundary intercepts: coordinates to 2 dp, the CRS, excluded and soft flags; a comma in a name stays in its column", () => {
  const rows = boundaryInterceptRows([{ id: "a", layerLabel: "Lithology", hole_id: "H,1", unit: "VCL", from: 12.5, x: 1.234, y: 5.678, z: 9.999 }, { id: "b", layerLabel: "Lithology", hole_id: "H2", unit: "DACT", from: 3, x: 0, y: 0, z: 0 }],
    { crs, excluded: new Set(["a"]), soft: new Set(["b"]) });
  assert.deepEqual(rows[0], { layer: "Lithology", hole_id: "H,1", unit: "VCL", from_m: 12.5, x: "1.23", y: "5.68", z: "10.00", crs: "EPSG:26909", excluded: "yes", soft: "no" });
  assert.equal(rows[1].soft, "yes");
  const csv = toExportCsv(rows).split(/\r?\n/);
  assert.match(csv[1], /^Lithology,"H,1",VCL,/);
});

test("#1083 Voronoi rows: area to 3 dp, weight to 6, blank z and label", () => {
  const rows = voronoiRows([{ point: { x: 10, y: 20, value: 1.5 }, area: 1234.56789, weight: 0.0123456789 }], { crs: crsCell({}) });
  assert.deepEqual(rows[0], { x: 10, y: 20, z: "", crs: "not set", value: 1.5, label: "", voronoi_area: "1234.568", decluster_weight: "0.012346" });
});

test("#1083 the layer style file round-trips: overrides win, unknown values are skipped, a non-style file is refused", () => {
  const meta = { label: "Lithology", colorFn: (v) => ({ VCL: "#00ff00", DACT: "#0000ff" })[v] || "#888888", nameFn: (v) => `Unit ${v}` };
  const payload = layerStylePayload("litho", meta, [["VCL", 10], ["DACT", 4]], { DACT: { color: "#123456", label: "Dacite tuff" } });
  assert.deepEqual(payload, { geostrixStyle: 1, layerKind: "litho", layerLabel: "Lithology", entries: { VCL: { color: "#00ff00", label: "Unit VCL" }, DACT: { color: "#123456", label: "Dacite tuff" } } });
  const back = layerStyleEntries(JSON.parse(JSON.stringify(payload)), ["DACT", "FINT"]);
  assert.equal(back.total, 2);
  assert.deepEqual(back.apply, [{ value: "DACT", color: "#123456", label: "Dacite tuff" }]);
  assert.deepEqual(layerStyleEntries({ entries: { 3: { color: "#fff" } } }, [3]).apply, [{ value: "3", color: "#fff", label: null }]); // numeric codes match as text
  assert.throws(() => layerStyleEntries({ foo: 1 }, []), /entries/);
  assert.throws(() => layerStyleEntries(null, []), /entries/);
});

test("#1083 a diagram's projected CSV: x / y as the plot draws them; a spider diagram writes one column per element", async () => {
  const { diagramExportRows, DIAGRAMS, SPIDER_DIAGRAMS } = await import("../src/lib/geochem.js");
  const units = { K: "%", Mg: "%", Na: "%", Ca: "%", Fe: "%", La: "ppm", Ce: "ppm" };
  const assays = [{ hole_id: "H1", from: 0, to: 2, values: { K: 3, Mg: 2, Na: 1, Ca: 1, Fe: 5, La: 30, Ce: 60 } }, { hole_id: "H1", from: 2, to: 4, values: {} }];
  const box = diagramExportRows(assays, DIAGRAMS.boxplot, units);
  const p = DIAGRAMS.boxplot.project(assays[0], units);
  assert.ok(p && Number.isFinite(p.x), "the box plot projects the first sample");
  assert.deepEqual(box[0], { hole_id: "H1", from: 0, to: 2, x: p.x, y: p.y });
  assert.deepEqual([box[1].x, box[1].y], ["", ""]); // nothing to plot
  const ree = diagramExportRows(assays, SPIDER_DIAGRAMS.ree_chondrite, units);
  assert.deepEqual(Object.keys(ree[0]).slice(0, 5), ["hole_id", "from", "to", ...SPIDER_DIAGRAMS.ree_chondrite.order.slice(0, 2)]);
  assert.ok(ree[0].La > 30); // chondrite-normalized (La / 0.237 or so)
  assert.equal(ree[1].La, "");
});

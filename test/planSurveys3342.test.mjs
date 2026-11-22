// TASKS.csv #3342 (Galore Creek review) — a table of points had no way onto the Maps plan: the IP receiver CSV dropped on the plan opened the
// drillhole import on 'Collars'; imported as a Geophysics point survey it was not drawn on the plan; no survey outline could be made.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { surveysOnPlan, convexHull, ringArea, surveyOutlineBoundary, pointTableColumns, pointTableLayer } from "../src/lib/planSurveys.js";
import { buildLayer } from "../src/lib/mapLayerBuild.js";
import { planDataExtent, planFarLayers } from "../src/lib/mapsPlan.js";

const src = (p) => readFileSync(new URL(`../src/${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
// a SYNTHETIC receiver line: 57 stations 50 m apart along two lines, with a header like the contractor's
const headers = ["GridX", "GridY", "Easting", "Northing", "Elevation", "Long", "Lat"];
const rows = [];
for (let i = 0; i < 57; i++) rows.push({ GridX: String(i * 50), GridY: String(i % 2 ? 100 : 0), Easting: String(350000 + i * 50), Northing: String(6333000 + (i % 2) * 100), Elevation: "900", Long: "-131.4", Lat: "57.1" });

test("a table with X / Y and no hole id is a points table; one with a hole id or no coordinates is not", () => {
  assert.deepEqual(pointTableColumns(headers), { x: "Easting", y: "Northing", geographic: false });
  assert.deepEqual(pointTableColumns(["Station", "Long", "Lat"]), { x: "Long", y: "Lat", geographic: true });
  assert.equal(pointTableColumns(["HoleID", "Easting", "Northing", "RL"]), null);
  assert.equal(pointTableColumns(["BHID", "X", "Y"]), null);
  assert.equal(pointTableColumns(["Sample", "Au_ppb"]), null);
});

test("its rows become a point map layer in the project CRS, the other columns kept as attributes", () => {
  const cols = pointTableColumns(headers);
  const layer = buildLayer(pointTableLayer("Rx", [...rows, { Easting: "", Northing: "" }], cols), { sourceName: "Rx", projectEpsg: 26909, qml: null, sourceOverride: null });
  assert.equal(layer.geomType, "point");
  assert.equal(layer.features.length, 57);
  assert.equal(layer.skipped, 1);
  assert.deepEqual(layer.features[0].parts[0][0], [350000, 6333000]);
  assert.equal(layer.features[0].attributes.Elevation, "900");
  assert.equal("Easting" in layer.features[0].attributes, false);
  assert.deepEqual(layer.bbox, [350000, 6333000, 352800, 6333100]);
});

test("point surveys on the plan: one entry per survey, thinned, with a box; they make a plan and are checked for distance", () => {
  const pts = [...Array.from({ length: 12000 }, (_, i) => ({ x: 350000 + (i % 100) * 10, y: 6333000 + Math.floor(i / 100) * 10, value: 1, _src: "ip_rx.csv" })), { x: 1, y: 2, value: 3, _src: "mag.csv" }];
  const s = surveysOnPlan(pts);
  assert.deepEqual(s.map((x) => [x.name, x.n]), [["ip_rx", 12000], ["mag", 1]]);
  assert.ok(s[0].xy.length / 2 <= 5000);
  assert.deepEqual(s[0].box, [350000, 6333000, 350990, 6334190]);
  assert.deepEqual(planDataExtent({ surveys: [s[0]] }), [350000, 6333000, 350990, 6334190]);
  const far = planFarLayers({ collars: [{ x: 350500, y: 6333500 }], surveys: s });
  assert.deepEqual(far.map((f) => [f.kind, f.name]), [["survey", "mag"]]);
});

test("a survey's outline: the convex hull of its points, as a closed boundary", () => {
  const hull = convexHull([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }, { x: 0, y: 50 }, { x: 50, y: 25 }, { x: 50, y: 0 }]);
  assert.deepEqual(hull, [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }, { x: 0, y: 50 }, { x: 0, y: 0 }]);
  assert.equal(ringArea(hull), 5000);
  assert.equal(convexHull([{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }]), null); // on a line
  const b = surveyOutlineBoundary(rows.map((r) => ({ x: +r.Easting, y: +r.Northing, _src: "Rx.csv" })), "Rx.csv");
  assert.equal(b.name, "Rx outline");
  assert.deepEqual(b.closedFlags, [true]);
  assert.equal(ringArea(b.polylines[0]), 2800 * 100 - 50 * 100); // the zigzag's hull: a parallelogram-ish strip
});

test("the Maps drop asks before making a point layer; the plan draws and lists the surveys", () => {
  const m = src("modules/MapsModule.jsx");
  assert.match(m, /const cols = pointTableColumns\(head\);\n        if \(!cols \|\| !(?:await askConfirm|window\.confirm)\(/);
  assert.match(m, /addMapLayer\(\{ \.\.\.layer, drapeMode: "terrain" \}\);\n        notes\.push\(tr\("\{name\}: \{features\} added to Map layers as points, \{crsNote\}\."/);
  assert.match(m, /planDataExtent\(\{ rasters, terrain, mapLayers, boundaries, collars, surfaceSamples, surveys \}\)/);
  const p = src("components/MapsPlanView.jsx");
  assert.match(p, /const surveys = useMemo\(\(\) => surveysOnPlan\(layers\.geophys_pts\), \[layers\.geophys_pts\]\);/);
  assert.match(p, /const b = surveyOutlineBoundary\(layers\.geophys_pts, s\.key\);/);
  assert.match(p, /tr\("Outline as boundary"\)/);
});

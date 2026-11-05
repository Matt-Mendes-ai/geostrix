// TASKS.csv #1970 — Boundaries, Claims, OMF and the cell budget: claim areas take holes away, a tenure file gives one claim per
// feature with its tenure number / name / good-to date, every GeoPackage table is read, OMF volumes offer their other
// attributes, the 3D view cell budget is remembered, the dead Map layers pane is gone, and the WFS clip needs a project area
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { boundaryAreaHectares } from "../src/lib/geoprocessing.js";
import { vectorToBoundaryPolylines, claimsFromVector, isoDateOf } from "../src/lib/boundaryImport.js";
import { readCellBudget, saveCellBudget, CELL_BUDGET_KEY } from "../src/lib/estimationMeta.js";
const read = (f) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");
const sq = (x, y, s) => [{ x, y }, { x: x + s, y }, { x: x + s, y: y + s }, { x, y: y + s }];

test("#1970 claim area: holes are taken away, islands in holes count, separate parts add", () => {
  assert.equal(boundaryAreaHectares([sq(0, 0, 100)]), 1);
  assert.equal(boundaryAreaHectares([sq(0, 0, 100), sq(25, 25, 50)]), 0.75); // a hole
  assert.equal(boundaryAreaHectares([sq(0, 0, 100), sq(25, 25, 50), sq(40, 40, 20)]), 0.79); // an island in the hole
  assert.equal(boundaryAreaHectares([sq(0, 0, 100), sq(200, 0, 100)]), 2); // two parcels
  assert.equal(boundaryAreaHectares([sq(25, 25, 50), sq(0, 0, 100)]), 0.75); // order does not matter
});

test("#1970 a tenure file gives one claim per feature with its attributes", async () => {
  const ring = (x) => [[x, 0], [x + 100, 0], [x + 100, 100], [x, 100], [x, 0]];
  const parsed = { geomType: "polygon", epsg: 26910, features: [
    { parts: [ring(0), [[25, 25], [75, 25], [75, 75], [25, 75], [25, 25]]], attributes: { TENURE_NUMBER_ID: 1012345, CLAIM_NAME: "RED 1", GOOD_TO_DATE: "20271231", OWNER: "x" } },
    { parts: [ring(300)], attributes: { TENURE_NUMBER_ID: 1012346, CLAIM_NAME: "", GOOD_TO_DATE: "2028-3-5" } },
  ] };
  const r = await vectorToBoundaryPolylines(parsed, 26910);
  assert.deepEqual(r.featureOf, [0, 0, 1]);
  const claims = claimsFromVector(r, "tenures");
  assert.equal(claims.length, 2);
  assert.deepEqual(claims.map((c) => [c.name, c.tenureNumber, c.expiryDate, c.polylines.length]), [["tenures RED 1", "1012345", "2027-12-31", 2], ["tenures 1012346", "1012346", "2028-03-05", 1]]);
  assert.equal(boundaryAreaHectares(claims[0].polylines), 0.75);
  assert.equal(claimsFromVector(r, "tenures", 1), null); // over the cap: one claim, said by the caller
  assert.equal(claimsFromVector({ ...r, featureOf: [0, 0, 0] }, "one"), null); // one feature
  assert.equal(isoDateOf("not a date"), "");
});

test("#1970 the cell budget is remembered, clamped, and cleared by Reset", () => {
  const m = new Map(), st = { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) };
  assert.equal(readCellBudget(st), null);
  saveCellBudget(500000, st); assert.equal(m.get(CELL_BUDGET_KEY), "500000"); assert.equal(readCellBudget(st), 500000);
  saveCellBudget(9e9, st); assert.equal(readCellBudget(st), 2000000);
  saveCellBudget(null, st); assert.equal(m.has(CELL_BUDGET_KEY), false);
  assert.equal(readCellBudget({ getItem: () => { throw new Error("blocked"); } }), null);
  assert.match(read("lib/store.jsx"), /useState\(\(\) => readCellBudget\(\)\)/);
});

test("#1970 GeophysicsModule: every GeoPackage table, no dead pane, OMF choices, texts", () => {
  const g = read("modules/GeophysicsModule.jsx"), w = read("components/AddWebLayerModal.jsx");
  assert.match(g, /for \(const layer of layers\) \{/);
  assert.doesNotMatch(g, /layers\.find\(\(l\) => l\.features\.length\)/);
  assert.doesNotMatch(g, /geoPane === "maps"/);
  assert.doesNotMatch(g, /SurfaceMappingPanel/);
  assert.match(g, /claimsFromVector\(p, label, MAX_CLAIMS_PER_FILE\)/);
  assert.match(g, /importOmf\(omfChoices\.file, \{ attribute: pick, volume: c\.volume, volumesOnly: true \}\)/);
  assert.doesNotMatch(g, /no on-import reprojection yet|same formats as Boundaries above|import a DEM above first/);
  assert.match(w, /disabled=\{!defaultBboxLonLat\}/);
  assert.doesNotMatch(w, /collarsLoaded/);
  assert.doesNotMatch(w, /WFS layers import as a boundary\/vector layer/);
  const omf = read("lib/omfImport.js");
  assert.match(omf, /if \(volume && el\.kind === "volume" && el\.name !== volume\) continue;/);
  assert.match(omf, /choices\.push\(\{ volume: el\.name, shown: attrName, attributes: numeric \}\)/);
});

test("#1970 the Claims pane shows its own import message", () => {
  const g = read("modules/GeophysicsModule.jsx");
  const a = g.indexOf("const importClaims = async"), b = g.indexOf("\n  };", a);
  assert.doesNotMatch(g.slice(a, b), /setBoundaryError\(/);
  assert.match(g, /\{claimMsg && \(/);
});

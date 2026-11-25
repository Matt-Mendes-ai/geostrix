// TASKS.csv #4070 part 2 (side 2) — the Geophysics and Maps panes the audit ranked worst, as steps (Matt's layout C): DC / IP line, Mag / gravity inversion,
// the point survey pane (Magnetics, Gravity, Radiometrics, Point survey), Project CRS, A layer, EM and Terrain. Each is a StepPane, its main action the one gold
// primary, and every setting and tool it had before is still in it (a step, Fine-tune or a fold), so nothing was lost in the move. Pure: reads the source.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(`../src/${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const missing = (src, list) => list.filter((k) => !src.includes(k));

test("DC / IP line: 1 Line, 2 Place, 3 Fit -> Invert, 4 Result in numbers; the rest in Fine-tune, the 3D tools in a fold", () => {
  const s = read("components/DcipPanel.jsx");
  assert.match(s, /<StepPane id="dcip" label=\{tr\("DC \/ IP line"\)\}/);
  for (const k of ['key: "line"', 'key: "place"', 'key: "fit"']) assert.ok(s.includes(k), k);
  assert.match(s, /action=\{file \? \{ label: running \? tr\("Inverting…"\) : tr\("Invert"\), onClick: run, disabled: running/);
  assert.match(s, /<MoreFold summary=\{tr\("Fine-tune…"\)\} data-fine-tune="dcip">/);
  assert.match(s, /<MoreFold summary=\{tr\("Merge lines, 3D arrays…"\)\} data-more-dcip="" open=\{!file\}>/); // open before a line is read: they are ways in too
  assert.deepEqual(missing(s, ["onFiles(e.target.files)", "onUbcFiles(e.target.files)", "loadSaved(e.target.value)", "removeDcipLine(pick)", "setMapping((m)", "errKind: e.target.value", "keepLine()",
    "onStationFile(e.target.files[0])", "applyStations(stationFile", "setPt(sk", "setPt(xk", "setPt(yk", "positions: e.target.value", "scale: (v == null", "ground: (v == null", "cell: (v == null",
    "depth: (v == null", "pct: (v == null", "floor: (v == null", "ipPct: (v == null", "ipFloor: (v == null", "geomFactor: e.target.value", "supportCutoff: (v == null", "doi: e.target.checked",
    "voxObserved: e.target.checked", "voxExtrapolated: e.target.checked", "cancelInversionJob()", "addUbcSection", "<DcipMergePanel", "<Dcip3dPanel", "<Dcip3dArrayPanel", "<SectionResult", "<Pseudosection",
    "not seen by the data"]), []);
});

test("DC / IP Result: the data's reach is the median depth the support still sees per column (columnReach returns { cols, median }, not an array)", async () => {
  const { dataReachM } = await import("../src/lib/dcip.js");
  // two made-up columns of three 10 m cells: the support passes down to the middle cell in one, to the bottom in the other
  const cells = { s: [0, 0, 0, 10, 10, 10], z: [-5, -15, -25, -5, -15, -25], dz: [10, 10, 10, 10, 10, 10], support: [0.5, 0.1, 0.001, 0.5, 0.4, 0.3] };
  assert.equal(dataReachM(cells, 0.02), 25); // 20 m and 30 m
  assert.equal(dataReachM({ ...cells, support: undefined }, 0.02), 30); // an imported section has no support: every cell passes
  assert.equal(dataReachM({ ...cells, support: cells.support.map(() => 0) }, 0.02), null); // nothing seen
  assert.match(read("components/DcipPanel.jsx"), /const reachM = last\?\.result\?\.cells \? dataReachM\(last\.result\.cells, Number\(opts\.supportCutoff\) \|\| 0\) : null;/);
});

test("Mag / gravity inversion: 1 Data, 2 Field (magnetics), 3 Fit -> Invert, 4 Result; mesh, base level and the rest in Fine-tune; the forward models in a fold", () => {
  const s = read("components/InversionPanel.jsx");
  assert.match(s, /<StepPane id="inversion" label=\{tr\("Mag \/ gravity inversion"\)\}/);
  for (const k of ['key: "data"', 'key: "field"', 'key: "fit"']) assert.ok(s.includes(k), k);
  assert.match(s, /action=\{\{ label: tr\("Invert"\), onClick: runInversion, disabled: running \|\| planBusy \|\| !!invertBlocked/);
  assert.match(s, /<MoreFold summary=\{tr\("Fine-tune…"\)\} data-fine-tune="inversion">/);
  assert.match(s, /<MoreFold summary=\{tr\("Forward models…"\)\} data-more-forward="" open=\{!allRows\.length\}>/); // a drill-only project's way in: the planned grid
  assert.deepEqual(missing(s, ["setSurvey(e.target.value)", "setMethod(k)", "setConfirmed(e.target.checked)", 'setZMode("sensor")', 'setZMode("ground")', 'setZMode("drape")', "setSensorHeight(", "setZDatum(",
    "setThin(", "computeIgrf", "setField((p)", "setUnc((p)", "setMesh((p)", "octree: { ...p.octree", "setBaseLevel(", "setMagModel(", "setRegStyle(", "setDh((p)", "setAdv((p)", "groundFromStations",
    "groundToProject", 'doPlan("inversion")', "setPlanned((p)", "setPlate((p)", "runForward", "nearestOrientation", "setGeo((g)", "runGeoForward", "setSfOpen(", "cancelInversionJob()", "<FitView",
    "<StructFitPanel"]), []);
});

test("Point survey (Magnetics / Gravity / Radiometrics): 1 Survey, 2 Colours, 3 Grid with Generate raster the gold primary; spatial analysis and the holes in a fold", () => {
  const s = read("modules/GeophysicsModule.jsx");
  assert.match(s, /<StepPane id="points" label=\{tr\("Point survey"\)\}/);
  for (const k of ['key: "survey"', 'key: "colours"', 'key: "grid"']) assert.ok(s.includes(k), k);
  assert.match(s, /className="gs-btn gs-btn--primary gs-btn--block" style=\{\{ marginBottom: 0, justifyContent: "center" \}\} \/\* #4070 part 2: the Grid step's one gold primary \*\//);
  assert.match(s, /<MoreFold summary=\{tr\("Spatial analysis, values along the holes…"\)\} data-more-points="">/);
  assert.ok(s.includes('const idwRows = useMemo(() => (geoPane === "points" ? rows.filter('), "the Grid step is always there");
  assert.deepEqual(missing(s, ["fileInput.current.click()", "xyzInput.current.click()", "setGeophysSourceEpsg(v)", "confirmImportXYZ()", "setLegendSurvey(e.target.value)", 'ptsLegendUpdate("geophys_pts"',
    "<VoxelLegendEditor", 'replaceLayer("geophys_pts", [])', "setSpatialOpen(true)", "setHoleOpen(", "convertAgl(sv.key)", "makeLevelGr", "setMethodHint(null)"]), []);
});

test("Project CRS and A layer: one question each, the picker first, the change the gold primary; the mine grid beside a chosen CRS in a fold", () => {
  const s = read("modules/CartographyModule.jsx");
  assert.match(s, /<StepPane id="crs" label=\{tr\("Project CRS"\)\}/);
  assert.match(s, /<StepPane id="layer" label=\{tr\("Reproject a layer"\)\}/);
  assert.match(s, /<MoreFold summary=\{tr\("Mine grid beside this CRS…"\)\} data-more-minegrid=""><React\.Suspense fallback=\{null\}><MineGridPanel \/>/);
  assert.ok(s.indexOf("<LocalGridPanel />") < s.indexOf('<StepPane id="crs"'), "with no CRS yet, keeping a local grid is a way in: on top");
  assert.match(s, /className="gs-btn gs-btn--primary" disabled=\{busy\} onClick=\{moveAll\}/);
  assert.deepEqual(missing(s, ["setNewCrs", "setRotate(e.target.checked)", "onClick={setOnly}", "moveObject", "setObjKey(e.target.value)", "setObjFrom("]), []);
});

test("EM: one question, the four kinds each with its Help page", () => {
  const s = read("modules/GeophysicsModule.jsx");
  assert.match(s, /<StepPane id="em" label=\{tr\("EM"\)\} steps=\{\[\{ key: "kind", label: tr\("EM"\), question: tr\("Which kind of EM survey\?"\)/);
  assert.deepEqual(missing(s, ['setGeoPane("tem")', 'setGeoPane("bhem")', 'setGeoPane("fdem")', 'setMethodHint("tem"); setGeoPane("points")', "openHelp(o.help)"]), []);
});

test("Terrain: one question, Fetch the gold primary; the source CRS, crop, online source and detail in Fine-tune", () => {
  const s = read("modules/GeophysicsModule.jsx");
  assert.match(s, /<StepPane id="terrain" label=\{tr\("Terrain"\)\} steps=\{\[\{ key: "terrain", label: tr\("Terrain"\), question: tr\("Where does the ground come from\?"\)/);
  assert.match(s, /<MoreFold summary=\{tr\("Fine-tune…"\)\} data-fine-tune="terrain">/);
  const fine = s.slice(s.indexOf('data-fine-tune="terrain"'), s.indexOf("</MoreFold>} />", s.indexOf('data-fine-tune="terrain"')));
  assert.deepEqual(missing(fine, ["setDemSourceEpsg(", "setDemCrop(", "setTerrainSource(", "setTerrainDetail("]), []);
  assert.deepEqual(missing(s, ["terrainInput.current.click()", "onClick={openSrtmPicker}", "pointsTerrainInput.current.click()", "lidarInput.current.click()", "terrainFromProject"]), []);
});

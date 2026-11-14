// TASKS.csv #2390 / #2773 — the 3D Modelling ribbon's Simple set follows the data: Strat. stack and its set-up tools with three or more
// stratigraphic codes, Model from map with a polygon map, geoML models with the add-on installed, Stereonet with oriented picks or outcrop data.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { modellingSimpleTools, STRAT_MIN_CODES } from "../src/lib/viewer/modellingSimple.js";
import { groupMcodeRole } from "../src/lib/layers.js";

const rows = (codes) => codes.map((value, i) => ({ hole_id: "H1", from: i, to: i + 1, value }));
const base = { mc: { codes: [], assign: {}, ties: [] }, groupOf: () => null, defaultRole: (n) => groupMcodeRole(n, []), mapLayers: [], geomlInstalled: false, structures: 0 };

test("Strat. stack in Simple from three stratigraphic codes; codes set to another role do not count", () => {
  assert.equal(STRAT_MIN_CODES, 3);
  assert.equal(modellingSimpleTools({ ...base, litho: rows(["SST", "MST", "SLT"]) }).strat, true);
  assert.equal(modellingSimpleTools({ ...base, litho: rows(["SST", "MST"]) }).strat, false);
  const mc = { codes: [{ name: "SLT", role: "intrusion" }], assign: {}, ties: [] };
  assert.equal(modellingSimpleTools({ ...base, mc, litho: rows(["SST", "MST", "SLT"]) }).strat, false);
  assert.equal(modellingSimpleTools({ ...base, litho: [] }).strat, false);
});

test("Model from map with a polygon map layer; geoML when installed; Stereonet with structures", () => {
  const t = modellingSimpleTools({ ...base, litho: [], mapLayers: [{ geomType: "polyline" }] });
  assert.deepEqual(t, { strat: false, mapModel: false, geoml: false, stereonet: false });
  assert.equal(modellingSimpleTools({ ...base, litho: [], mapLayers: [{ geomType: "polygon" }] }).mapModel, true);
  assert.equal(modellingSimpleTools({ ...base, litho: [], geomlInstalled: true }).geoml, true);
  assert.equal(modellingSimpleTools({ ...base, litho: [], structures: 4 }).stereonet, true);
});

test("wiring: the ribbon's flags, empty groups hidden in Simple (#1707), Stereonet disabled with a reason (#2773)", () => {
  const v = fs.readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.match(v, /const simpleTools = useModellingSimple\(mode === "modelling"\);/);
  // #3153 — the Setup group and Model settings show in Simple; Litho groups and Modelling codes follow the strat flag as the group did
  assert.match(v, /<RibbonGroup label="Setup">\{\/\* #3153[^\n]*\n\s*<RibbonButton icon=\{Settings\} label="Model settings"/);
  assert.match(v, /<RibbonButton advanced=\{!simpleTools\.strat\} icon=\{Group\} label="Litho groups"/);
  assert.match(v, /<RibbonButton advanced=\{!simpleTools\.strat\} icon=\{Waypoints\} label="Modelling codes"/);
  assert.match(v, /<RibbonButton advanced icon=\{GitCompare\} label="Correlation"/);
  assert.match(v, /<RibbonButton advanced=\{!simpleTools\.strat\} icon=\{Layers\} label="Strat\. stack"/);
  assert.match(v, /<RibbonButton advanced=\{!simpleTools\.mapModel\} icon=\{MapIcon\} label="Model from map"/);
  assert.match(v, /<RibbonGroup advanced=\{!simpleTools\.geoml\} label="geoML modelling">/);
  assert.match(v, /<RibbonGroup advanced=\{!simpleTools\.stereonet\} label="Structure">/);
  assert.match(v, /label="Stereonet"[^\n]*disabled=\{!simpleTools\.stereonet\} disabledReason="No structure picks with an orientation, nor outcrop measurements, yet\."/);
});

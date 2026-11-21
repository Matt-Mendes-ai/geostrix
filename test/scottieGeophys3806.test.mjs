// TASKS.csv #3806-#3810 (Scottie Gold, Geophysics): UBC files chosen together, the terrain's node spacing and the collars' side, apparent IP / DC at
// pseudo-depths, conductivity as resistivity, and a 3D cloud slice's grid defaults
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { terrainNodeM, collarTerrainSide, runDataQC } from "../src/lib/dataQC.js";
import { guessSurveyMethod } from "../src/lib/geophysSurveyTools.js";
import { SURVEY_METHODS } from "../src/lib/geophysSurveys.js";
import { LOG_SCALE_METHODS } from "../src/lib/surveyLegendDefault.js";
import { surveyGridDefaults } from "../src/lib/surveyGridDefaults.js";

const geo = fs.readFileSync(new URL("../src/modules/GeophysicsModule.jsx", import.meta.url), "utf8");

test("#3806: every file that reads as a mesh is a mesh; a model takes the mesh of its own name; failures are named, the rest import", () => {
  assert.match(geo, /const meshFiles = \[\];/);
  assert.match(geo, /meshFiles\.find\(\(m\) => baseOf\(m\.name\) === baseOf\(mf\.name\)\) \|\| \(distinctMeshes\.length === 1 \? meshFiles\[0\] : null\)/);
  assert.match(geo, /failed\.push\(tr\("\{file\}: \{message\}", \{ file: modelFile\.name, message: e\.message \}\)\)/);
  assert.match(geo, /tr\("Not imported: \{list\}", \{ list: failed\.join\(" "\) \}\)/);
});
test("#3807: the node spacing read from a number or [dx, dy]; the collars' side said when it is one-sided", () => {
  assert.equal(terrainNodeM({ source: { nodeM: [6.3, 6.2] } }), 6.3);
  assert.equal(terrainNodeM({ source: { nodeM: 30 } }), 30);
  assert.equal(terrainNodeM({ source: {} }), null);
  const offs = Array.from({ length: 33 }, (_, i) => ({ hole_id: `H${i}`, dz: -(0.3 + i * 0.45) }));
  const sd = collarTerrainSide(offs);
  assert.equal(sd.side, "below"); assert.equal(sd.below, 33); assert.equal(sd.lo, 0.3);
  assert.equal(collarTerrainSide([{ dz: 5 }, { dz: -5 }, { dz: 4 }, { dz: -3 }]).side, null);
  // in Data QC: no NaN, and the side said
  const terrain = { name: "Top of the model", bbox: [0, 0, 100, 100], gridW: 11, gridH: 11, elevations: new Float32Array(121).fill(900), noDataMask: null, source: { kind: "top of a block model", nodeM: [10, 10] } };
  const collars = Array.from({ length: 5 }, (_, i) => ({ hole_id: `H${i}`, x: 10 + i * 10, y: 50, z: 892 - i, azimuth: 0, dip: 60, length: 100 }));
  const { issues } = runDataQC({ project: {}, collars, survey: [], layers: {}, boundaries: [], assays: [], terrain });
  const line = issues.find((x) => x.category === "Collar vs terrain" && !x.holeId).message;
  assert.doesNotMatch(line, /NaN/); assert.match(line, /~10 m apart/); assert.match(line, /5 of the 5 collars are 8\.0 to 12\.0 m below this terrain/);
});
test("#3808: AppMx / AppRho are apparent methods at pseudo-depths, labelled so; resistivity's log legend follows", () => {
  assert.equal(guessSurveyMethod("AppMx"), "ip_app"); assert.equal(guessSurveyMethod("AppRho"), "res_app");
  assert.match(SURVEY_METHODS.ip_app.label, /apparent chargeability \(pseudo-depth points\)/);
  assert.equal(SURVEY_METHODS.res_app.units, "Ω·m");
  assert.ok(LOG_SCALE_METHODS.has("res_app"));
  assert.match(geo, /a DC \/ IP pseudo-section's apparent values\. Compare with an inversion, not the core\./);
  assert.match(geo, /APPARENT_METHODS\.has\(meta\.method\) && <div/);
});
test("#3809: conductivity to resistivity is a 1 / x copy, and relabelling one as the other asks first; the block calculator says why a model is refused before any pick", () => {
  assert.match(geo, /const reciprocalCopy = \(model\) =>/);
  assert.match(geo, /cells\.push\(\{ \.\.\.c, value: 1 \/ v \}\)/);
  assert.match(geo, /threshold: _t, rangeMax: _r, stretch: _st, \.\.\.rest \} = model;/); // the copy shows every block, not the source's band
  assert.match(geo, /if \(flip && !await askConfirm\(/);
  const bc = fs.readFileSync(new URL("../src/components/BlockCalculatorModal.jsx", import.meta.url), "utf8");
  assert.match(bc, /\{choices\.some\(\(c\) => c\.why\) && \(/);
});
test("#3810: a stacked 3D cloud's slice takes its spacing from its plan density, not from points stacked in depth", () => {
  // 26,430 points over about 0.44 km², stacked 1 m apart in depth on a 4 m plan grid
  const pts = [];
  for (let i = 0; i < 165; i++) for (let j = 0; j < 160; j++) for (let k = 0; k < 1; k++) pts.push({ x: 500000 + i * 4, y: 6200000 + j * 4 + (i % 2) * 0.01, z: 780 + (i * 7 + j) % 25, value: 1 });
  const s = surveyGridDefaults(pts, { stacked: true });
  assert.equal(s.basis, "plan density");
  assert.ok(s.spacing > 3.5 && s.spacing < 4.5, `spacing ${s.spacing}`);
  assert.ok(s.cell >= 4 && s.cell <= 5, `cell ${s.cell}`);
  assert.ok(s.distance >= 2 * s.spacing - 1e-9);
});

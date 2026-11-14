// TASKS.csv #3266 (review #3195, Galore Creek) — interval rows with both alpha and beta (a fault-zone layer's FLT_ALPHA / FLT_BETA, the Veins
// layer's VN_ALPHA / VN_BETA) were never oriented: 'alpha only (no beta)' in the Stereonet, nothing in Structures or the stack's fault list.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { betaColumnOf, customAlphaPicks } from "../src/lib/alphaPicks.js";
import { orientedLayerPicks } from "../src/lib/layerPickOrientation.js";
import { orientFromAlphaBeta } from "../src/lib/coreOrientation.js";

// the app stores dips positive down (desurvey.js: I = 90 - dip)
const collars = [{ hole_id: "G1", x: 0, y: 0, z: 800, azimuth: 45, dip: 60, length: 400 }];
const survey = [{ hole_id: "G1", depth: 0, azimuth: 45, dip: 60 }, { hole_id: "G1", depth: 400, azimuth: 45, dip: 60 }];
const faults = { id: "f", name: "Fault structures", rows: [
  { hole_id: "G1", from: 100, to: 104, value: "Shear Zone", FLT_ALPHA: 35, FLT_BETA: 210 },
  { hole_id: "G1", from: 150, to: 151, value: "Fault Zone", FLT_ALPHA: 50, FLT_BETA: "" }, // alpha only
  { hole_id: "G1", from: 200, to: 202, value: "Fault Zone", FLT_ALPHA: 70, FLT_BETA: 15 },
] };
const veins = [{ hole_id: "G1", from: 300, to: 300.5, value: "Vein", VN_ALPHA: 20, VN_BETA: 300 }, { hole_id: "G1", from: 310, to: 311, value: "Vein", VN_ALPHA: 40 }];

test("#3266 an alpha column's beta is the column of the same stem", () => {
  assert.equal(betaColumnOf("FLT_ALPHA", ["FLT_ALPHA", "FLT_BETA"]), "FLT_BETA");
  assert.equal(betaColumnOf("Vein_alpha2", ["vein_BETA2"]), "vein_BETA2");
  assert.equal(betaColumnOf("Vein_AvgAngle_TCA1", ["Vein_AvgAngle_TCA1"]), null, "a TCA column has no beta stem");
  const p = customAlphaPicks([faults], veins);
  assert.equal(p.length, 5, "the Veins layer is read too");
  assert.deepEqual(p.map((q) => q.beta ?? null), [210, null, 15, 300, null]);
});

test("#3266 the picks with a beta are oriented as a structure file's are, on the project's reference line", () => {
  const structure = [{ hole_id: "G1", depth: 50, dip: 40, azimuth: 120, value: "Bedding", abRef: "top", alpha: 30, beta: 100 }];
  const r = orientedLayerPicks({ structure, customLayers: [faults], veins, collars, survey });
  assert.equal(r.ref, "top"); assert.equal(r.refAssumed, false);
  assert.equal(r.oriented.length, 3);
  const want = orientFromAlphaBeta({ alphaDeg: 35, betaDeg: 210, holeAzDeg: 45, holeDipDeg: 60, useTop: true });
  const shear = r.oriented.find((q) => q.value === "Shear Zone");
  assert.ok(Math.abs(shear.dip - want.dipDeg) < 1e-6 && Math.abs(shear.azimuth - want.dipDirDeg) < 1e-6, JSON.stringify({ shear, want }));
  assert.equal(shear.depth, 102); assert.equal(shear.orientedFrom, "alpha/beta, top-of-hole line"); assert.equal(shear.alphaOnly, false);
  assert.equal(r.picks.filter((q) => q.alphaOnly).length, 2, "the two without a beta stay alpha-only");
  const none = orientedLayerPicks({ structure: [], customLayers: [faults], veins, collars, survey });
  assert.equal(none.ref, "bottom"); assert.equal(none.refAssumed, true, "no structure picks: the bottom line, said as assumed");
  const noSurvey = orientedLayerPicks({ structure, customLayers: [faults], veins: [], collars: [], survey: [] });
  assert.equal(noSurvey.oriented.length, 0);
  assert.match(noSurvey.picks[0].orientError, /no collar/);
});

test("#3266 wiring: the modelling layers, the Structures menu, the Stereonet and the Downhole plot take them", () => {
  const v = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(v, /const layerPicks = useMemo\(\(\) => orientedLayerPicks\(\{ structure: layers\.structure, customLayers, veins: layers\.vein, collars, survey \}\)/);
  assert.match(v, /const modelLayers = useMemo\(\(\) => \(modelArea === "checked" \? restrictLayersToHoles\(unitLayersP, visibleHoles\) : unitLayersP\)/);
  assert.match(v, /const struct_types = distinctValues\(unitLayersP\.structure \|\| \[\]\)/);
  assert.match(v, /layers: unitLayersP \/\* #3266 \*\//);
});

// TASKS.csv #1152 — interpretation lines as a map layer: adding, removing, the attributes, the bbox and the elevation.
import test from "node:test";
import assert from "node:assert/strict";
import { interpretationLayer, addInterpretationLine, removeInterpretationLine, updateInterpretationLine, lineLengthM, isInterpretationLayer, isRepeatClick, INTERPRETATION_TYPES } from "../src/lib/interpretation.js";
import { drawMapLayer, mapStyleSignature } from "../src/lib/mapLayers.js";
import { mapLayerFeatures } from "../src/lib/overlayExport.js";
import { mapLayerLegendGroups } from "../src/lib/legendGroups.js";

const pts = [{ x: 500000, y: 6200000, z: 1210 }, { x: 500300, y: 6200400, z: 1190 }, { x: 500300.004, y: 6200400.003, z: 1190 }, { x: 500900, y: 6200400, z: 1230 }];

test("#1152 a line goes in as a polyline feature with its attributes, length, bbox and category count", () => {
  const l0 = interpretationLayer("", "mag_2024.csv");
  assert.equal(l0.name, "Interpretation — mag_2024.csv");
  assert.ok(isInterpretationLayer(l0) && l0.geomType === "polyline" && l0.styleField === "type");
  const l1 = addInterpretationLine(l0, pts, { type: "fault", confidence: "certain", note: "offsets the dyke" });
  assert.equal(l1.features.length, 1);
  assert.deepEqual(l1.features[0].parts, [[[500000, 6200000], [500300, 6200400], [500900, 6200400]]]); // the repeated click dropped
  const a = l1.features[0].attributes;
  assert.equal(a.name, "Fault 1");
  assert.deepEqual([a.type, a.survey, a.confidence, a.note], ["fault", "mag_2024.csv", "certain", "offsets the dyke"]);
  assert.equal(a.length_m, 1100);
  assert.deepEqual(l1.bbox, [500000, 6200000, 500900, 6200400]);
  assert.equal(l1.categories.find((c) => c.value === "fault").count, 1);
  assert.equal(l1.elevation, 1210); // the median click elevation (1190, 1210, 1230): the layer sits at the survey with no terrain
  const l2 = addInterpretationLine(l1, pts.slice(0, 2), { type: "not a type", name: "Z" });
  assert.equal(l2.features[1].attributes.type, "other");
  assert.equal(l2.elevation, 1210); // set once
  assert.equal(addInterpretationLine(l0, [pts[0], { ...pts[0] }]).features.length, 0); // one spot is not a line
});

test("#1152 remove / update, and the layer draws, exports and keys like any map layer", () => {
  let l = addInterpretationLine(interpretationLayer("Faults"), pts, { type: "fault" });
  l = addInterpretationLine(l, pts.slice(0, 2), { type: "contact" });
  const u = updateInterpretationLine(l, 1, { name: "Top of VCL", confidence: "possible" });
  assert.deepEqual([u.features[1].attributes.name, u.features[1].attributes.confidence], ["Top of VCL", "possible"]);
  const r = removeInterpretationLine(u, 0);
  assert.equal(r.features.length, 1);
  assert.equal(r.categories.find((c) => c.value === "fault").count, 0);
  assert.equal(removeInterpretationLine(r, 5), r);
  // draws into a canvas-like context (a 2D context stub counting strokes)
  const calls = { stroke: 0, moveTo: 0 };
  const ctx = new Proxy({}, { get: (_, k) => (k === "stroke" ? () => calls.stroke++ : k === "moveTo" ? () => calls.moveTo++ : () => {}), set: () => true });
  const drawn = drawMapLayer(ctx, l, [499900, 6199900, 501000, 6200500], 500, 300);
  assert.equal(drawn, 2);
  assert.equal(calls.stroke, 2);
  assert.ok(mapStyleSignature(l) !== mapStyleSignature(r));
  const ex = mapLayerFeatures({ ...l, id: "x" });
  assert.equal(ex.geomType, "polyline");
  assert.equal(ex.features.length, 2);
  assert.equal(ex.features[0].attributes.type, "fault");
  const leg = mapLayerLegendGroups([{ ...l, id: "x", visible: true }]);
  assert.ok(leg.length === 1 && leg[0].items.some(([label]) => /Fault/.test(label)));
});

test("#1152 lengths, the double-click rule and the type table", () => {
  assert.equal(lineLengthM([{ x: 0, y: 0 }, { x: 3, y: 4 }, { x: 3, y: 10 }]), 11);
  assert.equal(isRepeatClick({ x: 0, y: 0, at: 1000 }, { x: 1, y: 1, at: 1300 }), true);
  assert.equal(isRepeatClick({ x: 0, y: 0, at: 1000 }, { x: 1, y: 1, at: 1500 }), false);
  assert.equal(isRepeatClick({ x: 0, y: 0, at: 1000 }, { x: 5, y: 0, at: 1100 }), false);
  assert.equal(isRepeatClick(null, { x: 0, y: 0, at: 1 }), false);
  assert.equal(new Set(INTERPRETATION_TYPES.map((t) => t.value)).size, INTERPRETATION_TYPES.length);
});

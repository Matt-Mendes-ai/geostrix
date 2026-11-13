// TASKS.csv #1686 — alpha angles in Structural zones and custom layers become alpha-only picks
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { zoneAlphaPicks, angleColumns, customAlphaPicks, withAlphaOnlyPicks } from "../src/lib/alphaPicks.js";

const zones = [
  { hole_id: "COP-23-0001", from: 12.3, to: 17.7, value: "FR", alpha: null },
  { hole_id: "COP-23-0001", from: 17.8, to: 18.55, value: "FL", alpha: 60 },
  { hole_id: "COP-23-0002", from: 40, to: 42, value: "VN", alpha: "35" },
  { hole_id: "COP-23-0002", from: 50, to: 51, value: "BX", alpha: 120 },
];
test("zones: alpha at the interval midpoint, no dip or azimuth invented", () => {
  const p = zoneAlphaPicks(zones);
  assert.equal(p.length, 2);
  assert.deepEqual(p[0], { hole_id: "COP-23-0001", depth: 18.175, value: "FL", alpha: 60, dip: null, azimuth: null, alphaOnly: true, source: "Structural zones" });
  assert.equal(p[1].alpha, 35);
});
test("custom layers: columns named as angles to the core axis with angle values", () => {
  const rows = [
    { hole_id: "H1", from: 10, to: 12, value: "QV", Vein_pct1: 5, Vein_AvgAngle_TCA1: 45, Vein_AvgAngle_TCA2: "", Total: 300 },
    { hole_id: "H1", from: 20, to: 21, value: "QCV", Vein_pct1: 2, Vein_AvgAngle_TCA1: 70, Vein_AvgAngle_TCA2: 30 },
  ];
  assert.deepEqual(angleColumns(rows), ["Vein_AvgAngle_TCA1", "Vein_AvgAngle_TCA2"]);
  const p = customAlphaPicks([{ name: "Copley_2023_DH_Veins", rows }]);
  assert.equal(p.length, 3);
  assert.equal(p[0].source, "Copley_2023_DH_Veins · Vein_AvgAngle_TCA1");
  assert.equal(p[0].depth, 11); assert.equal(p[0].value, "QV");
  assert.deepEqual(angleColumns([{ Total_alpha_count: 400 }, { Total_alpha_count: 500 }]), [], "a column of non-angles is not taken");
});
test("merged after the structure picks; nothing to add keeps the same array", () => {
  const s = [{ hole_id: "H", depth: 5, dip: 40, azimuth: 120, value: "J" }];
  assert.equal(withAlphaOnlyPicks(s, [], []), s);
  const m = withAlphaOnlyPicks(s, zones, []);
  assert.equal(m.length, 3); assert.equal(m[0], s[0]);
});
test("the Stereonet / Downhole plot source takes them", () => {
  const v = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.ok(v.includes("withAlphaOnlyPicks(layers.structure, layers.structzone, customLayers, { veins: layers.vein, orient: () => layerPicks.picks })"), "#3266: oriented when they have a beta, and the Veins layer");
});

// TASKS.csv #948 — legend groups for the Surface Geology map: map layers (units, or one colour), boundaries, surface
// samples (anomaly classes / one colour / by medium), each row with the kind of symbol to draw
import test from "node:test";
import assert from "node:assert/strict";
import { mapLayerLegendGroups, boundaryLegendGroups, surfaceSampleLegendGroup, legendGroupsToItems, swatchShape } from "../src/lib/legendGroups.js";

test("#948 map layers: visible units of the categorical style, one colour otherwise, a kind per geometry; hidden left out", () => {
  const layers = [
    { id: "g", name: "Geology", geomType: "polygon", features: [{}], styleField: "UNIT", categories: [{ value: "Kgd", label: "Kgd granodiorite", color: "#f4a" }, { value: "Ts", label: "Ts", color: "#cc2", visible: false }] },
    { id: "f", name: "Faults", geomType: "polyline", features: [{}], color: "#d00" },
    { id: "s", name: "Structures", geomType: "point", features: [{}], styleField: null, categories: [] },
    { id: "h", name: "Hidden", geomType: "polygon", features: [{}], visible: false },
  ];
  const g = mapLayerLegendGroups(layers);
  assert.deepEqual(g.map((x) => x.label), ["Geology", "Faults", "Structures"]);
  assert.deepEqual(g[0].items, [["Kgd granodiorite", "#f4a", { kind: "fill", opacity: 0.6 }]]); // opacity: #1122
  assert.deepEqual(g[1].items, [["Faults", "#d00", { kind: "line" }]]);
  assert.equal(g[2].items[0][2].kind, "point");
});

test("#948 boundaries as lines; samples by anomaly class, one colour, or medium; rows keep their kind as Layout items", () => {
  assert.deepEqual(boundaryLegendGroups([{ name: "Claim", color: "#00f" }, { name: "Off", visible: false }])[0].items, [["Claim", "#00f", { kind: "line" }]]);
  assert.deepEqual(boundaryLegendGroups([]), []);
  const samples = [{ medium: "soil" }, { medium: "stream sediment" }, { medium: "soil" }];
  const byMedium = surfaceSampleLegendGroup({ samples });
  assert.deepEqual(byMedium.items.map((i) => [i[0], i[2].kind]), [["soil", "point"], ["stream sediment", "point"]]);
  assert.deepEqual(surfaceSampleLegendGroup({ samples, style: { color: "#123456" } }).items, [["all samples", "#123456", { kind: "point" }]]);
  const an = surfaceSampleLegendGroup({ samples, anomalyGroup: { key: "surface_anomaly", label: "Au: median + 2 MAD", items: [["anomalous", "#f00"], ["no value", "#ccc"]], alwaysHead: true } });
  assert.equal(an.label, "Au: median + 2 MAD");
  assert.equal(an.items[0][2].kind, "point");
  assert.equal(surfaceSampleLegendGroup({ samples, visible: false }), null);
  const items = legendGroupsToItems([an, ...boundaryLegendGroups([{ name: "Claim", color: "#00f" }])]);
  assert.deepEqual(items.slice(0, 2), [["Au: median + 2 MAD", null, { heading: true }], ["anomalous", "#f00", { kind: "point" }]]);
  assert.deepEqual(items.at(-1), ["Claim", "#00f", { kind: "line" }]);
  assert.deepEqual(legendGroupsToItems([{ label: "Lithology", items: [["Andesite", "#0a0"]] }]), [["Andesite", "#0a0"]]); // old rows unchanged
  assert.equal(swatchShape("point", 14).borderRadius, "50%");
  assert.equal(swatchShape("line", 14).height, 3);
});

test("#1122 map-layer legend rows carry the drape opacity (default 0.6 for polygons; none at full strength)", async () => {
  const { mapLayerLegendGroups } = await import("../src/lib/legendGroups.js");
  const g = mapLayerLegendGroups([
    { id: 1, name: "Geology", geomType: "polygon", features: [{}], color: "#aa0000" },
    { id: 2, name: "Faults", geomType: "polyline", features: [{}], color: "#000000" },
    { id: 3, name: "Claims", geomType: "polygon", features: [{}], color: "#00aa00", opacity: 0.35 },
  ]);
  assert.deepEqual(g.map((x) => x.items[0][2]), [{ kind: "fill", opacity: 0.6 }, { kind: "line" }, { kind: "fill", opacity: 0.35 }]);
});

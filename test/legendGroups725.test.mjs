// TASKS.csv #725 — the Layout legend loads every group of the bound view, from the same builders as the 3D overlay
import { test } from "node:test";
import assert from "node:assert/strict";
import { categoryLegendGroups, assayLegendGroups, voxelLegendGroups, legendGroupsToItems, assayColorFor, ASSAY_ELEMENT_COLORS, LEGEND_CATEGORY_KEYS } from "../src/lib/legendGroups.js";
import { LAYER_META } from "../src/lib/layers.js";

const layers = {
  litho: [{ hole_id: "A", value: "DACT" }, { hole_id: "A", value: "AND" }, { hole_id: "B", value: "OBN" }],
  alt: [{ hole_id: "A", value: "SER" }, { hole_id: "B", value: "CHL" }],
  vein: [{ hole_id: "A", value: "QZ" }],
};
// what a saved theme carries (arrays, not Sets)
const theme = { layerVisible: { litho: true, alt: true, vein: false }, categoryFilter: { litho: ["AND"] }, visibleHoles: { B: false }, legendOverride: { alt: { SER: { label: "Sericite", color: "#123456" } } } };
const labelFor = (k, v) => theme.legendOverride[k]?.[v]?.label || v, colorFor = (k, v) => theme.legendOverride[k]?.[v]?.color || LAYER_META[k].colorFn(v);

test("#725 categories: every visible layer, minus hidden categories and holes, with overrides", () => {
  const g = categoryLegendGroups({ keys: LEGEND_CATEGORY_KEYS, layers, layerVisible: theme.layerVisible, hidden: theme.categoryFilter, visibleHoles: theme.visibleHoles, labelFor, colorFor });
  assert.deepEqual(g.map((x) => x.key), ["litho", "alt"]); // veins hidden in the theme
  assert.deepEqual(g[0].items.map((i) => i[0]), ["DACT"]); // AND filtered out, OBN only in hidden hole B
  assert.deepEqual(g[1].items, [["Sericite", "#123456"]]); // override label + colour; CHL only in hole B
  // Sets (live viewer state) work the same
  const live = categoryLegendGroups({ keys: ["litho"], layers, layerVisible: { litho: true }, hidden: { litho: new Set(["AND"]) }, labelFor, colorFor });
  assert.deepEqual(live[0].items.map((i) => i[0]), ["DACT", "OBN"]);
});

test("#725 assay classes and block models; items with headings and ramps", () => {
  const style = { breaks: [{ max: 0.1, color: "#aaaaaa" }, { max: 1, color: "#ffaa00" }, { max: 99, color: "#ff0000" }] };
  const a = assayLegendGroups({ assays: [{}], assayElements: [{ symbol: "Au", unit: "ppm" }], assayVisible: true, assayDisplayElements: ["Au", "Cu"], assayStyle: { Au: style } });
  assert.deepEqual(a[0].items.map((i) => i[0]), ["≤ 0.10 ppm", "0.10–1.00 ppm", "> 1.00 ppm"]);
  assert.equal(a[1].items[0][1], ASSAY_ELEMENT_COLORS[1]); // an unclassed element keeps its marker hue
  assert.equal(assayColorFor(0.5, 0, style), "#ffaa00");
  const v = voxelLegendGroups([{ id: "m", name: "Chargeability", min: 0, max: 40, stops: [{ value: 0, color: "#0000ff" }, { value: 40, color: "#ff0000" }] }]);
  assert.ok(v[0].ramp && v[0].ramp.colors.length >= 2, JSON.stringify(v[0]));
  const items = legendGroupsToItems([...a.slice(0, 1), ...v]);
  assert.deepEqual(items[0], ["Au (ppm)", null, { heading: true }]);
  assert.equal(items[1][0], "≤ 0.10 ppm");
  assert.ok(items[items.length - 1][2].ramp.colors.length >= 2);
  assert.deepEqual(legendGroupsToItems([{ key: "litho", label: "Lithology", items: [["DACT", "#111"]] }]), [["DACT", "#111"]]); // one group: no heading
});

// TASKS.csv #3377 — a section's numeric ribbons (specific gravity, RQD) get a key: their ramp in the section legend, numbered like the
// other ribbons, with the clipped ends said
import test from "node:test";
import assert from "node:assert/strict";
import { sectionNumericLegendItems, groupSectionLegend, rampRows } from "../src/lib/sectionLegend.js";
import { numericLayerLegendGroups } from "../src/lib/legendGroups.js";

// SYNTHETIC: SG 2.2-3.4 and RQD 0-100 rows on two holes, coloured on a two-stop grey-to-red ramp
const layers = {
  sg: Array.from({ length: 40 }, (_, i) => ({ hole_id: "S1", from: i, to: i + 1, value: 2.2 + (i / 39) * 1.2 })),
  geotech: Array.from({ length: 40 }, (_, i) => ({ hole_id: "S1", from: i, to: i + 1, value: (i * 2.5) % 100 })),
};
const colorOf = (key, v, r) => { const t = Math.max(0, Math.min(1, (v - r.min) / (r.max - r.min || 1))); return `rgb(${Math.round(100 + 155 * t)},80,80)`; };

test("each numeric ribbon drawn on the section is a ramp row in its legend items", () => {
  const groups = numericLayerLegendGroups({ keys: ["sg", "geotech"], layers, layerVisible: { sg: true, geotech: true }, colorOf, clips: { sg: { lo: 2.42, hi: 3.04, min: 2.2, max: 3.4 } } });
  const items = sectionNumericLegendItems(groups);
  assert.deepEqual(items.map((it) => it[0]).sort(), ["Geotech (RQD%)", "Specific gravity"]);
  assert.ok(items.every((it) => it[2]?.ramp?.colors?.length));
  // grouped with the ribbons: numbered 1 and 6 of 6, after the category groups, five value rows each, the clipped ends said
  const ribbons = ["Specific gravity", "Breccia", "Alteration", "Lithology", "Veins", "Geotech (RQD%)"];
  const rows = groupSectionLegend([["Lithology: Andesite", "#c44"], ["Alteration: Potassic", "#e9a"], ...items], ribbons);
  const heads = rows.filter((r) => r[2]?.heading).map((r) => r[0]);
  assert.ok(heads.includes("Specific gravity (ribbon 1 of 6, from the left)"), heads.join(" | "));
  assert.ok(heads.includes("Geotech (RQD%) (ribbon 6 of 6, from the left)"), heads.join(" | "));
  const sgAt = rows.findIndex((r) => r[0] === "Specific gravity (ribbon 1 of 6, from the left)");
  const sgRows = rows.slice(sgAt + 1, sgAt + 6).map((r) => r[0]);
  assert.equal(sgRows[0], "≤ 2.42"); assert.equal(sgRows[4], "≥ 3.04");
});

test("an unclipped ramp keeps its plain end values; classes become 'Layer: class' rows", () => {
  assert.deepEqual(rampRows({ colors: ["#000", "#fff"], min: 0, max: 100, minLabel: "0", maxLabel: "100" }).map((r) => r[0]), ["0", "25", "50", "75", "100"]);
  const cls = sectionNumericLegendItems([{ label: "Specific gravity", items: [["2.2 – 2.6", "#aaa"], ["≥ 2.6", "#c00"]] }]);
  assert.deepEqual(cls, [["Specific gravity: 2.2 – 2.6", "#aaa"], ["Specific gravity: ≥ 2.6", "#c00"]]);
});

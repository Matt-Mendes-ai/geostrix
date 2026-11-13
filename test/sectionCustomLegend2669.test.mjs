// TASKS.csv #2669 — the custom layers on a section get a key: a category layer's classes under its name, a numeric layer as a ramp
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { sectionCustomLegendItems } from "../src/lib/customColour.js";
import { groupSectionLegend } from "../src/lib/sectionLegend.js";

const strat = { id: "s1", name: "Strat unit", rows: [{ hole_id: "A", from: 0, to: 5, value: "Upper" }, { hole_id: "A", from: 5, to: 9, value: "Lower" }, { hole_id: "A", from: 9, to: 12, value: "Upper" }] };
const gamma = { id: "g1", name: "Gamma", unit: "ppm", rows: Array.from({ length: 50 }, (_, i) => ({ hole_id: "A", from: i, to: i + 1, value: 10 + i * 20 })) };

test("#2669 the section's custom layers as legend items: classes, and a numeric layer's ramp", () => {
  const items = sectionCustomLegendItems([strat, gamma, { id: "x", name: "Not on the section", rows: [{ value: "a" }] }], new Set(["s1", "g1"]), {});
  const names = items.map((it) => it[0]);
  assert.ok(names.includes("Strat unit: Upper") && names.includes("Strat unit: Lower"));
  assert.ok(!names.some((n) => /Not on the section/.test(n)));
  const ramp = items.find((it) => it[2]?.ramp);
  assert.equal(ramp[0], "Gamma (ppm)");
  assert.ok(Number.isFinite(ramp[2].ramp.min) && ramp[2].ramp.max > ramp[2].ramp.min);
});

test("#2669 the grouped key: the classes under their layer, the ramp as its own group of five value swatches", () => {
  const items = [["Lithology: BAS", "#111111"], ...sectionCustomLegendItems([strat, gamma], new Set(["s1", "g1"]), {})];
  const rows = groupSectionLegend(items);
  const heads = rows.filter((r) => r[2]?.heading).map((r) => r[0]);
  assert.deepEqual(heads, ["Lithology", "Strat unit", "Gamma (ppm)"]);
  const after = rows.slice(rows.findIndex((r) => r[0] === "Gamma (ppm)") + 1);
  assert.equal(after.length, 5);
  assert.ok(after.every(([v, c]) => Number.isFinite(Number(v)) && /^(#|rgb)/.test(c)));
  // a list already grouped (rows with options other than a ramp) comes back unchanged
  const grouped = [["Lithology", null, { heading: true }], ["BAS", "#111"]];
  assert.equal(groupSectionLegend(grouped).length, 2);
  assert.match(fs.readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8"), /legendItems\.push\(\.\.\.sectionCustomLegendItems\(customLayers, new Set\(/);
});

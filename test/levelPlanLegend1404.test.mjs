// TASKS.csv #1404 — the level plan's legend is the "Colour holes by" layer; numeric layers get their colours at values;
// a mineral once; hole ids decluttered
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { planLegend } from "../src/lib/levelPlanLegend.js";

const IV = [
  { layer: "litho", label: "Lithology: LMST", color: "#1f6fb2" },
  { layer: "litho", label: "Lithology: LMST", color: "#1f6fb2" },
  { layer: "litho", label: "Lithology: SLST", color: "#e8d84a" },
  { layer: "alt", label: "Alteration: DOL", color: "#1a9a6b" },
  { layer: "mnlgy", label: "Mineralization: PYR (0.1%)", color: "#e0a020" },
  { layer: "mnlgy", label: "Mineralization: PYR (8%)", color: "#e0a020" },
  { layer: "mnlgy", label: "Mineralization: SPH (2%)", color: "#a05020" },
  ...[5, 20, 35, 50, 65, 80, 95, 100].map((v, i) => ({ layer: "geotech", label: `Geotech (RQD%): ${v}`, color: `#00000${i}` })),
];

test("only the chosen layer, once per category", () => {
  assert.deepEqual(planLegend(IV, "litho"), { title: "Lithology", items: [["LMST", "#1f6fb2"], ["SLST", "#e8d84a"]], numeric: false });
});

test("a mineral is listed once, not once per percent", () => {
  assert.deepEqual(planLegend(IV, "mnlgy").items, [["PYR", "#e0a020"], ["SPH", "#a05020"]]);
});

test("a numeric layer keys five of its drawn colours at their values, low to high", () => {
  const L = planLegend(IV, "geotech", { numeric: true });
  assert.equal(L.title, "Geotech (RQD%)");
  assert.deepEqual(L.items.map(([v]) => v), ["5", "35", "65", "80", "100"]);
  assert.equal(L.items[0][1], "#000000");
  assert.equal(L.items.at(-1)[1], "#000007");
});

test("the window builds the legend from the chosen layer and declutters the hole ids", () => {
  const src = readFileSync(new URL("../src/components/LevelPlanWindow.jsx", import.meta.url), "utf8");
  assert.match(src, /planLegend\(data\.intervals, activeLayer, \{ numeric: activeLayer\.startsWith\("custom:"\) \? "auto" : !!LAYER_META\[activeLayer\]\?\.numeric \}\)/); // #1539: a custom layer is detected
  assert.match(src, /furniture: levelPlanFurniture\(legend\)/);
  assert.match(src, /const idLabels = !labels \? null : [\s\S]{0,300}?v: \(\(\) => \{[\s\S]{0,400}?resolveLabels\(/ /* #2518: cached per plan and frame */); // grouped first since #2212
  assert.doesNotMatch(src, /data\.legendItems\.slice\(0, 40\)/);
});

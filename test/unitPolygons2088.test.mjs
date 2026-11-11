// TASKS.csv #2088 / #2572 (drawn unit colours), #2095 (text slips), #2414 (closing on the first corner), #2573 (small things on the tab)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { geologyPolygonLayer, addUnitPolygon, removeUnitPolygon, interpretationLayer, addInterpretationLine, uniqueLayerName } from "../src/lib/interpretation.js";
import { CATEGORICAL_SAFE_COLORS } from "../src/lib/layers.js";

const sq = (x0, y0, s) => [{ x: x0, y: y0 }, { x: x0 + s, y: y0 }, { x: x0 + s, y: y0 + s }, { x: x0, y: y0 + s }];

test("#2088 / #2572 — drawn units take hex colours: the logs' colour for a logged code, else the curated palette in order", () => {
  let l = geologyPolygonLayer("Geology (drawn)");
  l = addUnitPolygon(l, sq(0, 0, 100), { unit: "P" }, { colorOf: (u) => (u === "P" ? "#f28e2b" : null) });
  l = addUnitPolygon(l, sq(100, 0, 100), { unit: "A" }, { colorOf: () => null });
  l = addUnitPolygon(l, sq(200, 0, 100), { unit: "G" });
  assert.deepEqual(l.categories.map((c) => [c.value, c.color]), [["P", "#f28e2b"], ["A", CATEGORICAL_SAFE_COLORS[0]], ["G", CATEGORICAL_SAFE_COLORS[1]]]);
  for (const c of l.categories) assert.match(c.color, /^#[0-9a-f]{6}$/i); // the colour picker and the KML read only #rrggbb
});

test("#2095 — a unit left with no polygon leaves the legend", () => {
  let l = geologyPolygonLayer("g");
  l = addUnitPolygon(l, sq(0, 0, 100), { unit: "Monzonite" });
  l = addUnitPolygon(l, sq(100, 0, 100), { unit: "Andesite" });
  l = removeUnitPolygon(l, 1);
  assert.deepEqual(l.categories.map((c) => [c.value, c.count]), [["Monzonite", 1]]);
});

test("#2095 — default line names count lines of their own type: the first fault after a contact is 'Fault 1'", () => {
  let l = interpretationLayer("interp", "");
  l = addInterpretationLine(l, [{ x: 0, y: 0 }, { x: 10, y: 0 }], { type: "contact" });
  l = addInterpretationLine(l, [{ x: 0, y: 5 }, { x: 10, y: 5 }], { type: "fault" });
  l = addInterpretationLine(l, [{ x: 0, y: 9 }, { x: 10, y: 9 }], { type: "fault" });
  const names = l.features.map((f) => f.attributes.name);
  assert.match(names[1], / 1$/); assert.match(names[2], / 2$/);
  assert.notEqual(names[1], names[2]);
});

test("#2414 / #2095 / #2573 — the pane closes on the first corner, names the polygon without an article; sets get unique names", () => {
  const p = readFileSync(new URL("../src/components/UnitPolygonPane.jsx", import.meta.url), "utf8");
  assert.match(p, /const corners = closedOnFirst \? pts\.slice\(0, -1\) : pts;/);
  assert.match(p, /if \(Math\.hypot\(b\.x - a\.x, b\.y - a\.y\) <= Math\.max\(1, 0\.02 \* Math\.hypot\(x1 - x0, y1 - y0\)\)\) finish\(true\);/);
  assert.match(p, /a click on the first corner, a double-click or Finish closes it\./);
  assert.match(p, /tr\("Added polygon \{unit\} \(\{ha\} ha\) to \\"\{layer\}\\"\."/);
  assert.equal(uniqueLayerName("truenorth_one_synth", [{ name: "truenorth_one_synth" }]), "truenorth_one_synth 2");
  const m = readFileSync(new URL("../src/components/SurfaceMappingPanel.jsx", import.meta.url), "utf8");
  assert.match(m, /name: uniqueLayerName\(p\.name, surfaceStructures\)/);
  assert.match(m, /removeSurfaceStructureSet\(s\.id\); setStructMsg\(null\);/);
});

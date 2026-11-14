// TASKS.csv #1437 (review #1352, Silvertip) — outcrop structure colours are not surface-sample medium colours, and the legend
// gets an "Outcrop structures" group with the classes drawn
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { STRUCTURE_CLASS_COLORS, STRUCTURE_CLASS_LABELS } from "../src/lib/mapLayers.js";
import { MEDIUM_COLORS } from "../src/lib/layers.js";
import { outcropLegendGroup } from "../src/lib/legendGroups.js";

const dist = (a, b) => { const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)); const [r1, g1, b1] = p(a), [r2, g2, b2] = p(b); return Math.hypot(r1 - r2, g1 - g2, b1 - b2); };

test("no structure class shares (or nearly shares) a colour with a sample medium", () => {
  for (const [cls, c] of Object.entries(STRUCTURE_CLASS_COLORS)) for (const [m, mc] of Object.entries(MEDIUM_COLORS)) {
    assert.ok(dist(c.toLowerCase(), mc.toLowerCase()) > 60, `${cls} ${c} vs ${m} ${mc}`);
  }
  assert.equal(new Set(Object.values(STRUCTURE_CLASS_COLORS).map((c) => c.toLowerCase())).size, Object.keys(STRUCTURE_CLASS_COLORS).length, "classes differ from each other too");
  assert.equal(Object.keys(STRUCTURE_CLASS_LABELS).join(), Object.keys(STRUCTURE_CLASS_COLORS).join());
});

test("the legend group lists the classes drawn, in class order, over the visible sets only", () => {
  const sets = [
    { name: "outcrops", rows: [{ cls: "fault" }, { cls: "bedding" }, { cls: "bedding" }, { cls: "vein" }, {}] },
    { name: "hidden", visible: false, rows: [{ cls: "joint" }] },
  ];
  const g = outcropLegendGroup({ surfaceStructures: sets });
  assert.equal(g.key, "outcrop_structures");
  assert.equal(g.label, "Outcrop structures");
  assert.deepEqual(g.items.map(([l, c, o]) => [l, c, o.kind]), [["Fault / shear", STRUCTURE_CLASS_COLORS.fault, "point"], ["Bedding", STRUCTURE_CLASS_COLORS.bedding, "point"], ["Vein", STRUCTURE_CLASS_COLORS.vein, "point"], ["Other", STRUCTURE_CLASS_COLORS.other, "point"]]);
  assert.equal(outcropLegendGroup({ surfaceStructures: [] }), null);
  assert.equal(outcropLegendGroup({ surfaceStructures: sets, visible: false }), null);
  assert.equal(outcropLegendGroup({ surfaceStructures: [{ name: "x", visible: false, rows: [{ cls: "fault" }] }] }), null);
});

test("the 3D View's legend and the Layout legend take the group", () => {
  const v = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.match(v, /const outcrop = outcropLegendGroup\(\{ surfaceStructures(, symbolByType: store\.project\?\.structureSymbolByType \/\* #3094 \*\/)? \}\);/); // symbolByType: #3094
  const l = readFileSync(new URL("../src/modules/LayoutModule.jsx", import.meta.url), "utf8");
  assert.match(l, /outcropLegendGroup\(\{ surfaceStructures/);
});

// TASKS.csv #1539 — custom-layer values were hashed to a colour per distinct value. Since #1697 the 3D view colours a numeric field on a
// ramp (and lists every visible custom layer in the legend); sections and level plans still hashed. They now take the 3D view's colour.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { customColour } from "../src/lib/customColour.js";
import { hashColor } from "../src/lib/layers.js";

test("a numeric value column (vein %) is a ramp: 2 % and 3 % are neighbours, not unrelated hashes", () => {
  const layer = { id: "v", rows: [1, 2, 3, 5, 8, 13, 21].map((v, i) => ({ hole_id: "H", from: i, to: i + 1, value: v })) };
  const c2 = customColour(layer, {}, { value: 2 }), c3 = customColour(layer, {}, { value: 3 }), c21 = customColour(layer, {}, { value: 21 });
  assert.notEqual(c2, hashColor(2));
  const rgb = (s) => s.match(/\d+/g).map(Number), d = (a, b) => Math.hypot(...rgb(a).map((x, i) => x - rgb(b)[i]));
  assert.ok(d(c2, c3) < d(c2, c21));
});

test("sections and level plans (layerPrimitivesFor) use the 3D colour of a custom row, with its style's fixed colour", () => {
  const s = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  const i = s.indexOf("const layerPrimitivesFor = ");
  const body = s.slice(i, s.indexOf("return { intervals, points };", i));
  assert.ok(!/hashColor\(row\.value\)/.test(body));
  assert.match(body, /color = \(iv \? stI\.color \|\| row\.modelColor : stP\.color\) \|\| customColour\(layer, layerStyles, row\)/);
});

test("a skewed column (Lawyers' vein %: median 2, p98 65, max 95) spreads over the ramp: 2nd-98th percentile, log", async () => {
  const { customLegendGroups } = await import("../src/lib/customColour.js");
  const vals = [...Array.from({ length: 50 }, (_, i) => 0.1 + (i % 10) * 0.3), ...Array.from({ length: 40 }, (_, i) => 1 + (i % 8)), 20, 30, 40, 50, 60, 65, 65, 65, 80, 95];
  const layer = { id: "vi", name: "Vein Interval", rows: vals.map((v, i) => ({ hole_id: "H", from: i, to: i + 1, value: v })) };
  const g = customLegendGroups([layer], {}, {})[0];
  assert.equal(g.ramp.log, true);
  assert.match(g.ramp.maxLabel, /^≥ /); // 95 is past the 98th percentile
  const c = (v) => customColour(layer, {}, { value: v });
  assert.notEqual(c(1), c(5)); // the common low percentages no longer share one colour
  assert.equal(c(95), c(1000)); // past the top end: the top colour
});

test("the level plan's legend: a numeric custom layer is five ramp values, a text one its categories", async () => {
  const { planLegend } = await import("../src/lib/levelPlanLegend.js");
  const rows = [1, 2, 3, 5, 8, 13, 40].map((v) => ({ layer: "custom:v", label: `Vein Interval: ${v}`, color: `#0000${String(v).padStart(2, "0")}` }));
  const L = planLegend(rows, "custom:v", { numeric: "auto" });
  assert.equal(L.numeric, true); assert.equal(L.items.length, 5); assert.equal(L.items[0][0], "1"); assert.equal(L.items[4][0], "40");
  const C = planLegend([{ layer: "custom:q", label: "QuickLog: AND", color: "#111111" }, { layer: "custom:q", label: "QuickLog: 3", color: "#222222" }], "custom:q", { numeric: "auto" });
  assert.equal(C.numeric, false);
  const w = readFileSync(new URL("../src/components/LevelPlanWindow.jsx", import.meta.url), "utf8");
  assert.match(w, /numeric: activeLayer\.startsWith\("custom:"\) \? "auto" :/);
});

// TASKS.csv #2044 (review #2013, Woodjam) — the 3D overlay legend's fixed 14 rows named 16 of 134 categories on a nine-layer project. The
// cap now grows with the view's height, a wide view gets a second column, and a layer whose categories were filtered keeps its list whole.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { allocateLegendRows, categoryLegendGroups } from "../src/lib/legendGroups.js";

const ov = fs.readFileSync(new URL("../src/components/ViewportFigureOverlay.jsx", import.meta.url), "utf8");
const legendLayout = eval(`(${ov.match(/export function legendLayout\(h, w, total = Infinity\) (\{[\s\S]*?\n\})/)[0].replace("export function legendLayout", "function")})`.replace(/MAX_LEGEND_ITEMS/g, "14"));

test("the cap: 14 on a short or unmeasured view, more on a tall one (to 40), doubled in two columns on a wide view with more codes", () => {
  assert.deepEqual(legendLayout(0, 0), { cap: 14, cols: 1 });
  assert.deepEqual(legendLayout(400, 900, 134), { cap: 14, cols: 1 });
  assert.equal(legendLayout(806, 1614, 20).cols, 1, "20 codes fit one column");
  assert.deepEqual(legendLayout(806, 1614, 134), { cap: 76, cols: 2 }, "a 1,614 x 806 view: 38 a column");
  assert.equal(legendLayout(3000, 900, 134).cap, 40);
});

test("a filtered layer's list comes whole before the others are shared out", () => {
  const g = (key, n, extra = {}) => ({ key, label: key, items: Array.from({ length: n }, (_, i) => [`${key}${i}`, "#000"]), ...extra });
  const groups = [g("Lithology", 25), g("Alteration", 13, { filtered: true }), g("Veins", 9)];
  const r = allocateLegendRows(groups, 30);
  assert.equal(r.rows.filter((x) => x.group === "Alteration").length, 13, "filtered: all 13");
  assert.equal(r.rows.length, 30);
  assert.ok(r.rows.filter((x) => x.group === "Lithology").length >= 8);
  const plain = allocateLegendRows([g("Lithology", 25), g("Alteration", 13), g("Veins", 9)], 30);
  assert.ok(plain.rows.filter((x) => x.group === "Alteration").length < 13, "without the filter, shared in turn as before");
});

test("categoryLegendGroups marks a layer with hidden categories as filtered", () => {
  const rows = ["A", "B", "C"].map((v, i) => ({ hole_id: "H1", from: i, to: i + 1, value: v }));
  const base = { keys: ["litho"], layers: { litho: rows }, layerVisible: { litho: true }, labelFor: (k, v) => v, colorFor: () => "#123456" };
  assert.equal(categoryLegendGroups({ ...base, hidden: { litho: new Set(["B"]) } })[0].filtered, true);
  assert.equal(categoryLegendGroups({ ...base, hidden: {} })[0].filtered, undefined);
});

test("wiring: the overlay starts from the size's cap, trims two items a row in two columns, keeps a heading with its row; the Figure count uses the same cap", () => {
  assert.match(ov, /const lay = legendLayout\(boxH, boxW, itemTotal\);/);
  assert.match(ov, /setFit\(\{ items: lay\.cap, ramps: 6 \}\)/);
  assert.match(ov, /Math\.ceil\(over \/ 17\)\) \* lay\.cols/);
  assert.match(ov, /columnCount: 2/);
  assert.match(ov, /style=\{\{ breakInside: "avoid" \}\}/);
  const vm = fs.readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.match(vm, /legendLayout\(mountRef\.current\?\.clientHeight, mountRef\.current\?\.clientWidth, t\)\.cap/);
});

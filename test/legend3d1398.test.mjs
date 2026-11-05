// TASKS.csv #1398 — the 3D legend keys the numeric hole layers and shares its rows between groups
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { allocateLegendRows, numericLayerLegendGroups } from "../src/lib/legendGroups.js";

const G = (label, n) => ({ label, items: Array.from({ length: n }, (_, i) => [`${label}${i}`, "#000"]) });

test("every group gets rows in turn; short groups show in full; the order is kept (lithology first)", () => {
  const { rows, shown, total } = allocateLegendRows([G("Lithology", 13), G("Alteration", 5), G("Breccia", 3), G("Samples", 3)], 14);
  assert.equal(shown, 14);
  assert.equal(total, 24);
  const by = (g) => rows.filter((r) => r.group === g).length;
  assert.deepEqual([by("Lithology"), by("Alteration"), by("Breccia"), by("Samples")], [4, 4, 3, 3]);
  assert.equal(rows[0].group, "Lithology");
  assert.ok(rows[0].head && rows[4].head);
});

test("one group: no headings unless it asks for one; everything when it fits", () => {
  const r = allocateLegendRows([G("Lithology", 5)], 14);
  assert.equal(r.shown, 5);
  assert.ok(r.rows.every((x) => !x.head));
});

test("a ramp per visible numeric layer, over the range the view colours it with", () => {
  const calls = [];
  const colorOf = (k, v, range) => { calls.push([k, range.min, range.max]); return `#${Math.round(v).toString(16).padStart(6, "0")}`; };
  const layers = { geotech: [{ value: 40 }], recovery: [{ value: 90 }], magsusc: [{ value: 0.2 }, { value: 12 }, { value: null }], sg: [{ value: 2.7 }] };
  const groups = numericLayerLegendGroups({ layers, layerVisible: { geotech: true, magsusc: true, sg: true }, colorOf });
  assert.deepEqual(groups.map((g) => g.key), ["numeric_geotech", "numeric_magsusc"]); // recovery off; SG has one value, no range
  assert.equal(groups[0].ramp.minLabel, "0"); assert.equal(groups[0].ramp.maxLabel, "100");
  assert.equal(groups[1].ramp.minLabel, "0.2"); assert.equal(groups[1].ramp.maxLabel, "12");
  assert.equal(groups[1].ramp.colors.length, 17);
  assert.ok(calls.some(([k, lo, hi]) => k === "magsusc" && lo === 0.2 && hi === 12));
});

test("the overlay allocates its rows and the Figure count says how many of them show", () => {
  const ov = readFileSync(new URL("../src/components/ViewportFigureOverlay.jsx", import.meta.url), "utf8");
  assert.match(ov, /const \{ rows: shown, total \} = allocateLegendRows\(legendGroups, MAX_LEGEND_ITEMS\);/);
  assert.doesNotMatch(ov, /a\.g\.items\.length - b\.g\.items\.length/);
  const vm = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.match(vm, /numericLayerLegendGroups\(\{ layers, layerVisible, isRowVisible, colorOf: numericLayerColor(, symbology: numericSymbology)?(, clips: numericClip)? \}\)/); // symbology: #1699
  assert.match(readFileSync(new URL("../src/modules/viewer/ViewerParts.jsx", import.meta.url), "utf8"), /tr\("\{n\} of \{m\} shown"/);
});

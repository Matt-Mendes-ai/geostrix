// TASKS.csv #3398 (Matt: 'make the legend in the 3d view always collapsable'; Orion_2026: Lithology plus a 60-class MagSusc voxel group
// covering the left third of the view) — the legend's collapse and each group's fold are the user's, saved with the view's figure settings.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { foldLegendGroups, allocateLegendRows } from "../src/lib/legendGroups.js";

const litho = { key: "litho", label: "Lithology", items: [["Basalt", "#111"], ["Granite", "#222"], ["Shale", "#333"]], counts: [5, 3, 1] };
const mag = { key: "voxel_m1", label: "MagSusc", grade: true, items: Array.from({ length: 60 }, (_, i) => [`c${i}`, "#444"]) };

test("a folded group keeps only its heading, saying how many rows it holds; the others are untouched", () => {
  const g = foldLegendGroups([litho, mag], ["voxel_m1"]);
  assert.equal(g[0], litho);
  assert.deepEqual(g[1].items, [["60", null, { folded: true }]]);
  assert.equal(g[1].alwaysHead, true);
  assert.equal(g[1].grade, false, "no '(n of m classes)' on a folded group");
  assert.equal(foldLegendGroups([litho], undefined)[0], litho);
  const { rows } = allocateLegendRows(g, 20);
  assert.deepEqual(rows.map((r) => [r.gkey, r.label, !!r.folded, !!r.head]), [["litho", "Basalt", false, true], ["litho", "Granite", false, false], ["litho", "Shale", false, false], ["voxel_m1", "60", true, true]]);
});

test("folding the big group frees the rows for the others: 60 classes no longer push Lithology out of a 12-row legend", () => {
  const open = allocateLegendRows([litho, mag], 12).rows.filter((r) => r.gkey === "litho").length;
  const folded = allocateLegendRows(foldLegendGroups([litho, mag], ["voxel_m1"]), 12).rows.filter((r) => r.gkey === "litho").length;
  assert.ok(open <= 3 && folded === 3);
});

test("wiring: the choices saved through onConfig (the view's figure settings), a saved collapse wins over #3280 (1)'s automatic one", () => {
  const o = fs.readFileSync(new URL("../src/components/ViewportFigureOverlay.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(o, /const legendGroups = foldLegendGroups\(allGroups, config\.legendFolded\);/);
  assert.match(o, /const saved = typeof config\.legendCollapsed === "boolean" \? config\.legendCollapsed : null, collapsed = saved \?\? autoCollapsed;/);
  assert.match(o, /const toggleLegend = \(v\) => \{ auto\.current\.user = true; setCollapsed\(v\); onConfig\?\.\(\(f\) => \(\{ \.\.\.f, legendCollapsed: v \}\)\); \};/);
  assert.match(o, /const toggleGroup = \(key\) => onConfig\?\.\(\(f\) => \{ const set = new Set\(f\.legendFolded \|\| \[\]\); if \(!set\.delete\(key\)\) set\.add\(key\); return \{ \.\.\.f, legendFolded: \[\.\.\.set\] \}; \}\);/);
  assert.match(o, /\{onConfig && it\.gkey && <button type="button" onClick=\{\(\) => toggleGroup\(it\.gkey\)\} aria-expanded=\{!it\.folded\}/);
  assert.match(o, /\{!it\.folded && <div style=\{\{ display: "flex", alignItems: "center", gap: 7, marginBottom: 2\.5 \}\}>/);
  assert.match(o, /tr\("Legend \(\{n\} rows\)", \{ n: itemTotal \+ allRamps\.length \+ images\.length \}\)/);
  assert.match(o, /const itemTotal = \(allGroups \|\| \[\]\)\.reduce/, "the collapsed title counts every row, folded or not");
  const v = fs.readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.match(v, /onConfig=\{setFigureOverlay\} \/\* #3398/);
  assert.match(v, /figureOverlay, \/\/ TASKS\.csv #311/, "the figure settings are saved with the view");
});

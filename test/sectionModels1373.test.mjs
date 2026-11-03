// TASKS.csv #1373 — model surfaces and block models drawn on a section are named on it and keyed in the Layout legend
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sectionModelLegend, rampRows, groupSectionLegend } from "../src/lib/sectionLegend.js";
import { voxelLegendGroups } from "../src/lib/legendGroups.js";

test("surfaces are listed once each under their own heading", () => {
  const rows = sectionModelLegend([{ name: "McDame top", color: "#c8a24a" }, { name: "McDame top", color: "#c8a24a" }, { name: "Earn base", color: "#3366cc" }], []);
  assert.deepEqual(rows, [["Model surfaces: McDame top", "#c8a24a"], ["Model surfaces: Earn base", "#3366cc"]]);
});

test("a continuous block model becomes five rows from low to high; a class model keeps its classes", () => {
  const cont = voxelLegendGroups([{ id: "p", name: "P(McDame)", min: 0, max: 1, colorMode: "continuous", stops: [{ value: 0, color: "#000000" }, { value: 1, color: "#ffffff" }] }])[0];
  const rows = rampRows(cont.ramp);
  assert.equal(rows.length, 5);
  assert.deepEqual(rows.map(([v]) => v), ["0", "0.25", "0.5", "0.75", "1"]);
  assert.equal(rows[0][1], cont.ramp.colors[0]);
  assert.equal(rows[4][1], cont.ramp.colors.at(-1));
  const cls = voxelLegendGroups([{ id: "u", name: "Units", min: 1, max: 2, valueLabels: { 1: "Earn", 2: "McDame" }, stops: [{ value: 1, color: "#aa0000" }, { value: 2, color: "#00aa00" }] }])[0];
  const out = groupSectionLegend(sectionModelLegend([{ name: "Earn base", color: "#3366cc" }], [{ name: "P(McDame)", legend: cont }, { name: "Units", legend: cls }, { name: "No key", legend: null }]));
  assert.deepEqual(out.filter((r) => r[2]?.heading).map((r) => r[0]), ["Model surfaces", "P(McDame)", "Units"]);
  assert.ok(out.some(([l, c]) => l === "McDame" && c === "#00aa00"));
});

test("a block model named with a colon stays one heading", () => {
  const out = groupSectionLegend(sectionModelLegend([{ name: "Top of LMST", color: "#3366cc" }], [{ name: "x", legend: { label: "Model units: stack SLST (2:53:04 AM)", items: [["SLST", "#eee044"]] } }]));
  assert.deepEqual(out, [["Model surfaces", null, { heading: true }], ["Top of LMST", "#3366cc"], ["Model units – stack SLST (2:53:04 AM)", null, { heading: true }], ["SLST", "#eee044"]]);
});

test("a log ramp is sampled in log steps", () => {
  assert.deepEqual(rampRows({ colors: ["#000", "#111", "#222"], min: 1, max: 10000, log: true }).map(([v]) => v), ["1", "10", "100", "1000", "10000"]);
  assert.deepEqual(rampRows(null), []);
});

test("the section window names each surface trace and keys the block models; the payload carries the key", () => {
  const sw = readFileSync(new URL("../src/components/SectionWindow.jsx", import.meta.url), "utf8");
  assert.match(sw, /\{pushSurfaceLabel\(st\)\}/);
  assert.match(sw, /<BlockModelKey slices=\{data\.voxelSlices\} \/>/);
  assert.match(sw, /sectionModelLegend\(data\.surfaceTraces, data\.voxelSlices/);
  const vm = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.match(vm, /voxelSlices\.push\(\{ id: model\.id, name: model\.name, rects, legend: voxelLegendGroups\(\[\{ \.\.\.model, visible: true \}\]\)\[0\] \|\| null \}\)/);
});

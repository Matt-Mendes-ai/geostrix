// TASKS.csv #3529 — the Specific gravity layer is the density the tonnes use: said at import (with its unit and how many values are flagged or calculated),
// in the legend heading, in Identify, in the layer's panel, and a column that is not t/m³ is questioned before the import.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as THREE from "three";
import Papa from "papaparse";
import { densityNote, densityUnitDoubt } from "../src/lib/densityNote.js";
import { LAYER_META } from "../src/lib/layers.js";
import { numericLayerLegendGroups } from "../src/lib/legendGroups.js";
import { describeHits } from "../src/lib/viewer/identify.js";

const tr = (s, v = {}) => s.replace(/\{(\w+)\}/g, (_, k) => v[k]);
const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const csv = Papa.parse(read("../sample_data/yk_macpass/sg.csv"), { header: true, skipEmptyLines: true, dynamicTyping: false });
const rows = csv.data.map((r) => ({ hole_id: r.hole_id, from: +r.from, to: +r.to, value: +r.sg, method: r.method, low_recovery: r.low_recovery, comment: r.comment }));
const FIELDS = [{ column: "method", name: "method", type: "category" }, { column: "low_recovery", name: "low_recovery", type: "category" }, { column: "comment", name: "comment", type: "category" }];

test("the import notice says it is the tonnes' density in t/m³, with the method counts and the low-recovery flags, from the real Macpass table", () => {
  const msg = densityNote(rows, FIELDS, tr);
  assert.match(msg, /^This layer is the density the tonnes use \(t\/m³\): 32,498 intervals, \d[\d.]* to \d[\d.]*\. The Grade-tonnage dialog and the tonnages of solids take their tonnes from it\./);
  const reg = rows.filter((r) => r.method === "REG").length, low = rows.filter((r) => /^y/i.test(r.low_recovery)).length;
  assert.ok(reg > 6000 && low > 2000, `${reg} regressed, ${low} low recovery`);
  assert.ok(msg.includes(`REG ${reg.toLocaleString("en-US")}`), msg);
  assert.ok(msg.includes(`${low.toLocaleString("en-US")} interval(s) are flagged low_recovery.`), msg);
  assert.doesNotMatch(msg, /do not look like t\/m³/, "a real density is not questioned");
});

test("no method or flag column: just the first sentence; no numbers: nothing", () => {
  const m = densityNote([{ value: 2.7 }, { value: 3.1 }], [], tr);
  assert.equal(m, "This layer is the density the tonnes use (t/m³): 2 intervals, 2.7 to 3.1. The Grade-tonnage dialog and the tonnages of solids take their tonnes from it.");
  assert.equal(densityNote([], [], tr), ""); assert.equal(densityNote([{ value: NaN }], [], tr), "");
});

test("kg/m³ (or any value that is not a density in t/m³) is said, before the import and after it", () => {
  const kg = [{ d: "2700" }, { d: "2650" }, { d: "3100" }, { d: "" }];
  const d = densityUnitDoubt(kg, "d");
  assert.equal(d.median, 2700); assert.equal(d.n, 3);
  assert.equal(densityUnitDoubt([{ d: "2,7" }, { d: "3.1" }, { d: "2.9" }], "d"), null, "a decimal comma and plausible values are fine");
  assert.equal(densityUnitDoubt(kg, ""), null); assert.equal(densityUnitDoubt([], "d"), null);
  assert.match(densityNote(kg.slice(0, 3).map((r) => ({ value: +r.d })), [], tr), /do not look like t\/m³ \(the middle value is 2700\): a density in kg\/m³ needs dividing by 1000/);
});

test("the layer carries its unit and purpose; its legend group carries the unit and the 3D legend heading shows it; other layers are unchanged", () => {
  assert.equal(LAYER_META.sg.unit, "t/m³"); assert.match(LAYER_META.sg.purpose, /density \(t\/m³\)/);
  assert.equal(LAYER_META.magsusc.unit, undefined);
  const layers = { sg: [{ hole_id: "A", from: 0, to: 1, value: 2.5 }, { hole_id: "A", from: 1, to: 2, value: 3.5 }], magsusc: [{ hole_id: "A", from: 0, to: 1, value: 1 }, { hole_id: "A", from: 1, to: 2, value: 9 }] };
  const g = numericLayerLegendGroups({ layers, layerVisible: { sg: true, magsusc: true }, colorOf: () => "#888" });
  assert.equal(g.find((x) => x.key === "numeric_sg").label, "Specific gravity", "the name stays: the section ribbons and the Layout legend match by it");
  assert.equal(g.find((x) => x.key === "numeric_sg").unit, "t/m³");
  assert.equal(g.find((x) => x.key === "numeric_magsusc").unit, undefined);
  { const o = read("../src/components/ViewportFigureOverlay.jsx"); assert.ok(o.includes('{(g.translated ? g.label : tr(g.label))') && o.includes('{g.unit ? ` (${g.unit})` : ""')); } // #3625 — the name is translated
});

test("Identify gives a density's value its unit: from the tooltip text and from the row alone; the hover tip carries it too", () => {
  const parent = {};
  const hit = (tip) => ({ object: { parent, userData: { row: { hole_id: "A", value: 2.708 }, tip } }, point: new THREE.Vector3(), distance: 3 });
  const ctx = (key) => ({ origin: { x: 0, y: 0, z: 0 }, units: {}, isHole: () => true, traceOf: () => null, layerOf: () => "Specific gravity", layerKeyOf: () => key,
    rasterOf: () => null, mapLayerOf: () => null, structureSetOf: () => null, terrainMesh: null, kindOf: () => null, tolerance: () => 1 });
  const val = (tip, key) => Object.fromEntries(describeHits([hit(tip)], ctx(key))[0].fields).Value;
  assert.equal(val("A", "sg"), "2.708 t/m³", "no tip text: the row's value gets the unit");
  assert.equal(val("A", "magsusc"), "2.708");
  assert.equal(val("A\nSpecific gravity: 2.708 t/m³", "sg"), "2.708 t/m³", "the tip text already carries it");
  const d = read("../src/modules/viewer/drillholeScene.js");
  assert.equal((d.match(/meta\.numeric \? row\.value \+ \(meta\.unit \? " " \+ meta\.unit : ""\) \/\* #3529 \*\//g) || []).length, 2, "both interval tooltips");
});

test("wired: the notice, the dialog's check, the layer's panel and Identify's key", () => {
  const p = read("../src/modules/viewer/importPipelineImpl.js"), m = read("../src/components/ImportMappingModal.jsx"), v = read("../src/modules/viewer/ViewerParts.jsx"), i = read("../src/lib/viewer/identify.js");
  assert.match(p, /\(target === "sg" \? densityNote\(rows, customFields, tr\)\.replace\(\/\^\(\?=\.\)\/, " "\) : ""\) \/\* #3529/);
  assert.match(m, /const densityDoubt = useMemo\(\(\) => \(modal\.target === "sg" \? densityUnitDoubt\(/);
  assert.match(m, /\{densityDoubt && <div role="alert"/);
  assert.match(v, /\{meta\.purpose && <div [^\n]*\{tr\(meta\.purpose\)\}<\/div>/);
  assert.match(i, /layerKeyOf: \(o\) => groups\.get\(o\.parent\) \?\? null, \/\/ #3529/);
  for (const lang of ["es", "pt", "fr", "ar"]) {
    const d = JSON.parse(fs.readFileSync(new URL(`../src/locales/${lang}.json`, import.meta.url), "utf8"));
    for (const k of [LAYER_META.sg.purpose, "{n} interval(s) are flagged {name}.", "These values do not look like t/m³ (the middle value is {m}): a density in kg/m³ needs dividing by 1000 before it is used for tonnes."]) assert.ok(d[k], `${lang}: ${k.slice(0, 30)}`);
  }
});

test("the unit reaches the sidebar row, the Layout legend and the section legend's ramp heading", async () => {
  assert.ok(read("../src/modules/ViewerModule.jsx").includes("label={tr(meta.label) + (meta.unit ? ` (${meta.unit})` : \"\") /* TASKS.csv #3529 */}"));
  assert.ok(read("../src/modules/LayoutModule.jsx").includes("{name}{opt.ramp.unit ? ` (${opt.ramp.unit})` : \"\""));
  const { legendGroupsToItems } = await import("../src/lib/legendGroups.js");
  const { sectionNumericLegendItems, groupSectionLegend } = await import("../src/lib/sectionLegend.js");
  const layers = { sg: [{ hole_id: "A", from: 0, to: 1, value: 2.5 }, { hole_id: "A", from: 1, to: 2, value: 3.5 }] };
  const groups = numericLayerLegendGroups({ layers, layerVisible: { sg: true }, colorOf: () => "#888" });
  assert.equal(legendGroupsToItems(groups)[0][2].ramp.unit, "t/m³", "the Layout legend's ramp row carries it");
  const items = sectionNumericLegendItems(groups);
  assert.equal(items[0][2].ramp.unit, "t/m³");
  const rows = groupSectionLegend(items, ["Specific gravity", "Lithology"]);
  assert.ok(rows.some((r) => r[0] === "Specific gravity (t/m³) (ribbon 1 of 2, from the left)"), rows.map((r) => r[0]).join(" | "));
});

// TASKS.csv #2523 — the section window had no key in the window or in its PNG / SVG / PDF. #1128 keeps the legend out of the drawing (Layout
// moves and edits it), so the key is shown under the drawing and drawn in the exported copy only, from the rows a Layout snapshot carries.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sectionKeyFurniture, furnitureLayout } from "../src/lib/figureFurniture.js";
import { groupSectionLegend } from "../src/lib/sectionLegend.js";

test("grouped legend rows become one export key per group", () => {
  const rows = groupSectionLegend([["Lithology: P", "#e0894a"], ["Lithology: BAS", "#556b2f"], ["Li (%): ≤ 0.46", "#f2ddb8"], ["Li (%): > 0.46", "#8c2f1f"]]);
  const f = sectionKeyFurniture(rows);
  assert.deepEqual(f.keys.map((k) => [k.title, k.items.map((i) => i.label)]), [["Lithology", ["P", "BAS"]], ["Li (%)", ["≤ 0.46", "> 0.46"]]]);
  const band = furnitureLayout(f, 1100);
  assert.ok(band.height > 0 && band.items.some((it) => it.type === "swatch"));
});

test("a lone group keeps no heading and still makes a key; notes and empty input are left out", () => {
  const one = sectionKeyFurniture(groupSectionLegend([["Lithology: P", "#e0894a"]]));
  assert.deepEqual(one.keys, [{ title: "Legend", items: [{ label: "P", color: "#e0894a" }] }]);
  assert.equal(sectionKeyFurniture([]), null);
  const withNote = sectionKeyFurniture([["Mineralization", null, { heading: true }], ["+ 2 longer description(s) not listed", null, { note: true }]]);
  assert.equal(withNote, null);
  const many = sectionKeyFurniture(Array.from({ length: 50 }, (_, i) => [`C${i}`, "#000000"]), { maxPerKey: 40 });
  assert.equal(many.keys[0].items.length, 41); assert.equal(many.keys[0].items[40].label, "+10 more");
});

test("the window: one builder for the key and the Layout snapshot, a switchable key, the band in the SVG and PNG exports", () => {
  const s = readFileSync(new URL("../src/components/SectionWindow.jsx", import.meta.url), "utf8");
  assert.match(s, /legendItems: keyRows\(true\)/);
  assert.match(s, /<SectionKey rows=\{keyRows\(false\)\} shown=\{showKey\} onToggle=\{toggleKey\} \/>/);
  assert.match(s, /exportSvgMarkup\(svgRef\.current, exportOpts\(\)\)\.markup/);
  assert.match(s, /const m = exportSvgMarkup\(svg, exportOpts\(\)\)/);
  assert.match(s, /showKey \? \{ furniture: sectionKeyFurniture\(keyRows\(true\)\) \} : \{\}/);
  assert.match(s, /localStorage\.getItem\("geostrix\.sectionKey"\) !== "0"/);
  for (const l of ["es", "pt", "fr", "ar"]) assert.ok(JSON.parse(readFileSync(new URL(`../src/locales/${l}.json`, import.meta.url), "utf8"))["Hide the key"], l);
});

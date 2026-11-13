// TASKS.csv #3066 (Matt, 2026-11-12) — USGS (FGDC-STD-013-2006) structure symbols: the library, the default per type, the per-type choice
import test from "node:test";
import assert from "node:assert/strict";
import { SYMBOLS, FAMILIES, defaultFamily, familyFor, symbolForReading, attitudeOf, projectSymbolChoices, typeKey, symbolFrame, symbolSvg, symbolGeometry } from "../src/lib/structureSymbols.js";

test("every family's three variants are symbols, each citing its FGDC number", () => {
  for (const [id, f] of Object.entries(FAMILIES)) for (const a of ["inclined", "vertical", "horizontal"]) {
    const s = SYMBOLS[f[a]];
    assert.ok(s, `${id}.${a}`); assert.ok(/^\d+(\.\d+)*( \/ \d+(\.\d+)*)?$/.test(s.fgdc), s.fgdc); assert.ok(s.parts.length > 0);
  }
  assert.equal(SYMBOLS["6.2"].name, "Inclined bedding"); assert.equal(SYMBOLS["6.1"].name, "Horizontal bedding"); assert.equal(SYMBOLS["8.3.2"].fgdc, "8.3.2");
});

test("the default family from the data's own words and class (no fixed list of types)", () => {
  const cases = [["Bedding", "bedding", "bedding"], ["S0", "bedding", "bedding"], ["Overturned bedding", "bedding", "beddingOverturned"], ["S1 schistosity", "foliation", "foliationTectonic"],
    ["Foliation", "foliation", "foliation"], ["Slaty cleavage", "cleavage", "cleavage"], ["Joint", "joint", "joint"], ["Fault", "fault", "fault"], ["Shear", "other", "fault"],
    ["Qz vein", "vein", "vein"], ["Dyke contact", "contact", "contact"], ["L1 stretching lineation", "other", "lineation"], ["F2 fold axis", "other", "foldHinge"], ["Whatever", "other", "bedding"]];
  for (const [t, c, want] of cases) assert.equal(defaultFamily(t, c), want, t);
});

test("each reading takes its family's variant by its own dip; a choice per type wins over the default", () => {
  assert.equal(attitudeOf(0), "horizontal"); assert.equal(attitudeOf(40), "inclined"); assert.equal(attitudeOf(89), "vertical"); assert.equal(attitudeOf(10, true), "horizontal");
  assert.deepEqual([0, 40, 90].map((dip) => symbolForReading({ type: "Bedding", cls: "bedding", dip }).symbol.fgdc), ["6.1", "6.2", "6.3"]);
  const choices = projectSymbolChoices([{ symbolByType: { [typeKey("Bedding")]: "beddingOverturned" } }, { symbolByType: { FOL: "foliationTectonic", BAD: "nope" } }]);
  assert.deepEqual(choices, { BEDDING: "beddingOverturned", FOL: "foliationTectonic" });
  assert.equal(familyFor(" bedding ", "bedding", choices), "beddingOverturned");
  assert.equal(symbolForReading({ type: "Bedding", cls: "bedding", dip: 60 }, choices).symbol.fgdc, "6.4");
});

test("the frame: u along the right-hand-rule strike, v down dip", () => {
  const f = symbolFrame(90); // dipping east: strike north
  const [e1, n1] = f(1, 0), [e2, n2] = f(0, 1);
  assert.ok(Math.abs(e1) < 1e-9 && Math.abs(n1 - 1) < 1e-9, "u runs north"); assert.ok(Math.abs(e2 - 1) < 1e-9 && Math.abs(n2) < 1e-9, "v runs east (down dip)");
});

test("SVG and geometry: lines, fills, dashes, the label", () => {
  const svg = symbolSvg(SYMBOLS["6.2"], { label: 40 });
  assert.match(svg, /^<svg /); assert.match(svg, /<text [^>]*>40<\/text>/);
  const g = symbolGeometry(SYMBOLS["8.3.2"]);
  assert.ok(g.segments.length >= 4 && g.triangles.length === 1, JSON.stringify([g.segments.length, g.triangles.length]));
  assert.equal(symbolGeometry(SYMBOLS["6.33"]).segments.length, 3, "the 5 mm strike line in two 2.0 mm dashes (0.7 mm gap), and the tick");
  assert.match(symbolSvg(SYMBOLS["2.15.1"]), /stroke-width="[0-9.]+"/);
});

import { readFileSync } from "node:fs";
test("the Surface Geology panel: a line per type with its symbol and a choice saved on the sets", () => {
  const p = readFileSync(new URL("../src/components/SurfaceMappingPanel.jsx", import.meta.url), "utf8");
  assert.match(p, /const symbolChoices = useMemo\(\(\) => projectSymbolChoices\(surfaceStructures\), \[surfaceStructures\]\);/);
  assert.match(p, /updateSurfaceStructureSet\(set\.id, \{ symbolByType: \{ \.\.\.\(set\.symbolByType \|\| \{\}\), \[key\]: family \} \}\)/);
  assert.match(p, /aria-label=\{tr\("Symbol for \{type\}", \{ type: t\.name \}\)\}/);
});

import { symbolPixels, symbolPng, symbolIconPath } from "../src/lib/structureSymbolPng.js";
import { featuresToKml } from "../src/lib/overlayExport.js";
test("KMZ icons: a PNG per symbol, the strike line north-south and the dip side east; the KML names each point's icon", () => {
  const p = symbolPixels(SYMBOLS["6.2"], 64), at = (x, y) => p.rgba[(y * 64 + x) * 4 + 3];
  assert.equal(at(32, 4), 255, "the strike line reaches north"); assert.equal(at(32, 59), 255, "and south");
  assert.equal(at(40, 32), 255, "the tick to the east (down dip)"); assert.equal(at(24, 32), 0, "nothing to the west");
  const png = symbolPng(SYMBOLS["8.3.2"]); assert.deepEqual([...png.slice(1, 4)], [80, 78, 71]);
  assert.equal(symbolIconPath(SYMBOLS["6.2"]), "files/fgdc_6_2.png"); assert.equal(symbolIconPath(SYMBOLS["1.3+1.4.1"]), "files/fgdc_1_3_1_4_1.png");
  const kml = featuresToKml({ geomType: "point", features: [{ geometry: [[1, 2, NaN]], attributes: {} }] }, { toLonLat: (x, y) => [x, y], headingOf: () => 30, iconOf: () => "files/fgdc_6_2.png" });
  assert.match(kml, /<heading>30<\/heading><Icon><href>files\/fgdc_6_2\.png<\/href><\/Icon>/);
});
import { outcropLegendGroup } from "../src/lib/legendGroups.js";
test("the legend: a row per type with its symbol in the class colour, classes in order, a class the colours do not know last", () => {
  const rows = [{ type: "L1 lineation", cls: "lineation", dip: 20 }, { type: "Fault", cls: "fault", dip: 70 }, { type: "S1 schistosity", cls: "foliation", dip: 60 }, { type: "Bedding", cls: "bedding", dip: 30 }, { type: "Bedding", cls: "bedding", dip: 0 }];
  const g = outcropLegendGroup({ surfaceStructures: [{ name: "a", rows, symbolByType: { "S1 SCHISTOSITY": "foliation" } }] });
  assert.deepEqual(g.items.map((i) => i[0]), ["Fault", "Bedding", "S1 schistosity", "L1 lineation"]);
  assert.deepEqual(g.items.map((i) => i[2].fgdc), ["2.15.1", "6.2", "8.1.2", "9.3"]);
  assert.match(g.items[0][2].svg, /^<svg/); assert.match(g.items[0][2].svg, /#b5179e/i);
});

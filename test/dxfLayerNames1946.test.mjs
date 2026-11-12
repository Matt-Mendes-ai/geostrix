// TASKS.csv #1946 — a design string keeps its name through the app's own DXF round trip (spaces kept in the layer)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildDXF, sanitizeLayerName } from "../src/lib/dxf.js";
import { stringsFromDxf, stringFeatures } from "../src/lib/designStrings.js";

test("spaces and accents stay; only the characters DXF forbids become '_'", () => {
  assert.equal(sanitizeLayerName("String 1"), "String 1");
  assert.equal(sanitizeLayerName("Dump pad / west"), "Dump pad _ west");
  assert.equal(sanitizeLayerName("Rampa sur é"), "Rampa sur é");
  assert.equal(sanitizeLayerName('a<b>c:d;e?f*g|h,i=j`k"l\\m'),"a_b_c_d_e_f_g_h_i_j_k_l_m");
  assert.equal(sanitizeLayerName("  PIT_CREST  "), "PIT_CREST"); // readers trim group values
  assert.equal(sanitizeLayerName("line\nbreak\ttab"), "line_break_tab");
  assert.equal(sanitizeLayerName(""), "GEOSTRIX");
  assert.equal(sanitizeLayerName("   "), "GEOSTRIX");
  assert.equal(sanitizeLayerName("x".repeat(300)).length, 255);
  assert.equal(sanitizeLayerName("DH-001.A_$"), "DH-001.A_$"); // what was allowed before is unchanged
});

test("'String 1' and 'Pit crest 2' come back from the exported DXF with their names", () => {
  const designStrings = [
    { id: "a", name: "String 1", closed: false, color: "#ff0000", vertices: [[0, 0, 100], [10, 0, 101], [20, 5, 102]] },
    { id: "b", name: "Pit crest 2", closed: true, color: "#00ff00", vertices: [[0, 0, 90], [10, 0, 90], [10, 10, 90], [0, 10, 90]] },
  ];
  const text = buildDXF({ features: stringFeatures(designStrings), geomType: "line", layerOf: (f) => f.attributes.name, colorOf: (f) => f.attributes.color });
  assert.match(text, /\n8\nString 1\n/);
  const { strings } = stringsFromDxf(text, { baseName: "design_strings" });
  assert.deepEqual(strings.map((s) => s.name), ["String 1", "Pit crest 2"]);
  assert.equal(strings[1].closed, true);
});

test("the strings pane still names the layer after the string", () => {
  const p = fs.readFileSync("src/components/DesignStringsPane.jsx", "utf8");
  assert.match(p, /layerOf: \(f\) => f\.attributes\.name/);
});

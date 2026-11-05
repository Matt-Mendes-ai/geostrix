// TASKS.csv #1822 (review #1646, Kodiak) — surface samples coloured by a text field; descriptions kept whole
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { anomalyClasses, textAttrFields, FIELD_CLASS_MAX, CATEGORY_COLORS } from "../src/lib/anomalyMap.js";
import { surfaceAttrColumns, surfaceAttrs, SURFACE_ATTR_MAX_CHARS, isFreeTextHeader } from "../src/lib/geochem.js";
import { mappedOfSample, surfaceSampleTip, sampleIdentifyFields } from "../src/lib/viewer/sampleTip.js";

const samples = [
  { sample_id: "R1", medium: "rock", x: 0, y: 0, z: 1000, values: { Cu: 100 }, attrs: { Lithology: "diorite", Alteration: "sericite", Description: "Mal and black stained diorite, strongly sericitized, 3 sumps" } },
  { sample_id: "R2", medium: "rock", x: 10, y: 0, z: 1000, values: { Cu: 50 }, attrs: { Lithology: "diorite", Alteration: "chlorite" } },
  { sample_id: "R3", medium: "rock", x: 20, y: 0, z: 1000, values: { Cu: 500 }, attrs: { Lithology: "andesite", Alteration: " sericite " } },
  { sample_id: "R4", medium: "rock", x: 30, y: 0, z: 1000, values: { Cu: 5 }, attrs: { Lithology: "" } },
  { sample_id: "S1", medium: "soil", x: 40, y: 0, z: 1000, values: { Cu: 20 }, attrs: { Horizon: "B", Depth_cm: "25" } },
];

test("#1822 the text fields of a sample set, not the numeric ones", () => {
  assert.deepEqual(textAttrFields(samples), ["Alteration", "Description", "Horizon", "Lithology"]);
  assert.deepEqual(textAttrFields(samples, { maxDistinct: 1 }), ["Description", "Horizon"]);
  assert.deepEqual(textAttrFields([]), []);
});

test("#1822 colour by Lithology: one class per value (most common first), no-value samples in the no-value colour, text in the tip", () => {
  const a = anomalyClasses(samples, { mode: "field", field: "Lithology" });
  assert.deepEqual(a.classes.map((c) => c.label), ["diorite (2)", "andesite (1)"]);
  assert.deepEqual([...a.classOf], [0, 0, 1, -1, -1]);
  assert.equal(a.classes[0].color, CATEGORY_COLORS[0]);
  assert.equal(a.anomalousFrom, Infinity, "a category map has no anomalous class");
  assert.equal(a.label, "Lithology: 2 value(s)");
  assert.ok(a.notes.some((n) => n.text.includes("have no {field}") && n.params.n === 2));
  const m = mappedOfSample(a, { mode: "field", field: "Lithology" }, 2);
  assert.equal(m.text, "andesite"); assert.equal(m.label, "Lithology"); assert.equal(m.cls, "andesite (1)");
  assert.match(surfaceSampleTip(samples[2], { mapped: m }), /Lithology: andesite/);
  assert.deepEqual(sampleIdentifyFields(samples[2], m)[0], ["Lithology", "andesite"]);
  // the alteration field is trimmed before it is classed
  const b = anomalyClasses(samples, { mode: "field", field: "Alteration" });
  assert.deepEqual(b.classes.map((c) => c.label), ["sericite (2)", "chlorite (1)"]);
  // many values: the rest pooled as "other"
  const many = Array.from({ length: 40 }, (_, i) => ({ x: i, y: 0, z: 0, values: {}, attrs: { Code: `C${i}` } }));
  const c = anomalyClasses(many, { mode: "field", field: "Code" });
  assert.equal(c.classes.length, FIELD_CLASS_MAX + 1);
  assert.match(c.classes[FIELD_CLASS_MAX].label, /^other \(16 more values, 16 samples\)/);
});

test("#1822 a description column is kept, whole, past the distinct-value cap", () => {
  const rows = Array.from({ length: 150 }, (_, i) => ({ id: `R${i}`, X: i, Y: 0, Cu: 1, Description: `note ${i} `.repeat(20), Lithology: i % 3 ? "diorite" : "andesite", Serial: `S${i}` }));
  const cols = surfaceAttrColumns(["id", "X", "Y", "Cu", "Description", "Lithology", "Serial"], rows, { sample_id: "id", x: "X", y: "Y" }, [{ symbol: "Cu", header: "Cu", mainHeader: "Cu" }]);
  assert.deepEqual(cols, ["Description", "Lithology"], "Serial has 150 distinct values and is not free text");
  assert.ok(isFreeTextHeader("Sample_Description") && isFreeTextHeader("Comments") && !isFreeTextHeader("Lithology"));
  const a = surfaceAttrs(rows[0], cols).attrs;
  assert.equal(a.Description.length, Math.min(SURFACE_ATTR_MAX_CHARS, rows[0].Description.trim().length));
  assert.ok(SURFACE_ATTR_MAX_CHARS >= 400);
});

test("#1822 the Colour by list offers the text fields", () => {
  const s = readFileSync(new URL("../src/components/SurfaceAnomalyControls.jsx", import.meta.url), "utf8");
  assert.ok(s.includes("textAttrFields(surfaceSamples)") && s.includes('tr("Field: {name}", { name: f })') && s.includes('set({ mode: "field", field: v.slice(6) })'));
});

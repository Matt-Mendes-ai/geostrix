// TASKS.csv #2520 — Identify listed the first 16 of a sample's 37 elements in the lab file's column order (Cs, Si, Al ... never showed) and
// 'Under this click' could not tell five intervals of one hole apart. Every element now, the one shown first; '<' as the lab wrote it.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { describeHits, assayValueText } from "../src/lib/viewer/identify.js";

const obj = (userData, parent = null) => ({ userData, parent, visible: true });
const ctx = (over = {}) => ({ origin: { x: 0, y: 0, z: 0 }, rayDirection: new THREE.Vector3(0, -1, 0), isHole: (id) => id === "CLDD006", traceOf: () => null, layerOf: () => null, rasterOf: () => null, ...over });
const P = (x, y, z) => new THREE.Vector3(x, y, z);

const syms = ["As", "Mg", "Mn", "Na", "Nb", "Ni", "P", "Pb", "Rb", "Sb", "Sn", "Ca", "Fe", "K", "Li", "Ta", "Ba", "Be", "Bi", "Ce", "Co", "Cs", "Si", "Al", "Ti", "Zr", "Hf", "U", "Th", "W", "Y", "Zn", "Cu", "Ga", "Ge", "In", "La"];
const values = Object.fromEntries(syms.map((s, i) => [s, 1 + i / 10]));

test("all 37 elements, the bar's element first, '<' and '>' as reported", () => {
  const group = {};
  const row = { hole_id: "CLDD006", from: 4, to: 5, values: { ...values, Hf: 0.0021 }, qualifiers: { Hf: "<", Li: ">" } };
  const o = obj({ tip: "CLDD006\nCs: 2.2 %\n4–5 m", row }, group);
  const [it] = describeHits([{ object: o, point: P(0, 0, 0), distance: 1 }], ctx({ layerOf: (x) => (x.parent === group ? "Assays" : null), units: { Cs: "%", Hf: "%", Li: "%" } }));
  const names = it.fields.map((f) => f[0]);
  for (const s of syms) assert.ok(names.includes(s), `${s} listed`);
  const firstEl = names.findIndex((n) => syms.includes(n));
  assert.equal(names[firstEl], "Cs", "the element this bar shows comes first");
  const f = Object.fromEntries(it.fields);
  assert.equal(f.Hf, "<0.0042 %", "a below-detection result as the lab wrote it");
  assert.match(f.Li, /^>/);
  assert.equal(it.at, "4–5 m");
});

test("assayValueText: plain, flagged, a surface bdl list, missing", () => {
  assert.equal(assayValueText({ values: { Cu: 1234.5678 } }, "Cu", "ppm"), "1,234.5678 ppm");
  assert.equal(assayValueText({ values: { Au: 0.0025 }, qualifiers: { Au: "<" } }, "Au", "ppm"), "<0.005 ppm");
  assert.equal(assayValueText({ values: { Au: 0.0025 }, bdl: ["Au"] }, "Au", "ppm"), "<0.005 ppm");
  assert.equal(assayValueText({ values: {} }, "Au", "ppm"), "");
});

test("'Under this click' rows carry the depth", () => {
  const p = readFileSync(new URL("../src/components/IdentifyPanel.jsx", import.meta.url), "utf8");
  assert.match(p, /\{x\.at \? <span style=\{\{ color: "var\(--color-text-muted\)" \}\}> · \{x\.at\}<\/span> : null\}/);
  const s = readFileSync(new URL("../src/lib/viewer/identify.js", import.meta.url), "utf8");
  assert.doesNotMatch(s, /Object\.entries\(row\.values\)\.slice\(0, 16\)/);
});

// TASKS.csv #2816 — a code's meaning from the project's code dictionary (#2163) beside the code in Identify and the interval's hover
// tooltip (lib/viewer/codeMeaning.js; identify.js describe; ViewerModule's hover).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as THREE from "three";
import { codeMeaning, layerKeyOf, tipWithMeaning } from "../src/lib/viewer/codeMeaning.js";
import { describeHits } from "../src/lib/viewer/identify.js";

const dict = { litho: { smp: { code: "SMP", desc: "Saprolite, mottled" }, gr: { code: "GR", desc: "GR" } }, alt: { smp: { code: "SMP", desc: "Sericite-muscovite-pyrite" } } };

test("codeMeaning: the layer's own entry, case-folded; nothing for no entry, an entry that only repeats the code, a number, or a meaning already shown", () => {
  assert.equal(codeMeaning(dict, "litho", "Smp"), "Saprolite, mottled");
  assert.equal(codeMeaning(dict, "alt", "SMP"), "Sericite-muscovite-pyrite"); // the same code means another thing in another layer
  assert.equal(codeMeaning(dict, "litho", "GR"), null);
  assert.equal(codeMeaning(dict, "litho", "XX"), null);
  assert.equal(codeMeaning(dict, "vein", "SMP"), null);
  assert.equal(codeMeaning(dict, "litho", 3.2), null);
  assert.equal(codeMeaning(dict, null, "SMP"), null);
  assert.equal(codeMeaning({}, "litho", "SMP"), null);
  assert.equal(codeMeaning(dict, "litho", "SMP", "H1\nLithology: Saprolite, mottled"), null); // the legend label already says it
});

const groups = { litho: new THREE.Group(), alt: new THREE.Group() };
const interval = (key, value, tip) => { const m = new THREE.Mesh(); m.userData = { row: { hole_id: "H1", value, from: 2, to: 6.5 }, holeId: "H1", catValue: value, tip }; groups[key].add(m); return m; };

test("the hover tooltip gets the meaning on its own line", () => {
  const m = interval("litho", "SMP", "H1\nLithology: SMP");
  assert.equal(layerKeyOf(m, groups), "litho");
  assert.equal(tipWithMeaning(m, groups, dict), "H1\nLithology: SMP\nSaprolite, mottled");
  assert.equal(tipWithMeaning(m, groups, null), "H1\nLithology: SMP");
  assert.equal(tipWithMeaning(interval("litho", "GR", "H1\nLithology: GR"), groups, dict), "H1\nLithology: GR");
});

test("Identify: a 'Meaning' row under the value", () => {
  const m = interval("alt", "SMP", "H1\nAlteration: SMP");
  const keys = new Map(Object.entries(groups).map(([k, g]) => [g, k]));
  const ctx = { origin: { x: 0, y: 0, z: 0 }, units: {}, isHole: () => true, traceOf: () => null, layerOf: (o) => (keys.has(o.parent) ? "Alteration" : null),
    meaningOf: (o, v, shown) => codeMeaning(dict, keys.get(o.parent), v, shown),
    rasterOf: () => null, mapLayerOf: () => null, structureSetOf: () => null, terrainMesh: null, kindOf: () => null, tolerance: () => 1 };
  const [it] = describeHits([{ object: m, point: new THREE.Vector3(), distance: 3 }], ctx);
  const f = Object.fromEntries(it.fields);
  assert.equal(f.Value, "SMP");
  assert.equal(f.Meaning, "Sericite-muscovite-pyrite");
  const i = it.fields.findIndex(([k]) => k === "Meaning");
  assert.equal(it.fields[i - 1][0], "Value");
});

test("wiring: identifyAt passes the dictionary; the hover uses tipWithMeaning through a ref; the key in every locale", () => {
  const id = fs.readFileSync(new URL("../src/lib/viewer/identify.js", import.meta.url), "utf8");
  assert.match(id, /meaningOf: \(o, v, shown\) => \(r\.codeDictionary \? codeMeaning\(r\.codeDictionary, groups\.get\(o\.parent\), v, shown\) : null\)/);
  const v = fs.readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.match(v, /text: tipWithMeaning\(layerHit\.object, layerGroupsRef\.current, codeDictRef\.current\)/);
  assert.match(v, /const codeDictRef = useRef\(codeDictionary\); codeDictRef\.current = codeDictionary;/);
  assert.match(v, /surfaceStructures, codeDictionary \/\* #2816 \*\//);
  for (const l of ["es", "pt", "fr", "ar"]) assert.ok(JSON.parse(fs.readFileSync(new URL(`../src/locales/${l}.json`, import.meta.url), "utf8")).Meaning, l);
});

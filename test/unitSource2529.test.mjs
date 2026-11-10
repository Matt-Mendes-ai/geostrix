// TASKS.csv #2529 (review #2486, WA lithium) — the Weathering layer and custom layers of codes as the modelled unit; Weathering in the halo's list
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { unitSourceLayers, applyUnitSource } from "../src/lib/unitSource.js";

const layers = {
  litho: [{ hole_id: "A", from: 0, to: 10, value: "P" }],
  weath: [{ hole_id: "A", from: 0, to: 4, value: "E" }, { hole_id: "A", from: 4, to: 19, value: "W" }, { hole_id: "A", from: 19, to: 40, value: "FR" }, { hole_id: "A", from: 40, to: 41, value: "" }],
};
const custom = [
  { id: 7, name: "Rock2", rows: [{ hole_id: "A", from: 0, to: 5, value: "PEG" }] },
  { id: 8, name: "Gamma", rows: [{ hole_id: "A", depth: 3, from: 3, to: 3, value: 120 }] }, // points: not a coded interval layer
  { id: 9, name: "RQD", rows: [{ hole_id: "A", from: 0, to: 3, value: 80 }, { hole_id: "A", from: 3, to: 6, value: 60 }] }, // numbers
];

test("Weathering and the coded custom layers are offered, not point or numeric layers", () => {
  assert.deepEqual(unitSourceLayers(layers, custom).map((x) => [x.name, x.label, x.distinct]), [["@weath", "Weathering", 3], ["@custom:7", "Rock2", 1]]);
  assert.deepEqual(unitSourceLayers({ litho: [] }, []), []);
});

test("that layer's intervals become the units; the top of fresh rock is FR's top", () => {
  const u = applyUnitSource(layers, "@weath");
  assert.deepEqual(u.litho.map((r) => [r.from, r.value]), [[0, "E"], [4, "W"], [19, "FR"]]);
  assert.equal(u.weath, layers.weath);
  assert.deepEqual(applyUnitSource(layers, "@custom:7", custom).litho.map((r) => r.value), ["PEG"]);
  assert.equal(applyUnitSource({ weath: layers.weath }, "@weath").litho.length, 3); // no Lithology rows at all
});

test("the halo offers Weathering and the run reads it", () => {
  const p = readFileSync(new URL("../src/modules/viewer/ModellingPanes.jsx", import.meta.url), "utf8");
  assert.match(p, /<option value="weath">\{tr\("Weathering \(a code set as an envelope\)"\)\}/);
  const m = readFileSync(new URL("../src/modules/viewer/modellingRuns.js", import.meta.url), "utf8");
  assert.match(m, /if \(!isCode && source\?\.layer === "weath"\) sourceKey = "weath";/);
});

// TASKS.csv #1017 — the title, caption and keys of four more figure exports (lib/figureFurniture.js), and that they lay out.
import test from "node:test";
import assert from "node:assert/strict";
import { fenceFurniture, tadpoleFurniture, geochemFurniture, levelPlanFurniture, furnitureLayout } from "../src/lib/figureFurniture.js";

const date = "2026-10-30";

test("#1017 fence diagram: holes, bearing and how it was chosen, exaggeration, the band caveat only with bands, the key", () => {
  const f = fenceFurniture({ holeIds: ["H1", "H2"], azimuth: 47.25, fitted: true, ve: 2, offsetLimit: 50, bands: true, codes: ["VCL", "DACT"], colorOf: (c) => (c === "VCL" ? "#0f0" : "#00f"), date });
  assert.equal(f.title, "Fence diagram: H1, H2");
  assert.match(f.caption[0], /^Section bearing 47\.3° \(best fit through the collars\) · vertical exaggeration 2x · holes more than 50 m off the section flagged amber · shaded bands .*not a measurement$/);
  assert.equal(f.caption[1], "GeoStrix · 2026-10-30");
  assert.deepEqual(f.keys, [{ title: "Lithology", items: [{ label: "VCL", color: "#0f0" }, { label: "DACT", color: "#00f" }] }]);
  const plain = fenceFurniture({ holeIds: ["H1"], azimuth: 90, fitted: false, ve: 1, offsetLimit: 25, bands: false, codes: [], colorOf: () => "#000", date });
  assert.ok(plain.caption[0].includes("(fixed)") && !plain.caption[0].includes("shaded bands"));
  assert.deepEqual(plain.keys, []);
});

test("#1017 tadpole plot: alpha or true dip wording, a type key only with more than one type", () => {
  const one = tadpoleFurniture({ hole: "MT23-118", alpha: false, picks: 12, types: ["FLT"], typeColor: () => "#f00", lithoCodes: ["VCL"], lithColor: () => "#0f0", date });
  assert.equal(one.title, "Tadpole plot: MT23-118");
  assert.match(one.caption[0], /its true dip and its depth/);
  assert.equal(one.caption[1], "12 pick(s) · GeoStrix · 2026-10-30");
  assert.deepEqual(one.keys.map((k) => k.title), ["Lithology"]);
  const two = tadpoleFurniture({ hole: "", alpha: true, picks: 3, types: ["FLT", "VEIN"], typeColor: () => "#f00", date });
  assert.equal(two.title, "Tadpole plot: hole");
  assert.match(two.caption[0], /alpha \(angle to the core axis\)/);
  assert.deepEqual(two.keys[0].items.map((i) => i.shape), ["dot", "dot"]);
});

test("#1017 geochem diagram: plotted of total, the filter count only with a filter, the key capped at 40", () => {
  const items = Array.from({ length: 45 }, (_, i) => ({ label: `H${i}`, color: "#123456", shape: "dot" }));
  const f = geochemFurniture({ title: "Alteration Box Plot (Large et al. 2001)", caption: "Ishikawa AI vs CCPI.", plotted: 3700, total: 3791, spider: false, hidden: 50, keyTitle: "Hole", keyItems: items, date });
  assert.equal(f.caption[1], "3700 of 3791 samples plotted; 50 hidden by the lithology filter. Below-detection values substituted at half the detection limit.");
  assert.equal(f.keys[0].items.length, 40);
  assert.equal(f.keys[0].items[39].label, "+6 more");
  const s = geochemFurniture({ title: "REE", caption: "Chondrite-normalized.", plotted: 10, total: 12, spider: true, date });
  assert.match(s.caption[1], /^10 of 12 samples have at least one plottable element\. Below/);
  assert.deepEqual(s.keys, []);
});

test("#1017 level plan legend: 60 entries then '+n more'; none without a legend; every furniture lays out", () => {
  const lp = levelPlanFurniture(Array.from({ length: 65 }, (_, i) => [`U${i}`, "#abcdef"]));
  assert.equal(lp.keys[0].items.length, 61);
  assert.equal(lp.keys[0].items[60].label, "+5 more");
  assert.equal(levelPlanFurniture([]), null);
  for (const f of [lp, tadpoleFurniture({ hole: "H", alpha: false, picks: 1, types: ["A", "B"], typeColor: () => "#000", date }), geochemFurniture({ title: "T", caption: "C", plotted: 1, total: 1, spider: false, date })]) {
    const L = furnitureLayout(f, 600);
    assert.ok(L.height > 0 && L.items.length > 0 && L.items.every((it) => Number.isFinite(it.x) && Number.isFinite(it.y)));
  }
});

// TASKS.csv #1807 (review #1646, Kodiak) — a section carries the geophysics points and placed samples inside its corridor
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { corridorScatter } from "../src/lib/sectionScatter.js";

const a = { x: 0, y: 0 }, b = { x: 1000, y: 0 };
const geo = [
  { x: 100, y: 50, z: -100, value: 10 }, { x: 500, y: -90, z: 900, value: 100 }, // inside a 100 m corridor
  { x: 500, y: 150, z: 900, value: 50 }, { x: 1200, y: 0, z: 900, value: 50 }, { x: 300, y: 0, z: null, value: 5 }, // outside / beyond the end / no z
];
const samples = [{ x: 700, y: 20, z: 1550, medium: "soil", sample_id: "S1" }, { x: 700, y: 20, z: NaN, medium: "soil" }];

test("#1807 points within the corridor and the line's length, with their elevation; no elevation, no place", () => {
  const s = corridorScatter({ geophysPts: geo, samples }, a, b, 100);
  assert.deepEqual(s.map((p) => [p.kind, Math.round(p.d), p.z]), [["geophys", 100, -100], ["geophys", 500, 900], ["sample", 700, 1550]]);
  assert.deepEqual(s.counts, { geophys: 2, samples: 1 });
  assert.ok(s[0].color && s[0].label.includes("10"));
  assert.equal(s[2].label, "Surface sample S1 (soil)");
  assert.equal(corridorScatter({ geophysPts: geo }, a, b, 100, 1).length, 1, "capped");
});

test("#1807 the payload and the section window carry them", () => {
  const v = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.ok(v.includes("geophysPts: layerVisible.geophys_pts ? layers.geophys_pts : null") && v.includes("scatter, scatterCounts: scatter.counts"));
  const w = readFileSync(new URL("../src/components/SectionWindow.jsx", import.meta.url), "utf8");
  assert.ok(w.includes("scatter.forEach((p) => { minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z); });"));
  assert.ok(w.includes("cx={sx(p.d)} cy={sz(p.z)}"));
});

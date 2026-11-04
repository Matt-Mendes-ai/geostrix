// TASKS.csv #1818 / #1819 (review #1646, Kodiak) — samples without a z are drawn flat when there is no terrain, and the anomaly
// classes are computed on every sample (drawn or not), so the legend, the drawn colours and the class CSV describe the survey
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { anomalyClasses } from "../src/lib/anomalyMap.js";
import { anomalyClassRows } from "../src/lib/tableExports.js";

const v = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");

test("no terrain: a sample without a z is placed flat at the median collar / sample elevation, and the panel says so", () => {
  assert.ok(v.includes("return med(collars) ?? med(surfaceSamples) ?? 0;"));
  assert.ok(v.includes(": !b || !inside ? { ...r, z: surfaceFlatZ, zFlat: true, ...(b ? { zOutside: true } : {}) } : null;")); // TASKS.csv #1806 — outside the terrain's footprint: flat too
  assert.ok(v.includes("drawn flat at {z} m (the median collar or sample elevation)"));
});

test("classes come from every sample and reach the drawn ones through their index", () => {
  assert.ok(v.includes("m.anomalyClasses(surfaceSamples, cfg,"));
  assert.ok(v.includes("const cl = an ? (j >= 0 ? an.classOf[j] : -1) : -2;"));
  assert.ok(v.includes("result={surfaceAnomaly} drawn={surfaceSamples}"));
  assert.ok(!v.includes("drawn: placedSurfaceSamples"));
});

test("Kodiak's case: soils with no z are classed beside the rock chips, and the class CSV holds every sample", () => {
  const soils = Array.from({ length: 200 }, (_, i) => ({ sample_id: `S${i}`, medium: "soil", x: 1000 + i * 50, y: 2000, z: null, values: { Cu: 10 + i } }));
  const rocks = Array.from({ length: 20 }, (_, i) => ({ sample_id: `R${i}`, medium: "rock chip", x: 5000 + i * 30, y: 3000, z: 1354, values: { Cu: 100 + i * 10 } }));
  const all = [...soils, ...rocks];
  const a = anomalyClasses(all, { mode: "element", symbol: "Cu", scheme: "percentile", groupBy: "medium" }, { units: { Cu: "ppm" } });
  const soilTop = soils.filter((_, i) => a.classOf[i] === 5).length;
  assert.ok(soilTop >= 3, "the top soils reach the top class within their own medium");
  assert.equal(anomalyClassRows(all, a, { crs: "" }).length, 220);
});

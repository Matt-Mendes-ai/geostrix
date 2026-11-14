// TASKS.csv #2947 (split from #2843) — a gravity derivative's unit is the user's choice: per km (default, as published), per metre, or Eötvös
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { filterOutputUnits } from "../src/lib/gridFilters.js";
test("mGal and µGal: per km (default), per m, Eötvös; a magnetic derivative ignores the choice", () => {
  assert.deepEqual(filterOutputUnits("vd1", "mGal"), { units: "mGal/km", scale: 1000 });
  assert.deepEqual(filterOutputUnits("vd1", "mGal", "m"), { units: "mGal/m", scale: 1 });
  assert.deepEqual(filterOutputUnits("as", "mGal", "E"), { units: "E", scale: 10000 }); // 1 mGal/m = 1e-5 s^-2 = 10,000 E
  assert.deepEqual(filterOutputUnits("vd1", "µGal", "E"), { units: "E", scale: 10 }); // 1 µGal/m = 1e-8 s^-2 = 10 E
  assert.deepEqual(filterOutputUnits("vd1", "nT", "E"), { units: "nT/m", scale: 1 });
  // the per-m value times the scale is the same physical quantity in each unit: 0.01 mGal/m = 10 mGal/km = 100 E
  assert.equal(0.01 * 1000, 10); assert.equal(0.01 * filterOutputUnits("vd1", "mGal", "E").scale, 100);
});
test("the filter form offers it for a gravity grid and passes it on", () => {
  const m = readFileSync(new URL("../src/modules/RasterModule.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(m, /filterOutputUnits\(filt\.kind, rasterUnitOf\(r\), filt\.gravPer \|\| "km"\)/);
  assert.match(m, /aria-label=\{tr\("Unit of the gravity derivative"\)\}/);
});

// TASKS.csv #2837 / #2843 (GSC geophysics review) — filter products of an imported grid lost the unit typed on it (only a gridded survey's
// r.units was passed), a tilt never said degrees, and a Bouguer 1VD was per metre where the published grid is per kilometre (~1,000 x).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { filterOutputUnits, applyGridFilter } from "../src/lib/gridFilters.js";
import { rasterUnitOf } from "../src/lib/rasterMethod.js";

test("the unit of each product: the parent's, its own, or per km for a gravity derivative", () => {
  const u = (k, p) => filterOutputUnits(k, p);
  assert.deepEqual(u("rtp", "nT"), { units: "nT", scale: 1 });
  assert.deepEqual(u("vd1", "nT"), { units: "nT/m", scale: 1 }); // magnetic derivatives stay per metre, as published
  assert.deepEqual(u("as", "nT"), { units: "nT/m", scale: 1 });
  assert.deepEqual(u("upward", "nT"), { units: "nT", scale: 1 });
  assert.deepEqual(u("tilt", ""), { units: "degrees", scale: 1 }); // needs no parent unit
  assert.deepEqual(u("tilt", "mGal"), { units: "degrees", scale: 1 });
  assert.deepEqual(u("vd1", "mGal"), { units: "mGal/km", scale: 1000 });
  assert.deepEqual(u("as", "µGal"), { units: "µGal/km", scale: 1000 });
  assert.deepEqual(u("upward", "mGal"), { units: "mGal", scale: 1 });
  assert.deepEqual(u("vd1", ""), { units: undefined, scale: 1 }); // no unit typed: none invented
  assert.deepEqual(u("nope", "nT"), { units: undefined, scale: 1 });
  // the typed unit is the one read (an imported grid has r.unit, not r.units)
  assert.equal(rasterUnitOf({ unit: "mGal" }), "mGal");
});

test("a SYNTHETIC buried point mass (5 mGal peak): its 1VD is ~0.01 mGal/m, scaled ~10 mGal/km", () => {
  // a buried point mass's anomaly on a 100 m grid: 1VD per metre is tiny; x 1,000 it is per km
  const nx = 64, ny = 64, dx = 100, dy = 100, z = 1500;
  const values = new Float32Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const x = (i - 32) * dx, y = (j - 32) * dy, r2 = x * x + y * y + z * z;
    values[j * nx + i] = (5 * z * z * z) / Math.pow(r2, 1.5); // peak 5 mGal
  }
  const out = applyGridFilter({ nx, ny, dx, dy, values }, "vd1", {});
  const peak = Math.max(...out.values);
  // analytic 1VD at the peak of g = 5 (z/r)^3: 3 x 5 / z per metre = 0.01 mGal/m = 10 mGal/km
  assert.ok(peak > 0.005 && peak < 0.015, `per metre ${peak}`);
  const { scale } = filterOutputUnits("vd1", "mGal");
  assert.ok(peak * scale > 5 && peak * scale < 15);
});

test("wired: runFilter takes the typed unit and scales the values before the raster is made", () => {
  const m = readFileSync(new URL("../src/modules/RasterModule.jsx", import.meta.url), "utf8");
  assert.match(m, /const ou = filterOutputUnits\(filt\.kind, rasterUnitOf\(r\)\);/);
  assert.match(m, /if \(ou\.scale !== 1\) for \(let i = 0; i < out\.values\.length; i\+\+\) out\.values\[i\] \*= ou\.scale;/);
  assert.match(m, /units: ou\.units \/\* #2557, #2837 \*\//);
  assert.doesNotMatch(m, /units: r\.units \? FILTERS/);
  assert.ok(m.indexOf("const ou = filterOutputUnits") < m.indexOf("const nr = rasterFromGrid({ name: `${r.name} — ${label}${suffix}`"));
});

// TASKS.csv #2491 (review #2486, WA lithium) — a true-north survey on a project kept on its mine grid: a grid TIED to a CRS converts the
// azimuths (true -> tie CRS grid -> local grid); an untied grid says why they were left, before Import and in the notice, which no
// longer ends with "converted to grid"
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { localGridAzimuthOffset } from "../src/lib/localGridNorth.js";
import { tieFromOrigin, tieOf } from "../src/lib/localGridTie.js";
import { azimuthToGridOffset, wrap360 } from "../src/lib/azimuthRef.js";

// the review's grid: local north 15.6487 deg west of MGA zone 50 grid north (counter-clockwise from local x to MGA x)
const tie = tieFromOrigin({ lx: 10000, ly: 5000, wx: 405000, wy: 6252000, rotationDeg: 15.6487, scale: 1, epsg: 28350 });

test("a true bearing of 60 becomes about 75.1 on the mine grid (the review: 75.13 with its convergence of 0.52)", () => {
  const o = localGridAzimuthOffset("true", tie, 10000, 5000);
  const conv = azimuthToGridOffset("true", 405000, 6252000, 28350).convergence;
  assert.ok(Math.abs(o.convergence - conv) < 1e-9);
  assert.ok(Math.abs(o.rotationDeg - 15.6487) < 1e-9);
  const az = wrap360(60 + o.offset);
  assert.ok(Math.abs(az - 75.08) < 0.02, String(az));
  assert.ok(Math.abs(az - 75.13) < 0.1);
});

test("the convergence is taken where the hole is in the tie CRS (a hole 20 km east has a different one)", () => {
  const a = localGridAzimuthOffset("true", tie, 10000, 5000), b = localGridAzimuthOffset("true", tie, 30000, 5000);
  assert.notEqual(a.convergence.toFixed(4), b.convergence.toFixed(4));
});

test("no tie, no location: null", () => {
  assert.equal(localGridAzimuthOffset("true", null, 1, 1), null);
  assert.equal(localGridAzimuthOffset("true", tie, NaN, 1), null);
  assert.equal(tieOf({ crsSet: false, localGrid: { name: "GBMG" } }), null);
  assert.ok(tieOf({ crsSet: false, localGrid: { name: "GBMG", tie } }));
});

test("wiring: the import converts through the tie, an untied grid says so, the notice's north label follows; the dialog warns", () => {
  const u = readFileSync(new URL("../src/modules/viewer/useImportPipeline.js", import.meta.url), "utf8");
  assert.match(u, /const live = importStateRef\.current\.project \|\| project, tie = tieOf\(live\);/);
  assert.match(u, /localGridAzimuthOffset\(azimuthRef, tie, loc\.x, loc\.y, azimuthDate\)/);
  assert.match(u, /this project is on a local grid with no tie to a coordinate system, so the grid's own north is not known/);
  assert.equal((u.match(/north: azNorth\(azimuthRef, azs\)/g) || []).length, 2);
  assert.match(u, /res\.crsUnset \? tr\(ref === "true" \? "true north, left as in the file"/);
  const m = readFileSync(new URL("../src/components/ImportMappingModal.jsx", import.meta.url), "utf8");
  assert.match(m, /crsUnset && \(modal\.azimuthRef === "true" \|\| modal\.azimuthRef === "magnetic"\)/);
  assert.match(m, /This project is on a local grid with no tie to a coordinate system, so its north is not known/);
});

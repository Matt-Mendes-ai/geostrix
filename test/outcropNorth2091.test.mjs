// TASKS.csv #2091 (review #2013) — the outcrop import notice says when the dip directions were taken as grid north (the picker's default);
// #2413 (review #2325) — the North picker's tooltip no longer quotes northern BC's '~17°' to every project
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("#2091 — grid north is said in the import notice", () => {
  const p = readFileSync(new URL("../src/components/SurfaceMappingPanel.jsx", import.meta.url), "utf8");
  assert.match(p, /let northNote = north\.ref === "grid" && !mineTurned \? tr\(" Dip directions were taken as grid north \(the project grid\); for compass or true-north readings, set North on the import card and import again\."\) : ""/); // && !mineTurned: #2684 (after a mine grid's turn that sentence says it instead) // !mineTurned: #2684 (the mine grid's turn says it instead)
  assert.match(p, /\+ crsNote \+ northNote,/);
});

test("#2413 — no regional number in the tooltip; the notice gives the site's own", () => {
  const a = readFileSync(new URL("../src/components/AzimuthRefPicker.jsx", import.meta.url), "utf8");
  assert.ok(!/northern BC|17°/.test(a));
  assert.match(a, /differs from grid north by the declination and the grid convergence at the site \(the import notice gives both\)/);
  for (const lang of ["es", "pt", "fr", "ar"]) {
    const d = JSON.parse(readFileSync(new URL(`../src/locales/${lang}.json`, import.meta.url), "utf8"));
    assert.ok(!Object.keys(d).some((k) => k.includes("~17° off grid in northern BC")), lang);
  }
});

// TASKS.csv #2090 (review #2013) — exports: an unknown elevation is NaN in the point (GeoPackage POINT Z), and the KML writes no altitude
import { surfaceStructureFeatures, surfaceSampleFeatures, featuresToKml } from "../src/lib/overlayExport.js";
test("#2090 — no 0 m for an unknown elevation in the GeoPackage / KML geometry", () => {
  const set = { name: "Mapping", rows: [{ x: 500000, y: 6000000, z: 950, dip: 60, dipDir: 120, type: "bedding" }, { x: 500010, y: 6000010, dip: 45, dipDir: 300, type: "joint" }] };
  const f = surfaceStructureFeatures(set, 26910);
  assert.equal(f.features[0].geometry[0][2], 950);
  assert.ok(Number.isNaN(f.features[1].geometry[0][2]));
  const kml = featuresToKml(f, { toLonLat: (x, y) => [x / 1e4, y / 1e5] });
  assert.match(kml, /<coordinates>50,60,950<\/coordinates>/);
  assert.match(kml, /<coordinates>50\.001,60\.0001<\/coordinates>/); // lon,lat only
  const s = surfaceSampleFeatures([{ sample_id: "S1", medium: "soil", x: 1, y: 2, z: null, values: {} }], []);
  assert.ok(Number.isNaN(s.features[0].geometry[0][2]));
});

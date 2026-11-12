// TASKS.csv #2724 (follow-up of #2663) — Model from map: a sheet's dip and dip direction FITTED to the unit's logged intercepts (strike from
// the map outline), offered on a click. SYNTHETIC: a 20 m dyke striking north, its centre plane through x = 1000 at a flat 1,000 m ground.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fitSheetToLogs } from "../src/lib/sheetLogCheck.js";

const ring = [[990, 0], [1010, 0], [1010, 600], [990, 600], [990, 0]];
const ground = () => 1000;
const R = Math.PI / 180;
// holes and the unit's logged interval where each crosses a plane dipping `dip` toward `dd` (east = 90, west = 270), 20 m true thickness
function dataset(dip, dd, spots, { inclined = false } = {}) {
  const collars = [], survey = [], litho = [], east = dd === 90 ? 1 : -1;
  spots.forEach(([x, y], k) => {
    const id = `H${k}`;
    collars.push({ hole_id: id, x, y, z: 1000 });
    // inclined: drilled at -60 toward the west (azimuth 270, against an east dip); else vertical. Stored dip +ve down (GeoStrix's survey).
    const az = inclined ? 270 : 0, d = inclined ? 60 : 90;
    survey.push({ hole_id: id, depth: 0, azimuth: az, dip: d }, { hole_id: id, depth: 2000, azimuth: az, dip: d });
    // along the hole: (dxE, dz) per metre; the plane: z = 1000 - (x - 1000) * east * tan(dip)
    const ux = inclined ? -Math.cos(60 * R) : 0, uz = inclined ? -Math.sin(60 * R) : -1;
    const f = (m) => (1000 + uz * m) - (1000 - (x + ux * m - 1000) * east * Math.tan(dip * R)); // > 0 above the plane
    let lo = 0, hi = 2000; for (let i = 0; i < 80; i++) { const m = (lo + hi) / 2; if (f(m) > 0) lo = m; else hi = m; }
    const half = 10 / Math.abs(ux * east * Math.sin(dip * R) + uz * Math.cos(dip * R)); // half the true thickness along the hole (10 m / |hole . pole|)
    litho.push({ hole_id: id, from: lo - half, to: lo + half, value: "PEG" });
  });
  return { collars, survey, litho };
}
const fit = (d, extra = {}) => fitSheetToLogs({ polygons: [[ring]], groundAt: ground, unit: "Pegmatite", codeUnit: { PEG: "Pegmatite" }, desurveyMethod: "minimumCurvature", ...d, ...extra });

test("vertical holes across a dyke dipping 60 east: 60 toward 90, on the plane, 20 m true thickness", () => {
  const r = fit(dataset(60, 90, [[1100, 100], [1200, 300], [1050, 500], [1300, 200]]));
  assert.equal(r.strike, 0);
  assert.deepEqual([r.dip, r.dipDir, r.used, r.holes, r.placed, r.intercepts], [60, 90, 4, 4, 4, 4]);
  assert.ok(r.rmsM < 1e-6);
  assert.ok(Math.abs(r.thickness.median - 20) < 1e-6 && Math.abs(r.thickness.min - 20) < 1e-6);
  assert.equal(r.reason, undefined);
});

test("a west dip, and inclined holes drilled against an east dip, fit too", () => {
  const w = fit(dataset(45, 270, [[900, 100], [800, 300], [700, 450]]));
  assert.deepEqual([w.dip, w.dipDir], [45, 270]);
  const inc = fit(dataset(70, 90, [[1150, 100], [1300, 300], [1250, 500]], { inclined: true }));
  assert.deepEqual([inc.dip, inc.dipDir], [70, 90]);
  assert.ok(Math.abs(inc.thickness.median - 20) < 0.01, String(inc.thickness.median));
});

test("what it says it cannot do: no log, no outline, nothing below the ground, a sill", () => {
  const d = dataset(60, 90, [[1100, 100]]);
  assert.equal(fit({ ...d, litho: [] }), null);
  assert.equal(fit(d, { polygons: [] }).reason, "no-trace");
  assert.equal(fit({ ...d, collars: [] }).reason, "too-few"); // no collar: not placed
  assert.equal(fit({ ...d, collars: [] }).placed, 0);
  const sill = fit(dataset(5, 90, [[1200, 100], [1600, 300], [1900, 500]]));
  assert.equal(sill.reason, "flat");
  assert.equal(sill.dip, 5);
});

test("the pane offers the fit for a one-unit sheet with logs, fills the boxes only on a click, and says what it did", () => {
  const src = readFileSync(new URL("../src/components/MapModelPanel.jsx", import.meta.url), "utf8");
  assert.match(src, /const fitUnit = bodyShape === "sheet" && bodyUnits\.length === 1 \? bodyUnits\[0\] : null;/);
  assert.match(src, /\{fitUnit && lithoRows\?\.length > 0 && Object\.values\(codeUnit\)\.includes\(fitUnit\)[^]*?onClick=\{fitToLogs\}/);
  assert.match(src, /setSheetDip\(String\(r\.dip\)\); setSheetDipDir\(String\(r\.dipDir\)\);/);
  assert.match(src, /if \(r\.reason === "flat"\) \{ setSheetFit\(/); // a sill is said, the boxes are left
  assert.match(src, /tr\("From fewer than three holes: a guide, not a fit\."\)/);
  assert.match(src, /const th = r\.thickness\.min\.toFixed\(1\) === r\.thickness\.max\.toFixed\(1\)/); // live: "20.0–20.0 m" from a 1e-14 spread
  assert.match(src, /const \{ collars: storeCollars, survey: storeSurvey, desurveyMethod \} = useStore\(\);/);
});

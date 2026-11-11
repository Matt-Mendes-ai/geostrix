// TASKS.csv #2642 — Model from map: an intrusion as a SHEET (both walls dip one way), its dip and dip direction offered from the contact
// readings near the unit's polygons, its thickness from the map width
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { intrusionBody, chordWidth } from "../src/lib/intrusionBody.js";
import { meshVolume } from "../src/lib/unitVolumes.js";
import { validateSolid } from "../src/lib/meshValidate.js";
import { contactOrientationNear, distToRings } from "../src/lib/sheetFromContacts.js";

const dyke = [[0, 0], [20, 0], [20, 200], [0, 200], [0, 0]]; // 20 m wide, 200 m long, striking north

test("a north-striking dyke dipping 60 east: base moved 57.7 m east, a closed solid of the prism's volume, 17.3 m thick", () => {
  const b = intrusionBody(dyke, () => 100, { depthM: 100, sheet: { dip: 60, dipDir: 90 } });
  const P = b.positions; let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < P.length; i += 3) if (P[i + 2] < 1) { lo = Math.min(lo, P[i]); hi = Math.max(hi, P[i]); }
  assert.ok(Math.abs(lo - 100 / Math.tan(Math.PI / 3)) < 1e-6 && Math.abs(hi - lo - 20) < 1e-6);
  assert.ok(Math.abs(meshVolume(P, b.indices) - 20 * 200 * 100) < 1); // shearing keeps the volume
  const v = validateSolid(P, b.indices);
  assert.equal(v.openEdges, 0); assert.equal(v.selfIntersectingPairs, 0);
  assert.ok(Math.abs(b.sheetThicknessM - 20 * Math.sin(Math.PI / 3)) < 1e-6);
  // a vertical sheet is the vertical prism
  const v90 = intrusionBody(dyke, () => 100, { depthM: 100, sheet: { dip: 90, dipDir: 90 } });
  assert.ok(Math.abs(v90.sheetThicknessM - 20) < 1e-9);
});

test("thickness: the median chord across the dip, so readings oblique to the dyke do not measure it end to end", () => {
  const long = [[0, 0], [20, 0], [20, 600], [0, 600], [0, 0]];
  assert.ok(Math.abs(chordWidth(long, 90) - 20) < 1e-9);
  assert.ok(Math.abs(chordWidth(long, 256) - 20 / Math.cos((14 * Math.PI) / 180)) < 0.01); // the live run first said 104 m here
  const b = intrusionBody(long, () => 1000, { depthM: 200, sheet: { dip: 39, dipDir: 256 } });
  assert.ok(Math.abs(b.sheetThicknessM - 20.61 * Math.sin((39 * Math.PI) / 180)) < 0.05, String(b.sheetThicknessM)); // about 13 m
});

test("ground that slopes along the dyke: each point goes down its own plane (the base stays a sheared outline)", () => {
  const b = intrusionBody(dyke, (x, y) => 100 + y * 0.2, { depthM: 50, sheet: { dip: 45, dipDir: 270 } });
  assert.ok(validateSolid(b.positions, b.indices).selfIntersectingPairs === 0);
  assert.equal(b.baseZ, 50); // the lowest outcrop (100) less 50 m
});

test("the offer: the mean of contact readings within 250 m of the unit's polygons; too few or none near -> null", () => {
  const layer = { features: [{ attributes: { U: "PEG" }, parts: [dyke] }, { attributes: { U: "BAS" }, parts: [[[5000, 0], [5100, 0], [5100, 100], [5000, 0]]] }] };
  const near = [[39, 256], [41, 250], [37, 260], [40, 255], [38, 258]].map(([dip, dipDir], i) => ({ x: 10 + i, y: 40 * i, dip, dipDir, cls: "contact" }));
  const rows = [...near, { x: 5050, y: 20, dip: 80, dipDir: 10, cls: "contact" }, { x: 10, y: 10, dip: 10, dipDir: 0, cls: "bedding" }];
  assert.deepEqual(contactOrientationNear(rows, layer, "U", ["PEG"]), { dip: 39, dipDir: 256, n: 5, maxM: 250 });
  assert.equal(contactOrientationNear(rows, layer, "U", ["BAS"]), null); // one reading
  assert.equal(distToRings(10, 10, [dyke]), 0);
  assert.equal(distToRings(30, 100, [dyke]), 10);
});

test("the pane offers the shape and the readings, and the run builds and reports the sheet", () => {
  const m = readFileSync(new URL("../src/components/MapModelPanel.jsx", import.meta.url), "utf8");
  assert.match(m, /<option value="sheet">\{tr\("sheet or dyke \(both walls dip one way\)"\)\}<\/option>/);
  assert.match(m, /const \[sheetDip, setSheetDip\] = useState\(""\);/); // blank until typed or taken from the readings
  assert.match(m, /sheet: bodyShape === "sheet" \? \{ dip: Number\(sheetDip\), dipDir: Number\(sheetDipDir\) \} : null/);
  const r = readFileSync(new URL("../src/modules/viewer/intrusionRun.js", import.meta.url), "utf8");
  assert.match(r, /inTerrain, sheet: p\.sheet \|\| null \}\);/);
  assert.match(r, /As a sheet each body is \{a\}–\{b\} m thick/);
});

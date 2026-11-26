// TASKS.csv #1863 — the grid filter opened on RTP for a chargeability depth slice. It now opens on RTP only for total-field magnetics
// (by method, or with no method by name), and on upward continuation otherwise.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { defaultFilterKind } from "../src/lib/filterDefault.js";

test("by method", () => {
  assert.equal(defaultFilterKind({ name: "x" }, "mag"), "rtp");
  assert.equal(defaultFilterKind({ name: "x" }, "mag_rtp"), "upward"); // already reduced
  assert.equal(defaultFilterKind({ name: "TMI grid" }, "grav"), "upward");
});

test("with no method, by name", () => {
  assert.equal(defaultFilterKind({ name: "Chg_z1445_float.tif" }), "upward"); // the review's slice
  assert.equal(defaultFilterKind({ name: "Res_100_geo.tif" }), "upward");
  assert.equal(defaultFilterKind({ name: "Kodiak_TMI_25m.tif" }), "rtp");
  assert.equal(defaultFilterKind({ name: "mag_survey_grid" }), "rtp");
  assert.equal(defaultFilterKind({ name: "magnesium.tif" }), "upward");
  assert.equal(defaultFilterKind({ name: "dem.tif" }), "upward");
});

test("the filter form opens on it", () => {
  const src = readFileSync(new URL("../src/modules/RasterModule.jsx", import.meta.url), "utf8");
  // #4087 — the Filter step opens a grid on its usual filter whenever the grid chosen changes (a card's icon or the step's list)
  assert.match(src, /useEffect\(\(\) => \{ if \(fr\) setFilt\(\(f\) => \(\{ \.\.\.f, kind: defaultFilterKind\(fr, rasterMethodOf\(fr, geophysSurveys\)\) \}\)\); \}, \[fr\?\.id\]\);/);
});

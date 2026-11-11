// TASKS.csv #2395 (review #2325, WA uranium) — a radiometric file's channels: eU / eTh / K / uranium / thorium / potassium headers are
// measurements; a multi-channel file opens the picker, each ticked channel its own survey, and the eU/eTh and K/eTh ratios can be made
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { guessGeophysColumns } from "../src/lib/geophysColumns.js";
import { radiometricChannels, isMultiRadiometric, channelKey, ratioJobs, ratioOf } from "../src/lib/radiometricChannels.js";

test("the review's headers are measurement columns now (eU_ppm was not even a candidate)", () => {
  const g = guessGeophysColumns(["Line", "Station", "Easting", "Northing", "Elevation", "TC_cps", "K_pct", "eU_ppm", "eTh_ppm"]);
  for (const h of ["TC_cps", "K_pct", "eU_ppm", "eTh_ppm"]) assert.ok(g.valueCandidates.includes(h), h);
  for (const h of ["Uranium_ppm", "Thorium_ppm", "Potassium_pct"]) assert.ok(guessGeophysColumns(["X", "Y", h]).valueCandidates.includes(h), h);
  assert.ok(!isMultiRadiometric(["TMI_nT", "TMI_lev"])); // a magnetic file keeps its automatic path
});

test("the channels and their methods, one survey key each, and the two ratios", () => {
  const ch = radiometricChannels(["TC_cps", "K_pct", "eU_ppm", "eTh_ppm"]);
  assert.deepEqual(ch.map((c) => c.method), ["rad_tc", "rad_k", "rad_u", "rad_th"]);
  assert.ok(isMultiRadiometric(["TC_cps", "K_pct", "eU_ppm", "eTh_ppm"]));
  assert.equal(channelKey("synth.csv", "eU_ppm"), "synth.csv · eU_ppm");
  const r = ratioJobs(ch);
  assert.deepEqual(r.map((x) => [x.label, x.num, x.den, x.method]), [["eU/eTh", "eU_ppm", "eTh_ppm", "rad_uth"], ["K/eTh", "K_pct", "eTh_ppm", "rad_kth"]]);
  assert.equal(ratioOf({ eU_ppm: "3", eTh_ppm: "12" }, r[0]), 0.25);
  assert.ok(Number.isNaN(ratioOf({ eU_ppm: "3", eTh_ppm: "0" }, r[0])));
  assert.deepEqual(ratioJobs(radiometricChannels(["TC_cps", "eU_ppm"])), []); // no thorium: no ratio
});

test("the import opens the picker for such a file and the picker imports each channel and the ratios", () => {
  const m = readFileSync(new URL("../src/modules/GeophysicsModule.jsx", import.meta.url), "utf8");
  assert.match(m, /if \(isMultiRadiometric\(cols\.valueCandidates\)\) \{/);
  assert.match(m, /src: channelKey\(fileName, c\.col\)/);
  assert.match(m, /src: channelKey\(fileName, r\.label\), ratio: r, method: r\.method/);
  assert.match(m, /updateGeophysSurvey\(j\.src, \{ method: j\.method, units: SURVEY_METHODS\[j\.method\]\.units \}\)/);
});

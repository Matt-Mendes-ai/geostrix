// TASKS.csv #3109 / #3081 (from #2951 / #3012, review #2876 WA iron) — Grade-tonnage's per-code densities filled from a downhole log's mean per
// code; #2637 (part) — the bench table takes the same per-block density as the main table.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { densityMeansByCode, MIN_READINGS } from "../src/lib/densityFromLog.js";
import { numericSourceChoices } from "../src/lib/numericSources.js";
import { gradeTonnageByBench } from "../src/lib/gradeTonnage.js";

// two holes logged A over B over C (and D for a metre), a binned density log (1 m bins, n readings each)
const litho = ["H1", "H2"].flatMap((h) => [{ hole_id: h, from: 0, to: 10, value: "A" }, { hole_id: h, from: 10, to: 20, value: "B" }, { hole_id: h, from: 20, to: 30, value: "C" }, { hole_id: h, from: 30, to: 31, value: "D" }]);
const rows = [];
for (const h of ["H1", "H2"]) for (let d = 0; d < 35; d++) {
  const v = d < 10 ? 2.4 + (d % 2) * 0.2 : d < 20 ? 3.1 : d < 30 ? 14 : 2.0; // C reads 14: not a density; D one bin; 31-35 in no interval
  rows.push({ hole_id: h, from: d, to: d + 1, value: v, n: d < 10 ? (d % 2 ? 1 : 3) : 2 });
}
const custom = [{ id: "dens", name: "Density log", unit: "g/cm3", binM: 1, rows }];

test("each code's mean of the log (binned: weighted by readings); out of the density range and too few readings not taken, and named", () => {
  const ch = numericSourceChoices({ layers: { litho }, customLayers: custom }).find((c) => c.key === "custom:dens:value");
  const r = densityMeansByCode(ch, { layers: { litho }, customLayers: custom }, litho);
  // A: bins 2.4 (3 readings) and 2.6 (1 reading), alternating: (2.4 x 3 + 2.6) / 4 = 2.45
  assert.equal(r.fill.A, 2.45);
  assert.equal(r.fill.B, 3.1);
  assert.equal(r.fill.C, undefined);
  assert.deepEqual(r.outside.map((o) => o.code), ["C"]);
  assert.equal(MIN_READINGS, 3);
  assert.deepEqual(r.few.map((o) => o.code), ["D"], "two bins of D");
  assert.equal(r.notLogged, 2 * 4 * 2, "35 m of log, 31 m logged: 4 bins x 2 readings x 2 holes");
  assert.deepEqual(r.taken.map((t) => t.code).sort(), ["A", "B"]);
  assert.ok(r.taken[0].readings >= r.taken[1].readings, "most readings first");
  assert.equal(r.readings, 2 * (20 + 20 + 20 + 2 + 8), "every reading of the log counted");
});

test("the log's own valid range (#2953) applies", () => {
  const withRange = [{ ...custom[0], validRange: [1, 3] }];
  const ch = numericSourceChoices({ layers: { litho }, customLayers: withRange }).find((c) => c.key === "custom:dens:value");
  const r = densityMeansByCode(ch, { layers: { litho }, customLayers: withRange }, litho);
  assert.equal(r.fill.B, undefined, "B's 3.1 readings are outside the log's valid range");
  assert.equal(r.fill.A, 2.45);
  assert.ok(r.outOfRange > 0);
  assert.deepEqual(r.validRange, [1, 3]);
});

test("#2637 the bench table: per-block density, tonnes summed block by block, the mean grade tonnage-weighted", () => {
  const cells = [{ x: 0, y: 0, z: 5, dx: 10, dy: 10, dz: 10, value: 2 }, { x: 10, y: 0, z: 5, dx: 10, dy: 10, dz: 10, value: 4 }];
  const one = gradeTonnageByBench(cells, { cutoff: 0, benchH: 10, density: 2.5, unit: "%" });
  assert.equal(one[0].tonnes, 2000 * 2.5);
  const rho = new Map([[cells[0], 2], [cells[1], 3]]);
  const per = gradeTonnageByBench(cells, { cutoff: 0, benchH: 10, density: 2.5, unit: "%", densityOf: (c) => rho.get(c) });
  assert.equal(per[0].tonnes, 1000 * 2 + 1000 * 3);
  assert.ok(Math.abs(per[0].meanGrade - (2 * 2000 + 4 * 3000) / 5000) < 1e-12);
  // a block with no density: in the volume, not the tonnes
  const part = gradeTonnageByBench(cells, { cutoff: 0, benchH: 10, unit: "%", densityOf: (c) => (c === cells[0] ? 2 : null) });
  assert.equal(part[0].tonnes, 2000); assert.equal(part[0].volumeM3, 2000);
});

test("wiring: the dialog's fill from a log, the bench table's density, the CSV header line; keys", () => {
  const p = readFileSync(new URL("../src/components/GradeTonnageModal.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(p, /const r = densityMeansByCode\(ch, \{ layers, customLayers \}, layers\?\.\[densityLayer\] \|\| \[\]\);/);
  assert.match(p, /setCodeDensity\(\(p\) => \(\{ \.\.\.p, \.\.\.r\.fill \}\)\);/);
  assert.match(p, /gradeTonnageByBench\(cellsUsed, \{[^}]*densityOf: byModel\?\.of \|\| byCode\?\.of \|\| null \}\)/);
  assert.doesNotMatch(p, /The bench table uses the one density above/);
  assert.match(p, /\.\.\.\(byCode \? \[`Density by \$\{/);
  for (const l of ["es", "pt", "fr", "ar"]) {
    const d = JSON.parse(readFileSync(new URL(`../src/locales/${l}.json`, import.meta.url), "utf8"));
    for (const k of ["Fill from a log's mean per code", "Filled {k} code(s) from the mean of \"{log}\" per code ({n} readings{vr}): {list}.", "Not taken, the mean outside {lo}-{hi} t/m³ (not a density?): {list}."]) assert.ok(d[k], `${l}: ${k}`);
  }
});

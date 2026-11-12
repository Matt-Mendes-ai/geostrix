// TASKS.csv #1747 (review #1645, Copley; DECISION 2026-11-12, Matt: 'follow your recommendations') — grade-tonnage on a Cu (ppm) model opened on
// percentile cut-offs (0 / 5.3 / 10 / 16 / 48 / 180 ppm) and gave its metal only in tonnes. #1577's round-grade rule now covers the base
// metals Cu / Zn / Pb / Ni: round grades in % from the data's own range (no fixed copper grades, #264), shown in % beside ppm; and Mlb beside
// the tonnes. This reverses #1577's 'base metals keep percentiles' and #2404's 'nothing in pounds for other elements' (their pins updated).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { autoCutoffs, metalColumns, metalOf, cutoffPct, gradeTonnageRows } from "../src/lib/gradeTonnage.js";

const cells = (vals) => vals.map((value) => ({ value, dx: 10, dy: 10, dz: 10 }));

test("round % grades from the model's own range, in its unit", () => {
  let s = 1747; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const cu = cells(Array.from({ length: 4000 }, () => Math.exp(Math.log(300) + 1.6 * (r() + r() + r() - 1.5)))); // lognormal, median ~300 ppm
  const ppm = autoCutoffs(cu, { element: "Cu", unit: "ppm" });
  assert.deepEqual(ppm, [0, 200, 500, 1000, 2000]);
  assert.deepEqual(autoCutoffs(cells(cu.map((c) => c.value / 1e4)), { element: "Cu", unit: "%" }), [0, 0.02, 0.05, 0.1, 0.2], "the same in %");
  // the review's low-grade copper model: round steps of its own range, not fixed copper grades
  assert.deepEqual(autoCutoffs(cells([0, 5.3, 10, 16, 48, 180, 200]), { element: "Cu", unit: "ppm" }), [0, 10, 20, 50, 100, 200]);
  // a rich zinc model keeps at most the eight highest round grades
  const zn = autoCutoffs(cells([1, 10, 100, 1000, 5000, 20000, 80000, 150000]), { element: "Zn", unit: "ppm" });
  assert.ok(zn.length <= 9 && zn[zn.length - 1] <= 150000 && zn.includes(100000), JSON.stringify(zn));
  // one round grade reached at most: percentiles, as #1577 falls back
  assert.notDeepEqual(autoCutoffs(cells([100, 110, 120, 130]), { element: "Cu", unit: "ppm" }).slice(0, 2), [0, 100]);
  // not a base metal: unchanged
  assert.deepEqual(autoCutoffs(cells([0.001, 0.005, 0.02, 0.09, 0.4, 0.8, 1.6, 3.1]), { element: "Au", unit: "ppm" }), [0, 0.1, 0.3, 0.5, 1, 2]);
});

test("the cut-off in % beside ppm, in the table and the CSV; Mlb beside the tonnes", () => {
  assert.equal(cutoffPct(5000, "Cu", "ppm"), 0.5);
  assert.equal(cutoffPct(0.5, "Cu", "%"), null, "already in %");
  assert.equal(cutoffPct(5000, "Au", "ppm"), null);
  const cols = metalColumns(metalOf("ppm"), "Cu");
  assert.deepEqual(cols.map((c) => c.key), ["metal_t", "metal_mlb_Cu"]);
  // 552,143 t at 749 ppm Cu (the review's row) -> 413.6 t Cu -> 0.912 Mlb
  const [row] = gradeTonnageRows([{ cutoff: 500, blocks: 26, volumeM3: 223993, meanGrade: 749, tonnes: 552143, metal: 413574318 }], { vname: "Cu", density: 2.465, metal: metalOf("ppm"), columns: cols, pctOf: (v) => cutoffPct(v, "Cu", "ppm") });
  assert.deepEqual(Object.keys(row).slice(0, 2), ["cutoff", "cutoff_pct"]);
  assert.equal(row.cutoff_pct, 0.05);
  assert.ok(Math.abs(row.metal_t - 413.574) < 0.001 && Math.abs(row.metal_mlb_Cu - 0.9118) < 0.0001, JSON.stringify(row));
  const m = readFileSync(new URL("../src/components/GradeTonnageModal.jsx", import.meta.url), "utf8");
  assert.match(m, /pctOf: cutoffPct\(1, element, unit\) != null \? \(v\) => cutoffPct\(v, element, unit\) : null/);
});

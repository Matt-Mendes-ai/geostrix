// TASKS.csv #3781 (Scottie Gold review) — the grade shell's default cap (the length-weighted P99) is never at or below the cut-off: it is lifted to the P99 of the samples at or above
// the cut-off, and a refusal with a cap names it. Synthetic nuggety column.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { defaultShellCap, shellCapAction } from "../src/lib/viewer/shellCapRule.js";
import { lengthWeightedPercentile, compositeDownhole, valueIn } from "../src/lib/geochem.js";
import { modellingPanesSource } from "./helpers/modellingPanesSource.mjs"; // TASKS.csv #4070 — the panes in their own files

// 2,000 one-metre samples: 98.5 % background (0.01-1 g/t), 0.5 % at 3-90 g/t: the P99 falls under a 3 g/t cut-off
let s = 9; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
const assays = Array.from({ length: 2000 }, (_, i) => ({ hole_id: `H${i % 40}`, from: Math.floor(i / 40), to: Math.floor(i / 40) + 1, values: { Au: i % 211 === 0 ? 3 + r() * 87 : 0.01 + r() * 0.99 } }));
const U = { Au: "ppm" };

test("the rule: the column's P99 when it is above the cut-off, else the P99 of the samples at or above it, else no default cap", () => {
  assert.deepEqual(defaultShellCap(5, null, 3), { value: 5, lifted: false });
  assert.deepEqual(defaultShellCap(2.84, 60, 3), { value: 60, lifted: true });
  assert.deepEqual(defaultShellCap(3, 50, 3), { value: 50, lifted: true }, "a cap equal to the cut-off is lifted too");
  assert.equal(defaultShellCap(2.84, null, 3), null, "no sample above the cut-off: no default cap");
  assert.deepEqual(defaultShellCap(2.84, 60, null), { value: 2.84, lifted: false }, "no cut-off yet: the P99");
  assert.equal(defaultShellCap(0, 60, 3), null);
});

test("on a nuggety column the whole P99 sits under a 3 g/t cut-off and would leave nothing to enclose; the lifted cap keeps the composites above it", () => {
  const p99 = lengthWeightedPercentile(assays, "Au", "ppm", U, 99);
  assert.ok(p99 < 3, `the column's P99 ${p99}`);
  const above = assays.filter((a) => valueIn(a, "Au", "ppm", U) >= 3);
  const d = defaultShellCap(p99, lengthWeightedPercentile(above, "Au", "ppm", U, 99), 3);
  assert.equal(d.lifted, true); assert.ok(d.value > 3);
  const capped = compositeDownhole(assays, "Au", "ppm", U, { length: 2, minCoverage: 0.5, capValue: p99 });
  const lifted = compositeDownhole(assays, "Au", "ppm", U, { length: 2, minCoverage: 0.5, capValue: d.value });
  const uncapped = compositeDownhole(assays, "Au", "ppm", U, { length: 2, minCoverage: 0.5, capValue: null });
  const n = (c) => c.filter((x) => x.avgGrade >= 3).length;
  assert.equal(n(capped), 0, "under the old default nothing reaches the cut-off");
  assert.ok(n(lifted) > 0 && n(lifted) === n(uncapped) || n(lifted) > 0, `lifted ${n(lifted)} uncapped ${n(uncapped)}`);
});

test("the action rule is unchanged: a typed cap is kept, a cap the note set is refilled (with the cut-off now part of the fill)", () => {
  assert.equal(shellCapAction({ symbol: "Au", auto: { symbol: "Au", value: 2.84 }, capValue: 2.84, over: true }), "fill");
  assert.equal(shellCapAction({ symbol: "Au", auto: { symbol: "Au", value: 2.84 }, capValue: 7, over: true }), "keep");
});

test("wiring: the note takes the cut-off and says a lifted or too-low cap; the refusal names the cap and the count that reaches the cut-off uncapped", () => {
  const n = readFileSync(new URL("../src/modules/viewer/ShellCapNote.jsx", import.meta.url), "utf8");
  assert.match(n, /const d = defaultShellCap\(p99, above \? lengthWeightedPercentile\(above, symbol, unit, units, 99\) : null, cutoff\);/);
  assert.match(n, /\}, \[symbol, cv, src, cutoff\]\);/);
  assert.match(n, /tr\("The cap \(\{cap\}\) is not above the \{cutoff\} cut-off: every sample is capped under it/);
  assert.match(modellingPanesSource(), /cutoff=\{numericCutoff \/\* #3781 \*\/\}/);
  const m = readFileSync(new URL("../src/modules/viewer/modellingRuns.js", import.meta.url), "utf8");
  assert.match(m, /cutoff once capped at \{cap\} \{unit\}: \{n\} reach it uncapped\. Raise or clear the cap/);
});

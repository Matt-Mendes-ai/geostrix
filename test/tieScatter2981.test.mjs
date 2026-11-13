// TASKS.csv #2981 (split from #2000) — the levelling tie scatter (log survey vs log reference) with the median-ratio and Huber lines, as
// Main & Champion (2022) read it
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fitLevelling, tieScatter } from "../src/lib/levelling.js";

// 20 sites sampled by both surveys: the new survey reads 2x the old one, and one site disagrees badly
const samples = [];
for (let i = 0; i < 20; i++) {
  const v = 10 + i * 5;
  samples.push({ medium: "soil", attrs: { source: "OLD" }, x: i * 100, y: 0, values: { Cu: v } });
  samples.push({ medium: "soil", attrs: { source: "NEW" }, x: i * 100 + 3, y: 0, values: { Cu: i === 7 ? v * 30 : v * 2 } });
}

test("the points, the median-ratio line and the Huber line; the odd tie marked", () => {
  const fit = fitLevelling(samples, { symbol: "Cu", medium: "soil", reference: "OLD", survey: "NEW", radiusM: 10 });
  assert.equal(fit.ties.n, 20);
  const d = tieScatter(fit, "Cu");
  assert.equal(d.points.length, 20);
  assert.ok(Math.abs(d.median - Math.log10(0.5)) < 1e-9, "reference = survey / 2");
  assert.ok(Math.abs(d.huber.b - 1) < 0.02 && Math.abs(d.huber.a - Math.log10(0.5)) < 0.03, JSON.stringify(d.huber));
  const odd = d.points.filter((p) => p.down);
  assert.equal(odd.length, 1);
  assert.ok(Math.abs(odd[0].x - Math.log10(45 * 30)) < 1e-9, "site 7, at 30x");
  assert.ok(d.lo < Math.log10(10) && d.hi > Math.log10(45 * 30));
});

test("no ties: nothing to draw", () => {
  assert.equal(tieScatter({ ties: null }, "Cu"), null);
  assert.equal(tieScatter(null, "Cu"), null);
});

test("wiring: the plot under the tie sentence", () => {
  const s = readFileSync(new URL("../src/components/LevellingPanel.jsx", import.meta.url), "utf8");
  assert.match(s, /\{fit\.ties\?\.ok && <TieScatterPlot data=\{tieScatter\(fit, symbol\)\} reference=\{reference\} survey=\{survey\} unit=\{unit\} \/>\}/);
});

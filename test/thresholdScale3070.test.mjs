// TASKS.csv #3070 (split from #2912, review #2876 WA iron) — Thresholds on a percentage-scale major (Fe, SiO2 of an iron ore) drew log10 Fe
// and offered Mean + 2 SD (log) = 87 %: it now reads a major on arithmetic axes without the log rules, by Grade stats' scale rule
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { thresholdScale, LOG_RULES, populations, candidateThresholds, THRESHOLD_METHODS } from "../src/lib/thresholds.js";

let seed = 11;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const popsOf = (vals) => populations(vals.map((v) => ({ v })), { valueOf: (s) => s.v, keyOf: () => "All" }).map((p) => ({ ...p, cand: candidateThresholds(p.summary) }));

test("an iron ore's Fe and SiO2 (per cent, not skewed) read on arithmetic axes", () => {
  const fe = Array.from({ length: 600 }, (_, i) => (i % 3 ? 52 + rnd() * 12 : 20 + rnd() * 20)); // ore and waste, 20-64 %
  assert.equal(thresholdScale(popsOf(fe), "%"), "linear");
  const si = Array.from({ length: 600 }, () => 0.8 + rnd() * 60); // 0.8-61 %: over a decade and a half, median near 30
  assert.equal(thresholdScale(popsOf(si), "%"), "linear");
  // the same Fe stored in ppm
  assert.equal(thresholdScale(popsOf(fe.map((v) => v * 1e4)), "ppm"), "linear");
});

test("trace elements keep the log rules, whatever their range", () => {
  const au = Array.from({ length: 600 }, () => Math.exp(rnd() * 8 - 6)); // log-normal-ish, 0.0025-7 ppm
  assert.equal(thresholdScale(popsOf(au), "ppm"), "log");
  const cuNarrow = Array.from({ length: 300 }, () => 20 + rnd() * 30); // 20-50 ppm: narrow, but a trace element
  assert.equal(thresholdScale(popsOf(cuNarrow), "ppm"), "log");
  // a skewed major: S in a sulphide-poor rock, median under 1 %
  const s = Array.from({ length: 300 }, () => Math.exp(rnd() * 6 - 5) * 10);
  assert.equal(thresholdScale(popsOf(s), "%"), "log");
  assert.equal(thresholdScale([], "%"), "log");
});

test("the log rules are the four computed on log10 values", () => {
  assert.deepEqual([...LOG_RULES].sort(), ["mean2sd", "median2mad", "probbreak", "tukey"]);
  assert.deepEqual(THRESHOLD_METHODS.filter((m) => !LOG_RULES.has(m.id) && !m.arith).map((m) => m.id), ["p90", "p95", "p98"]); // #3173: and the rules on the values
});

test("wiring: the panel hides the log rules and draws arithmetic plots off the log scale", () => {
  const s = readFileSync(new URL("../src/components/ThresholdToolkit.jsx", import.meta.url), "utf8");
  assert.match(s, /const shownMethods = logOn \? (THRESHOLD_METHODS|THRESHOLD_METHODS\.filter\(\(m\) => !ARITH_RULES\.has\(m\.id\)\)) : THRESHOLD_METHODS\.filter\(\(m\) => !LOG_RULES\.has\(m\.id\)\)/);
  assert.match(s, /autoScale === "log" \|\| \(!!saved && LOG_RULES\.has\(saved\.method\)\)/);
  assert.match(s, /if \(\(?!logOn && LOG_RULES\.has\(method\)\)? (\|\| \(logOn && ARITH_RULES\.has\(method\)\)\) )?setMethod\(null\)/); // #3173: and the value rules on log axes
  assert.match(s, /<LogHistogram [^>]*log=\{logOn\} \/>/);
  assert.match(s, /<ProbabilityPlot [^>]*log=\{logOn\} \/>/);
  assert.equal((s.match(/shownMethods\.map\(/g) || []).length, 3, "header, cells and the rules list");
});

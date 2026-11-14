// TASKS.csv #3173 (Matt's decision, 2026-11-13) — majors keep their place in Anomaly thresholds with three rules on the values: mean + 2 SD, the
// break on an arithmetic probability plot, and mean - 2 SD for a depletion (the low side is the anomaly)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { populations, candidateThresholds, ARITH_RULES, LOG_RULES, isLowRule, thresholdUnreachable, drillThresholdOffers, usableDefaultMethod } from "../src/lib/thresholds.js";
import { anomalyClasses } from "../src/lib/anomalyMap.js";

let seed = 9;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const normal = () => { let s = 0; for (let i = 0; i < 12; i++) s += rnd(); return s - 6; };
const popOf = (vals) => populations(vals.map((v) => ({ v })), { valueOf: (s) => s.v, keyOf: () => "All" }).map((p) => ({ ...p, cand: candidateThresholds(p.summary) }))[0];

test("mean ± 2 SD on the values", () => {
  const vals = Array.from({ length: 2000 }, () => 4 + 0.5 * normal()); // Na2O about 4 ± 0.5 %
  const c = popOf(vals).cand.values;
  assert.ok(Math.abs(c.amean2sd - 5) < 0.1, String(c.amean2sd));
  assert.ok(Math.abs(c.amean2sdLow - 3) < 0.1, String(c.amean2sdLow));
  // the log rule sits elsewhere: it is not the arithmetic one
  assert.ok(Math.abs(c.mean2sd - c.amean2sd) > 0.01);
  // a mean - 2 SD under zero is no threshold
  assert.equal(popOf(Array.from({ length: 200 }, () => Math.abs(1 + 2 * normal()) + 0.01)).cand.values.amean2sdLow, null);
});

test("the arithmetic break between two populations of a major", () => {
  const vals = [...Array.from({ length: 900 }, () => 30 + 3 * normal()), ...Array.from({ length: 100 }, () => 60 + 2 * normal())]; // waste and ore Fe
  const b = popOf(vals).cand.values.aprobbreak;
  assert.ok(b > 38 && b < 60, String(b));
});

test("the depletion rule's low side: unreachable below every sample, offered nowhere as a cut-off", () => {
  assert.equal(isLowRule("amean2sdLow"), true); assert.equal(isLowRule("amean2sd"), false);
  assert.deepEqual([...ARITH_RULES].sort(), ["amean2sd", "amean2sdLow", "aprobbreak"]);
  assert.equal([...ARITH_RULES].some((id) => LOG_RULES.has(id)), false);
  assert.equal(thresholdUnreachable(1, { min: 2, max: 9 }, "%", true), true);
  assert.equal(thresholdUnreachable(3, { min: 2, max: 9 }, "%", true), false);
  const pops = [popOf(Array.from({ length: 300 }, () => 4 + 0.5 * normal()))];
  assert.equal(usableDefaultMethod(pops, "amean2sdLow", "%"), "amean2sdLow");
  assert.deepEqual(drillThresholdOffers([{ source: "drill", symbol: "Na", unit: "%", direction: "below", values: { All: 3 } }], "Na", "%"), []);
});

test("the anomaly map flags the low side for a saved depletion rule", () => {
  const samples = Array.from({ length: 100 }, (_, i) => ({ medium: "rock", x: i, y: 0, values: { Na: i < 10 ? 1 : 4 + (i % 7) * 0.1 } }));
  const saved = [{ symbol: "Na", unit: "%", groupBy: "none", method: "amean2sdLow", methodLabel: "Mean − 2 SD (depletion)", decided: "2026-11-13", direction: "below", values: { All: 2 } }];
  const r = anomalyClasses(samples, { mode: "element", symbol: "Na", scheme: "threshold", groupBy: "none" }, { units: { Na: "%" }, thresholds: saved });
  assert.match(r.classes[2].label, /at or below the threshold \(depleted\)/);
  assert.equal(r.classOf[0], 2); assert.equal(r.classOf[55], 0, "4.6 %: above the 25th percentile");
});

test("wiring: the value rules on arithmetic axes; 'Below' and the saved direction for the depletion rule", () => {
  const s = readFileSync(new URL("../src/components/ThresholdToolkit.jsx", import.meta.url), "utf8");
  assert.match(s, /THRESHOLD_METHODS\.filter\(\(m\) => !ARITH_RULES\.has\(m\.id\)\) : THRESHOLD_METHODS\.filter\(\(m\) => !LOG_RULES\.has\(m\.id\)\)/);
  assert.match(s, /\.\.\.\(isLowRule\(method\) \? \{ direction: "below" \} : \{\}\)/);
  assert.match(s, /isLowRule\(method\) \? tr\("Below"\) : tr\("Above"\)/);
  assert.match(s, /isLowRule\(method\) \? v <= p\.cand\.values\[method\] : v >= p\.cand\.values\[method\]/);
});

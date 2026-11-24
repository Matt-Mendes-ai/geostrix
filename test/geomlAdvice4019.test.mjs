// TASKS.csv #4019 (Matt: "why are so many intercepts missed?") — geoML's Missed intercepts give a reason per row, a weak training fit is said with
// the causes the run shows, a run grouping units of different kinds is warned before and after, and the fixes are one click away. Thresholds from
// the run itself (its block, the model's 50 % line), never a deposit type. Synthetic holes DH-23-xx and made-up codes only.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { missReason, reasonCounts, unitMix, runAdvice, NEAR_LINE, WEAK_IN_UNIT, missedInterceptsCsv } from "../src/lib/geomlIntercepts.js";
const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");

const miss = (from, to, best) => ({ hole_id: "DH-23-001", from, to, best });

test("#4019 each missed intercept's reason: thinner than the run's block, else near the 50 % line (30-50 %), else far from the model", () => {
  assert.equal(missReason(miss(10, 12, 0.45), 60), "thin", "2 m against 60 m blocks: thin, whatever its %");
  assert.equal(missReason(miss(10, 90, 0.45), 60), "near");
  assert.equal(missReason(miss(10, 90, NEAR_LINE), 60), "near", "30 % is near");
  assert.equal(missReason(miss(10, 90, 0.12), 60), "far");
  assert.equal(missReason(miss(10, 12, 0.12), null), "far", "no block known: by the % alone");
  assert.deepEqual(reasonCounts([miss(0, 2, 0.4), miss(0, 80, 0.4), miss(0, 80, 0.1), miss(5, 6, 0)], 60), { thin: 2, near: 1, far: 1 });
  assert.match(missedInterceptsCsv([miss(0, 2, 0.4)], 60), /,thinner than a block\r\n$/);
});

// three made-up codes in six holes: VOL thick (40-60 m runs), HFS thin (1-3 m), TUF thick as VOL
const iv = [];
for (let h = 0; h < 6; h++) {
  const id = `DH-23-00${h}`;
  iv.push({ hole_id: id, from: 0, to: 50 + h * 2, value: "VOL" }, { hole_id: id, from: 60, to: 61 + (h % 3), value: "HFS" }, { hole_id: id, from: 70, to: 120, value: "TUF" }, { hole_id: id, from: 120, to: 200, value: "SST" });
}

test("#4019 the codes of one run that differ: litho groups, Modelling-codes roles, intercepts of different lengths", () => {
  assert.equal(unitMix({ codes: ["VOL"], intervals: iv }).mixed, false, "one code: nothing to mix");
  assert.equal(unitMix({ codes: ["VOL", "TUF"], intervals: iv }).mixed, false, "two thick units of one shape, no groups or roles: not flagged");
  const shape = unitMix({ codes: ["VOL", "HFS"], intervals: iv });
  assert.equal(shape.mixed, true); assert.deepEqual(shape.shapes.map((s) => s.code), ["VOL", "HFS"]); assert.equal(shape.largest, "VOL");
  const groups = unitMix({ codes: ["VOL", "TUF"], intervals: iv, lithoGroups: [{ name: "Volcanics", codes: ["VOL"] }, { name: "Sediments", codes: ["TUF"] }] });
  assert.deepEqual(groups.groups, ["Volcanics", "Sediments"]);
  const roles = unitMix({ codes: ["VOL", "TUF"], intervals: iv, modellingCodes: { codes: [{ name: "VOL", role: "stratigraphic" }, { name: "TUF", role: "intrusion" }] } });
  assert.deepEqual(roles.roles, ["stratigraphic", "intrusion"]);
});

test("#4019 after a run: weak fit and its causes, only those the run shows; the fixes", () => {
  const intercepts = { logged: 60, reached: 36, missed: [...Array(8)].map(() => miss(0, 3, 0.4)).concat([...Array(10)].map(() => miss(0, 80, 0.4)), [...Array(6)].map(() => miss(0, 80, 0.05))) };
  const mix = unitMix({ codes: ["VOL", "HFS"], intervals: iv });
  const a = runAdvice({ fit: { in_unit: 0.65, other: 0.85 }, intercepts, blockM: 60, secs: 120, quality: "fast", heldOut: false, mix });
  assert.equal(a.weak, true); assert.deepEqual(a.counts, { thin: 8, near: 10, far: 6 });
  assert.deepEqual(a.causes, ["mixed", "thin", "near", "fast"]);
  assert.deepEqual(a.fixes.map((f) => f.key), ["oneUnit", "smaller", "standard", "heldOut"]);
  const small = a.fixes.find((f) => f.key === "smaller");
  assert.equal(small.blockM, 30); assert.equal(small.secs, 120 * 8, "half the block: up to eight times the blocks to predict");
  assert.equal(a.fixes[0].unit, "VOL", "the code with the most metres");
  // a good fit with nothing missed and one unit: nothing said
  const ok = runAdvice({ fit: { in_unit: 0.95, other: 0.95 }, intercepts: { logged: 10, reached: 10, missed: [] }, blockM: 40, secs: 60, quality: "standard", heldOut: true, mix: null });
  assert.deepEqual([ok.weak, ok.causes, ok.fixes], [false, [], []]);
  // weak with no cause shown: the unit's own shape
  assert.deepEqual(runAdvice({ fit: { in_unit: WEAK_IN_UNIT - 0.1, other: 0.9 }, intercepts: { logged: 5, reached: 5, missed: [] }, blockM: 40, quality: "standard", heldOut: true }).causes, ["shape"]);
  // inside + outside well under the good range is weak too
  assert.equal(runAdvice({ fit: { in_unit: 0.86, other: 0.8 }, intercepts: null, blockM: 40, quality: "standard", heldOut: true }).weak, true);
});

test("#4019 wiring: the reason column, the advice under each run, the warning before a mixed run, the fixes change the settings", () => {
  const c = read("../src/components/GeomlMissedIntercepts.jsx"), p = read("../src/components/PredictivePanel.jsx");
  assert.match(c, /<td style=\{\{ \.\.\.cell, textAlign: "left" \}\}>\{whyText\(missReason\(m, blockM\)\)\}<\/td>/);
  assert.match(c, /content: missedInterceptsCsv\(result\.missed, blockM\)/);
  assert.match(p, /res\.advice = runAdvice\(\{ fit: res\.fit, intercepts, blockM: res\.blocks\?\.cell, secs: res\.seconds, quality, heldOut, mix: runMix \}\);/);
  assert.match(p, /<GeomlRunAdvice advice=\{r\.advice\} mix=\{r\.mix\} blockM=\{r\.blockM\} onFix=\{applyFix\}/);
  assert.match(p, /\{mix\?\.mixed && \(/);
  assert.match(p, /params\.block_size = unitSize\.m;/, "a smaller block reaches the add-on: the fix fills the Block size box (#4054), which the run sends");
  assert.match(p, /if \(f\.key === "oneUnit" && f\.unit\) setUnit\(new Set\(\[f\.unit\]\)\);/);
  assert.match(p, /else if \(f\.key === "heldOut"\) setHeldOut\(true\);/);
  for (const l of ["es", "pt", "fr", "ar"]) { const j = JSON.parse(read(`../src/locales/${l}.json`)); for (const k of ["thinner than a block", "near the 50 % line", "far from the model", "A weak fit to the logs."]) assert.ok(j[k], `${l}: ${k}`); }
});

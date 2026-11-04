// TASKS.csv #1583 (review #1497, Lawyers) — rover readings cleaned on import: the GEM signal-quality column, an along-line
// despike against a running median, and a floor hint that ignores spikes and dropouts
import test from "node:test";
import assert from "node:assert/strict";
import { guessQualityColumn, filterSignalQuality, despikeAlongLines, robustAnomalyMax } from "../src/lib/surveyClean.js";
import { simpegMagFloorHint } from "../src/lib/inversion.js";

test("#1583 the quality column by name", () => {
  assert.equal(guessQualityColumn(["X", "Y", "elev", "rawmag", "sq", "cormag", "sat", "time"]), "sq");
  assert.equal(guessQualityColumn(["X", "Y", "Quality", "nT"]), "Quality");
  assert.equal(guessQualityColumn(["X", "Y", "nT", "sigma"]), "", "sigma is an uncertainty, not a quality");
  assert.equal(guessQualityColumn(["X", "Y", "nT"]), "");
});

test("#1583 readings under the quality floor are dropped; a no-data quality keeps the reading", () => {
  const rows = [{ nT: 56500, sq: 99 }, { nT: 23635, sq: 9 }, { nT: 56510, sq: 50 }, { nT: 56520, sq: "*" }, { nT: 38362, sq: 49 }];
  const r = filterSignalQuality(rows, "sq", 50);
  assert.deepEqual(r.rows.map((x) => x.nT), [56500, 56510, 56520]); assert.equal(r.dropped, 2);
  assert.equal(filterSignalQuality(rows, "", 50).dropped, 0, "no column: nothing dropped");
  assert.equal(filterSignalQuality(rows, "sq", 0).dropped, 0, "a floor of 0: off");
});

test("#1583 the along-line despike drops a spike and a dropout but keeps a real anomaly and a quiet line", () => {
  let s = 3; const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
  const rows = [];
  for (let i = 0; i < 200; i++) rows.push({ line: "L1", v: 56500 + 8 * (rnd() - 0.5) + (i >= 80 && i < 120 ? 400 * Math.sin(((i - 80) / 40) * Math.PI) : 0) }); // a 400 nT anomaly over 40 readings
  rows[30].v = 113403; // a spike
  rows[150].v = 23635; // a dropout
  for (let i = 0; i < 50; i++) rows.push({ line: "L2", v: 56400 + 0.2 * (rnd() - 0.5) }); // a quiet line: MAD under 1 nT
  rows[220].v = 56400 + 15; // a 15 nT step on the quiet line: under the 20 nT minimum step, kept
  const r = despikeAlongLines(rows, (x) => x.v, (x) => x.line);
  assert.equal(r.dropped, 2, JSON.stringify(r.threshold));
  assert.ok(!r.rows.some((x) => x.v === 113403 || x.v === 23635));
  assert.equal(r.rows.filter((x) => x.line === "L1").length, 198, "the anomaly's 40 readings all stay");
  assert.equal(r.rows.filter((x) => x.line === "L2").length, 50);
  assert.ok(r.threshold.L2 === 20, "the quiet line's limit is the 20 nT minimum step");
  // the running median follows the anomaly, so even its crest is within the limit
  assert.ok(r.threshold.L1 < 200);
  // a line on a steady gradient (15 nT per reading, 3 nT noise): its first and last readings are not spikes (the window past
  // the ends is the line reflected, not one-sided), and the one real spike is
  const slope = []; for (let i = 0; i < 150; i++) slope.push({ line: "L3", v: 56500 + 300 * Math.sin(i / 20) + 3 * (rnd() - 0.5) });
  slope[60].v = 113403;
  const r2 = despikeAlongLines(slope, (x) => x.v, (x) => x.line);
  assert.equal(r2.dropped, 1, JSON.stringify(r2.threshold));
});

test("#1583 the floor hint is 2% of the largest anomaly among readings that are not outliers", () => {
  const v = []; for (let i = 0; i < 1000; i++) v.push(56500 + 300 * Math.sin((2 * Math.PI * i) / 250)); // four whole periods: the median is the centre
  const plain = simpegMagFloorHint(v);
  assert.ok(Math.abs(plain - 0.02 * 300) < 0.5, String(plain));
  const spiked = [...v, 167300, 2105];
  assert.ok(Math.abs(simpegMagFloorHint(spiked) - plain) < 0.5, "a spike and a dropout do not move the hint");
  assert.ok(Math.abs(robustAnomalyMax(spiked) - 300) < 10, String(robustAnomalyMax(spiked))); // about the median of the samples, which is not exactly the sine's centre
  assert.equal(robustAnomalyMax([]), null);
  assert.equal(robustAnomalyMax([5, 5, 5]), null, "no anomaly at all");
});

// TASKS.csv #2813 (split from #2786) — the Fence diagram's numeric track gets an optional log scale: gamma and grades are skewed, and the
// linear track's 98th-percentile top only helps the high end. Log: from the 2nd percentile of the positive values to the highest; zero,
// negative and floor values are drawn at zero width and counted in the key.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { numericTrackRows, trackFraction } from "../src/lib/fenceTrack.js";

const src = (rows) => ({ kind: "layer", rows });

test("log scale: range from the positive values, floor values counted, fractions on log10", () => {
  // 100 intervals of a skewed grade: 0 (below detection), then 1 .. 1000 log-spaced
  const rows = [{ hole_id: "A", from: 0, to: 1, value: 0 }, { hole_id: "A", from: 1, to: 2, value: -1 }];
  for (let i = 0; i < 98; i++) rows.push({ hole_id: "A", from: i + 2, to: i + 3, value: 10 ** (3 * i / 97) });
  const lin = numericTrackRows(src(rows), ["A"]);
  assert.equal(lin.log, false);
  assert.equal(lin.positive, 98);
  const t = numericTrackRows(src(rows), ["A"], [], { log: true });
  assert.equal(t.log, true);
  assert.equal(t.hi, 1000, "the top is the highest value: on a log scale one spike no longer flattens the rest");
  assert.ok(t.lo > 1 && t.lo < 1.2, `the 2nd percentile of the positive values, ${t.lo}`);
  assert.equal(t.below, 4, "0, -1 and the two values at or under the start");
  assert.equal(trackFraction(0, t.lo, t.hi, true), 0);
  assert.equal(trackFraction(-1, t.lo, t.hi, true), 0);
  assert.equal(trackFraction(1000, t.lo, t.hi, true), 1);
  const mid = trackFraction(Math.sqrt(t.lo * 1000), t.lo, t.hi, true);
  assert.ok(Math.abs(mid - 0.5) < 1e-9, "the geometric mean is half-way");
  // the linear track puts 10 (a tenth of the log range's middle) at ~1 % of the width; the log track at about a third
  assert.ok(trackFraction(10, lin.lo, lin.hi) < 0.02 && trackFraction(10, t.lo, t.hi, true) > 0.3);
  assert.equal(trackFraction(5, 0, 10), 0.5, "linear unchanged");
});

test("log asked with fewer than two distinct positive values: the linear scale", () => {
  const t = numericTrackRows(src([{ hole_id: "A", from: 0, to: 1, value: 0 }, { hole_id: "A", from: 1, to: 2, value: 5 }]), ["A"], [], { log: true });
  assert.equal(t.log, false);
  assert.equal(t.positive, 1);
  assert.equal(numericTrackRows(src([]), ["A"], [], { log: true }).log, false);
});

test("the Fence modal: a Log scale tick box, passed to the rows and to every fraction, and the key says so", () => {
  const m = readFileSync(new URL("../src/components/FenceDiagramModal.jsx", import.meta.url), "utf8");
  assert.match(m, /numericTrackRows\(trackSrc, panel\.holes\.map\(\(h\) => h\.hole_id\), assays, \{ log: trackLog \}\)/);
  assert.equal((m.match(/trackFraction\(r\.v, track\.lo, track\.hi, track\.log\)/g) || []).length, 2, "bars and the point line");
  assert.ok(m.includes('track && track.positive >= 2 && <label') && m.includes('{tr("Log scale")}'));
  assert.ok(m.includes('"Track: {name}, log scale from {lo} to {hi}"'));
  for (const l of ["es", "pt", "fr", "ar"]) {
    const d = JSON.parse(readFileSync(new URL(`../src/locales/${l}.json`, import.meta.url), "utf8"));
    assert.ok(d["Track: {name}, log scale from {lo} to {hi}; {n} values at or under {lo} are drawn at zero width"], l);
  }
});

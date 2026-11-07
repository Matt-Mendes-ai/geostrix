// TASKS.csv #1551 — Vn1a / Vn3 at k 3.3-3.4 read 'Moderate clustering', and the header counted 2,397 alpha-only, 363 no-angle and 1
// beta-only picks together as 'no dip direction (alpha only, no beta)'
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const s = readFileSync(new URL("../src/components/StereonetModal.jsx", import.meta.url), "utf8");

test("k below 5 is called weak clustering", () => {
  assert.match(s, /: stats\?\.k < 5 \? tr\("Weak clustering \(k \{k\}\): a broad set, spread about 45° or more around the mean\.", \{ k: stats\.k\.toFixed\(1\) \}\)/);
  assert.ok(s.indexOf("stats?.k < 5 ?") < s.indexOf('tr("Moderate clustering.")'));
});

test("the header gives each reason a pick is not plotted", () => {
  // the classification, run on the reviewer's mix
  const body = s.slice(s.indexOf("const unplotted = useMemo(() => {") + "const unplotted = useMemo(() => {".length, s.indexOf("}, [filtered]);", s.indexOf("const unplotted")));
  const classify = new Function("filtered", body);
  const rows = [
    ...Array.from({ length: 5 }, () => ({ dip: 70, azimuth: 220 })),
    ...Array.from({ length: 4 }, () => ({ alpha: 45, beta: null })),
    ...Array.from({ length: 3 }, () => ({})),
    { beta: 120 }, { dip: 60, azimuth: "" },
  ];
  assert.deepEqual(classify(rows), { alphaOnly: 4, betaOnly: 1, noAngles: 3, noDipDir: 1, other: 0 });
  assert.match(s, /not plotted: \{why\}/);
  assert.ok(!/tr\([^)]*have no dip direction \(alpha only, no beta\)/.test(s));
});

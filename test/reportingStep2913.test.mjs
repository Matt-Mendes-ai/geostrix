// TASKS.csv #2913 (review #2876, WA iron) — XRF per cent data reported to 0.01 with zeros below: 0.01 is the reporting step, not half a
// detection limit, and a major's lowest value is not a limit. No limit is suggested, and Thresholds / Grade stats count no <DL from it.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { censoringFloor, suggestDetectionLimit, reportedStep, reportingResolution, zeroResults } from "../src/lib/qaqc.js";

const rd = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
// Cu: 570 zeros (as the import stores them: null with the nd flag), 360 at 0.01, then 0.02 ... 0.07
const cuRows = [
  ...Array.from({ length: 570 }, () => ({ values: { Cu: null }, nd: ["Cu"] })),
  ...Array.from({ length: 360 }, () => ({ values: { Cu: 0.01 } })),
  ...Array.from({ length: 70 }, (_, i) => ({ values: { Cu: Number((0.02 + (i % 6) * 0.01).toFixed(2)) } })),
];

test("zeros below the commonest low value: the reporting step, no limit suggested", () => {
  assert.equal(zeroResults(cuRows, "Cu"), 570);
  assert.equal(zeroResults([{ values: { Cu: 0 } }, { values: { Cu: null }, nd: ["Cu"] }], "Cu", { flaggedOnly: true }), 1);
  const s = suggestDetectionLimit(cuRows, "Cu");
  assert.deepEqual(s, { limit: null, basis: "step", step: 0.01, zeros: 570 });
  const vals = cuRows.map((a) => a.values.Cu);
  assert.ok(censoringFloor(vals), "without the zeros the old floor guess fires");
  assert.equal(censoringFloor(vals, { zeros: 570 }), null, "with them, no floor");
  assert.deepEqual(reportedStep(vals, { zeros: 570 }), { step: 0.01, zeros: 570 });
  assert.equal(censoringFloor([...vals.filter((v) => v != null), ...Array(570).fill(0)]), null, "0 values in the list count too");
});

test("a few zeros do not change the half-limit floor of #1520", () => {
  const au = [...Array(200).fill(0.0005), ...Array.from({ length: 800 }, (_, i) => 0.001 + i * 0.0001), 0, 0, 0];
  const f = censoringFloor(au);
  assert.equal(f.floor, 0.0005);
  assert.equal(f.dl, 0.001);
  assert.equal(reportedStep(au), null);
});

test("a major's lowest value far above the reporting step is not offered as a limit", () => {
  const fe = Array.from({ length: 300 }, (_, i) => ({ values: { Fe: Number((0.97 + i * 0.21).toFixed(2)) } }));
  fe.push({ values: { Fe: 0.98 } }); // two values 0.01 apart: the resolution
  assert.equal(reportingResolution(fe.map((a) => a.values.Fe)), 0.01);
  assert.deepEqual(suggestDetectionLimit(fe, "Fe"), { limit: null, basis: "low", min: 0.97, step: 0.01 });
  // few values, or a lowest value within 20 steps: the lowest value is still offered (#2354)
  assert.deepEqual(suggestDetectionLimit([{ values: { Cu: 4 } }, { values: { Cu: 2 } }], "Cu"), { limit: 2, basis: "min" });
  const tr = Array.from({ length: 50 }, (_, i) => ({ values: { Au: Number((0.002 + i * 0.001).toFixed(3)) } }));
  assert.deepEqual(suggestDetectionLimit(tr, "Au"), { limit: 0.002, basis: "min" });
});

test("wiring: QAQC says why no limit is suggested; Thresholds and Grade stats share the censoring rule with the zeros", () => {
  const q = rd("../src/components/QAQCPanel.jsx");
  assert.match(q, /dlSuggestion\.basis === "step" \|\| dlSuggestion\.basis === "low"/);
  const t = rd("../src/components/ThresholdToolkit.jsx");
  assert.match(t, /censoringFloor\(vals, \{ zeros \}\), step: reportedStep\(vals, \{ zeros \}\)/);
  assert.match(t, /zeroResults\(data, symbol, \{ flaggedOnly: true \}\)/);
  const g = rd("../src/components/GradeStatistics.jsx");
  assert.match(g, /const ltFloor = useMemo\(\(\) => censoringFloor\(rows\.filter\(\(r\) => !r\.lt\)\.map\(\(r\) => r\.value\), \{ zeros: zeroResults\(/);
  assert.match(g, /ltN: rs\.reduce\(\(k, r\) => k \+ \(isLt\(r\) \? 1 : 0\), 0\)/);
});

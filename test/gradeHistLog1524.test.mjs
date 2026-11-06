// TASKS.csv #1524 — Grade stats' histogram opened linear: for Lawyers' Au one bar held 99.7 % of 83,444 intervals.
// A skewed grade now opens on the log scale; a tick still wins for that source and element.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { histogramWantsLog } from "../src/lib/geochem.js";

test("histogramWantsLog: over two decades or a CV above 150 %", () => {
  assert.equal(histogramWantsLog({ sorted: [0, 0.0025, 0.01, 0.2, 136], cv: 962 }), true); // Lawyers-like Au
  assert.equal(histogramWantsLog({ sorted: [0.5, 1, 2, 60], cv: 120 }), true); // 120x range
  assert.equal(histogramWantsLog({ sorted: [1, 2, 3, 4, 50], cv: 160 }), true); // CV alone
  assert.equal(histogramWantsLog({ sorted: [1.2, 1.9, 2.4, 3.1], cv: 35 }), false); // a normal-looking grade stays linear
  assert.equal(histogramWantsLog({ sorted: [-5, -1, 0], cv: null }), false); // nothing positive
  assert.equal(histogramWantsLog({ sorted: [2, 2, 2], cv: 0 }), false);
  assert.equal(histogramWantsLog(null), false);
});

test("Grade stats: the data decides unless the box was ticked for this source and element; left-out values are counted", () => {
  const g = readFileSync(new URL("../src/components/GradeStatistics.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.ok(!g.includes("const [logScale, setLogScale] = useState(false);"));
  assert.match(g, /const logScale = logChoice\?\.key === logKey \? logChoice\.on : histogramWantsLog\(overallStats\);/);
  assert.match(g, /const logKey = `\$\{source\}:\$\{symbol\}`;/);
  assert.match(g, /leftOut: allValues\.length - vals\.length/);
  assert.match(g, /tr\("\{n\} zero or negative values are not on the log scale\.", \{ n: histogram\.leftOut\.toLocaleString\(\) \}\)/);
});

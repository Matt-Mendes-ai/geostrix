// TASKS.csv #2353 (review #2325, WA uranium) — gamma against assay: an interval log averaged over the sample's interval, a 1:1 line, and
// the numbers the disequilibrium check reads (n, Spearman, median Y / X, length-weighted Y / X) above a typed X; the same ratios in Downhole logs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { intervalLookup, depthLookup, xyDiagram, xyStats } from "../src/lib/geochemXY.js";
import { logVsAssay } from "../src/lib/downholeLogs.js";

// a 0.5 m gamma log: 10 ppm except 4.0-4.5 m at 100; a 2-4 m composite at 3-6 m: mean = (5 x 10 + 1 x 100) / 6 = 25; mid-depth (4.5) = 10
const log = [];
for (let d = 0; d < 10; d += 0.5) log.push({ hole_id: "H", from: d, to: d + 0.5, values: { eU: d === 4 ? 100 : 10 } });

test("a sample reads the log's length-weighted mean over its own interval; a point reads at its depth", () => {
  const at = intervalLookup(log, "eU");
  assert.equal(at({ hole_id: "H", from: 3, to: 6 }), 25);
  assert.equal(depthLookup(log, "eU")({ hole_id: "H", from: 3, to: 6 }), 10); // the old mid-depth read
  assert.equal(at({ hole_id: "H", from: 4.1, to: 4.3 }), 100);
  assert.equal(at({ hole_id: "H", from: 4.25 }), 100); // a point
  assert.equal(at({ hole_id: "X", from: 3, to: 6 }), null);
  assert.equal(at({ hole_id: "H", from: 20, to: 22 }), null);
});

test("statistics: n, Spearman, the median and length-weighted Y / X, above a typed X; a 1:1 line on request", () => {
  const X = { label: "U3O8", value: (s) => s.x }, Y = { label: "eU3O8", value: (s) => s.y };
  const samples = [{ x: 100, y: 70, from: 0, to: 2 }, { x: 300, y: 210, from: 2, to: 6 }, { x: 1000, y: 650, from: 6, to: 7 }, { x: 5, y: 20, from: 7, to: 9 }];
  const all = xyStats(X, Y, samples, {});
  assert.equal(all.n, 4);
  assert.equal(all.r, 1); // the ranks agree
  const ore = xyStats(X, Y, samples, {}, { xMin: 100 });
  assert.equal(ore.n, 3);
  assert.ok(Math.abs(ore.medianRatio - 0.7) < 1e-9);
  assert.ok(Math.abs(ore.weightedRatio - (70 * 2 + 210 * 4 + 650) / (100 * 2 + 300 * 4 + 1000)) < 1e-12); // 0.6625
  const d = xyDiagram(X, Y, samples, {}, { oneToOne: true });
  assert.equal(d.tieLines[0].label, "1:1");
  assert.equal(d.tieLines[0].from[0], d.tieLines[0].from[1]);
  assert.ok(!xyDiagram(X, Y, samples, {}).tieLines);
  assert.match(d.caption, /averaged over each sample's interval/);
});

test("Downhole logs against an element give the ratios too; the Geochem and pane wiring", () => {
  const rows = [{ hole_id: "H", from: 0, to: 0.5, values: { eU: 70 } }, { hole_id: "H", from: 0.5, to: 1, values: { eU: 80 } }, { hole_id: "H", from: 1, to: 1.5, values: { eU: 150 } }];
  const assays = [{ hole_id: "H", from: 0, to: 1, values: { U: 100 } }, { hole_id: "H", from: 1, to: 2, values: { U: 200 } }];
  const v = logVsAssay(rows, "eU", assays, "U", { U: "ppm" });
  assert.equal(v.n, 3);
  assert.ok(Math.abs(v.medianRatio - 0.75) < 1e-12);
  assert.ok(Math.abs(v.weightedRatio - (70 + 80 + 150) / (100 + 100 + 200)) < 1e-12);
  const g = readFileSync(new URL("../src/modules/GeochemModule.jsx", import.meta.url), "utf8");
  assert.match(g, /xyDiagram\(xyAxes\[0\], xyAxes\[1\], sourceRows, elementUnits, \{ oneToOne: !!xyOne \}\)/);
  assert.match(g, /n \{n\} · Spearman \{r\} · median Y \/ X \{m\} · length-weighted Y \/ X \{w\}/);
  const p = readFileSync(new URL("../src/components/DownholeLogsPane.jsx", import.meta.url), "utf8");
  assert.match(p, /Log \/ assay: median \{m\}, length-weighted \{w\}/);
});

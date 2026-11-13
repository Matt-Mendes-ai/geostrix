// TASKS.csv #1425 / #1708 — the Geophysics tab's Downhole logs pane: a log by logged code (box statistics) and against an assay
// element (Spearman), and the empty headline that counts the downhole readings
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { boxStats, logByCode, logVsAssay, NOT_LOGGED } from "../src/lib/downholeLogs.js";

const rows = [
  ...[2, 5, 8].map((d, i) => ({ hole_id: "H1", from: d - 0.5, to: d + 0.5, values: { "Mag. susc.": [0.1, 0.12, 0.09][i] } })), // phyllic 0-10
  ...[12, 15, 18].map((d, i) => ({ hole_id: "H1", from: d - 0.5, to: d + 0.5, values: { "Mag. susc.": [0.5, 0.6, 0.55][i] } })), // propylitic 10-20
  { hole_id: "H1", from: 24.5, to: 25.5, values: { "Mag. susc.": 0.3 } }, // beyond the logged intervals
  { hole_id: "H2", from: 1, to: 2, values: { "Mag. susc.": 0.7 } }, // no alteration log on H2
  { hole_id: "H1", from: 30, to: 31, values: { "Mag. susc.": NaN } },
];
const alt = [{ hole_id: "H1", from: 0, to: 10, value: "PHYL" }, { hole_id: "H1", from: 10, to: 20, value: "PROP" }];

test("boxStats and the readings grouped by the code at their midpoint, medians descending", () => {
  assert.deepEqual(boxStats([5, 1, 3, 4, 2]), { n: 5, min: 1, q1: 2, median: 3, q3: 4, max: 5 });
  assert.equal(boxStats([NaN]), null);
  const g = logByCode(rows, "Mag. susc.", alt);
  assert.deepEqual(g.map((x) => [x.key, x.n, +x.stats.median.toFixed(2)]), [["PROP", 3, 0.55], ["PHYL", 3, 0.1]]); // (not logged) has 2 readings: under minN
  const g1 = logByCode(rows, "Mag. susc.", alt, { minN: 1 });
  assert.deepEqual(g1.map((x) => [x.key, x.n]), [["PROP", 3], [NOT_LOGGED, 2], ["PHYL", 3]]); // (not logged): 0.3 and 0.7, median 0.5, under PROP's 0.55
});

test("the log against an assay element: pairs by hole and depth, Spearman and log-Pearson", () => {
  const assays = [
    { hole_id: "H1", from: 0, to: 10, values: { Fe: 2 } }, { hole_id: "H1", from: 10, to: 20, values: { Fe: 6 } }, { hole_id: "H1", from: 20, to: 24, values: { Fe: 9 } },
    { hole_id: "H1", from: 24, to: 26, values: { Fe: 4 }, source: "pXRF" }, // left out
    { hole_id: "H2", from: 0, to: 5, values: { Fe: 7 } },
  ];
  const v = logVsAssay(rows, "Mag. susc.", assays, "Fe", { Fe: "%" });
  assert.equal(v.n, 7); // 3 + 3 + H2; the 25 m reading only has a pXRF interval, the NaN reading is dropped
  assert.equal(v.unit, "%");
  assert.ok(v.r > 0.8, `Spearman ${v.r}`); // low susc with low Fe, high with high
  assert.ok(Number.isFinite(v.rLog));
  { const two = logVsAssay(rows.slice(0, 2), "Mag. susc.", assays, "Fe"); assert.deepEqual({ pairs: two.pairs, n: two.n, r: two.r, rLog: two.rLog, unit: two.unit }, { pairs: [[0.1, 2], [0.12, 2]], n: 2, r: NaN, rLog: NaN, unit: "ppm" }); } // #2353 added the ratios
});

test("the pane, the ribbon button and the headline", () => {
  const g = readFileSync(new URL("../src/modules/GeophysicsModule.jsx", import.meta.url), "utf8");
  assert.match(g, /label="Downhole logs" tone="analyse"/);
  assert.match(g, /\{geoPane === "logs" && \(<Suspense fallback=\{null\}><DownholeLogsPane layers=\{layers\} customLayers=\{customLayers\} assays=\{assays\} assayElements=\{assayElements\}/);
  assert.match(g, /No surface geophysics yet; \{ms\} mag-susc and \{sg\} SG readings in the drillholes — see Downhole logs/);
  const p = readFileSync(new URL("../src/components/DownholeLogsPane.jsx", import.meta.url), "utf8");
  assert.match(p, /TaskPaneHeader title=\{tr\("Downhole logs"\)\} helpId="downhole-logs"/);
  assert.match(p, /<BoxPlots fit groups=\{(groups|ranked\.all|boxes\.groups)\}/); // fit: scaled to the pane; ranked.all: #2951 (common codes first); boxes.groups: #2953 (whiskers P2-P98)
  assert.match(p, /logVsAssay\(data\.assays, data\.symbol, assays, el, elementUnits(, \{ perSample: pairOn === "sample" \})?\)/); // #2954 — Pair on
});

// TASKS.csv #2954 (review #2876, WA iron) — density against Fe was answered with a uranium sentence and a meaningless ratio (g/cc over %), no
// fitted line, and four 0.5 m bins of one 2 m sample counted as four pairs.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { logVsAssay, fitLine, ratioComparable } from "../src/lib/downholeLogs.js";

test("least squares: a line comes back exactly", () => {
  const xs = [20, 30, 40, 50, 60], ys = xs.map((x) => 1.895 + 0.0175 * x);
  const f = fitLine(xs, ys);
  assert.ok(Math.abs(f.a - 1.895) < 1e-12 && Math.abs(f.b - 0.0175) < 1e-12 && f.n === 5);
  assert.equal(fitLine([3, 3, 3], [1, 2, 3]), null, "x does not vary: no line");
});

// 0.5 m density bins against 2 m Fe samples: density = 1.9 + 0.02 Fe, the bins inside a sample spread around it
const assays = [], rows = [];
for (let s = 0; s < 30; s++) {
  const fe = 20 + s * 1.5;
  assays.push({ hole_id: "A", from: s * 2, to: s * 2 + 2, values: { Fe: fe } });
  [-0.03, 0.01, 0.03, -0.01].forEach((d, k) => rows.push({ hole_id: "A", from: s * 2 + k * 0.5, to: s * 2 + k * 0.5 + 0.5, values: { D: 1.9 + 0.02 * fe + d } }));
}

test("pairing on the sample: one pair per assay interval, the log's length-weighted mean inside it; the fit of the log on the element", () => {
  const each = logVsAssay(rows, "D", assays, "Fe", { Fe: "%" });
  assert.equal(each.n, 120, "a pair per reading");
  const per = logVsAssay(rows, "D", assays, "Fe", { Fe: "%" }, { perSample: true });
  assert.equal(per.n, 30, "a pair per sample");
  assert.equal(per.perSample, true);
  for (const [d, fe] of per.pairs) assert.ok(Math.abs(d - (1.9 + 0.02 * fe)) < 1e-12, "the bins' mean");
  assert.ok(Math.abs(per.fit.a - 1.9) < 1e-9 && Math.abs(per.fit.b - 0.02) < 1e-12, "density = 1.9 + 0.02 x Fe");
  assert.ok(Math.abs(each.fit.b - 0.02) < 1e-3, "the same slope from every reading");
  assert.ok(per.rLin > each.rLin, "equal support: a tighter correlation");
});

test("the ratio is said only for one quantity against itself (an equivalent grade against its element)", () => {
  assert.equal(ratioComparable("downhole_logs: Density_Best g/cc", "Fe"), false);
  assert.equal(ratioComparable("downhole_logs: Gamma_Best cps", "U3O8"), false, "a count rate is not a grade");
  assert.equal(ratioComparable("eU3O8_cased_ppm ppm", "U3O8"), true);
  assert.equal(ratioComparable("Gamma log: eU3O8 (ppm)", "U"), true);
  assert.equal(ratioComparable("spectral eTh", "Th"), true);
  assert.equal(ratioComparable("spectral eTh", "U"), false);
});

test("the pane: Pair on, the line drawn and said, the ratio only when comparable", () => {
  const p = readFileSync(new URL("../src/components/DownholeLogsPane.jsx", import.meta.url), "utf8");
  assert.match(p, /useKeptState\(keptScope, "dhlogs\.pairOn", "reading"\)/);
  assert.match(p, /logVsAssayIndexed\(vsIndex, el, elementUnits, \{ perSample: pairOn === "sample" \}\)/); // #3078
  assert.match(p, /Number\.isFinite\(vs\.medianRatio\) && ratioComparable\(`\$\{source\.label\} \$\{source\.unit \|\| ""\}`, el\)/);
  assert.match(p, /tr\("Least-squares line: \{log\} = \{a\} \+ \{b\} × \{el\} \(\{n\} pairs\)\."/);
  assert.match(p, /fit=\{vs\.fit\}/);
  assert.match(p, /\{fit && !logX && !logY && \(\(\) => \{/);
  assert.doesNotMatch(p, /\buseState\(/, "#2394");
});

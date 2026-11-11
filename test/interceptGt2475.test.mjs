// TASKS.csv #2475 — an intercept of 10.40 m with 9.00 m sampled printed grade x length over the whole span (1669 x 10.40 = 17,355) and
// outranked a 6.00 m intercept of 15,761; over the samples it is 15,019. Grade x length and the ranking are over the sampled metres.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { computeBestIntercepts, interceptGradeLength, interceptSampledM } from "../src/lib/geochem.js";

test("grade x length over the sampled metres, and the ranking follows", () => {
  const r = { avgGrade: 1668.8, length: 10.4, unsampledM: 1.4 };
  assert.ok(Math.abs(interceptSampledM(r) - 9.0) < 1e-9);
  assert.ok(Math.abs(interceptGradeLength(r) - 15019.2) < 1e-6);
  assert.equal(interceptGradeLength({ avgGrade: 2, length: 3 }), 6, "no unsampled metres: as before");
  // hole A: 10 m with a 1.5 m unsampled gap at 1,700; hole B: 6 m at 2,627 -> B first (15,762 > 14,450)
  const assays = [
    { hole_id: "A", from: 0, to: 4, values: { U: 1700 } }, { hole_id: "A", from: 5.5, to: 10, values: { U: 1700 } },
    { hole_id: "B", from: 0, to: 6, values: { U: 2627 } },
  ];
  const out = computeBestIntercepts(assays, "U", "ppm", { U: "ppm" }, { cutoff: 200, maxInternalDilution: 2 });
  assert.deepEqual(out.map((c) => c.hole_id), ["B", "A"]);
  assert.ok(Math.abs(out[1].unsampledM - 1.5) < 1e-9);
});

test("the pane, the Layout table and the CSV use it", () => {
  const b = readFileSync(new URL("../src/components/BestIntercepts.jsx", import.meta.url), "utf8");
  assert.match(b, /<td style=\{td\}>\{\+dg\(interceptGradeLength\(r\)\)\.toPrecision\(5\)\}<\/td>/);
  assert.match(b, /tr\("\{len\} \(\{s\} sampled\)"/);
  const d = readFileSync(new URL("../src/lib/drillReportExport.js", import.meta.url), "utf8");
  assert.match(d, /grade_x_length: sig6\(interceptGradeLength\(r\)\)/);
});

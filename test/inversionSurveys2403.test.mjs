// TASKS.csv #2403 — the Inversion checklist counts per survey
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { inversionSurveyCounts } from "../src/lib/geophysSurveyTools.js"; // TASKS.csv #3590

const mk = (src, n) => Array.from({ length: n }, (_, i) => ({ x: i, y: 0, value: 1, _src: src }));

test("#2403 two 861-station surveys, one radiometric: one can be inverted", () => {
  const rows = [...mk("groundmag.csv", 861), ...mk("radiometric.csv", 861)];
  const c = inversionSurveyCounts(rows, { "groundmag.csv": { method: "mag" }, "radiometric.csv": { method: "rad_tc" } });
  assert.equal(c.total, 1722); assert.equal(c.n, 2);
  assert.deepEqual(c.usable, [{ key: "groundmag.csv", count: 861 }]); assert.equal(c.usableReadings, 861);
  assert.deepEqual(c.skipped, [{ key: "radiometric.csv", count: 861 }]);
});

test("#2403 a survey with no Method set counts as usable; none usable is said; one survey is as before", () => {
  const rows = [...mk("a.csv", 10), ...mk("b.csv", 5)];
  assert.equal(inversionSurveyCounts(rows, {}).usable.length, 2);
  assert.equal(inversionSurveyCounts(rows, { "a.csv": { method: "ip" }, "b.csv": { method: "res" } }).usable.length, 0);
  const one = inversionSurveyCounts(mk("a.csv", 10), { "a.csv": { method: "grav" } });
  assert.equal(one.n, 1); assert.equal(one.skipped.length, 0);
  assert.equal(inversionSurveyCounts([], {}).n, 0);
});

test("#2403 the checklist uses the per-survey counts", () => {
  const p = readFileSync(new URL("../src/components/InversionPanel.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(p, /const c = inversionSurveyCounts\(allRows, geophysSurveys\);/);
  assert.match(p, /survey\(s\) loaded; \{u\} can be inverted/);
});

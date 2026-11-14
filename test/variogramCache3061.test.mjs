// TASKS.csv #3061 — the Variogram keeps its composites (and the points it pairs) between Compute presses while what makes them is the same
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { makeRunCache } from "../src/lib/runCache.js";

test("one entry: kept while every input is the same value or the same object, worked out again when one changes", () => {
  const c = makeRunCache(), rows = [{ a: 1 }];
  let n = 0;
  const f = () => ({ k: ++n });
  const a = c.get([rows, "Au", 2, null, NaN], f);
  assert.equal(a.hit, false); assert.equal(n, 1);
  const b = c.get([rows, "Au", 2, null, NaN], f);
  assert.equal(b.hit, true); assert.equal(b.value, a.value, "the same object"); assert.equal(n, 1);
  assert.equal(c.get([rows.slice(), "Au", 2, null, NaN], f).hit, false, "an equal copy is another input");
  assert.equal(c.get([rows.slice(), "Au", 2, null, NaN], f).hit, false);
  const d = c.get([rows, "Au", 2.5, null, NaN], f); assert.equal(d.hit, false);
  assert.equal(c.get([rows, "Au", 2.5, null, NaN], f).value, d.value);
  assert.equal(c.get([rows, "Au", 2.5, null], f).hit, false, "a different number of inputs");
  c.clear(); assert.equal(c.get([rows, "Au", 2.5, null], f).hit, false);
});

test("wiring: the composites keyed by everything compositing and placing read; the domain / transform and the flattening kept apart", () => {
  const m = readFileSync(new URL("../src/components/VariogramModal.jsx", import.meta.url), "utf8");
  const key = m.match(/compCache\.current\.getAsync\(\[([^\]]+)\]/)[1].split(",").map((s) => s.trim());
  for (const k of ["srcAssays", "uns.ready", "uns.mode", "uns.value", "uns.logKey", "uns.logFactor", "uns.alsoUnassayed", "layers", "customLayers", "symbol", "unit", "elementUnits", "compositeLength", "minCoverage", "domainChoice ? domainChoice.rows : null", "collars", "survey", "desurveyMethod", "holeMode"]) assert.ok(key.includes(k), k);
  // nothing the cached step reads is left out of its key
  const body = m.slice(m.indexOf("compCache.current.getAsync(["), m.indexOf("})).value;", m.indexOf("compCache.current.getAsync(["))); // getAsync: #3111 (compositing and placing in slices)
  for (const k of ["uns.apply(srcAssays)", "compositeDownholeSliced(filled.assays, symbol, unit, elementUnits", "length: compositeLength, minCoverage", "samplePointsSliced(intervals, collars, survey, desurveyHole, desurveyMethod)", "holeMode === \"downhole\""]) assert.ok(body.includes(k), k);
  assert.match(m, /pointCache\.current\.get\(\[allPoints, domainKey, domainValue, transform, capPercentile\]/);
  assert.match(m, /flatCache\.current\.get\(\[tPoints, usePlane\.surface\]/);
  assert.match(m, /= pick\.tf;/);
});

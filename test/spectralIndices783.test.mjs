// TASKS.csv #783 — spectral indices: the expression language, the presets, per-pixel evaluation and blanks.
import test from "node:test";
import assert from "node:assert/strict";
import { compileExpression, evaluateIndex, INDEX_PRESETS, SENSORS } from "../src/lib/spectralIndices.js";

test("expressions: precedence, right-associative power, unary minus, brackets", () => {
  const f = (s, env = {}) => compileExpression(s).fn(env);
  assert.equal(f("1+2*3"), 7);
  assert.equal(f("(1+2)*3"), 9);
  assert.equal(f("2^3^2"), 512);
  assert.equal(f("-2^2"), -4);
  assert.equal(f("2**3"), 8);
  assert.equal(f("a/b", { a: 3, b: 4 }), 0.75);
  assert.equal(f("1e2 + .5"), 100.5);
});

test("bad expressions say what is wrong, and nothing outside the language runs", () => {
  assert.throws(() => compileExpression("B4/"), /ends too early/);
  assert.throws(() => compileExpression("(B4"), /not closed/);
  assert.throws(() => compileExpression("B4/B9", ["B2", "B4"]), /Unknown band "B9"/);
  assert.throws(() => compileExpression("alert(1)", ["B2"]), /Unknown band "alert"/);
  assert.throws(() => compileExpression("B2;B3", ["B2", "B3"]), /Unexpected ";"/);
  assert.throws(() => compileExpression(""), /empty/);
});

test("every preset compiles against its sensor's bands", () => {
  for (const p of INDEX_PRESETS) {
    const { uses } = compileExpression(p.expr, SENSORS[p.sensor].roles);
    assert.ok(uses.length >= 2, p.id);
  }
});

test("quartz index on emissivity: quartz-like pixel high, featureless pixel ~1, blanks counted", () => {
  // bands 10..14: quartz's reststrahlen doublet lowers bands 10 and 12 against band 11, so QI = B11^2 / (B10 B12) > 1
  const b10 = [0.85, 0.95, 0, 0.9], b11 = [0.93, 0.95, 0.9, 0.9], b12 = [0.86, 0.95, 0.9, NaN], b13 = [0.96, 0.95, 0.9, 0.9], b14 = [0.96, 0.95, 0.9, 0.9];
  const r = evaluateIndex([b10, b11, b12, b13, b14], SENSORS.aster_tir.defaultBands, "B11*B11/(B10*B12)");
  assert.ok(r.values[0] > 1.15, String(r.values[0]));
  assert.ok(Math.abs(r.values[1] - 1) < 1e-6);
  assert.ok(Number.isNaN(r.values[2]) && Number.isNaN(r.values[3])); // a 0 fill and a NaN
  assert.equal(r.blank, 2);
});

test("mapping errors and file nodata", () => {
  assert.throws(() => evaluateIndex([[1], [1]], { B4: 3, B2: 1 }, "B4/B2"), /mapped to band 3, but the file has 2/);
  const r = evaluateIndex([[0.2, -9999], [0.1, 0.1]], { B4: 1, B2: 2 }, "B4/B2", { isNoData: (v) => v === -9999 });
  assert.ok(Math.abs(r.values[0] - 2) < 1e-6); assert.ok(Number.isNaN(r.values[1]));
});

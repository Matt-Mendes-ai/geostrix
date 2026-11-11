// TASKS.csv #2203 — the X-Y scatter's linear axes never show a negative tick for values that are never negative, a percentage axis stops at
// 100, and an element whose positive values span a decade is drawn on a log axis
import test from "node:test";
import assert from "node:assert/strict";
import { xyDiagram } from "../src/lib/geochemXY.js";

const axis = (key, extra = {}) => ({ label: key, value: (s) => s[key], ...extra });

test("the review's case: Au 0.005-0.45 g/t against RQD 78.8-101.2 %", () => {
  const samples = [{ au: 0.005, rqd: 78.8 }, { au: 0.12, rqd: 90 }, { au: 0.45, rqd: 101.2 }];
  const d = xyDiagram(axis("au", { element: true, unit: "g/t" }), axis("rqd", { label: "RQD (%)", unit: "%" }), samples, {});
  assert.equal(d.logX, true); // 90x span: a log grade axis
  assert.equal(d.logY, false);
  assert.ok(d.yRange[0] > 0 && d.yRange[1] > 101.2, String(d.yRange)); // a value over 100 keeps the axis past it
  const d2 = xyDiagram(axis("au", { element: true, unit: "g/t" }), axis("rqd", { label: "RQD (%)", unit: "%" }), samples.slice(0, 2), {});
  assert.equal(d2.yRange[1], Math.min(100, 90 + (90 - 78.8) * 0.06));
});

test("a linear axis of non-negative values starts at 0 at the lowest", () => {
  const d = xyDiagram(axis("a", { element: true }), axis("b"), [{ a: 0, b: 1 }, { a: 0.3, b: 2 }], {});
  assert.equal(d.logX, false);
  assert.equal(d.xRange[0], 0);
  const neg = xyDiagram(axis("a"), axis("b"), [{ a: -5, b: 1 }, { a: 5, b: 2 }], {});
  assert.ok(neg.xRange[0] < -5); // real negative values keep their padding
});

test("a non-element axis keeps the two-decade rule; an element switches at one decade", () => {
  const s = [{ a: 1, b: 1 }, { a: 20, b: 20 }];
  const d = xyDiagram(axis("a", { element: true }), axis("b"), s, {});
  assert.equal(d.logX, true);
  assert.equal(d.logY, false);
});

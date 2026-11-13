// TASKS.csv #3051 (#2911's second ask) — a ternary of three corners the user chooses, beside 'X-Y scatter (choose the axes)'
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ternaryDiagram, axisOf, TERNARY_LABEL } from "../src/lib/geochemXY.js";
import { DIAGRAMS, ternaryXY } from "../src/lib/geochemDiagrams.js";

const el = (symbol, unit = "ppm") => axisOf({ kind: "element", symbol, unit }, {});
const U = { Ti: "ppm", Zr: "ppm", Y: "ppm" };

test("Ti/100 - Zr - Y×3 chosen by hand plots as Pearce & Cann's own diagram", () => {
  const d = ternaryDiagram([el("Ti"), el("Zr"), el("Y")], [0.01, 1, 3]);
  assert.equal(d.ternary, true); assert.equal(d.label, TERNARY_LABEL);
  assert.deepEqual(d.corners, ["Ti (ppm)/100", "Zr (ppm)", "Y (ppm)×3"]);
  const s = { values: { Ti: 6000, Zr: 120, Y: 30 } };
  assert.deepEqual(d.project(s, U), DIAGRAMS.tizry.project(s, U));
});

test("shares of the sum; no point without all three or with a negative value", () => {
  const d = ternaryDiagram([el("A"), el("B"), el("C")]);
  assert.deepEqual(d.project({ values: { A: 1, B: 1, C: 1 } }, {}), ternaryXY(1 / 3, 1 / 3, 1 / 3));
  assert.deepEqual(d.project({ values: { A: 5, B: 0, C: 0 } }, {}), { x: 0.5, y: Math.sqrt(3) / 2 }, "all A: the top corner");
  assert.equal(d.project({ values: { A: 1, B: 1 } }, {}), null);
  assert.equal(d.project({ values: { A: 1, B: -1, C: 1 } }, {}), null);
  assert.equal(d.project({ values: { A: 0, B: 0, C: 0 } }, {}), null);
  assert.equal(ternaryDiagram([el("A"), null, el("C")]), null);
  // a bad factor is 1
  assert.deepEqual(ternaryDiagram([el("A"), el("B"), el("C")], ["x", -2, 0]).corners, ["A (ppm)", "B (ppm)", "C (ppm)"]);
});

test("wiring: offered beside the X-Y scatter, drawn through diagramOverride", () => {
  const s = readFileSync(new URL("../src/modules/GeochemModule.jsx", import.meta.url), "utf8");
  assert.match(s, /\[\.\.\.Object\.values\(ALL_DIAGRAMS\), XY_ENTRY, TERNARY_ENTRY \/\* #3051 \*\/\]/);
  assert.match(s, /diagramId === "ternary" \? ternDiag \|\| TERNARY_ENTRY/);
  assert.match(s, /diagramOverride=\{diagramId === "xy" \|\| diagramId === "ternary"/);
  assert.match(s, /return ternaryDiagram\(ternKeysNow\.map\(\(k\) => axisOf\(choice\(k\), ctx\)\), ternK\)/);
});

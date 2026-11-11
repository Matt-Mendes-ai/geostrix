// TASKS.csv #2505 — below-detection values counted as measured grades: Grade stats gave Hf a mean, a CV and cap percentiles from 21,863
// '<' values and 18 numbers with no word; Correlation's Li-Sn 0.61 was mostly 'both below detection'; X-Y said nothing; Isocon averaged a
// mostly-'<' Zr; calculated elements dropped the flag.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isBelowDetection, censoredSamples } from "../src/lib/assayFlags.js";
import { resolvedSegments } from "../src/lib/geochem.js";
import { groupMeans } from "../src/lib/isoconGroups.js";
import { addCalculatedElement, operandsOf } from "../src/lib/calcElement.js";
import { correlationMatrix } from "../src/lib/correlation.js";

const src = (f) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");

test("one helper: a drill qualifier or a surface bdl list", () => {
  assert.equal(isBelowDetection({ qualifiers: { Hf: "<" } }, "Hf"), true);
  assert.equal(isBelowDetection({ qualifiers: { Hf: ">" } }, "Hf"), false);
  assert.equal(isBelowDetection({ bdl: ["Au"] }, "Au"), true);
  assert.equal(isBelowDetection({ bdl: ["Au"] }, "Cu"), false);
  assert.equal(isBelowDetection(null, "Cu"), false);
});

test("resolved segments keep the '<' flag (every contributing result '<')", () => {
  const assays = [
    { hole_id: "H", from: 0, to: 1, values: { Hf: 0.0025 }, qualifiers: { Hf: "<" } },
    { hole_id: "H", from: 1, to: 2, values: { Hf: 0.01 } },
  ];
  const segs = resolvedSegments(assays, "Hf", "%", { Hf: "%" });
  assert.deepEqual(segs.map((s) => s.lt), [true, false]);
});

test("Grade stats: a <DL % column, a warning over half, the Thresholds wording", () => {
  const s = src("components/GradeStatistics.jsx");
  assert.match(s, /lt: isBelowDetection\(s, symbol\)/);
  assert.match(s, /domain, lt: s\.lt \}/);
  assert.match(s, /ltN: rs\.reduce\(\(k, r\) => k \+ \(r\.lt \? 1 : 0\), 0\)/);
  assert.match(s, /\{tr\("<DL %"\)\}<\/th>/);
  assert.match(s, /g\.ltN \/ g\.stats\.n > 0\.5/);
  assert.match(s, /is below detection: its statistics are mostly about the detection limit\./);
  assert.match(s, /Its percentiles and caps sit on the limit, not on measured grades\./);
});

test("X-Y counts the below-detection samples of its element axes", () => {
  const g = src("modules/GeochemModule.jsx");
  assert.match(g, /diagramId === "xy" \? \[xyKeyX, xyKeyY\]\.filter\(\(k\) => String\(k\)\.startsWith\("el:"\)\)\.map\(\(k\) => k\.slice\(3\)\)/);
  const plotted = [{ qualifiers: { Cs: "<" } }, { qualifiers: {} }, { qualifiers: { Li: "<" } }];
  assert.equal(censoredSamples(plotted, ["Li", "Cs"]), 2);
  assert.equal(censoredSamples(plotted, []), 0, "the old requires: [] counted none");
});

test("Isocon: each mean says how many of its values are below detection", () => {
  const rows = [{ v: 1, lt: true }, { v: 2, lt: true }, { v: 9, lt: false }].map((r) => ({ values: { Zr: r.v }, qualifiers: r.lt ? { Zr: "<" } : {} }));
  const m = groupMeans(rows, ["Zr"], (a, s) => a.values[s], [], isBelowDetection);
  assert.equal(m.ns.Zr, 3); assert.equal(m.lts.Zr, 2); assert.equal(m.values.Zr, 4);
  assert.equal(groupMeans(rows, ["Zr"], (a, s) => a.values[s]).lts.Zr, 0, "without the helper: none counted, as before");
  const t = src("components/IsoconTool.jsx");
  assert.match(t, /tr\("\{n\} <DL", \{ n: r\.precursorLt \}\)/);
});

test("Correlation: detected pairs only leaves a '<' out; the tooltip counts the pairs holding one", () => {
  // Li-Sn: 'both below detection' in 40 host-rock samples, unrelated where detected
  const rows = [];
  for (let i = 0; i < 40; i++) rows.push({ Li: 0.005, Sn: 2, lt: true });
  for (let i = 0; i < 30; i++) rows.push({ Li: 0.5 + ((i * 7) % 30) / 10, Sn: 5 + ((i * 13) % 30), lt: false });
  const all = correlationMatrix({ Li: rows.map((r) => r.Li), Sn: rows.map((r) => r.Sn) }, ["Li", "Sn"], "spearman");
  const det = correlationMatrix({ Li: rows.map((r) => (r.lt ? null : r.Li)), Sn: rows.map((r) => (r.lt ? null : r.Sn)) }, ["Li", "Sn"], "spearman");
  assert.ok(all.Li.Sn.r > 0.6, `all pairs ${all.Li.Sn.r}`);
  assert.ok(Math.abs(det.Li.Sn.r) < 0.4, `detected pairs ${det.Li.Sn.r}`);
  assert.equal(det.Li.Sn.n, 30);
  const c = src("components/CorrelationMatrix.jsx");
  assert.match(c, /detectedOnly && caches\.lt\[s\]\[i\] \? null : valueIn/);
  assert.match(c, /tr\("Detected pairs only"\)/);
  assert.match(c, /, \{k\} of them with a below-detection value/);
});

test("calculated elements: '<' kept when every operand is '<'; a ratio with a '<' operand gets no value", () => {
  const els = [{ symbol: "Li", unit: "%" }, { symbol: "Nb", unit: "ppm" }, { symbol: "Ta", unit: "ppm" }];
  const assays = [
    { hole_id: "H", from: 0, to: 1, values: { Li: 0.005, Nb: 5, Ta: 1 }, qualifiers: { Li: "<", Nb: "<" } },
    { hole_id: "H", from: 1, to: 2, values: { Li: 1.2, Nb: 60, Ta: 20 }, qualifiers: {} },
  ];
  assert.deepEqual(operandsOf("Nb/Ta", ["Nb", "Ta", "N"]), ["Nb", "Ta"]);
  const li2o = addCalculatedElement(assays, els, "Li2O", "Li*2.1527", "%");
  assert.equal(li2o.assays[0].qualifiers.Li2O, "<");
  assert.equal(li2o.assays[1].qualifiers?.Li2O, undefined);
  assert.equal(li2o.flaggedLt, 1);
  const nbta = addCalculatedElement(assays, els, "NbTa", "Nb/Ta");
  assert.equal(nbta.assays[0].values.NbTa, undefined, "Nb '<': no ratio");
  assert.equal(nbta.assays[1].values.NbTa, 3);
  assert.equal(nbta.leftBdl, 1); assert.equal(nbta.computed, 1);
  const sum = addCalculatedElement(assays, els, "NbTa_sum", "Nb+Ta");
  assert.equal(sum.assays[0].values.NbTa_sum, 6, "a sum with one detected operand keeps its value");
  assert.equal(sum.assays[0].qualifiers?.NbTa_sum, undefined, "and is not '<'");
  // a surface sample keeps the flag in its bdl list
  const surf = addCalculatedElement([{ values: { Li: 0.005 }, bdl: ["Li"] }], [{ symbol: "Li", unit: "%" }], "Li2O", "Li*2.1527", "%");
  assert.deepEqual(surf.assays[0].bdl, ["Li", "Li2O"]);
  const g = src("modules/GeochemModule.jsx");
  assert.equal((g.match(/r\.leftBdl \? tr\("; \{n\} left out: a ratio with a below-detection operand is not a value"/g) || []).length, 2);
});

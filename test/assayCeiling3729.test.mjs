// TASKS.csv #3729 (Scottie Gold review) — capped upper limits passed unnoticed: Fe 15 % on 164 rows (the column's commonest value), As 10,000 ppm
// x 33, S 10 % x 31. The twin of the floor check at the top: said at import and in Grade statistics, which can mark them '>'. Synthetic values.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { censoringCeiling, fileCeiling, markCeiling, isRoundLimit } from "../src/lib/qaqc.js";
import { assayImportFindings } from "../src/lib/assayImportFindings.js";

let seed = 7;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

test("a round maximum held by many results is a ceiling; a natural top is not", () => {
  const fe = [...Array.from({ length: 800 }, () => +(rnd() * 14.9).toFixed(2)), ...Array(164).fill(15)];
  assert.deepEqual(censoringCeiling(fe), { ceiling: 15, n: 164, next: censoringCeiling(fe).next });
  const as = [...Array.from({ length: 500 }, () => Math.round(rnd() * 9000)), ...Array(33).fill(10000)];
  assert.equal(censoringCeiling(as).ceiling, 10000);
  assert.equal(censoringCeiling(as).n, 33);
  const lognormal = Array.from({ length: 5000 }, () => +Math.exp((rnd() + rnd() + rnd() - 1.5) * 3).toFixed(3));
  assert.equal(censoringCeiling(lognormal), null, "a skewed grade's top is one result");
  assert.equal(censoringCeiling([1, 2, 3, 10, 10, 10, 10]), null, "four is not yet more than a handful");
  assert.equal(censoringCeiling([1, 2, 14.83, 14.83, 14.83, 14.83, 14.83]), null, "14.83 is not a round limit");
  assert.equal(censoringCeiling([1, 9, 9, 9, 9, 9, 9, 10, 10, 10, 10, 10]), null, "the next value down holds as many: a coarse reporting step, not a cap");
  assert.ok(isRoundLimit(15) && isRoundLimit(10000) && isRoundLimit(2.5) && !isRoundLimit(14.83) && !isRoundLimit(0));
});

test("on the file's results: flagged ones left out; marking sets '>' on the unflagged results at the ceiling, value unchanged", () => {
  const rows = [
    ...Array.from({ length: 40 }, (_, i) => ({ hole_id: "A", from: i, to: i + 1, values: { Fe: 2 + i * 0.3 } })),
    ...Array.from({ length: 8 }, (_, i) => ({ hole_id: "B", from: i, to: i + 1, values: { Fe: 15 } })),
    { hole_id: "C", from: 0, to: 1, values: { Fe: 15 }, qualifiers: { Fe: ">" } },
  ];
  const units = { Fe: "%" };
  const c = fileCeiling(rows, "Fe", "%", units);
  assert.equal(c.ceiling, 15);
  assert.equal(c.n, 8, "the row already '>' is not counted");
  const m = markCeiling(rows, "Fe", 15, "%", units);
  assert.equal(m.n, 8);
  assert.equal(m.rows.filter((r) => r.qualifiers?.Fe === ">").length, 9);
  assert.ok(m.rows.slice(40, 48).every((r) => r.values.Fe === 15));
  assert.equal(m.rows[0], rows[0], "an untouched row is the same object");
  assert.equal(fileCeiling(m.rows, "Fe", "%", units), null, "once marked, nothing more to say");
});

test("the import's findings name each element's ceiling in its unit", () => {
  const rows = [
    ...Array.from({ length: 60 }, (_, i) => ({ hole_id: "A", from: i, to: i + 1, values: { Fe: 1 + (i % 13) * 1.07, As: 5 + i * 13, Au: 0.01 * (i + 1) } })),
    ...Array.from({ length: 12 }, (_, i) => ({ hole_id: "B", from: i, to: i + 1, values: { Fe: 15, As: 10000, Au: 0.2 } })),
  ];
  const f = assayImportFindings({ rows, elements: [{ symbol: "Fe" }, { symbol: "As" }, { symbol: "Au" }], unitOf: (s) => (s === "Fe" ? "%" : "ppm") });
  assert.deepEqual(f.ceilings.map((c) => `${c.symbol} ${c.n} ${c.ceiling} ${c.unit}`), ["Fe 12 15 %", "As 12 10000 ppm"]);
});

test("wiring: the import notice and Grade statistics' line and button", () => {
  const g = readFileSync(new URL("../src/modules/GeochemModule.jsx", import.meta.url), "utf8");
  assert.match(g, /f\.ceilings\.length \? tr\("Results on a round maximum/);
  const gs = readFileSync(new URL("../src/components/GradeStatistics.jsx", import.meta.url), "utf8");
  assert.match(gs, /fileCeiling\(statsAssays, symbol, ceilUnit, elementUnits\)/);
  assert.match(gs, /markCeiling\(surface \? store\.surfaceSamples : store\.assays, symbol, ceil\.ceiling, ceilUnit/);
  assert.match(gs, /tr\("Mark them as over the limit \('>'\)"\)/);
});

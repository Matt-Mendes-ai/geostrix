// TASKS.csv #3387 (split from #3170) — a stack's unit points: each unit walked every logged row of every hole to keep the few of its own code (150,455
// rows x 6 units on WA iron, about 0.35 s of the run's first main-thread task). The rows of each hole are now indexed by value once per log, and a
// unit reads only its codes' rows; the first logged depth of each hole is built once per log, not once per unit.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { rowsByHole, rowsByHoleValue, holeRowsOfCodes, firstFromByHole } from "../src/lib/rowsByHole.js";

let seed = 7;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const VALUES = ["HNAM", "TNAM", "ONAM", "SONAM", "SNAM", "BNAM", 7, null, "", "UNK"];
function logRows(holes, perHole) {
  const rows = [];
  for (let h = 0; h < holes; h++) {
    let d = 0;
    for (let k = 0; k < perHole; k++) { const to = d + 1 + rnd() * 9; rows.push({ hole_id: `H${h}`, from: d, to, value: VALUES[Math.floor(rnd() * VALUES.length)] }); d = to; }
  }
  rows.push(null, { hole_id: "ODD", from: "x", to: 1, value: "HNAM" }, { hole_id: null, from: 0, to: 1, value: "HNAM" });
  return rows;
}
const oldOf = (rows, hole, codes) => (rowsByHole(rows).get(hole) || []).filter((r) => codes.has(r.value));

test("a unit's rows of a hole are the old filter's, in the hole's own row order, for one code and for several (the stack's group of codes)", () => {
  const rows = logRows(60, 40);
  for (const codes of [new Set(["HNAM"]), new Set(["TNAM", "SONAM", 7]), new Set(["BNAM", "HNAM", "TNAM", "ONAM", "SONAM", "SNAM"]), new Set(["NOPE"]), new Set([null]), new Set([""]), new Set()]) {
    for (let h = 0; h < 60; h++) {
      const want = oldOf(rows, `H${h}`, codes), got = holeRowsOfCodes(rows, `H${h}`, codes);
      assert.equal(got.length, want.length);
      got.forEach((r, i) => assert.equal(r, want[i], "the same row objects, in the same order"));
    }
    assert.deepEqual(holeRowsOfCodes(rows, "NO SUCH HOLE", codes), []);
  }
  assert.deepEqual(holeRowsOfCodes(undefined, "H0", new Set(["HNAM"])), []);
  assert.deepEqual(holeRowsOfCodes(null, "H0", new Set(["HNAM"])), []);
});

test("the per-value index is kept per rows array, and a new array is indexed afresh", () => {
  const rows = logRows(5, 5);
  assert.equal(rowsByHoleValue(rows), rowsByHoleValue(rows));
  const next = rows.slice();
  assert.notEqual(rowsByHoleValue(next), rowsByHoleValue(rows));
  assert.equal(rowsByHoleValue(undefined).size, 0);
});

test("firstFromByHole is the old loop's answer, kept per rows array", () => {
  const rows = logRows(80, 30);
  const want = new Map();
  for (const r of rows || []) { if (!r) continue; const f = Number(r.from); if (r.hole_id != null && Number.isFinite(f) && !(want.get(r.hole_id) <= f)) want.set(r.hole_id, f); }
  assert.deepEqual([...firstFromByHole(rows)], [...want]);
  assert.equal(firstFromByHole(rows), firstFromByHole(rows));
  assert.equal(firstFromByHole(null).size, 0);
});

test("six units over 150,000 rows: the code index reads a fraction of what the per-unit filter reads", () => {
  const rows = []; for (let h = 0; h < 6000; h++) { let d = 0; for (let k = 0; k < 25; k++) { rows.push({ hole_id: `H${h}`, from: d, to: d + 4, value: VALUES[k % 6] }); d += 4; } }
  const units = ["HNAM", "TNAM", "ONAM", "SONAM", "SNAM", "BNAM"].map((u) => new Set([u]));
  let a = 0, b = 0;
  const t0 = performance.now();
  for (const codes of units) for (let h = 0; h < 6000; h++) a += oldOf(rows, `H${h}`, codes).length;
  const tOld = performance.now() - t0;
  const t1 = performance.now();
  for (const codes of units) for (let h = 0; h < 6000; h++) b += holeRowsOfCodes(rows, `H${h}`, codes).length;
  const tNew = performance.now() - t1;
  assert.equal(a, b);
  assert.ok(tNew < 1500 && tNew < tOld + 200, `new ${tNew.toFixed(0)} ms, old ${tOld.toFixed(0)} ms`);
});

test("wiring: the unit-points loop reads the unit's own rows (with no modelling-code assignments) and the shared first depths", () => {
  const s = readFileSync(new URL("../src/modules/viewer/modellingRuns.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(s, /import \{ rowsByHole, holeRowsOfCodes, firstFromByHole \} from "\.\.\/\.\.\/lib\/rowsByHole\.js";/);
  assert.match(s, /const firstFrom = firstFromByHole\(layers\.litho \|\| \[\]\);/);
  assert.match(s, /\(hasAssign \? rowsByHole\(layers\.litho\)\.get\(t\.hole_id\) \|\| \[\] : holeRowsOfCodes\(layers\.litho, t\.hole_id, codes\)\)\.filter\(\(r\) => !isNaN\(r\.from\)\)/);
});

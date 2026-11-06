// TASKS.csv #1391 — a 0 the import kept (a lab column's 0: below detection or not analysed) was left out of the threshold populations
// without a count; it is counted as a reported zero now, like #931's flagged ones, so Thresholds shows '(+N at 0)' and its note.
import test from "node:test";
import assert from "node:assert/strict";
import { populations } from "../src/lib/thresholds.js";

test("zeros are counted per population, not in n; negatives and blanks are not zeros", () => {
  const rows = [
    ...Array.from({ length: 30 }, (_, i) => ({ m: "stream", v: 0.002 + i * 0.001 })),
    ...Array.from({ length: 12 }, () => ({ m: "stream", v: 0 })),
    ...Array.from({ length: 20 }, (_, i) => ({ m: "soil", v: 0.01 + i * 0.01 })),
    { m: "soil", v: 0 }, { m: "soil", v: -1 }, { m: "soil", v: null },
  ];
  const pops = populations(rows, { valueOf: (r) => r.v, keyOf: (r) => r.m });
  const by = Object.fromEntries(pops.map((p) => [p.key, p]));
  assert.equal(by.stream.summary.n, 30); assert.equal(by.stream.zero, 12);
  assert.equal(by.soil.summary.n, 20); assert.equal(by.soil.zero, 1);
});

test("#931's flagged zeros (value null, zeroOf true) are still counted", () => {
  const rows = [...Array.from({ length: 15 }, (_, i) => ({ v: 1 + i })), { v: null, nd: true }, { v: null }];
  const [p] = populations(rows, { valueOf: (r) => r.v, keyOf: () => "all", zeroOf: (r) => !!r.nd });
  assert.equal(p.zero, 1); assert.equal(p.summary.n, 15);
});

// TASKS.csv #1052 — a block model's grade-tonnage table
import { test } from "node:test";
import assert from "node:assert/strict";
import { gradeTonnageTable, autoCutoffs, metalOf, blockVolume } from "../src/lib/gradeTonnage.js";

const cells = [0.1, 0.5, 1, 2, 4].map((value) => ({ value, dx: 10, dy: 10, dz: 5 })); // 500 m3 each

test("#1052 volume, volume-weighted mean grade, tonnes and grams at each cutoff", () => {
  const t = gradeTonnageTable(cells, { cutoffs: [1, 0], density: 2.7, unit: "g/t" });
  assert.deepEqual(t.map((r) => r.cutoff), [0, 1]);
  assert.deepEqual([t[0].blocks, t[0].volumeM3, t[0].tonnes], [5, 2500, 6750]);
  assert.ok(Math.abs(t[0].meanGrade - 1.52) < 1e-12);
  assert.deepEqual([t[1].blocks, t[1].volumeM3], [3, 1500]);
  assert.ok(Math.abs(t[1].meanGrade - 7 / 3) < 1e-12);
  assert.ok(Math.abs(t[1].metal - 4050 * (7 / 3)) < 1e-6); // tonnes x g/t = grams
});

test("#1052 no density: volumes only; merged blocks count at their coverage; % metal in tonnes", () => {
  const t = gradeTonnageTable([{ value: 1, dx: 10, dy: 10, dz: 10, coverage: 0.25 }], { cutoffs: [0], unit: "%" });
  assert.equal(t[0].volumeM3, 250);
  assert.equal(t[0].tonnes, null);
  assert.equal(blockVolume({ dx: 2, dy: 2, dz: 2 }), 8);
  assert.deepEqual(metalOf("%"), { factor: 0.01, unit: "t" });
  assert.equal(metalOf("ohm.m"), null);
});

test("#1052 auto cutoffs start at 0 and rise through the quantiles", () => {
  const c = autoCutoffs(cells);
  assert.equal(c[0], 0);
  assert.ok(c.every((v, i) => i === 0 || v > c[i - 1]));
});

// TASKS.csv #1659 (review #1646, Kodiak) — a DCIP3D chargeability's -1 air is masked like the 1e-8 air of a resistivity
import test from "node:test";
import assert from "node:assert/strict";
import { maskAirCells } from "../src/lib/voxel.js";

test("-1 filling a fifth of a chargeability model, with no other negative, is air", () => {
  const v = Array.from({ length: 1000 }, (_, i) => (i < 210 ? -1 : 3 + (i % 50) / 10));
  const r = maskAirCells(v);
  assert.equal(r.count, 210);
  assert.equal(r.value, -1);
  assert.ok(v.slice(0, 210).every((x) => x !== -1), "masked");
  assert.ok(v.slice(210).every((x) => x >= 3), "data untouched");
});

test("a model that really holds negatives (susceptibility) is left alone; the 1e-8 rule is unchanged", () => {
  const sus = Array.from({ length: 1000 }, (_, i) => (i < 200 ? -0.002 : (i % 7) * 0.001 - 0.001));
  assert.equal(maskAirCells(sus).count, 0);
  const res = Array.from({ length: 1000 }, (_, i) => (i < 100 ? 1e-8 : 500 + i));
  assert.equal(maskAirCells(res).count, 100);
  const few = Array.from({ length: 1000 }, (_, i) => (i < 10 ? -1 : 5));
  assert.equal(maskAirCells(few).count, 0, "under 5 %: not a flag");
});

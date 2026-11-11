// TASKS.csv #2116 — the dump on a cell of a couple of metres (not 1.14 m), with the volume kept by measuring to the footprint's true edges
import test from "node:test";
import assert from "node:assert/strict";
import { dumpFromFootprint } from "../src/lib/dumpDesign.js";

test("the review's 1.68 ha footprint (140 x 120 m), 37°, 32.6 m high: a ~2 m cell, a few ten thousand faces, the volume of a frustum", () => {
  const fp = [[0, 0, 0], [140, 0, 0], [140, 120, 0], [0, 120, 0]];
  const r = dumpFromFootprint(fp, { crestZ: 32.6, reposeDeg: 37, flatZ: 0 });
  assert.ok(r.cell >= 2 && r.cell < 2.5, String(r.cell));
  assert.ok(r.indices.length / 3 < 40000, String(r.indices.length / 3)); // was 133,216
  // by hand: the area at distance d from a 140 x 120 rectangle is (140 + 2d)(120 + 2d) - (4 - pi) d^2, h = 32.6, reach = h / tan 37
  const h = 32.6, reach = h / Math.tan((37 * Math.PI) / 180); let v = 0; const n = 4000;
  for (let k = 0; k < n; k++) { const d = ((k + 0.5) / n) * reach; v += ((140 + 2 * d) * (120 + 2 * d) - (4 - Math.PI) * d * d) * Math.tan((37 * Math.PI) / 180) * (reach / n); }
  assert.ok(Math.abs(r.volume - v) < 0.01 * v, `${r.volume} vs ${v}`);
});

// TASKS.csv #1740 — the share of an indicator envelope farther than a distance from every sample point
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { farFromSamples } from "../src/lib/haloSupport.js";

test("#1740 node share far from the samples", () => {
  // a 10 x 1 x 1 row of nodes 10 m apart, all inside; one sample at x = 0: nodes 0..5 are within 50 m
  const values = new Float32Array(10).fill(1);
  const r = farFromSamples(values, 10, 1, 1, { x: 0, y: 0, z: 0 }, { dx: 10, dy: 10, dz: 10 }, 0.5, [{ x: 0, y: 0, z: 0 }], 50);
  assert.deepEqual([r.inside, r.far], [10, 4]);
  assert.equal(r.share, 0.4);
  // nodes outside the envelope are not counted; a warp maps the grid frame to the real one
  values[9] = 0;
  const w = farFromSamples(values, 10, 1, 1, { x: 0, y: 0, z: 0 }, { dx: 10, dy: 10, dz: 10 }, 0.5, [{ x: 0, y: 0, z: 0 }], 50, { toReal: (p) => ({ x: p.x / 2, y: p.y, z: p.z }) });
  assert.deepEqual([w.inside, w.far], [9, 0]);
  assert.equal(farFromSamples(new Float32Array(4), 4, 1, 1, { x: 0, y: 0, z: 0 }, { dx: 1, dy: 1, dz: 1 }, 0.5, [], 5).share, 0);
});

test("#1740 the halo run reports it", () => {
  const s = readFileSync(new URL("../src/modules/viewer/modellingRuns.js", import.meta.url), "utf8");
  assert.match(s, /farFromSamples\(altCap\.values, grid\.nx, grid\.ny, grid\.nz, grid\.origin, grid\.cellSize, iso, pts, Math\.max\(50, cell\)/);
  assert.match(s, /farFromLogs: \{ share: \+farLogs\.share\.toFixed\(3\), beyondM: farLogs\.dist \}/);
});

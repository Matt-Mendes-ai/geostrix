// TASKS.csv #3313 (review Galore Creek) — with no terrain the pit stands on ground interpolated between far-flung collars, unsaid; #3315 —
// 'deep for an open pit' was measured from the project's highest collar, 6.4 km away on a property with 1,140 m of relief.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { oreDepthBelowCollars, undergroundOreVerdict, farFromCollars, runPitShell } from "../src/lib/pitShell.js";

// ore blocks at RL 770-780 under ground at ~790 m; four collars over the body at 790 m, one 6.4 km away at 1,596 m
const ore = [];
for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) ore.push({ x: 1000 + i * 25, y: 1000 + j * 25, z: 772, value: 5000 });
const near = [[990, 990], [1090, 990], [990, 1090], [1090, 1090]].map(([x, y], k) => ({ hole_id: `N${k}`, x, y, z: 790, azimuth: 0, dip: 90, length: 300 }));
const far = { hole_id: "FAR", x: 7400, y: 1000, z: 1596, azimuth: 0, dip: 90, length: 300 };

test("#3315 the ore is measured from the ground over it, not from the highest collar of the project", () => {
  const d = oreDepthBelowCollars(ore, 2000, [...near, far], []);
  assert.equal(d.from, "collars");
  assert.ok(d.max < 25, JSON.stringify(d));
  assert.equal(undergroundOreVerdict(d), false, "no 'deep for an open pit'");
  assert.equal(d.top, 1596, "the highest collar is still reported");
  const t = oreDepthBelowCollars(ore, 2000, [...near, far], [], () => 800);
  assert.equal(t.from, "terrain"); assert.ok(Math.abs(t.median - 28) < 1e-9);
  const n = readFileSync(new URL("../src/components/UndergroundOreNote.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(n, /below the ground over them \(\{median\} m at the median; \{src\}\)/);
  assert.match(readFileSync(new URL("../src/components/PitShellPane.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n"), /res\.maxDepth > 500 && !pitWideForDepth\(res\)/);
});

test("#3313 the pit's waste under ground far from any collar is measured and said", () => {
  // a 10 x 10 x 2 grid of 50 m blocks of waste, mined everywhere; one collar at a corner
  const grid = { nx: 10, ny: 10, nz: 2, x0: 0, y0: 0, dx: 50, dy: 50, ground: new Float64Array(100).map((_, c) => 700 + (c % 10) * 10), rockT: new Float32Array(200).fill(100), oreT: new Float32Array(200) };
  const mined = new Uint8Array(200).fill(1);
  const r = farFromCollars(grid, mined, [{ x: 0, y: 0 }]);
  assert.equal(r.reachM, 300, "one collar: the 300 m floor");
  // columns farther than 300 m from (0, 0): centre distance over 300
  let want = 0; for (let j = 0; j < 10; j++) for (let i = 0; i < 10; i++) if (Math.hypot((i + 0.5) * 50, (j + 0.5) * 50) > 300) want++;
  assert.equal(r.cols, want); assert.equal(r.colsAll, 100);
  assert.ok(Math.abs(r.wasteShare - want / 100) < 1e-9);
  assert.equal(farFromCollars(grid, mined, []), null);
  const p = readFileSync(new URL("../src/components/PitShellPane.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(p, /res\.farGround\?\.cols > 0 && <div style=\{warn\}>/);
  assert.match(readFileSync(new URL("../src/lib/pitShell.js", import.meta.url), "utf8").replace(/\r\n/g, "\n"), /const farGround = groundSource === "collars" \? farFromCollars\(grid, solve\.mined, collars\) : null;/);
});

test("#3313 a run on the collar ground carries farGround", () => {
  const cells = [];
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) for (let k = 0; k < 2; k++) cells.push({ x: 1000 + i * 25 + 12.5, y: 1000 + j * 25 + 12.5, z: 760 + k * 25 + 12.5, dx: 25, dy: 25, dz: 25, value: 20000 });
  const r = runPitShell({ cells, unit: "ppm", element: "Cu", price: 4, priceUnit: "lb", recovery: 88, miningCost: 2.5, processingCost: 10, density: 2.7, slopeDeg: 45, revenueFactor: 1, size: null }, { collars: [...near, far] });
  assert.equal(r.groundSource, "collars");
  assert.ok(r.farGround && r.farGround.colsAll > 0, JSON.stringify(r.farGround));
});

// TASKS.csv #1840 (review #1646, Kodiak) — a block model's range as ONE target body: the shell counts the range's separate bodies on its
// lattice and, with largestOnly, keeps only the biggest
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { voxelShell, latticeBodies } from "../src/lib/voxelShell.js";

// 16 x 10 x 10 blocks of 10 m: a big "high" (radius 25 m around x 50) and a small one (radius 12 m around x 130), value 100 inside
function twoHighs() {
  const cells = [];
  for (let k = 0; k < 10; k++) for (let j = 0; j < 10; j++) for (let i = 0; i < 16; i++) {
    const x = 5 + i * 10, y = 5 + j * 10, z = 5 + k * 10;
    const big = Math.hypot(x - 50, y - 50, z - 50) <= 25, small = Math.hypot(x - 130, y - 50, z - 50) <= 12;
    cells.push({ x, y, z, dx: 10, dy: 10, dz: 10, value: big || small ? 100 : 1 });
  }
  return { cells, min: 1, max: 100 };
}

test("#1840 latticeBodies joins nodes across faces, edges and corners; separate groups are separate bodies", () => {
  const f = new Float32Array(4 * 4 * 4).fill(-1);
  const at = (i, j, k) => i + 4 * (j + 4 * k);
  f[at(0, 0, 0)] = 1; f[at(1, 1, 1)] = 1; // corner neighbours: one body
  f[at(3, 3, 3)] = 0; f[at(3, 3, 2)] = 2; f[at(3, 2, 2)] = 2; // a second body of 3 (a node exactly on the bound is inside)
  const B = latticeBodies(f, 4, 4, 4);
  assert.deepEqual(B.sizes, [2, 3]);
  assert.equal(B.largest, 1);
  assert.equal(B.label[at(2, 2, 2)], -1);
});

test("#1840 two highs: all bodies by default (said by bodies), only the big one with largestOnly", () => {
  const all = voxelShell(twoHighs(), { lo: 50 });
  assert.equal(all.bodies, 2);
  assert.equal(all.keptShare, 1);
  const one = voxelShell(twoHighs(), { lo: 50, largestOnly: true });
  assert.equal(one.bodies, 2);
  assert.ok(one.keptShare > 0.8 && one.keptShare < 1, String(one.keptShare));
  assert.ok(one.volumeM3 < all.volumeM3, `${one.volumeM3} < ${all.volumeM3}`);
  const xs = []; for (let i = 0; i < one.positions.length; i += 3) xs.push(one.positions[i]);
  assert.ok(Math.max(...xs) < 90, "no vertex of the small high at x 118-142 is left");
  assert.equal(one.closingVertices, 0);
  // a single body: largestOnly changes nothing
  const m = twoHighs(); m.cells.forEach((c) => { if (c.x > 100) c.value = 1; });
  const single = voxelShell(m, { lo: 50, largestOnly: true });
  assert.deepEqual([single.bodies, single.keptShare], [1, 1]);
});

test("#1840 the range row offers Largest body only and both routes pass it to the shell", () => {
  const parts = readFileSync(new URL("../src/modules/viewer/ViewerParts.jsx", import.meta.url), "utf8");
  assert.ok(parts.includes("onClick={() => onShell(model, { largestOnly })}"));
  assert.ok(parts.includes('{tr("Largest body only (in the shell)")}')); // worded since #2457
  const geo = readFileSync(new URL("../src/modules/GeophysicsModule.jsx", import.meta.url), "utf8");
  assert.ok(geo.includes("largestOnly: !!opts.largestOnly"));
  const vm = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.ok(vm.includes("voxelShell(model, { lo, hi, largestOnly })"));
  assert.ok(vm.includes("{ largestOnly: !!payload?.largestOnly }"));
});

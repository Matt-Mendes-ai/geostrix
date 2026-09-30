// TASKS.csv #324 — an adaptive (octree) model has no single grid: the export package still works, as a cell
// list + UBC-GIF OcTree files + data + provenance, instead of refusing everything (run: npm test).
import test from "node:test";
import assert from "node:assert/strict";
import { buildModelExportZip } from "../src/lib/modelExport.js";
import { readZipEntries } from "../src/lib/shapefile.js";
import { ubcOctreeFromCells } from "../src/lib/ubcOctree.js";

test("#324 adaptive model export: cells CSV + UBC OcTree + provenance, no tensor UBC/OMF/slices; a regular model is unchanged", async () => {
  // four 25 m cells over one 50 m cell below them: an octree-like pair of levels
  const fine = [[12.5, 12.5], [37.5, 12.5], [12.5, 37.5], [37.5, 37.5]].map(([x, y], i) => ({ x: 460000 + x, y: 6250000 + y, z: 987.5, dx: 25, dy: 25, dz: 25, value: 0.001 * (i + 1), support: 0.9 }));
  const cells = [...fine, { x: 460025, y: 6250025, z: 950, dx: 50, dy: 50, dz: 50, value: 0.02, support: 0.4 }];
  const r = await buildModelExportZip({ name: "Octree test", cells, source: "simpeg", params: { mesh: { type: "octree" } } }, 3156);
  assert.ok(!r.error, r.error);
  assert.deepEqual(r.files.map((f) => f.replace(/^Octree_test/, "")), ["_cells.csv", "_octree.msh", "_octree.mod", "_octree_support.mod", "provenance.txt"]);
  const e = await readZipEntries(r.zip, /./);
  const csv = new TextDecoder().decode(e["Octree_test_cells.csv"]).trim().split("\n");
  assert.equal(csv[0], "x,y,z,dx,dy,dz,value,support");
  assert.deepEqual(csv.slice(1).map((l) => l.split(",").map(Number)), cells.map((c) => [c.x, c.y, c.z, c.dx, c.dy, c.dz, c.value, c.support]));
  const prov = new TextDecoder().decode(e["provenance.txt"]);
  assert.match(prov, /Mesh: adaptive \(octree\), 5 cells of 25 \/ 50 m, x 460000\.00-460050\.00/);
  assert.match(prov, /UBC OcTree \(_octree\.msh \/ \.mod\)/);
  assert.match(prov, /no UBC tensor \.msh\/\.mod, OMF or depth-slice files/);
  // a regular model still gets the full package
  const reg = await buildModelExportZip({ name: "Regular", cells: fine, source: "simpeg" }, 3156);
  assert.ok(reg.files.includes("Regular.msh") && reg.files.includes("Regular.mod") && reg.files.includes("Regular.omf"));
});

// parse the writer's output back into leaves
const parse = (r) => {
  const L = r.meshText.trim().split("\n");
  const n = Number(L[3]);
  const leaves = L.slice(4).map((l) => l.split(" ").map(Number));
  const vals = r.modelText.trim().split("\n").map(Number);
  return { N: L[0].split(" ").map(Number), corner: L[1].split(" ").map(Number), h: L[2].split(" ").map(Number), n, leaves, vals };
};

test("#324 UBC OcTree writer: header, UBC order (k, j, i), no-data fill, tiles the cube, 2:1 balanced", () => {
  // one 10 m cell in the corner of an otherwise empty 80 m block, plus an 80 m cell beside it: forces balancing
  const cells = [
    { x: 5, y: 5, z: 95, dx: 10, dy: 10, dz: 10, value: 1 },
    { x: 120, y: 40, z: 60, dx: 80, dy: 80, dz: 80, value: 2 },
  ];
  const r = ubcOctreeFromCells(cells);
  assert.ok(!r.error, r.error);
  const p = parse(r);
  assert.deepEqual(p.N, [16, 16, 16]); // extent 160 m / 10 m -> 16 (power of two)
  assert.deepEqual(p.corner, [0, 0, 100]); // top south-west
  assert.deepEqual(p.h, [10, 10, 10]);
  assert.equal(p.leaves.length, p.n);
  assert.equal(p.vals.length, p.n);
  // UBC order
  for (let a = 1; a < p.leaves.length; a++) { const [i0, j0, k0] = p.leaves[a - 1], [i1, j1, k1] = p.leaves[a]; assert.ok(k0 < k1 || (k0 === k1 && (j0 < j1 || (j0 === j1 && i0 < i1)))); }
  // tiles the 16^3 cube exactly
  assert.equal(p.leaves.reduce((s, [, , , z]) => s + z ** 3, 0), 16 ** 3);
  // the two model cells are there with their values; everything else is no-data
  const find = (i, j, k, s) => p.leaves.findIndex((l) => l[0] === i && l[1] === j && l[2] === k && l[3] === s);
  assert.equal(p.vals[find(1, 1, 1, 1)], 1);          // 10 m cell: x 0-10, y 0-10, top 100 -> k 1
  assert.equal(p.vals[find(9, 1, 1, 8)], 2);          // 80 m cell: x 80-160 -> i 9, top 100 -> k 1
  assert.equal(p.vals.filter((v) => v !== -99999).length, 2);
  assert.equal(r.modelCellsSplit, 0);
  // 2:1 balance, brute force: two leaves that touch (face, edge or corner) differ by at most a factor 2
  const touch = (a, b) => [0, 1, 2].every((d) => a[d] <= b[d] + b[3] && b[d] <= a[d] + a[3]);
  for (const a of p.leaves) for (const b of p.leaves) if (a !== b && touch(a, b)) assert.ok(Math.max(a[3], b[3]) <= 2 * Math.min(a[3], b[3]), `unbalanced ${a} / ${b}`);
});

test("#324 UBC OcTree writer refuses what isn't an octree", () => {
  assert.match(ubcOctreeFromCells([{ x: 5, y: 5, z: 5, dx: 10, dy: 10, dz: 20, value: 1 }]).error, /cube cells/);
  assert.match(ubcOctreeFromCells([{ x: 5, y: 5, z: 5, dx: 10, dy: 10, dz: 10, value: 1 }, { x: 30, y: 5, z: 5, dx: 30, dy: 30, dz: 30, value: 1 }]).error, /power of two/);
  assert.match(ubcOctreeFromCells([{ x: 5, y: 5, z: 5, dx: 10, dy: 10, dz: 10, value: 1 }, { x: 25, y: 10, z: 10, dx: 20, dy: 20, dz: 20, value: 1 }]).error, /not aligned|octree/);
  assert.match(ubcOctreeFromCells([]).error, /no cells/);
});

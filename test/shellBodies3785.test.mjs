// TASKS.csv #3785 — a tight shell said against its runs at the cut-off: along the holes, and the bodies one hole holds (lib/viewer/shellBodies.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { holeRuns, bodyHoles, medianOf } from "../src/lib/viewer/shellBodies.js";
import { shellPost } from "../src/lib/viewer/shellPost.js";

// a 20 x 20 x 40 lattice at 1 m; the field is 1 inside a slab x in [5, 14] (10 m thick) and 0 elsewhere
const grid = { origin: { x: 0, y: 0, z: 0 }, cellSize: { dx: 1, dy: 1, dz: 1 }, nx: 20, ny: 20, nz: 40 };
const slab = (x0 = 5, x1 = 14, extra = null) => {
  const f = new Float64Array(grid.nx * grid.ny * grid.nz);
  for (let k = 0; k < grid.nz; k++) for (let j = 0; j < grid.ny; j++) for (let i = 0; i < grid.nx; i++) f[i + grid.nx * (j + grid.ny * k)] = (i >= x0 && i <= x1) || extra?.(i, j, k) ? 1 : 0;
  return f;
};
// a hole along x at (y, z), 2 m composites; the grade is high only in a 2 m run at x = 9-11
const hole = (id, y, z) => Array.from({ length: 10 }, (_, n) => ({ hole_id: id, x: 2 * n + 1, y, z, from: 2 * n, to: 2 * n + 2, value: n === 4 || n === 5 ? 5 : 0.1 }));

test("#3785 — along the holes: the shell's runs against the runs at the cut-off", () => {
  const pts = [...hole("A", 5, 10), ...hole("B", 12, 20)];
  const r = holeRuns(pts, grid, slab(), 0.5, 3);
  // composites at x = 5, 7, 9, 11, 13 lie in the slab: a 10 m crossing per hole; the run at the cut-off is 4 m (two 2 m composites)
  assert.deepEqual([...r.insideRuns], [10, 10]);
  assert.deepEqual([...r.atRuns], [4, 4]);
  assert.equal(r.insideM, 20);
  assert.equal(r.atM, 8);
  assert.equal(medianOf([r.insideRuns, Float64Array.from([2])]), 10);
  assert.equal(medianOf([]), null);
});

test("#3785 — the bodies: a part whose composites at the cut-off come from one hole is counted, with its volume", () => {
  // the slab (two holes' composites at the cut-off) and a separate blob at x 17-19, y 0-4, z 0-4 holding one hole's
  const f = slab(5, 14, (i, j, k) => i >= 17 && j <= 4 && k <= 4);
  const at = [{ x: 9, y: 5, z: 10, hole_id: "A" }, { x: 9, y: 12, z: 20, hole_id: "B" }, { x: 18, y: 2, z: 2, hole_id: "C" }];
  const b = bodyHoles(f, grid, 0.5, at);
  assert.equal(b.bodies, 2);
  assert.equal(b.oneHole.bodies, 1);
  assert.equal(b.oneHole.nodes, 3 * 5 * 5);
  assert.deepEqual(b.largestOneHole, { nodes: 75, hole: "C" });
  assert.equal(b.nodes, 10 * 20 * 40 + 75);
});

test("#3785 — the worker's post says it when asked (bodies), and not otherwise", () => {
  const values = slab();
  const g = { ...grid, values };
  const pts = [...hole("A", 5, 10), ...hole("B", 12, 20)];
  const at = pts.filter((p) => p.value >= 3);
  const r = shellPost(g, { iso: 0.5, closeOutside: true, inShellPoints: at, bodies: { runPoints: pts, atPoints: at, cutoff: 3, farDist: 3 } });
  assert.deepEqual([...r.bodies.runs.insideRuns], [10, 10]);
  assert.equal(r.bodies.parts.bodies, 1);
  assert.equal(r.bodies.parts.oneHole.bodies, 0);
  assert.ok(r.bodies.farAt && r.bodies.farAt.inside > 0 && r.bodies.farAt.far > 0, "most of a 10 m slab is beyond 3 m of the two runs");
  assert.equal(shellPost(g, { iso: 0.5, closeOutside: true, inShellPoints: at }).bodies, undefined);
});

test("#3785 — the wiring: the shell asks the worker and says the runs, the far share from the composites at the cut-off and the one-hole bodies", () => {
  const s = readFileSync(new URL("../src/modules/viewer/modellingRuns.js", import.meta.url), "utf8");
  assert.match(s, /bodies: \{ runPoints: boxAll\(bi\)\.map/);
  assert.match(s, /along the holes: it runs \{inside\} m at a time \(the median of \{ni\} crossings\) where the composites at or above \{cutoff\} \{unit\} run \{at\} m/);
  assert.match(s, /from every composite at the cut-off/);
  assert.match(s, /bodies whose composites at the cut-off come from one hole \(or none\)/);
  assert.match(s, /\.\.\.\(alongHoles \? \{ alongHoles \} : \{\}\), \/\/ #3785/);
});

test("#3876 (#3785) — a body only one hole holds is kept within the reach of its composites at the cut-off; a body two holes hold is untouched", async () => {
  const { trimOneHoleBodies } = await import("../src/lib/viewer/shellBodies.js");
  // the slab (two holes) and a rod at x 17-19, y 0-2, z 0-39 holding one hole's composite at its foot (z 2): 40 m long
  const f = slab(5, 14, (i, j) => i >= 17 && j <= 2);
  const at = [{ x: 9, y: 5, z: 10, hole_id: "A" }, { x: 9, y: 12, z: 20, hole_id: "B" }, { x: 18, y: 1, z: 2, hole_id: "C" }];
  const r = trimOneHoleBodies(f, grid, 0.5, at, 6);
  assert.equal(r.bodies, 1);
  const inside = (v, i, j, k) => v[i + grid.nx * (j + grid.ny * k)] >= 0.5;
  for (let k = 0; k < grid.nz; k++) assert.equal(inside(r.values, 18, 1, k), Math.abs(k - 2) <= 6, `rod node z ${k}`); // within 6 m of its composite
  for (let k = 0; k < grid.nz; k++) for (let i = 5; i <= 14; i++) assert.ok(inside(r.values, i, 10, k)); // the slab: two holes, kept whole
  assert.ok(r.nodes > 0 && r.values !== f && inside(f, 18, 1, 30)); // a copy; the field given is left as it was
  assert.equal(trimOneHoleBodies(f, grid, 0.5, at, 0).values, f); // no reach: nothing done
  // the worker's post trims when asked, and says it; the runs and bodies are counted on the trimmed field
  const pts = [...hole("A", 5, 10), ...hole("B", 12, 20)], atP = pts.filter((p) => p.value >= 3).concat([{ ...at[2], value: 5, from: 0, to: 2 }]);
  const post = shellPost({ ...grid, values: f }, { iso: 0.5, closeOutside: true, inShellPoints: atP, bodies: { runPoints: pts, atPoints: atP, cutoff: 3, farDist: 12, oneHoleReachM: 6 } });
  assert.equal(post.bodies.trim.bodies, 1);
  assert.ok(post.bodies.parts.oneHole.nodes < 3 * 3 * 40);
  assert.equal(shellPost({ ...grid, values: f }, { iso: 0.5, closeOutside: true, inShellPoints: atP, bodies: { runPoints: pts, atPoints: atP, cutoff: 3, farDist: 12 } }).bodies.trim, null);
  // the run asks for half the hole spacing (>= 1.5 cells, within the search) and says what it took off
  const runs = readFileSync(new URL("../src/modules/viewer/modellingRuns.js", import.meta.url), "utf8");
  assert.match(runs, /const oneHoleReach = workerPost && gsSpacing > 0 \? Math\.round\(Math\.min\(searchInGrid, Math\.max\(gsSpacing \/ 2, 1\.5 \*/);
  assert.match(runs, /oneHoleReachM: oneHoleReach \}, \/\/ #3785; oneHoleReachM: #3876/);
  assert.match(runs, /\{far\}\{one\}\{trimmed\}\{cell\}/);
});

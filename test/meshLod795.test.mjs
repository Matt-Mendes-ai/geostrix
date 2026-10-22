// TASKS.csv #795 — the drawing copy of a big mesh: far fewer triangles over the same vertices, within the error bound,
// the open edge kept, small meshes left alone
import test from "node:test";
import assert from "node:assert/strict";
import { lodPlan, simplifyIndex, LOD_MIN_TRIANGLES } from "../src/lib/meshLod.js";

// a 401 x 401 node surface over 1 km (320,000 triangles), gently rolling
function grid(n = 401, size = 1000) {
  const pos = new Float32Array(n * n * 3), idx = new Uint32Array((n - 1) * (n - 1) * 6);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const k = (j * n + i) * 3, x = (i / (n - 1)) * size, y = (j / (n - 1)) * size; pos[k] = x; pos[k + 1] = 20 * Math.sin(x / 150) * Math.cos(y / 200); pos[k + 2] = y; }
  let t = 0;
  for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) { const a = j * n + i, b = a + 1, c = a + n, d = c + 1; idx.set([a, c, b, b, c, d], t); t += 6; }
  return { pos, idx, n };
}

test("#795 only big meshes get a drawing copy", () => {
  assert.equal(lodPlan(LOD_MIN_TRIANGLES), null);
  assert.ok(lodPlan(LOD_MIN_TRIANGLES + 1).targetTris > 0);
});

test("#795 a 320,000-triangle surface drawn with <= 100,000, every vertex used is an original one, the edge kept", async () => {
  const { pos, idx, n } = grid();
  const r = await simplifyIndex(pos, idx, { targetTris: 100000, maxError: 0.001 });
  assert.ok(r.triangles <= 100000 && r.triangles > 1000, `${r.triangles} triangles`);
  assert.ok(r.error <= 0.001 + 1e-9, `error ${r.error}`);
  const used = new Set(r.index);
  for (const v of used) assert.ok(v < n * n);
  // border nodes are locked: all four corners and every node on the edges that the original used stay in use
  for (const v of [0, n - 1, n * (n - 1), n * n - 1]) assert.ok(used.has(v), `corner ${v}`);
  let edge = 0;
  for (let i = 0; i < n; i++) if (used.has(i)) edge++;
  assert.equal(edge, n, "the whole first edge row is kept");
});

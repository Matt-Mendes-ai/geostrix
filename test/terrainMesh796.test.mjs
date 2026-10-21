// TASKS.csv #796 — the adaptive (RTIN) terrain mesh: fewer triangles where the ground is simple, never a crack, the
// grid's edges and no-data holes exactly where the full mesh puts them, and within its tolerance of every node.
import test from "node:test";
import assert from "node:assert/strict";
import { buildAdaptiveTerrain } from "../src/lib/terrainMesh.js";

const grid = (W, H, f) => { const e = new Float32Array(W * H); for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) e[j * W + i] = f(i, j); return e; };
// area covered (grid units) and the open edges of the mesh
function inspect(W, m) {
  let area = 0;
  const edges = new Map();
  const xy = (k) => { const v = m.vertexIds[k]; return [v % W, Math.floor(v / W)]; };
  for (let t = 0; t < m.triangles; t++) {
    const ks = [m.indices[3 * t], m.indices[3 * t + 1], m.indices[3 * t + 2]];
    const [[ax, ay], [bx, by], [cx, cy]] = ks.map(xy);
    const cross = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    assert.ok(cross < 0, "every triangle wound like the full mesh");
    area += -cross / 2;
    for (let s = 0; s < 3; s++) {
      const p = m.vertexIds[ks[s]], q = m.vertexIds[ks[(s + 1) % 3]];
      const key = p < q ? `${p},${q}` : `${q},${p}`;
      edges.set(key, (edges.get(key) || 0) + 1);
    }
  }
  return { area, edges };
}
// a T-junction (a crack) shows as an open edge that is not on the outline: walk every open edge's nodes
function openEdgesOnOutline(W, H, edges, onOutline) {
  for (const [key, n] of edges) {
    if (n === 2) continue;
    assert.equal(n, 1, "no edge shared by more than two triangles");
    const [p, q] = key.split(",").map(Number);
    if (!onOutline(p % W, Math.floor(p / W), q % W, Math.floor(q / W))) return false;
  }
  return true;
}

test("#796 a plane collapses to a handful of triangles, covering the whole grid", () => {
  const W = 257, H = 257, m = buildAdaptiveTerrain(W, H, grid(W, H, (i, j) => 100 + 0.5 * i - 0.2 * j));
  assert.ok(m.triangles <= 8, `${m.triangles} triangles`);
  const { area } = inspect(W, m);
  assert.equal(area, (W - 1) * (H - 1));
});

test("#796 rough ground: about the tolerance from every node, crack-free, far fewer triangles than the full grid", () => {
  const W = 513, H = 300;
  const f = (i, j) => 800 + 120 * Math.sin(i / 40) * Math.cos(j / 25) + 30 * Math.sin(i / 7 + j / 11) + (i > 200 && i < 260 && j > 100 && j < 140 ? 60 : 0);
  const el = grid(W, H, f);
  const m = buildAdaptiveTerrain(W, H, el, null, { maxTriangles: 60000 });
  assert.ok(m.triangles <= 60000 && m.triangles > 1000, `${m.triangles} triangles at ${m.maxError} m`);
  const { area, edges } = inspect(W, m);
  assert.equal(area, (W - 1) * (H - 1), "the mesh covers the grid exactly (a non-square grid's edge is exact)");
  const edge = (ax, ay, bx, by) => (ax === bx && (ax === 0 || ax === W - 1)) || (ay === by && (ay === 0 || ay === H - 1));
  assert.ok(openEdgesOnOutline(W, H, edges, edge), "every open edge is on the grid's outline (no cracks)");
  // every node lies within maxError of the mesh: interpolate each triangle at the nodes inside it
  let worst = 0;
  const xy = (k) => { const v = m.vertexIds[k]; return [v % W, Math.floor(v / W), el[v]]; };
  for (let t = 0; t < m.triangles; t++) {
    const [[ax, ay, az], [bx, by, bz], [cx, cy, cz]] = [0, 1, 2].map((s) => xy(m.indices[3 * t + s]));
    const d = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    for (let y = Math.min(ay, by, cy); y <= Math.max(ay, by, cy); y++) for (let x = Math.min(ax, bx, cx); x <= Math.max(ax, bx, cx); x++) {
      const u = ((bx - x) * (cy - y) - (by - y) * (cx - x)) / d, v = ((cx - x) * (ay - y) - (cy - y) * (ax - x)) / d, w = 1 - u - v;
      if (u < -1e-9 || v < -1e-9 || w < -1e-9) continue;
      worst = Math.max(worst, Math.abs(u * az + v * bz + w * cz - el[y * W + x]));
    }
  }
  // the tolerance is tested at each split point (Martini's measure), not at every node a leaf covers: close, not a
  // strict bound (here 1.13 m at a 1 m tolerance)
  assert.ok(worst <= 1.5 * m.maxError, `worst ${worst} vs tolerance ${m.maxError}`);
});

test("#796 no-data: a hole is cut exactly, at full resolution around it", () => {
  const W = 129, H = 129, el = grid(W, H, (i, j) => 50 + i * 0.1); // a plane: would be 2 triangles
  const hole = (k) => { const i = k % W, j = Math.floor(k / W); return i >= 40 && i <= 59 && j >= 70 && j <= 79; };
  const m = buildAdaptiveTerrain(W, H, el, hole);
  for (const v of m.vertexIds) assert.ok(!hole(v), "no triangle touches a no-data node");
  const { area } = inspect(W, m);
  // the full mesh drops every quad with a no-data corner: (20+1) x (10+1) quads; the RTIN keeps half-quads whose
  // three nodes are valid, so it drops at least the hole's own cells and at most those quads
  assert.ok(area <= 128 * 128 - 19 * 9 && area >= 128 * 128 - 21 * 11, `area ${area}`);
});

test("#796 a big terrain is saved as Float32 base64 and comes back the same; a Standard one stays a plain array", async () => {
  const { payloadFromFields, fieldsFromPayload, emptyFields } = await import("../src/lib/projectFields.js");
  const W = 513, H = 400, el = Array.from(grid(W, H, (i, j) => 1200.25 + Math.sin(i / 9) * 40 - j * 0.125));
  const live = { ...emptyFields(), terrain: { id: "t1", name: "T", bbox: [0, 0, 5120, 3990], gridW: W, gridH: H, elevations: el, noDataMask: null } };
  const saved = JSON.parse(JSON.stringify(payloadFromFields(live)));
  assert.ok(typeof saved.terrain.elevationsF32 === "string" && !saved.terrain.elevations);
  const back = fieldsFromPayload(saved, "x.geostrix.json").terrain;
  assert.ok(Array.isArray(back.elevations) && back.elevations.length === W * H && !("elevationsF32" in back));
  assert.deepEqual(back.elevations, el, "exact (the values were Float32 to begin with)");
  assert.equal(back.gridW, W);
  const small = { ...live, terrain: { ...live.terrain, gridW: 200, gridH: 150, elevations: el.slice(0, 30000) } };
  assert.ok(Array.isArray(payloadFromFields(small).terrain.elevations), "Standard grids: the file stays as before");
  assert.equal(fieldsFromPayload({ terrain: null }).terrain, null);
});

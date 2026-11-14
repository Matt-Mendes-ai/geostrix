// TASKS.csv #3365 (#3354's follow-up) — the exposed-face build: a cutoff's cells matched to the grid by walking both lists (no Map lookup per
// cell), each colour converted once, each cell's drawn faces from one pass, the discrete colour by a binary search. Same faces as before.
import test from "node:test";
import assert from "node:assert/strict";
import { rectilinearGrid, buildExposedFaces, voxelBands } from "../src/lib/voxelFaces.js";
import { makeVoxelColorResolverRGB } from "../src/lib/layers.js";

const cells = [];
for (let k = 0; k < 6; k++) for (let j = 0; j < 7; j++) for (let i = 0; i < 8; i++) cells.push({ x: i * 10 + 5, y: j * 10 + 5, z: 100 - k * 5 - 2.5, dx: 10, dy: 10, dz: 5, value: Math.round((Math.sin(i * 0.9) + Math.cos(j * 0.7) + k * 0.3) * 1000) / 1000 + 3 });
const stops = [0, 1.5, 2.5, 3, 3.5, 4.5, 6].map((v, n) => ({ value: v, color: `#${(40 * n).toString(16).padStart(2, "0")}6699` }));
const model = { colorMode: "discrete", stops };
// a face as a sortable string: its 4 corners, normal and colour
const faceSet = (m) => {
  const out = [];
  for (let f = 0; f < m.faces; f++) {
    const p = [...m.positions.slice(f * 12, f * 12 + 12)].map((v) => v.toFixed(3)), c = [...m.colors.slice(f * 12, f * 12 + 3)].map((v) => v.toFixed(5));
    out.push(`${p.join(",")}|${m.normals.slice(f * 12, f * 12 + 3).join(",")}|${c.join(",")}`);
  }
  return out.sort();
};

test("a cutoff's cells (in the grid's order) and the same cells in another order (the map) give the same faces", () => {
  const grid = rectilinearGrid(cells), opts = { boundaries: true, classOf: voxelBands(model) }, o = { x: 0, y: 0, z: 0 };
  const cut = cells.filter((c) => c.value > 2.8);
  const a = buildExposedFaces(cut, grid, o, makeVoxelColorResolverRGB(model), opts);
  const b = buildExposedFaces([...cut].reverse(), grid, o, makeVoxelColorResolverRGB(model), opts);
  assert.ok(a.faces > 0);
  assert.equal(a.faces, b.faces);
  assert.deepEqual(faceSet(a), faceSet(b));
  assert.equal(buildExposedFaces([{ ...cut[0] }], grid, o, makeVoxelColorResolverRGB(model), opts), null, "a cell not in the grid: null, as before");
});

test("the discrete colour: the last stop at or below the value, else the first (as the scan it replaced), duplicates and NaN included", () => {
  const dup = { colorMode: "discrete", stops: [{ value: 1, color: "#010101" }, { value: 2, color: "#020202" }, { value: 2, color: "#030303" }, { value: 5, color: "#050505" }] };
  const f = makeVoxelColorResolverRGB(dup);
  const scan = (v) => { const s = [...dup.stops].sort((a, b) => a.value - b.value); let c = s[0].color; for (const x of s) { if (v >= x.value) c = x.color; else break; } return c; };
  for (const v of [-3, 0.99, 1, 1.5, 2, 2.01, 4.99, 5, 99, NaN]) assert.equal("#" + f(v).map((x) => x.toString(16).padStart(2, "0")).join(""), scan(v), String(v));
});

test("a continuous model (interpolated colours) builds, each colour converted from its own value", () => {
  const grid = rectilinearGrid(cells);
  const m = buildExposedFaces(cells, grid, { x: 0, y: 0, z: 0 }, makeVoxelColorResolverRGB({ colorMode: "continuous", stops }), {});
  assert.equal(m.faces, 2 * (8 * 7 + 8 * 6 + 7 * 6), "the outer shell only");
  const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const rgb = makeVoxelColorResolverRGB({ colorMode: "continuous", stops })(cells[0].value);
  assert.ok(faceSet(m).some((s) => s.endsWith(rgb.map((v) => lin(v / 255).toFixed(5)).join(","))));
});

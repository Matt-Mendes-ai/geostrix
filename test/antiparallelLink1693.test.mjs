// TASKS.csv #1693 (review #1645, Copley) — 'Link into a solid' refused two outlines drawn on the per-hole sections of COP-23-0005 (az 316°)
// and COP-23-0003 (az 138°): 'The linked outlines do not make a valid solid (0 open edges, 1 self-crossing triangle pairs, …)'. The
// sections facing opposite ways was not the cause: the linker already winds every loop in one frame. lib/meshValidate.js's segment-triangle
// test called two COPLANAR cap triangles crossing: it took |det| < 1e-12 (absolute) as parallel, and det scales with metres cubed, so the
// rounding of world coordinates left it far above that. The parallel test is now relative to the lengths.
import { test } from "node:test";
import assert from "node:assert/strict";
import { linkOutlines } from "../src/lib/wireframe.js";
import { validateSolid, isValidSolid } from "../src/lib/meshValidate.js";

const R = Math.PI / 180;
// a section through (cx, cy) along azimuth az, and an outline on it given in its own (along, elevation) frame
const section = (cx, cy, az, name, quad) => { const ux = Math.sin(az * R), uy = Math.cos(az * R); return { section: name, ax: cx - 300 * ux, ay: cy - 300 * uy, bx: cx + 300 * ux, by: cy + 300 * uy, points: quad.map(([s, z]) => ({ x: cx + s * ux, y: cy + s * uy, z })) }; };
const shapes = [[[-40, 100], [40, 110], [50, 40], [-30, 30]], [[-60, 90], [10, 120], [70, 60], [0, 20]], [[-20, 100], [60, 100], [60, 60], [-20, 60]]];

test("4-point outlines on sections facing either way, near or far apart, shifted or not, link into valid solids (world and UTM coordinates)", () => {
  let checked = 0;
  for (const [cx, cy] of [[1000, 1000], [569931, 6678089]]) // Copley-like UTM numbers too
    for (const azB of [316, 136, 138]) for (const sh of shapes) for (const dw of [20, 60, 150]) for (const du of [-80, 0, 80]) for (const ends of ["flat", "pinch", "extend"]) {
      const wx = Math.cos(316 * R), wy = -Math.sin(316 * R), ux = Math.sin(316 * R), uy = Math.cos(316 * R), flip = azB === 316 ? 1 : -1;
      const A = section(cx, cy, 316, "A", sh), B = section(cx + dw * wx + du * ux, cy + dw * wy + du * uy, azB, "B", sh.map(([s, z]) => [flip * s * 0.9 + 5, z - 5]));
      const w = linkOutlines([A, B], { ends });
      const v = validateSolid(w.positions, w.indices);
      assert.ok(isValidSolid(v), `${cx} az ${azB} dw ${dw} du ${du} ${ends}: ${JSON.stringify({ open: v.openEdges, pairs: v.selfIntersectingPairs, wind: v.windingConflicts })}`);
      checked++;
    }
  assert.equal(checked, 486);
});

test("a mesh that really crosses itself is still caught", () => {
  // two closed tetrahedra pushed through each other, at UTM-scale coordinates
  const X = 569931, Y = 6678089;
  const tet = (ox, oy, oz) => [[ox, oy, oz], [ox + 40, oy, oz], [ox, oy + 40, oz], [ox, oy, oz + 40]];
  const P = [...tet(X, Y, 0), ...tet(X + 10, Y + 10, 10)].flat();
  const F = [[0, 2, 1], [0, 1, 3], [1, 2, 3], [0, 3, 2]];
  const I = [...F.flat(), ...F.flat().map((k) => k + 4)];
  const v = validateSolid(P, I);
  assert.ok(v.selfIntersectingPairs > 0, JSON.stringify(v));
  // and a single tetrahedron is clean
  assert.equal(validateSolid(tet(X, Y, 0).flat(), F.flat()).selfIntersectingPairs, 0);
});

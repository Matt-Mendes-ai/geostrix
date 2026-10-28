// TASKS.csv #1032 (review #1016) — "Link into a solid" with flat ends accepts outlines that are not rectangles: the caps
// have no zero-area triangles and no T-junctions with the wall strips.
import { test } from "node:test";
import assert from "node:assert/strict";
import { linkOutlines } from "../src/lib/wireframe.js";
import { validateSolid, isValidSolid } from "../src/lib/meshValidate.js";

// an outline on the section y (UTM-sized coordinates), points [along, elevation]
const outline = (y, pts) => ({ section: `N${y}`, ax: 600000, ay: 5800000 + y, bx: 601000, by: 5800000 + y, points: pts.map(([x, z]) => ({ x: 600500 + x, y: 5800000 + y, z: 900 + z })) });
const ngon = (k, r) => Array.from({ length: k }, (_, i) => [r * Math.cos((2 * Math.PI * i) / k), r * Math.sin((2 * Math.PI * i) / k)]);
let seed = 11;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const freehand = (k, r) => Array.from({ length: k }, (_, i) => { const t = (2 * Math.PI * i) / k, rr = r * (0.75 + 0.5 * rnd()); return [rr * Math.cos(t), rr * Math.sin(t)]; });

const zeroArea = (P, I) => {
  let n = 0;
  for (let t = 0; t < I.length; t += 3) {
    const [a, b, c] = [I[t], I[t + 1], I[t + 2]].map((k) => [P[3 * k], P[3 * k + 1], P[3 * k + 2]]);
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    if (Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]) < 1e-9) n++;
  }
  return n;
};

test("#1032 triangle, pentagon, hexagon and freehand prisms link with flat ends into valid solids", () => {
  const shapes = { triangle: ngon(3, 40), pentagon: ngon(5, 40), hexagon: ngon(6, 40), heptagon: ngon(7, 35), freehand: freehand(40, 50) };
  for (const [name, pts] of Object.entries(shapes)) {
    for (const ends of ["flat", "extend"]) {
      const w = linkOutlines([outline(0, pts), outline(50, pts)], { n: 128, ends });
      const v = validateSolid(w.positions, w.indices);
      assert.ok(isValidSolid(v), `${name} / ${ends}: ${JSON.stringify(v)}`);
      if (ends === "flat") assert.equal(zeroArea(w.positions, w.indices), 0, `${name}: zero-area cap triangles`);
    }
  }
});

test("#1032 the flat-ended prism keeps the outline's area x length as its volume", () => {
  const pts = ngon(6, 40), area = (3 * Math.sqrt(3) / 2) * 40 * 40;
  const w = linkOutlines([outline(0, pts), outline(50, pts)], { n: 128 });
  assert.ok(Math.abs(w.volume - area * 50) / (area * 50) < 0.005, `${w.volume} vs ${area * 50}`);
});

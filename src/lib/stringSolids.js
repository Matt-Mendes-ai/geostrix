// TASKS.csv #1877 — SOLIDS FROM DESIGN STRINGS: a closed string extruded between two elevations, or closed strings on several
// levels lofted into one body (lib/wireframe.js linkPlanOutlines, the sectional wireframer turned flat), and what a block model
// holds inside the solid. Pure: no three.js, no React.
import { earClip } from "./intrusionBody.js";
import { linkPlanOutlines } from "./wireframe.js";
import { meshVolume } from "./unitVolumes.js";
import { buildMeshQuery, isPointInsideMesh } from "./meshQuery.js";
import { dedupe, stringStats } from "./designStrings.js";
import { blockVolume } from "./gradeTonnage.js";

// a closed string's plan outline swept straight up from zBottom to zTop: flat caps (ear-clipped) and vertical walls, wound
// outward, so volumetrics and the inside query accept it. -> { positions, indices, volume } or null
export function extrudeString(vertices, zBottom, zTop) {
  const ring = dedupe((vertices || []).filter((p) => p && Number.isFinite(p[0]) && Number.isFinite(p[1]))).map((p) => [p[0], p[1]]);
  const n = ring.length;
  if (n < 3 || !(zTop > zBottom)) return null;
  const tris = earClip(ring); // [x, y] pairs; triangles come out counter-clockwise
  if (!tris.length) return null;
  const pos = [];
  ring.forEach(([x, y]) => pos.push(x, y, zBottom));
  ring.forEach(([x, y]) => pos.push(x, y, zTop));
  const idx = [];
  const ccw = stringStats(ring.map(([x, y]) => [x, y, 0]), true).ccw;
  // caps: the top faces up (CCW seen from above), the bottom faces down
  tris.forEach(([a, b, c]) => {
    const up = area2(ring[a], ring[b], ring[c]) > 0;
    const [p, q, r] = up ? [a, b, c] : [a, c, b];
    idx.push(n + p, n + q, n + r); // top
    idx.push(p, r, q); // bottom
  });
  // walls: for a CCW ring the outward normal of edge a->b is to its right
  for (let i = 0; i < n; i++) {
    const a = i, b = (i + 1) % n;
    if (ccw) idx.push(a, b, n + b, a, n + b, n + a); else idx.push(a, n + b, b, a, n + a, n + b);
  }
  const positions = Float64Array.from(pos), indices = Uint32Array.from(idx);
  let volume = meshVolume(positions, indices);
  if (volume < 0) { for (let t = 0; t < indices.length; t += 3) { const k = indices[t + 1]; indices[t + 1] = indices[t + 2]; indices[t + 2] = k; } volume = -volume; }
  return { positions, indices, volume };
}
const area2 = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]);

// closed strings on different levels lofted into one solid (each at its mean elevation, ordered bottom-up)
export function loftStrings(strings, opts = {}) {
  // TASKS.csv #1956 — a string's tie vertex (s.tieVertex, an index) rides as the point's `tie` flag, which the linker pairs with
  // the other ring's tie, as a section outline's Shift-click tie does (#874)
  const planPoints = (s) => { const seen = new Set(), out = []; s.vertices.forEach((p, i) => { if (!(Number.isFinite(p[0]) && Number.isFinite(p[1]))) return; const k = `${Math.round(p[0] * 1000)},${Math.round(p[1] * 1000)}`; if (seen.has(k)) return; seen.add(k); out.push({ x: p[0], y: p[1], ...(i === s.tieVertex ? { tie: true } : {}) }); }); return out; };
  const plans = strings.filter((s) => s.vertices.length > 2).map((s) => ({ name: s.name, rl: s.vertices.reduce((a, p) => a + p[2], 0) / s.vertices.length, points: planPoints(s), tied: s.tieVertex != null }))
    .sort((a, b) => a.rl - b.rl);
  if (plans.length < 2) return null;
  for (let i = 1; i < plans.length; i++) if (plans[i].rl - plans[i - 1].rl < 0.01) return { failed: "same-level", levels: plans.map((p) => p.rl) };
  const w = linkPlanOutlines(plans, opts);
  const positions = Float64Array.from(w.positions), indices = Uint32Array.from(w.indices);
  return { positions, indices, volume: Math.abs(meshVolume(positions, indices)), warnings: w.warnings || [], levels: plans.map((p) => p.rl), tied: plans.filter((p) => p.tied).length /* #1956 */ };
}

// what a block model holds inside a closed solid: blocks whose centre is inside, at the typed density (t/m3)
export function solidTonnage(positions, indices, cells, density, { cutoff = -Infinity } = {}) {
  const q = buildMeshQuery(positions, indices);
  if (!q) return null;
  let blocks = 0, volume = 0, tonnes = 0, metalU = 0, above = 0;
  for (const c of cells || []) {
    if (!isPointInsideMesh(q, { x: c.x, y: c.y, z: c.z })) continue;
    const vol = blockVolume(c), t = vol * density;
    blocks++; volume += vol; tonnes += t;
    if (Number.isFinite(c.value)) { metalU += t * c.value; if (c.value >= cutoff) above += t; }
  }
  return { blocks, volumeM3: volume, tonnes, meanGrade: tonnes > 0 ? metalU / tonnes : null, metalU, tonnesAboveCutoff: above };
}

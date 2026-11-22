// TASKS.csv #3580 (b) (Main: "the cut, marching cubes and counts in the worker") — after the estimate, the grade shell cut its grid at the ground,
// drew the iso-surface and counted on the WINDOW's thread: at 20 million blocks on Macpass ~8 s of frozen window (cut 2.8, marching cubes 4.2,
// beyond-drilling 0.7), ~17 s at 50 million. The worker does it now, right after the estimate, and hands back the mesh and the counts, not the
// grid (its values never cross back). The ground comes looked up once per column of the grid's lattice (groundColumns, in the window, in slices):
// a function cannot cross to a worker, and with no trend the ground depends on x and y only. A trend-warped shell keeps the window's path.
//
// shellPost(grid, post) — post: { iso, closeOutside, ground: Float64Array(nx * ny) | null, inShellPoints: [{ x, y, z, value }] (the box's samples at
// or above the iso), farPoints: [{ x, y, z }] | null, farDist, reach: { points, basis, scales, limM } | null (#3655: the shell kept within that
// reach of the composites at the cut-off, lib/viewer/shellPlane.js) } -> { positions: Float64Array (x y z per vertex, the grid's frame), faces: Uint32Array,
// closingVertices, skippedCubes, vertexSupport: Uint8Array (0 / 1 / 2, 255 = none), capped, inShell, far: { inside, far } | null, sum, n, hi }
// TASKS.csv #3673 — post.envelope (the envelope mode, lib/viewer/shellEnvelope.js): { clean: cleanField's options, targetTriangles, smooth:
// taubinSmooth's options, gradePoints: [{ x, y, z, value, length }] (the box's composites, their real grades), cutoff } -> also envelope:
// { clean (its report), coarsen, trianglesFine, grades: { n, sum, w, median, atCut, values } } (the composites inside, by their grades)
// TASKS.csv #3673 phase 2 — post.update (a domain updated with new holes, lib/viewer/domainUpdate.js): { positions (the old mesh, world),
// indices, widthM, influenceM, newPoints: [{ x, y, z }], reportPoints / refPoints: [{ x, y, z, value, length, hole_id }] (the new holes' and the
// older holes' composites), cutoff, nearM }: the grid's values (the new holes' indicator estimate) are blended with the old mesh as a prior
// before anything else -> also update: updateReport's result plus { touched }
import { marchingCubes } from "../marchingCubes.js";
import { capFieldAtColumns, sumInsideShell } from "../groundCap.js";
import { samplesInsideShell } from "../shellSupport.js";
import { farFromSamples } from "../haloSupport.js";
import { gridShape } from "../blockReach.js";
import { reachCutField } from "./shellPlane.js"; // TASKS.csv #3655
import { holeRuns, bodyHoles, trimOneHoleBodies } from "./shellBodies.js"; // TASKS.csv #3785; trimOneHoleBodies: #3876
import { cleanField, coarsenFactor, coarsenField, taubinSmooth } from "./shellEnvelope.js"; // TASKS.csv #3673
import { meshInsideMask, meshInsideTester, signedDistance, priorField, blendWithPrior, updateReport } from "./domainUpdate.js"; // TASKS.csv #3673 phase 2

// TASKS.csv #3932 batch 3 — the shell's own cells: the nodes at or above the iso in the field it was drawn from (after the ground cut and the trims),
// as their index in the grid and their value (the grade; an envelope's field is a probability). For add_grade_shell_blocks. -> { idx: Uint32Array, value: Float32Array }
export function insideCells(field, values, iso) {
  let k = 0;
  for (let i = 0; i < field.length; i++) if (field[i] >= iso) k++;
  const idx = new Uint32Array(k), value = new Float32Array(k);
  k = 0;
  for (let i = 0; i < field.length; i++) if (field[i] >= iso) { idx[k] = i; value[k++] = Number.isFinite(values[i]) ? values[i] : NaN; }
  return { idx, value };
}
export function shellPost(grid, post) {
  const { nx, ny, nz, origin, cellSize } = grid, iso = post.iso;
  // #3673 phase 2 — the old domain as a soft prior, blended with the new holes' estimate
  const up = post.update || null;
  let upOld = null, upSd = null, upTouched = 0, base = grid.values;
  if (up) {
    upOld = meshInsideMask(up.positions, up.indices, grid); upSd = signedDistance(upOld, grid);
    const b = blendWithPrior(priorField(upSd, up.widthM), grid.values, up.newPoints, grid, up.influenceM);
    base = b.values; upTouched = b.touched;
  }
  const reached = post.reach ? reachCutField(base, grid, iso, post.reach) : { values: base, cut: 0 }; // #3655 — before the ground
  const cut = post.ground ? capFieldAtColumns(reached.values, nx, ny, nz, origin, cellSize, iso, post.ground) : { values: reached.values, capped: 0 };
  const env = post.envelope || null;
  // #3673 — the envelope's clean-up (parts dropped, voids filled) after the ground cut, before the surface
  const cleaned = env?.clean ? cleanField(cut.values, grid, iso, env.clean) : null;
  // TASKS.csv #3876 (#3785) — a Tight shell's bodies that one hole holds kept within post.bodies.oneHoleReachM of the composites at the cut-off
  const trim = !env && post.bodies?.oneHoleReachM > 0 ? trimOneHoleBodies(cleaned ? cleaned.values : cut.values, grid, iso, post.bodies.atPoints, post.bodies.oneHoleReachM) : null;
  const field = trim ? trim.values : cleaned ? cleaned.values : cut.values;
  const noData = post.closeOutside ? "outside" : "skip";
  const inside = post.keepCells ? insideCells(field, base, iso) : null; // #3932 batch 3
  let mc = marchingCubes(field, nx, ny, nz, iso, { origin, spacing: cellSize, noData });
  const trianglesFine = mc.faces.length, coarsen = env?.targetTriangles ? coarsenFactor(trianglesFine, env.targetTriangles) : 1;
  if (coarsen > 1) { const cf = coarsenField(field, grid, coarsen); mc = marchingCubes(cf.values, cf.grid.nx, cf.grid.ny, cf.grid.nz, iso, { origin: cf.grid.origin, spacing: cf.grid.cellSize, noData }); } // #3673: decimation by the field
  const nv = mc.vertices.length, positions = new Float64Array(nv * 3) /* world coordinates: Float32 keeps a northing of 7,004,000 only to ~0.5 m */, faces = new Uint32Array(mc.faces.length * 3), vertexSupport = new Uint8Array(nv).fill(255);
  const clampI = (n, hi) => (n < 0 ? 0 : n > hi ? hi : n);
  mc.vertices.forEach((v, i) => {
    positions[i * 3] = v[0]; positions[i * 3 + 1] = v[1]; positions[i * 3 + 2] = v[2];
    if (grid.supportCode) { // the nearest grid node's class, as the window did (#91)
      const gx = clampI(Math.round((v[0] - origin.x) / cellSize.dx), nx - 1), gy = clampI(Math.round((v[1] - origin.y) / cellSize.dy), ny - 1), gz = clampI(Math.round((v[2] - origin.z) / cellSize.dz), nz - 1);
      vertexSupport[i] = grid.supportCode[gx + nx * (gy + ny * gz)];
    }
  });
  mc.faces.forEach((f, i) => { faces[i * 3] = f[0]; faces[i * 3 + 1] = f[1]; faces[i * 3 + 2] = f[2]; });
  const smoothed = env?.smooth && faces.length ? taubinSmooth(positions, faces, env.smooth) : positions; // #3673
  const inShell = samplesInsideShell(post.inShellPoints || [], grid, field, iso);
  const far = post.farPoints && post.farDist > 0 ? farFromSamples(field, nx, ny, nz, origin, cellSize, iso, post.farPoints, post.farDist, {}) : null;
  // TASKS.csv #3785 — the runs along the holes, the bodies held by one hole, and the share far from the composites AT the cut-off
  const B = post.bodies;
  const bodies = B ? { trim: trim ? { nodes: trim.nodes, bodies: trim.bodies } : null, runs: holeRuns(B.runPoints, grid, field, iso, B.cutoff), parts: bodyHoles(field, grid, iso, B.atPoints), farAt: B.farDist > 0 && B.atPoints?.length ? farFromSamples(field, nx, ny, nz, origin, cellSize, iso, B.atPoints, B.farDist, {}) : null } : null;
  const { sum, n } = sumInsideShell(base, field, iso);
  // #3673 phase 2 — what changed, against the old domain
  let update = null;
  if (up) {
    const newMask = new Uint8Array(field.length); for (let i = 0; i < field.length; i++) newMask[i] = field[i] >= iso ? 1 : 0;
    update = { ...updateReport({ oldMask: upOld, newMask, grid: { nx, ny, nz, origin, cellSize, sd: upSd }, points: up.reportPoints, refPoints: up.refPoints, insideOld: meshInsideTester(up.positions, up.indices), cutoff: up.cutoff, nearM: up.nearM }), touched: upTouched };
  }
  // #3673 — the composites inside the envelope by their real grades (the field is a probability, its mean is no grade)
  let grades = null;
  if (env?.gradePoints) {
    const vs = []; let gs = 0, gw = 0, atCut = 0;
    for (const p of env.gradePoints) {
      const i = Math.round((p.x - origin.x) / cellSize.dx), j = Math.round((p.y - origin.y) / cellSize.dy), k = Math.round((p.z - origin.z) / cellSize.dz);
      if (i < 0 || j < 0 || k < 0 || i >= nx || j >= ny || k >= nz || !(field[i + nx * (j + ny * k)] >= iso)) continue;
      const w = p.length > 0 ? p.length : 1;
      vs.push(p.value); gs += p.value * w; gw += w; if (p.value >= env.cutoff) atCut++;
    }
    vs.sort((a, b) => a - b);
    grades = { n: vs.length, sum: gs, w: gw, median: vs.length ? vs[Math.floor(vs.length / 2)] : null, atCut, values: Float64Array.from(vs) }; // values: for one median over every box
  }
  let hi = -Infinity; for (const v of grid.values) if (Number.isFinite(v) && v > hi) hi = v;
  return { positions: smoothed, faces, closingVertices: mc.closingVertices || 0, skippedCubes: mc.skippedCubes || 0, vertexSupport, capped: cut.capped, reachCut: reached.cut, ...(env ? { envelope: { clean: cleaned?.report || null, coarsen, trianglesFine, grades } } : {}), ...(update ? { update } : {}), inShell, far: far ? { inside: far.inside, far: far.far } : null, ...(bodies ? { bodies: { ...bodies, farAt: bodies.farAt ? { inside: bodies.farAt.inside, far: bodies.farAt.far } : null } } : {}) /* #3785 */, sum, n, hi, ...(inside ? { inside } : {}) };
}

// the ground per column of the lattice a dense grid over `bounds` at `cellSize` will have (estimation.js: gridShape, origin at the lower bound plus
// half a cell), in slices of `slice` columns with the window painting between them. groundAt(x, y) -> elevation or NaN. -> Float64Array(nx * ny)
export async function groundColumns(groundAt, bounds, cellSize, { slice = 20000, pause = () => new Promise((r) => setTimeout(r, 0)) } = {}) {
  const { dx, dy, nx, ny } = gridShape(bounds, cellSize), ox = bounds.xmin + 0.5 * dx, oy = bounds.ymin + 0.5 * dy;
  const G = new Float64Array(nx * ny);
  for (let at = 0; at < nx * ny; at++) {
    const i = at % nx, j = (at - i) / nx;
    G[at] = groundAt(ox + i * dx, oy + j * dy);
    if (at % slice === slice - 1) await pause();
  }
  return G;
}

// the worker's mesh in the shape the window's code reads (marchingCubes': vertices [[x, y, z]], faces [[a, b, c]]); a shell mesh is small
export function meshOfPost(post) {
  const P = post.positions, F = post.faces, vertices = new Array(P.length / 3), faces = new Array(F.length / 3);
  for (let i = 0; i < vertices.length; i++) vertices[i] = [P[3 * i], P[3 * i + 1], P[3 * i + 2]];
  for (let i = 0; i < faces.length; i++) faces[i] = [F[3 * i], F[3 * i + 1], F[3 * i + 2]];
  return { vertices, faces, closingVertices: post.closingVertices, skippedCubes: post.skippedCubes };
}

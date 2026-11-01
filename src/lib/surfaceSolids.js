// TASKS.csv #802 — solid blocks from modelled surfaces. Matt: "GeoStrix can model surfaces. It would be nice if it could
// create solid blocks out of these surfaces". The implicit (GemPy) stack already returns a lithology block that the
// 3D Modelling pane turns into a block model and closed unit volumes (#356 / #517); this builds the same kind of block
// from ANY surfaces in the list - contacts drawn from points or sections, imported solids, grade shells, unit volumes -
// so those two actions (and the modelled-unit layer) work on them unchanged.
//
// Every cell centre of a regular grid gets a unit from vertical rays:
//  * TOP surfaces (open sheets: contacts, horizons) - GeoStrix surfaces are unit TOPS (#356), so a cell belongs to
//    the LOWEST surface in the stack order (top -> bottom) that lies above it; above every top it is "not modelled"
//    (null label, left out like GemPy's "above tops"). Where a surface has no triangle over a column (beyond its
//    footprint) it is absent there, and the unit above continues down. If surfaces cross, the later one in the list
//    wins below both (it truncates the earlier one). Each column takes a surface's HIGHEST crossing (a folded or
//    overturned sheet is read by its upper limb - stated, not hidden).
//  * SOLID surfaces (closed shells) - a cell is inside when a vertical ray from it crosses the shell an odd number of
//    times above it. Solids are applied after the stack, later ones over earlier ones (a vein shell inside a host).
//  * ground(x, y) (optional, the terrain): cells above it are outside the model (id 0).
//  * TASKS.csv #830 / #832 — a top may say which unit it bounds (`unit`, default its own name: several surfaces can bound
//    one unit, e.g. "Basalt A") and whether it is that unit's UPPER contact (role "top", the default) or its LOWER one
//    (role "base"). Under a base the unit is NOT the one above it: the cell takes the unit whose base lies nearest below
//    it (a unit known only by its base runs up to the next contact above, or to the ground), and when the nearest
//    contact below is another unit's top, the cell is in a gap nobody modelled (null label). A top of another unit
//    lying at or below that base (picked on the same contact) still wins: the cell is in that unit. With tops only this
//    is exactly the rule above.
// Pure: no three.js. Coordinates: any frame shared by the meshes and the extent (east, north, up).
//
//  * TASKS.csv #1138 — extend (default true): Matt, "we are getting the block cut off at a perpendicular angle to the
//    surface instead of at the intersection of the surface". A top that stopped at its own edge left its unit ending in
//    a vertical, stair-stepped wall there (the columns beyond the edge took the unit above). Each top is now continued
//    past its edge to the box, along the plane of its own edge (fitted to the covered columns near the nearest edge
//    column), so a unit ends where its surfaces MEET - the stack rule above truncates the continuation - as an implicit
//    modeller extends contacts to the model boundary. extend: false keeps each surface to its own footprint.
//
// surfacesToBlock({ tops, solids, extent: [xmin, xmax, ymin, ymax, zmin, zmax], cell, ground, maxCells, extend })
//   tops / solids: [{ name, positions (flat E, N, Z), indices }]; a top may also carry { unit, role: "top" | "base" } (#830)
//   -> { block: { extent, resolution: [nx, ny, nz], ids (x-major, z fastest - modelCheck.js), labels }, counts, coverage }
//   labels = [null, ...top units (each once, in stack order), ...solid names]; id k -> labels[k - 1]; id 0 = outside.

// Column centres are nudged by an irrational fraction of a cell so a ray never runs exactly along a mesh edge or
// through a vertex (meshes built on a lattice put vertices on round coordinates, the same ones cell centres use).
import { t as tr } from "./i18n.js"; // TASKS.csv #898
const JX = 1.3e-6 * Math.SQRT2, JY = 1.7e-6 * Math.PI;

// For each column (i, j): every z where the vertical line at its centre crosses the mesh. Returns a visitor
// forEachColumnHit(cb(col, z)). Triangles are rasterised onto the columns whose centres fall in their xy footprint.
function columnHits(mesh, x0, y0, dx, dy, nx, ny, cb) {
  const p = mesh.positions, ix = mesh.indices, nt = Math.floor(ix.length / 3);
  for (let t = 0; t < nt; t++) {
    const a = ix[3 * t] * 3, b = ix[3 * t + 1] * 3, c = ix[3 * t + 2] * 3;
    const ax = p[a], ay = p[a + 1], az = p[a + 2], bx = p[b], by = p[b + 1], bz = p[b + 2], cx = p[c], cy = p[c + 1], cz = p[c + 2];
    const det = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    if (!det) continue; // vertical or degenerate in plan: a vertical ray never crosses its interior
    const i0 = Math.max(0, Math.ceil((Math.min(ax, bx, cx) - x0) / dx - 0.5 - JX)), i1 = Math.min(nx - 1, Math.floor((Math.max(ax, bx, cx) - x0) / dx - 0.5 - JX));
    const j0 = Math.max(0, Math.ceil((Math.min(ay, by, cy) - y0) / dy - 0.5 - JY)), j1 = Math.min(ny - 1, Math.floor((Math.max(ay, by, cy) - y0) / dy - 0.5 - JY));
    for (let i = i0; i <= i1; i++) {
      const x = x0 + (i + 0.5 + JX) * dx;
      for (let j = j0; j <= j1; j++) {
        const y = y0 + (j + 0.5 + JY) * dy;
        const u = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / det, v = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / det, w = 1 - u - v;
        if (u < 0 || v < 0 || w < 0) continue;
        cb(i * ny + j, u * az + v * bz + w * cz);
      }
    }
  }
}

// TASKS.csv #1138 — a top's column heights continued past its footprint. Every empty column takes the nearest covered
// column (multi-source flood with Euclidean distance to the source) and is set on that source's edge plane: the least-
// squares plane z = a + b·i + c·j through the covered columns within `r` columns of it (its own height if they are
// fewer than three or in a line). -> a new array; the covered columns are unchanged.
// TASKS.csv #1194 — maxCols: past this many columns from its edge a contact stops (Infinity = the box, as before).
export const EXTEND_MIN_COVER = 0.05;
export function extendColumns(z, nx, ny, r = 5, maxCols = Infinity) {
  const n = nx * ny, src = new Int32Array(n).fill(-1), d2 = new Float64Array(n).fill(Infinity);
  let queue = [];
  for (let c = 0; c < n; c++) if (z[c] === z[c]) { src[c] = c; d2[c] = 0; queue.push(c); }
  if (!queue.length || queue.length === n) return z;
  while (queue.length) {
    const next = [];
    for (const c of queue) {
      const ci = Math.floor(c / ny), cj = c % ny, s = src[c], si = Math.floor(s / ny), sj = s % ny;
      for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
        const i = ci + di, j = cj + dj;
        if ((!di && !dj) || i < 0 || j < 0 || i >= nx || j >= ny) continue;
        const q = i * ny + j, dd = (i - si) ** 2 + (j - sj) ** 2;
        if (dd < d2[q]) { d2[q] = dd; src[q] = s; next.push(q); }
      }
    }
    queue = next;
  }
  const planes = new Map(), out = Float64Array.from(z);
  const planeOf = (s) => {
    let p = planes.get(s);
    if (p) return p;
    const si = Math.floor(s / ny), sj = s % ny;
    let m = 0, Si = 0, Sj = 0, Sz = 0, Sii = 0, Sjj = 0, Sij = 0, Siz = 0, Sjz = 0;
    for (let i = Math.max(0, si - r); i <= Math.min(nx - 1, si + r); i++) for (let j = Math.max(0, sj - r); j <= Math.min(ny - 1, sj + r); j++) {
      const h = z[i * ny + j];
      if (h !== h || (i - si) ** 2 + (j - sj) ** 2 > r * r) continue;
      const a = i - si, b = j - sj;
      m++; Si += a; Sj += b; Sz += h; Sii += a * a; Sjj += b * b; Sij += a * b; Siz += a * h; Sjz += b * h;
    }
    // normal equations for z = c0 + c1·a + c2·b (a, b relative to the source column)
    const M = [[m, Si, Sj], [Si, Sii, Sij], [Sj, Sij, Sjj]], v = [Sz, Siz, Sjz];
    const det = (A) => A[0][0] * (A[1][1] * A[2][2] - A[1][2] * A[2][1]) - A[0][1] * (A[1][0] * A[2][2] - A[1][2] * A[2][0]) + A[0][2] * (A[1][0] * A[2][1] - A[1][1] * A[2][0]);
    const D = det(M);
    if (m < 3 || !(Math.abs(D) > 1e-9 * Math.max(1, m ** 3))) p = [z[s], 0, 0];
    else p = [0, 1, 2].map((k) => det(M.map((row, ri) => row.map((x, ci) => (ci === k ? v[ri] : x)))) / D);
    planes.set(s, p);
    return p;
  };
  for (let c = 0; c < n; c++) {
    if (z[c] === z[c] || d2[c] > maxCols * maxCols) continue;
    const s = src[c], p = planeOf(s);
    out[c] = p[0] + p[1] * (Math.floor(c / ny) - Math.floor(s / ny)) + p[2] * ((c % ny) - (s % ny));
  }
  return out;
}

export function surfacesToBlock({ tops = [], solids = [], extent, cell, ground = null, maxCells = 2_000_000, extend = true }) {
  const [xmin, xmax, ymin, ymax, zmin, zmax] = extent;
  if (!(cell > 0) || !(xmax > xmin && ymax > ymin && zmax > zmin)) throw new Error(tr("The model box is empty or the block size is zero.")); // tr: TASKS.csv #898
  const nx = Math.max(1, Math.round((xmax - xmin) / cell)), ny = Math.max(1, Math.round((ymax - ymin) / cell)), nz = Math.max(1, Math.round((zmax - zmin) / cell));
  if (nx * ny * nz > maxCells) throw new Error(tr("{nx} x {ny} x {nz} blocks is over the {max} limit: use a larger block size.", { nx, ny, nz, max: maxCells.toLocaleString() }));
  const dx = (xmax - xmin) / nx, dy = (ymax - ymin) / ny, dz = (zmax - zmin) / nz;
  const ncol = nx * ny;
  // each top's highest crossing per column (NaN = no triangle over that column)
  const topZ = tops.map((m) => {
    const z = new Float64Array(ncol).fill(NaN);
    columnHits(m, xmin, ymin, dx, dy, nx, ny, (col, h) => { if (!(h <= z[col])) z[col] = h; });
    return z;
  });
  const coverage = {};
  tops.forEach((m, s) => { let n = 0; for (let c = 0; c < ncol; c++) if (topZ[s][c] === topZ[s][c]) n++; coverage[m.name] = n / ncol; });
  // #1138 — the surfaces as drawn (for the contradiction counts below) and continued to the box (for the coding)
  const drawnZ = topZ.slice(); // the per-surface arrays themselves are replaced, not changed
  // TASKS.csv #1194 — extending a contact is a guess that grows with the gap: the flat top of a 100 m cube was carried 1-2 km across a box and made 454 Mm3 of a
  // 0.53 Mm3 unit. A contact under 5 % of the box stays as drawn; others reach at most three times their own radius.
  const notExtended = [];
  if (extend) for (let s = 0; s < topZ.length; s++) {
    const f = coverage[tops[s].name];
    if (f < EXTEND_MIN_COVER) { notExtended.push(tops[s].name); continue; }
    topZ[s] = extendColumns(topZ[s], nx, ny, 5, 3 * Math.sqrt((f * ncol) / Math.PI));
  }
  // every crossing per column of each solid, sorted
  const solidHits = solids.map((m) => {
    const lists = new Map();
    columnHits(m, xmin, ymin, dx, dy, nx, ny, (col, h) => { let l = lists.get(col); if (!l) lists.set(col, (l = [])); l.push(h); });
    for (const l of lists.values()) l.sort((a, b) => a - b);
    return lists;
  });
  // #830 — units, each once in stack order; a top's unit is its own name unless it says otherwise
  const unitOf = tops.map((m) => m.unit || m.name), isBase = tops.map((m) => m.role === "base");
  const units = [...new Set(unitOf)], uid = unitOf.map((u) => 2 + units.indexOf(u));
  const anyBase = isBase.some(Boolean), tol = dz / 2;
  const labels = [null, ...units, ...solids.map((m) => m.name)];
  const ids = new (labels.length < 255 ? Uint8Array : Uint16Array)(nx * ny * nz);
  for (let i = 0; i < nx; i++) {
    const x = xmin + (i + 0.5) * dx;
    for (let j = 0; j < ny; j++) {
      const y = ymin + (j + 0.5) * dy, col = i * ny + j;
      const g = ground ? ground(x, y) : NaN;
      for (let k = 0; k < nz; k++) {
        const z = zmin + (k + 0.5) * dz, at = i * ny * nz + j * nz + k;
        if (g === g && z > g) { ids[at] = 0; continue; } // above the terrain: outside the model
        let id = 1; // above every top (not modelled)
        let sa = -1;
        for (let s = tops.length - 1; s >= 0; s--) { const h = topZ[s][col]; if (h === h && h > z) { sa = s; break; } }
        if (sa >= 0 && !isBase[sa]) id = uid[sa];
        else if (anyBase) {
          // #830 — under a lower contact (or under nothing): another unit's top at or below that base, else the unit whose
          // base is the nearest contact below
          let s2 = -1;
          if (sa >= 0) { const hb = topZ[sa][col]; for (let s = tops.length - 1; s >= 0; s--) { const h = topZ[s][col]; if (!isBase[s] && unitOf[s] !== unitOf[sa] && h === h && h > z && h <= hb + tol) { s2 = s; break; } } }
          if (s2 >= 0) id = uid[s2];
          else {
            let hb = -Infinity, sb = -1;
            for (let s = 0; s < tops.length; s++) { const h = topZ[s][col]; if (h === h && h <= z && (h > hb + tol || (isBase[s] && h >= hb - tol))) { hb = Math.max(h, hb); sb = s; } } // a base and a top on one contact: the base (the unit above it sits on it)
            // TASKS.csv #858 — but not when that unit's OWN top also lies below the cell (a unit thinner than half a cell
            // has its base and top within the coincidence tolerance): the cell is above the unit, not in it
            const ownTopBelow = sb >= 0 && isBase[sb] && tops.some((_, s) => { const h = topZ[s][col]; return !isBase[s] && unitOf[s] === unitOf[sb] && h === h && h <= z && h >= topZ[sb][col] - tol; });
            if (sb >= 0 && isBase[sb] && !ownTopBelow) id = uid[sb];
          }
        }
        for (let s = 0; s < solids.length; s++) {
          const l = solidHits[s].get(col);
          if (!l) continue;
          let above = 0;
          for (let q = l.length - 1; q >= 0 && l[q] > z; q--) above++;
          if (above % 2 === 1) id = 2 + tops.length + s;
        }
        ids[at] = id;
      }
    }
  }
  // TASKS.csv #860 — contacts that contradict their order, per column: a unit's base above its own top (negative
  // thickness), or a top lower in the stack lying above one higher in it (crossing tops). Coded as the rules say, but
  // counted so the notice can say where the result cannot be trusted.
  const inverted = { baseAboveTop: 0, crossingTops: 0, columns: ncol };
  for (let col = 0; col < ncol; col++) {
    let bad = false, cross = false;
    for (let s = 0; s < tops.length && !bad; s++) {
      if (!isBase[s]) continue;
      const hb = drawnZ[s][col];
      if (hb !== hb) continue;
      for (let t = 0; t < tops.length; t++) { const ht = drawnZ[t][col]; if (t !== s && !isBase[t] && unitOf[t] === unitOf[s] && ht === ht && hb > ht + tol) { bad = true; break; } }
    }
    let higher = Infinity;
    for (let s = 0; s < tops.length && !cross; s++) {
      if (isBase[s]) continue;
      const h = drawnZ[s][col];
      if (h !== h) continue;
      if (h > higher + tol) cross = true;
      higher = Math.min(higher, h);
    }
    if (bad) inverted.baseAboveTop++;
    if (cross) inverted.crossingTops++;
  }
  const counts = {};
  for (let at = 0; at < ids.length; at++) { const l = ids[at] ? labels[ids[at] - 1] : undefined; if (l) counts[l] = (counts[l] || 0) + 1; }
  return { block: { extent: [xmin, xmax, ymin, ymax, zmin, zmax], resolution: [nx, ny, nz], ids, labels }, counts, notExtended, coverage, cellVolume: dx * dy * dz, inverted };
}

// A cell size giving about `target` cells in the box, rounded to 1 / 2 / 2.5 / 5 x 10^n metres
export function suggestCellSize(extent, target = 250_000) {
  const [xmin, xmax, ymin, ymax, zmin, zmax] = extent;
  const raw = Math.cbrt(((xmax - xmin) * (ymax - ymin) * (zmax - zmin)) / target);
  if (!(raw > 0)) return 10;
  const p = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 2.5, 5, 10].map((m) => m * p).find((v) => v >= raw) || 10 * p;
}

// TASKS.csv #1879 — STOPE OUTLINES BY LEVEL: the underground counterpart of the pit shell for a high-grade body. For each level
// slab the block model is seen in plan: every column's grade over the slab (block overlaps weighted); columns at or above the
// cut-off are the candidate ore; a morphological OPENING (erode then dilate by a k x k square, k the minimum width in columns) drops
// anything thinner than a machine can mine; a dilution skin dilates what is left, the added columns carrying the model's grade
// there (or none); each connected patch longer than the minimum length is a stope: its outline is the exact boundary of its
// columns' squares (holes inside a patch are filled and counted), extruded over the slab into a closed solid.
// Outlines, not a stope optimizer: no geotechnical, access, sequencing or shape-regularity check. Pure: no three.js, no React.
import { extrudeString } from "./stringSolids.js";
import { meshVolume } from "./unitVolumes.js"; // #1953

const fin = Number.isFinite;

// model: { cells: [{ x, y, z, dx, dy, dz, value, coverage }] }; opts: cutoff, levelH, zMin / zMax (level floors run from zMin by levelH up
// to zMax), minWidth, minLength, skin, density (t / m3). -> { levels: [{ rl, stopes: [{ outline: [[x, y, z]], positions, indices, volume,
// tonnes, metalU, grade, oreTonnes, oreGrade, columns, holesFilled }], tonnes, oreTonnes, grade }], totals, cell: [dx, dy], grid: [nx, ny],
// widthCols / skinCols (the whole columns the width and skin rounded to, #1885), blockH (the median block height), oreColumns (columns at
// or above the cut-off over all levels), unbuilt (outlines whose solid could not be made, #1884) }; { failed: "range" } when zMin >= zMax
// TASKS.csv #1953 (Vulcan review) — dipDeg / dipDirDeg: the stope framework follows a DIPPING vein. The blocks are sheared so the
// vein stands vertical (a block at height z above the base moves (z - base) / tan(dip) towards the dip direction), the columns
// are taken in that frame, and each outline and solid is sheared back: the bottom ring at its level, the top ring at the level's
// top, so a stope is a prism leaning with the dip. The width and skin typed are measured ACROSS the vein: on the ground they are
// that / sin(dip). Without a dip everything is as before (vertical columns).
// TASKS.csv #1964 — ceilingAt(x, y) -> z | NaN (lib/pitCeiling.js: a pit shell or design read as a height field) and pillar (m):
// stopes start below the pit, column by column. A column is open on a level only where the whole slab, plus the pillar, lies
// under the pit's surface above it (checked where the stope's bottom and top rings stand, so a leaning stope is checked at both);
// NaN (the pit's mesh does not reach there) leaves the column open, and so does a surface at or above the top of the column's
// blocks: the pit mines nothing there (a shell's unmined columns sit at the ground), so no pillar is kept under the ground. Ore columns shut this way are counted (pitShut), and so are the
// skin columns the pit takes, so no stope reaches into the pit's volume.
export function stopeOutlines(model, { cutoff, levelH, zMin = null, zMax = null, minWidth = 0, minLength = 0, skin = 0, density = 1, dipDeg = null, dipDirDeg = null, ceilingAt = null, pillar = 0, groundAt = null, crown = 0, onLevel = null } = {}) { // onLevel(k, n): #2279, the worker's progress
  const cells0 = (model?.cells || []).filter((c) => fin(c.x) && fin(c.y) && fin(c.z) && c.dx > 0 && c.dy > 0 && c.dz > 0);
  if (!cells0.length || !(levelH > 0) || !fin(cutoff)) return null;
  const dipping = fin(dipDeg) && dipDeg > 0 && dipDeg < 90 && fin(dipDirDeg);
  const sinD = dipping ? Math.sin((dipDeg * Math.PI) / 180) : 1, cotD = dipping ? 1 / Math.tan((dipDeg * Math.PI) / 180) : 0;
  const ux = dipping ? Math.sin((dipDirDeg * Math.PI) / 180) : 0, uy = dipping ? Math.cos((dipDirDeg * Math.PI) / 180) : 0; // the dip direction in plan
  let zBase = Infinity; for (const c of cells0) if (c.z - c.dz / 2 < zBase) zBase = c.z - c.dz / 2;
  const shift = (z) => (z - zBase) * cotD; // how far up-dip the vein has moved at height z above the base
  const cells = dipping ? cells0.map((c) => ({ ...c, x: c.x + shift(c.z) * ux, y: c.y + shift(c.z) * uy })) : cells0;
  const unshear = ([x, y], z) => [x - shift(z) * ux, y - shift(z) * uy];
  if (dipping) { minWidth = minWidth / sinD; skin = skin / sinD; } // typed across the vein, applied on the ground
  const med = (k) => cells.map((c) => c[k]).sort((a, b) => a - b)[cells.length >> 1];
  const dx = med("dx"), dy = med("dy");
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, zLo = Infinity, zHi = -Infinity;
  for (const c of cells) { if (c.x < x0) x0 = c.x; if (c.x > x1) x1 = c.x; if (c.y < y0) y0 = c.y; if (c.y > y1) y1 = c.y; if (c.z - c.dz / 2 < zLo) zLo = c.z - c.dz / 2; if (c.z + c.dz / 2 > zHi) zHi = c.z + c.dz / 2; }
  const pad = Math.ceil(Math.max(0, skin) / Math.min(dx, dy)) + 1;
  const gx0 = x0 - pad * dx, gy0 = y0 - pad * dy; // the first column centre
  const nx = Math.round((x1 - x0) / dx) + 1 + 2 * pad, ny = Math.round((y1 - y0) / dy) + 1 + 2 * pad, N = nx * ny;
  if (N > 4_000_000) return { failed: "too-many-columns", columns: N };
  const col = (c) => { const i = Math.round((c.x - gx0) / dx), j = Math.round((c.y - gy0) / dy); return i >= 0 && i < nx && j >= 0 && j < ny ? j * nx + i : -1; };
  // #1919 — a blank From RL starts at the model's base, so a level interval equal to the block height puts each slab on one block
  const from = fin(zMin) ? zMin : zLo, to = fin(zMax) ? zMax : zHi;
  if (!(to > from)) return { failed: "range", from, to }; // #1893
  // the opening's element is a k x k square of columns, k the minimum width in whole columns (a 20 m zone on 10 m columns is two wide
  // and survives a 15 m minimum; a one-column stringer does not); the skin is a square ring of rS columns
  const k = Math.max(1, Math.ceil(minWidth / Math.min(dx, dy) - 1e-9)), rS = Math.max(0, Math.round(skin / Math.min(dx, dy)));
  const area = dx * dy, levels = [];
  const totals = { tonnes: 0, metalU: 0, oreTonnes: 0, oreMetalU: 0, stopes: 0 };
  let oreColumns = 0, unbuilt = 0, pitShut = 0, pitSkin = 0, groundShut = 0, groundSkin = 0; // #1964; ground: #2438
  const pil = fin(pillar) && pillar > 0 ? pillar : 0;
  const colTop = new Float64Array(ceilingAt ? N : 0).fill(-Infinity); // #1964 — the top of each column's blocks
  if (ceilingAt) for (const c of cells) { const q = col(c); if (q >= 0 && c.z + c.dz / 2 > colTop[q]) colTop[q] = c.z + c.dz / 2; }
  const openUnder = (q, rl, top) => { // #1964 — the slab and the pillar below the pit's surface at both rings
    const j = Math.floor(q / nx), i = q - j * nx, sx = gx0 + i * dx, sy = gy0 + j * dy;
    for (const z of dipping ? [rl, top] : [top]) { const [x, y] = unshear([sx, sy], z), c = ceilingAt(x, y); if (fin(c) && c < colTop[q] - 1e-6 && c < top + pil - 1e-9) return false; }
    return true;
  };
  // TASKS.csv #2438 (review #2325, WA uranium) — groundAt(x, y) -> z | NaN (the terrain or the collar surface the pit tools use) and crown (m):
  // no stope reaches above the ground less the crown, at both rings of a leaning stope; NaN (no ground known there) leaves the column open
  const cr = fin(crown) && crown > 0 ? crown : 0;
  const openGround = (q, rl, top) => {
    const j = Math.floor(q / nx), i = q - j * nx, sx = gx0 + i * dx, sy = gy0 + j * dy;
    for (const z of dipping ? [rl, top] : [top]) { const [x, y] = unshear([sx, sy], z), g = groundAt(x, y); if (fin(g) && top + cr > g + 1e-9) return false; }
    return true;
  };
  const square = (lo, hi) => { const o = []; for (let j = lo; j <= hi; j++) for (let i = lo; i <= hi; i++) o.push([i, j]); return o; };
  const dE = square(0, k - 1), dS = square(-rS, rS);
  const inside = (mask, i, j) => i >= 0 && i < nx && j >= 0 && j < ny && mask[j * nx + i];
  const erode = (mask, offsets) => { const out = new Uint8Array(N); for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { let keep = 1; for (const [a, b] of offsets) if (!inside(mask, i + a, j + b)) { keep = 0; break; } out[j * nx + i] = keep; } return out; };
  const dilate = (mask, offsets) => { const out = new Uint8Array(N); for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { if (!mask[j * nx + i]) continue; for (const [a, b] of offsets) { const ii = i + a, jj = j + b; if (ii >= 0 && ii < nx && jj >= 0 && jj < ny) out[jj * nx + ii] = 1; } } return out; };
  const nLevels = Math.max(1, Math.ceil((to - from - 1e-9) / levelH)); let levelNo = 0; // #2279
  for (let rl = from; rl < to - 1e-9; rl += levelH) {
    onLevel?.(++levelNo, nLevels);
    const top = Math.min(rl + levelH, to);
    const t = new Float64Array(N), m = new Float64Array(N), cover = new Float64Array(N); // cover: the slab height the blocks fill (#1919)
    // TASKS.csv #2107 (review #2013, Woodjam) — the tonnes and metal of the BLOCKS at or above the cut-off, per column: 'Ore above
    // cut-off' used to sum whole ore columns (a column whose mean passed brought its 2,805 ppm blocks along at a 3,000 ppm cut-off),
    // so with no skin it equalled the diluted tonnes and dilution read 0 %
    const tA = new Float64Array(N), mA = new Float64Array(N);
    for (const c of cells) {
      const q = col(c); if (q < 0) continue;
      const h = Math.min(c.z + c.dz / 2, top) - Math.max(c.z - c.dz / 2, rl);
      if (h <= 0) continue;
      const tt = h * area * (fin(c.coverage) ? c.coverage : 1) * density;
      t[q] += tt; if (fin(c.value)) m[q] += tt * c.value; cover[q] += h;
      if (fin(c.value) && c.value >= cutoff) { tA[q] += tt; mA[q] += tt * c.value; } // #2107
    }
    let mask = new Uint8Array(N);
    const slabH = top - rl;
    for (let q = 0; q < N; q++) if (t[q] > 0 && m[q] / t[q] >= cutoff && cover[q] >= 0.5 * slabH - 1e-9) { mask[q] = 1; oreColumns++; } // half the slab at least (#1919)
    let shut = null;
    if (ceilingAt || groundAt) { // #1964; the ground (2): #2438
      shut = new Uint8Array(N);
      for (let q = 0; q < N; q++) if (ceilingAt && !openUnder(q, rl, top)) shut[q] = 1; else if (groundAt && !openGround(q, rl, top)) shut[q] = 2;
      for (let q = 0; q < N; q++) if (mask[q] && shut[q]) { mask[q] = 0; if (shut[q] === 1) pitShut++; else groundShut++; }
    }
    if (k > 1) mask = dilate(erode(mask, dE), dE); // opening: nothing thinner than the minimum width survives
    if (rS > 0) mask = dilate(mask, dS); // the skin
    if (shut) for (let q = 0; q < N; q++) if (mask[q] && shut[q]) { mask[q] = 0; if (shut[q] === 1) pitSkin++; else groundSkin++; } // #1964 — no skin inside the pit (or above the ground, #2438) either
    // connected patches (4-neighbours)
    const label = new Int32Array(N).fill(-1);
    const patches = [];
    for (let s = 0; s < N; s++) {
      if (!mask[s] || label[s] >= 0) continue;
      const id = patches.length, stack = [s], members = [];
      label[s] = id;
      while (stack.length) {
        const q = stack.pop(); members.push(q);
        const j = Math.floor(q / nx), i = q - j * nx;
        for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ii = i + a, jj = j + b; if (ii < 0 || ii >= nx || jj < 0 || jj >= ny) continue; const p = jj * nx + ii; if (mask[p] && label[p] < 0) { label[p] = id; stack.push(p); } }
      }
      patches.push(members);
    }
    const stopes = [];
    for (const members of patches) {
      let i0 = Infinity, i1 = -Infinity, j0 = Infinity, j1 = -Infinity, tonnes = 0, metalU = 0, oreT = 0, oreM = 0;
      for (const q of members) {
        const j = Math.floor(q / nx), i = q - j * nx;
        if (i < i0) i0 = i; if (i > i1) i1 = i; if (j < j0) j0 = j; if (j > j1) j1 = j;
        // a column of the skin with no block in this slab: rock of unknown grade, counted at the density with no metal
        const tt = t[q] > 0 ? t[q] : (top - rl) * area * density;
        tonnes += tt; metalU += m[q]; oreT += tA[q]; oreM += mA[q]; // #2107 — the blocks at or above the cut-off, wherever they sit in the stope
      }
      const extent = Math.max((i1 - i0 + 1) * dx, (j1 - j0 + 1) * dy);
      if (extent < minLength) continue;
      const loops = boundaryLoops(members, nx, gx0, gy0, dx, dy);
      if (!loops.length) continue;
      const outer = loops.reduce((a, b) => (Math.abs(b.area) > Math.abs(a.area) ? b : a));
      const outline = outer.points.map((p) => [...unshear(p, rl), rl]); // the bottom ring, back in the ground frame (#1953)
      // #1884 — an outline the ear clipper refuses keeps its tonnes and outline without a solid, and the run goes on
      let solid = null;
      try {
        solid = extrudeString(outline, rl, top);
        if (solid && dipping) { // #1953 — the top ring leans with the dip: the extrusion lists the bottom ring first, then the top
          const n = outline.length, d = shift(top) - shift(rl), P = solid.positions;
          for (let i = 0; i < n; i++) { P[3 * (n + i)] -= d * ux; P[3 * (n + i) + 1] -= d * uy; }
          solid.volume = Math.abs(meshVolume(P, solid.indices));
        }
      } catch { solid = null; }
      if (!solid) unbuilt++;
      stopes.push({ outline, positions: solid?.positions || null, indices: solid?.indices || null, volume: solid?.volume ?? null, tonnes, metalU, grade: tonnes > 0 ? metalU / tonnes : null, oreTonnes: oreT, oreGrade: oreT > 0 ? oreM / oreT : null, columns: members.length, holesFilled: loops.length - 1 });
      totals.tonnes += tonnes; totals.metalU += metalU; totals.oreTonnes += oreT; totals.oreMetalU += oreM; totals.stopes++;
    }
    const lt = stopes.reduce((a, s) => a + s.tonnes, 0), lm = stopes.reduce((a, s) => a + s.metalU, 0), lo = stopes.reduce((a, s) => a + s.oreTonnes, 0), lom = stopes.reduce((a, s) => a + (s.oreGrade == null ? 0 : s.oreGrade * s.oreTonnes), 0);
    levels.push({ rl, top, stopes, tonnes: lt, grade: lt > 0 ? lm / lt : null, oreTonnes: lo, oreGrade: lo > 0 ? lom / lo : null });
  }
  totals.grade = totals.tonnes > 0 ? totals.metalU / totals.tonnes : null;
  totals.oreGrade = totals.oreTonnes > 0 ? totals.oreMetalU / totals.oreTonnes : null;
  totals.dilutionPct = totals.oreTonnes > 0 ? ((totals.tonnes - totals.oreTonnes) / totals.oreTonnes) * 100 : null;
  return { levels, totals, cell: [dx, dy], grid: [nx, ny], from, to, widthCols: k, skinCols: rS, blockH: med("dz"), oreColumns, unbuilt, pit: ceilingAt ? { shut: pitShut, skinShut: pitSkin, pillar: pil } : null /* #1964 */, ground: groundAt ? { shut: groundShut, skinShut: groundSkin, crown: cr } : null /* #2438 */,
    dip: dipping ? { dipDeg, dipDirDeg, widthOnGroundM: minWidth, skinOnGroundM: skin } : null /* #1953 */ };
}

// the boundary of a set of grid squares as closed loops in world coordinates (the squares are centred on the column centres)
function boundaryLoops(members, nx, gx0, gy0, dx, dy) {
  const inSet = new Set(members);
  const edges = new Map(); // from corner key -> [to corner key, ...], directed with the set on the left
  const key = (i, j) => `${i},${j}`;
  const add = (a, b) => { const k = key(...a); (edges.get(k) || edges.set(k, []).get(k)).push(b); };
  for (const q of members) {
    const j = Math.floor(q / nx), i = q - j * nx;
    const has = (ii, jj) => inSet.has(jj * nx + ii);
    // corners of the square: (i, j) is its south-west corner in corner coordinates
    if (!has(i, j - 1)) add([i, j], [i + 1, j]); // south edge, walking east
    if (!has(i + 1, j)) add([i + 1, j], [i + 1, j + 1]); // east edge, north
    if (!has(i, j + 1)) add([i + 1, j + 1], [i, j + 1]); // north edge, west
    if (!has(i - 1, j)) add([i, j + 1], [i, j]); // west edge, south
  }
  const loops = [];
  const parse = (k) => k.split(",").map(Number);
  while (edges.size) {
    const [startK, list] = edges.entries().next().value;
    const pts = [parse(startK)];
    let cur = startK, next = list.shift();
    if (!list.length) edges.delete(startK);
    let guard = 0;
    while (next && guard++ < 1e6) {
      const nk = key(...next);
      if (nk === startK) break;
      pts.push(next);
      const l = edges.get(nk);
      if (!l) break;
      // at a corner where two squares touch diagonally (a hole touching the outside, or two holes), take the edge that turns RIGHT
      // first: the walk closes the tighter loop there, so the outer ring and the hole stay two simple loops. Turning left first
      // chained them into one loop that visited the corner twice, which the ear clipper refused (TASKS.csv #1884, Lawyers).
      let pick = 0;
      if (l.length > 1) { const [px, py] = parse(cur), [cx, cy] = next, dirx = cx - px, diry = cy - py; pick = l.findIndex(([tx, ty]) => (tx - cx) * diry - (ty - cy) * dirx > 0); if (pick < 0) pick = 0; }
      next = l.splice(pick, 1)[0];
      if (!l.length) edges.delete(nk);
      cur = nk;
    }
    // corner (i, j) -> world: the square's south-west corner is half a cell below and left of the column centre
    const points = pts.map(([i, j]) => [gx0 + (i - 0.5) * dx, gy0 + (j - 0.5) * dy]);
    let area = 0;
    for (let k = 0; k < points.length; k++) { const a = points[k], b = points[(k + 1) % points.length]; area += a[0] * b[1] - b[0] * a[1]; }
    loops.push({ points: simplifyCollinear(points), area: area / 2 });
  }
  return loops;
}
function simplifyCollinear(pts) {
  const out = [];
  const n = pts.length;
  for (let k = 0; k < n; k++) {
    const a = pts[(k - 1 + n) % n], b = pts[k], c = pts[(k + 1) % n];
    if (Math.abs((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0])) > 1e-9) out.push(b);
  }
  return out;
}

export function stopeRows(result, unit) {
  const out = [];
  result.levels.forEach((l) => l.stopes.forEach((s, i) => out.push({ level_rl: l.rl, stope: i + 1, columns: s.columns, tonnes: Math.round(s.tonnes), [`grade_${String(unit || "").replace("%", "pct")}`]: s.grade == null ? "" : +s.grade.toPrecision(4), ore_tonnes: Math.round(s.oreTonnes), ore_grade: s.oreGrade == null ? "" : +s.oreGrade.toPrecision(4), volume_m3: s.volume == null ? "" : Math.round(s.volume), holes_filled: s.holesFilled, min_x: +Math.min(...s.outline.map((p) => p[0])).toFixed(1), max_x: +Math.max(...s.outline.map((p) => p[0])).toFixed(1), min_y: +Math.min(...s.outline.map((p) => p[1])).toFixed(1), max_y: +Math.max(...s.outline.map((p) => p[1])).toFixed(1) })));
  return out;
}

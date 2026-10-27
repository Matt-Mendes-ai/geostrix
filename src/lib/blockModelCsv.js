// TASKS.csv #410 — block-model CSV import that works on real exports. parseBlockModelCSV (voxel.js) used a
// short fixed synonym list, so a Micromine model (EAST / NORTH / RL) or a Datamine one (XC / YC / ZC,
// AU_PPM) imported 0 cells, a file with CU and AU silently took AU, Vulcan's dim_x was ignored, only one
// attribute was ever read, and anything over the cell budget was refused outright. Now: a guessed column
// mapping the user confirms (BlockModelMappingModal), any numeric column as an attribute, and a
// volume-weighted block average down to the budget instead of a refusal. Rotated models are still out of
// scope (their centroids are in a local frame; say so rather than draw them in the wrong place). Pure.

const norm = (h) => String(h ?? "").trim().toLowerCase().replace(/[\s\-.]+/g, "_").replace(/^_+|_+$/g, "");
// TASKS.csv #659 — Micromine writes the block SIZES as _EAST / _NORTH / _RL beside the centroids EAST / NORTH / RL.
// norm() strips that underscore, so the size columns collided with the centroids and were offered as attributes
// (sizes then inferred from the smallest centroid gap: a 10 x 10 x 5 m parent drawn 2.5 x 2.5 x 1.25 m). The key
// used for matching keeps a literal leading underscore.
const key = (h) => (/^\s*_/.test(String(h ?? "")) ? "_" : "") + norm(h);

// Priority order within each list matters: the first header that matches wins.
const SYN = {
  x: ["x", "xc", "x_c", "xcentre", "x_centre", "xcenter", "x_center", "centroid_x", "xcentroid", "x_centroid", "mid_x", "xmid", "x_mid", "east", "easting", "x_coord", "xcoord", "e"],
  y: ["y", "yc", "y_c", "ycentre", "y_centre", "ycenter", "y_center", "centroid_y", "ycentroid", "y_centroid", "mid_y", "ymid", "y_mid", "north", "northing", "y_coord", "ycoord", "n"],
  z: ["z", "zc", "z_c", "zcentre", "z_centre", "zcenter", "z_center", "centroid_z", "zcentroid", "z_centroid", "mid_z", "zmid", "z_mid", "rl", "elev", "elevation", "z_coord", "zcoord", "level"],
  dx: ["_east", "_x", "dx", "xinc", "x_inc", "xsize", "x_size", "size_x", "xdim", "x_dim", "dim_x", "dimx", "xlength", "x_length", "xlen", "block_x", "xblock", "size"],
  dy: ["_north", "_y", "dy", "yinc", "y_inc", "ysize", "y_size", "size_y", "ydim", "y_dim", "dim_y", "dimy", "ylength", "y_length", "ylen", "block_y", "yblock", "size"],
  dz: ["_rl", "_z", "_elev", "dz", "zinc", "z_inc", "zsize", "z_size", "size_z", "zdim", "z_dim", "dim_z", "dimz", "zlength", "z_length", "zlen", "block_z", "zblock", "size"],
};
// Numeric columns that are never an attribute to colour by.
const NOT_ATTR = new Set(["ijk", "i", "j", "k", "ix", "iy", "iz", "index", "idx", "id", "block_id", "blockid", "nx", "ny", "nz", "xmorig", "ymorig", "zmorig", "parent", "sub_block", "subblock"]);
const GRADE_HINT = /^(au|ag|cu|zn|pb|mo|ni|co|u3o8|fe|grade|value|val|density|sg|resistivity|susceptibility|chargeability)(_|$)/;

import { num } from "./layers.js";

export function numericColumns(headers, rows, sample = 200) {
  const out = [];
  const n = Math.min(rows.length, sample);
  for (const h of headers) {
    let num = 0, seen = 0;
    for (let i = 0; i < n; i++) { const v = rows[i]?.[h]; if (v === null || v === undefined || v === "") continue; seen++; if (typeof v === "number" && Number.isFinite(v)) num++; }
    if (seen && num / seen >= 0.9) out.push(h);
  }
  return out;
}

export function guessBlockModelMapping(headers, rows) {
  const numeric = numericColumns(headers, rows);
  const byNorm = new Map();
  numeric.forEach((h) => { if (!byNorm.has(key(h))) byNorm.set(key(h), h); }); // first header wins; _EAST is its own key (#659)
  const used = new Set();
  const pick = (role) => { for (const s of SYN[role]) { const h = byNorm.get(s); if (h && (!used.has(h) || s === "size")) { used.add(h); return h; } } return ""; };
  const mapping = { x: pick("x"), y: pick("y"), z: pick("z"), dx: pick("dx"), dy: pick("dy"), dz: pick("dz") };
  const attributes = numeric.filter((h) => !used.has(h) && !NOT_ATTR.has(norm(h)) && !NOT_ATTR.has(key(h)));
  const preferred = attributes.find((h) => GRADE_HINT.test(norm(h))) || attributes[0] || "";
  return { mapping, attributes, defaultAttributes: preferred ? [preferred] : [] };
}

// Rows -> cells for ONE attribute. Missing / non-positive sizes are inferred per axis from the smallest
// gap between distinct centroids (a regular lattice's spacing), as before.
export function blockModelCellsFromRows(rows, mapping, attr) {
  // TASKS.csv #508 — layers.num: a blank / "NA" cell is NaN, not 0 (an unestimated block was a real 0-grade block)
  const cell = (r, k) => (mapping[k] ? num(r[mapping[k]]) : NaN);
  const parsed = rows.map((r) => ({ x: cell(r, "x"), y: cell(r, "y"), z: cell(r, "z"), dx: cell(r, "dx"), dy: cell(r, "dy"), dz: cell(r, "dz"), value: attr ? num(r[attr]) : NaN }));
  const good = parsed.filter((r) => Number.isFinite(r.x) && Number.isFinite(r.y) && Number.isFinite(r.z) && Number.isFinite(r.value));
  const infer = (sizeKey, posKey) => {
    if (!good.some((r) => !(r[sizeKey] > 0))) return null;
    const vals = Array.from(new Set(good.map((r) => r[posKey]))).sort((a, b) => a - b);
    let minGap = Infinity;
    for (let i = 1; i < vals.length; i++) minGap = Math.min(minGap, vals[i] - vals[i - 1]);
    return Number.isFinite(minGap) && minGap > 0 ? minGap : 1;
  };
  const ix = infer("dx", "x"), iy = infer("dy", "y"), iz = infer("dz", "z");
  const cells = good.map((r) => ({ x: r.x, y: r.y, z: r.z, dx: r.dx > 0 ? r.dx : ix, dy: r.dy > 0 ? r.dy : iy, dz: r.dz > 0 ? r.dz : iz, value: r.value }));
  return { cells, badRows: parsed.length - good.length, inferred: ix !== null || iy !== null || iz !== null ? { dx: ix, dy: iy, dz: iz } : null };
}

// Cells -> at most maxCells cells: merge fx x fy x fz lattice blocks (lattice = the smallest cell size per
// axis), value = VOLUME-weighted mean of what falls in each coarse cell. Only OCCUPIED coarse cells count (a
// model listing only its real blocks is sparse). Factors grow on the axis with the most coarse cells first, like
// planCoarsenFactors. A mean is right for grades and densities; for a coded attribute (rock type as a number)
// it is meaningless — the caller warns. TASKS.csv #659 — a block larger than the lattice (a parent block of a
// sub-blocked model) spreads its volume over every coarse cell it overlaps; it used to count, whole, in the one
// cell holding its corner, so a sub-blocked model kept 30 % of its volume with a biased mean (0.489 vs 0.287).
// TASKS.csv #943 — that holds for a model that fills its lattice. A merged cell is a FULL coarse cell whatever share of
// it the source blocks covered, so a sparse model (sub-blocks only along the domain edge, the normal Micromine case)
// came out larger (+22 % in the review's file). Each merged cell now carries `coverage` (covered volume / cell volume,
// 0-1) and the result the source and merged volumes, so the import can say so and the CSV export can write the real
// volume per block.
export function coarsenBlockCells(cells, maxCells) {
  if (cells.length <= maxCells) return { cells, factors: null };
  let x0 = Infinity, y0 = Infinity, z0 = Infinity, ux = Infinity, uy = Infinity, uz = Infinity;
  for (const c of cells) {
    x0 = Math.min(x0, c.x - c.dx / 2); y0 = Math.min(y0, c.y - c.dy / 2); z0 = Math.min(z0, c.z - c.dz / 2);
    ux = Math.min(ux, c.dx); uy = Math.min(uy, c.dy); uz = Math.min(uz, c.dz);
  }
  const u = [ux, uy, uz];
  // per block, per axis: [first lattice index, number of lattice cells covered]
  const span = cells.map((c) => [[c.x - c.dx / 2 - x0, c.dx], [c.y - c.dy / 2 - y0, c.dy], [c.z - c.dz / 2 - z0, c.dz]]
    .map(([lo, w], i) => [Math.floor(lo / u[i] + 1e-6), Math.max(1, Math.round(w / u[i]))]));
  const ext = [0, 0, 0];
  for (const sp of span) for (let i = 0; i < 3; i++) ext[i] = Math.max(ext[i], sp[i][0] + sp[i][1]);
  const f = [1, 1, 1];
  // the coarse cells along one axis a block overlaps, with how many of its lattice cells fall in each
  const pieces = ([a0, n], fi) => {
    const out = [];
    for (let k = Math.floor(a0 / fi); k * fi < a0 + n; k++) out.push([k, Math.min(a0 + n, (k + 1) * fi) - Math.max(a0, k * fi)]);
    return out;
  };
  const bin = () => {
    const m = new Map();
    for (let i = 0; i < cells.length; i++) {
      const c = cells[i], sp = span[i];
      const px = pieces(sp[0], f[0]), py = pieces(sp[1], f[1]), pz = pieces(sp[2], f[2]);
      const per = (c.dx * c.dy * c.dz) / (sp[0][1] * sp[1][1] * sp[2][1]); // volume of one covered lattice cell
      for (const [kx, nx] of px) for (const [ky, ny] of py) for (const [kz, nz] of pz) {
        const w = per * nx * ny * nz;
        const keyStr = `${kx},${ky},${kz}`;
        const e = m.get(keyStr);
        if (e) { e.w += w; e.s += w * c.value; } else m.set(keyStr, { w, s: w * c.value, k: [kx, ky, kz] });
      }
    }
    return m;
  };
  let bins = bin(), guard = 0;
  while (bins.size > maxCells && guard++ < 10000) {
    const coarse = ext.map((e, i) => Math.ceil(e / f[i]));
    const axis = coarse[0] >= coarse[1] && coarse[0] >= coarse[2] ? 0 : coarse[1] >= coarse[2] ? 1 : 2;
    f[axis]++;
    bins = bin();
  }
  const [sx, sy, sz] = [ux * f[0], uy * f[1], uz * f[2]];
  const out = [];
  const full = sx * sy * sz;
  let sourceM3 = 0;
  for (const e of bins.values()) {
    sourceM3 += e.w;
    out.push({ x: x0 + (e.k[0] + 0.5) * sx, y: y0 + (e.k[1] + 0.5) * sy, z: z0 + (e.k[2] + 0.5) * sz, dx: sx, dy: sy, dz: sz, value: e.s / e.w, coverage: Math.min(1, e.w / full) });
  }
  return { cells: out, factors: { fx: f[0], fy: f[1], fz: f[2] }, sourceM3, mergedM3: out.length * full };
}

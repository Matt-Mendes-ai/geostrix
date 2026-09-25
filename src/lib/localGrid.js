// TASKS.csv #412 — legacy data on a LOCAL MINE GRID, and depths in FEET.
//
// Much pre-1990 BC data (ARIS assessment reports, old mine plans) is on a local grid — an arbitrary
// origin, often rotated from north, sometimes in feet — and logs are in feet. reproject.js only knows
// EPSG systems, so such a collar file used to land kilometres away. The standard fix is a 2D similarity
// (Helmert, 4-parameter: scale, rotation, two shifts) fitted by least squares from two or more control
// points whose coordinates are known on BOTH grids (surveyed pins, a tied-in hole). A 3D elevation
// shift is separate (local "mine datum" RLs, e.g. 1000 m added to keep values positive).
//
// Pure: no UI, no three.js.

export const FEET = 0.3048;

// pairs: [{ lx, ly, wx, wy }] (local and world coordinates of the same point). Least squares for
//   wx = a*lx - b*ly + tx,   wy = b*lx + a*ly + ty     (a = s cos t, b = s sin t)
// solved on coordinates centred at each set's mean (numerically stable at UTM magnitudes).
export function fitSimilarity(pairs) {
  const P = (pairs || []).filter((p) => [p.lx, p.ly, p.wx, p.wy].every(Number.isFinite));
  if (P.length < 2) throw new Error("Need at least two control points (local and project coordinates of the same place).");
  const n = P.length;
  const mlx = P.reduce((s, p) => s + p.lx, 0) / n, mly = P.reduce((s, p) => s + p.ly, 0) / n;
  const mwx = P.reduce((s, p) => s + p.wx, 0) / n, mwy = P.reduce((s, p) => s + p.wy, 0) / n;
  let sxx = 0, num_a = 0, num_b = 0;
  P.forEach((p) => {
    const x = p.lx - mlx, y = p.ly - mly, u = p.wx - mwx, v = p.wy - mwy;
    sxx += x * x + y * y;
    num_a += x * u + y * v;
    num_b += x * v - y * u;
  });
  if (!(sxx > 0)) throw new Error("The control points coincide on the local grid — they must be at different places.");
  const a = num_a / sxx, b = num_b / sxx;
  const t = { a, b, tx: mwx - (a * mlx - b * mly), ty: mwy - (b * mlx + a * mly) };
  const res = P.map((p) => { const w = applySimilarity(t, p.lx, p.ly); return Math.hypot(w.x - p.wx, w.y - p.wy); });
  return {
    ...t,
    scale: Math.hypot(a, b),
    rotationDeg: (Math.atan2(b, a) * 180) / Math.PI, // counter-clockwise from local x to world x
    residuals: res,
    rmsM: Math.sqrt(res.reduce((s, r) => s + r * r, 0) / n),
    n,
  };
}

export function applySimilarity(t, lx, ly) {
  return { x: t.a * lx - t.b * ly + t.tx, y: t.b * lx + t.a * ly + t.ty };
}

// "lx ly wx wy" per line (spaces, commas, tabs or semicolons); blank lines and #comments ignored.
export function parseControlPoints(text) {
  const out = [];
  String(text || "").split(/\r?\n/).forEach((line) => {
    const s = line.replace(/#.*/, "").trim();
    if (!s) return;
    const v = s.split(/[\s,;]+/).map(Number);
    if (v.length >= 4 && v.slice(0, 4).every(Number.isFinite)) out.push({ lx: v[0], ly: v[1], wx: v[2], wy: v[3] });
  });
  return out;
}

// Applied to raw imported rows (before normalisation) by the import step. `mapping` maps schema keys to
// column names. Lengths/depths (depth, from, to, length) and elevations (z) are converted when
// `units === "ft"`; x/y go through the fitted similarity when `grid` is given; `zShift` (metres, after
// unit conversion) is added to z. Returns new rows and a summary of what was done.
const LENGTH_KEYS = ["depth", "from", "to", "length"];
export function transformImportRows(rows, mapping, { units = "m", grid = null, zShift = 0 } = {}) {
  const f = units === "ft" ? FEET : 1;
  const num = (v) => (v === "" || v == null ? NaN : Number(v));
  let moved = 0;
  const out = rows.map((r) => {
    const o = { ...r };
    if (f !== 1) {
      LENGTH_KEYS.forEach((k) => { const c = mapping[k]; if (c && Number.isFinite(num(o[c]))) o[c] = num(o[c]) * f; });
    }
    const zc = mapping.z;
    if (zc && Number.isFinite(num(o[zc]))) o[zc] = num(o[zc]) * f + (Number(zShift) || 0);
    if (grid && mapping.x && mapping.y && Number.isFinite(num(o[mapping.x])) && Number.isFinite(num(o[mapping.y]))) {
      const w = applySimilarity(grid, num(o[mapping.x]), num(o[mapping.y]));
      o[mapping.x] = w.x; o[mapping.y] = w.y; moved++;
    }
    return o;
  });
  return { rows: out, moved };
}

// TASKS.csv #643 — the request for a true 3D DC/IP inversion of several saved lines (python-sidecar app/geophys/dcip3d.py),
// and its result as block models. Each saved line already knows where it lies (its two points / station file, #602 /
// #634) and how its positions were chained (#539); here every electrode becomes a world point (x, y on the line, z on
// the ground: the surveyed station elevations, else the terrain, else the line's entered flat ground), and the
// along-line distances are kept for the flat-ground geometric factor the readings were computed with (#580).
// Pure: no React.
import { lineGeometry, terrainProfile, slopeToHorizontalFromProfile, slopeToHorizontalFromStations, readingsToHorizontal, suggestModelDepth } from "./dcip.js";
import { stationGroundProfile } from "./dcipStations.js";
import { terrainElevationAt } from "./inversion.js";

const num = (v) => (v === "" || v == null ? NaN : Number(v));
function interp(pts, x) { // pts [[x, y]] sorted by x; held at the ends
  if (x <= pts[0][0]) return pts[0][1];
  const n = pts.length;
  if (x >= pts[n - 1][0]) return pts[n - 1][1];
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (pts[m][0] <= x) lo = m; else hi = m; }
  const t = (x - pts[lo][0]) / (pts[hi][0] - pts[lo][0] || 1);
  return pts[lo][1] + t * (pts[hi][1] - pts[lo][1]);
}

// One saved line in 3D: { ok, reason?, readings (12 numbers per reading), chain, rho, ip, err, errKind, stations [[x, y, z]], spacing, depth }
// err / errKind: the file's error column and what the user said it measures in the 2D panel ("rhoPct" | "ipMvV", #683)
export function lineIn3d(entry, terrain) {
  const L = entry.line || {};
  const x0 = num(L.x0), y0 = num(L.y0), x1 = num(L.x1), y1 = num(L.y1);
  if (![x0, y0, x1, y1].every(Number.isFinite)) return { ok: false, reason: "not placed" };
  const slope = L.positions === "slope";
  const geom = lineGeometry([x0, y0], [x1, y1], slope ? 1 : num(L.scale) || 1);
  if (!geom) return { ok: false, reason: "not placed" };
  const st = L.stations?.list || [];
  let readings = entry.readings, toH = null;
  if (slope) {
    toH = st.length >= 2 ? slopeToHorizontalFromStations(st, [x0, y0], geom.u) : null;
    if (!toH && terrain) {
      const flat = entry.readings.flat().filter((v) => v != null);
      const prof = terrainProfile(terrain, geom, Math.min(0, Math.min(...flat)) - 50, Math.max(...flat) + 50, 400);
      if (prof) toH = slopeToHorizontalFromProfile(prof);
    }
    if (!toH) return { ok: false, reason: "slope distances need stations or a terrain" };
    readings = readingsToHorizontal(entry.readings, toH).readings;
  }
  const flat = readings.flat().filter((v) => v != null);
  const s0 = Math.min(...flat), s1 = Math.max(...flat);
  const stH = toH ? st.map((p) => ({ ...p, s: toH(p.s) })) : st;
  const prof = stationGroundProfile(stH, s0 - 1, s1 + 1);
  const zAt = (s) => {
    if (prof) return interp(prof, s);
    const [x, y] = geom.at(s);
    const t = terrain ? terrainElevationAt(terrain, x, y) : NaN;
    return Number.isFinite(t) ? t : num(L.ground);
  };
  const out = [];
  for (const r of readings) {
    const row = [];
    for (const s of r) {
      if (s == null) { row.push(null, null, null); continue; }
      const [x, y] = geom.at(s), z = zAt(s);
      if (!Number.isFinite(z)) return { ok: false, reason: "no ground elevation (stations, terrain or a flat ground)" };
      row.push(+x.toFixed(2), +y.toFixed(2), +z.toFixed(2));
    }
    out.push(row);
  }
  const pos = [...new Set(flat.map((v) => +v.toFixed(3)))].sort((a, b) => a - b);
  let spacing = Infinity;
  for (let i = 1; i < pos.length; i++) if (pos[i] - pos[i - 1] > 1e-6) spacing = Math.min(spacing, pos[i] - pos[i - 1]);
  return {
    ok: true, readings: out, chain: readings, rho: entry.rho, ip: entry.ip || null,
    err: Array.isArray(entry.err) && entry.err.length === entry.rho.length ? entry.err : null, errKind: entry.opts?.errKind || null, // #929
    stations: st.filter((p) => [p.x, p.y, p.z].every(Number.isFinite)).map((p) => [p.x, p.y, p.z]),
    spacing: Number.isFinite(spacing) ? spacing : null, depth: suggestModelDepth(readings, [s0, s1], null),
  };
}

// Defaults for a set of placed lines: core cell = the smallest electrode spacing (twice the 2D cell, #680's default of half
// a spacing: a 3D mesh costs the cube), depth = the deepest of the lines' suggested model depths
export function suggest3d(lines) {
  const sp = lines.map((l) => l.spacing).filter((v) => v > 0);
  const core = sp.length ? Math.max(5, Math.round(Math.min(...sp) / 5) * 5) : 25;
  const depth = Math.max(core, ...lines.map((l) => l.depth || 0));
  return { core, depth: Math.round(depth) };
}

// Keep every `step`-th current position along each line (all of its readings): the cheaper preset (#643: half the
// current positions took the Woodjam run from ~1.7 to ~0.6 h with the same mesh class)
function thin(line, step) {
  if (!(step > 1)) return line;
  const key = (r) => `${r[0]},${r[1]},${r[2]},${r[3]},${r[4]},${r[5]}`;
  const order = [];
  for (const r of line.readings) { const k = key(r); if (!order.includes(k)) order.push(k); }
  const keep = new Set(order.filter((_, i) => i % step === 0));
  const idx = line.readings.map((r, i) => (keep.has(key(r)) ? i : -1)).filter((i) => i >= 0);
  return { ...line, readings: idx.map((i) => line.readings[i]), chain: idx.map((i) => line.chain[i]), rho: idx.map((i) => line.rho[i]), ip: line.ip ? idx.map((i) => line.ip[i]) : null, err: line.err ? idx.map((i) => line.err[i]) : null };
}

// TASKS.csv #929 — chargeability goes in only when every chosen line has one value per reading (the request used to drop
// it for the whole run on a length mismatch while the panel still offered the IP uncertainty)
export const linesHaveIp = (lines) => lines.length > 0 && lines.every((l) => Array.isArray(l.ip) && l.ip.length === l.rho.length);

// TASKS.csv #929 — the per-reading floors of the lines whose error column measures `kind` ("rhoPct" | "ipMvV"), null
// for every reading of the other lines, as the 2D request sends them (#683); null when no line has one
const errValue = (v) => { if (v == null || v === "") return null; const x = Number(v); return Number.isFinite(x) && x >= 0 ? x : null; };
export function perReadingFloors(lines, kind) {
  if (!lines.some((l) => l.err && l.errKind === kind)) return null;
  return lines.flatMap((l) => (l.err && l.errKind === kind ? l.err.map(errValue) : l.rho.map(() => null)));
}

// The request: lines from lineIn3d (ok ones), terrain (optional, sampled under the survey for the air / ground surface)
export function build3dRequest(lines, terrain, { core, depth, step = 1, pct, floor, ipPct, ipFloor, maxIter = 12, geometricFactor = "flat", useIp = true }) {
  const parts = lines.map((l) => thin(l, step));
  const withIp = useIp && linesHaveIp(parts);
  const flPct = perReadingFloors(parts, "rhoPct"), flIp = withIp ? perReadingFloors(parts, "ipMvV") : null; // #929
  const readings = parts.flatMap((l) => l.readings), chain = parts.flatMap((l) => l.chain), rho = parts.flatMap((l) => l.rho);
  const topo = parts.flatMap((l) => l.stations);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const r of readings) for (const k of [0, 3, 6, 9]) if (r[k] != null) { x0 = Math.min(x0, r[k]); x1 = Math.max(x1, r[k]); y0 = Math.min(y0, r[k + 1]); y1 = Math.max(y1, r[k + 1]); }
  let topoSkipped = 0; // TASKS.csv #927 — samples over the terrain's fill (or off it): the stations stand in there
  if (terrain) {
    const pad = 500, n = 40;
    for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) {
      const x = x0 - pad + ((x1 - x0 + 2 * pad) * i) / n, y = y0 - pad + ((y1 - y0 + 2 * pad) * j) / n;
      const z = terrainElevationAt(terrain, x, y);
      if (Number.isFinite(z)) topo.push([+x.toFixed(1), +y.toFixed(1), +z.toFixed(2)]); else topoSkipped++;
    }
  }
  return {
    readings, chain, rho, ...(withIp ? { chargeability: parts.flatMap((l) => l.ip) } : {}), topo, ...(terrain ? { topoSkipped } : {}),
    mesh: { core: Number(core), depth: Number(depth) }, maxIter: Number(maxIter) || 12, geometricFactor,
    uncertainty: { percent: num(pct) || 0, floor: num(floor) || 0, ...(flPct ? { floorPerReadingPercent: flPct } : {}) },
    ...(withIp ? { ipUncertainty: { percent: num(ipPct) || 0, floor: num(ipFloor) || 0, ...(flIp ? { floorPerReadingMvV: flIp } : {}) } } : {}),
  };
}

// The result's cells as a block model: only cells the data see (normalised support >= cutoff) and no bigger than
// maxCell across (the octree's padding cells are hundreds of metres)
export function cells3d(result, field, { cutoff = 0.005, maxCell = Infinity } = {}) {
  const c = result.cells, v = c[field];
  if (!v) return [];
  const out = [];
  for (let i = 0; i < v.length; i++) {
    if (c.support[i] < cutoff || Math.max(c.dx[i], c.dy[i]) > maxCell) continue;
    out.push({ x: c.x[i], y: c.y[i], z: c.z[i], dx: c.dx[i], dy: c.dy[i], dz: c.dz[i], value: v[i], support: c.support[i] });
  }
  return out;
}

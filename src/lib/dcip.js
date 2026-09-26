// TASKS.csv #322 — 2D DC resistivity / IP line data: reading the CSV, placing the line, and turning the
// inverted section into 3D block-model cells. Pure functions (the panel is DcipPanel.jsx; the inversion is
// python-sidecar/app/geophys/dcip2d.py).
//
// The CSV is one row per reading with the four electrode positions as DISTANCES ALONG THE LINE (m): A and B
// (current), M and N (potential). A pole-dipole or pole-pole survey leaves B and/or N blank (at "infinity").
// Apparent resistivity in ohm.m; chargeability (optional) in mV/V. The line itself is placed by its start
// and end coordinates in the project CRS (distance 0 = start).
import { terrainElevationAt } from "./inversion.js";

const norm = (h) => String(h).trim().toLowerCase().replace(/[\s()\[\]./-]+/g, "_").replace(/_+$/, "");
const ALIASES = {
  a: ["a", "c1", "a_x", "ax", "a_pos", "tx1", "c1_x"],
  b: ["b", "c2", "b_x", "bx", "b_pos", "tx2", "c2_x"],
  m: ["m", "p1", "m_x", "mx", "m_pos", "rx1", "p1_x"],
  n: ["n", "p2", "n_x", "nx", "n_pos", "rx2", "p2_x"],
  rho: ["rho", "rho_a", "rhoa", "app_res", "apparent_resistivity", "resistivity", "res", "rhoa_ohm_m", "rho_ohm_m"],
  ip: ["ip", "m_mv_v", "chargeability", "charg", "chg", "mv_v", "ma", "eta", "ip_mv_v"],
};
// Two passes: the full header (units included: "M (mV/V)" -> m_mv_v, a chargeability) first, then the header
// without a bracketed unit ("Rho_a (ohm.m)" -> rho_a). A header is used for one field only.
export function guessDcipColumns(headers) {
  const out = {};
  const used = new Set();
  const forms = [(h) => norm(h), (h) => norm(String(h).replace(/\(.*?\)|\[.*?\]/g, ""))];
  for (const form of forms) {
    for (const [key, names] of Object.entries(ALIASES)) {
      if (out[key]) continue;
      const hit = headers.find((h) => !used.has(h) && names.includes(form(h)));
      if (hit) { out[key] = hit; used.add(hit); }
    }
  }
  return out;
}

const num = (v) => { if (v == null || String(v).trim() === "" || /^(\*|na|nan|null|inf)$/i.test(String(v).trim())) return null; const n = Number(String(v).replace(",", ".")); return Number.isFinite(n) ? n : null; };

// rows: objects keyed by header. Returns { readings: [[a, b|null, m, n|null]], rho, ip|null, skipped, spacing, span, array }.
export function parseDcipRows(rows, mapping) {
  const readings = [], rho = [], ip = [];
  let skipped = 0;
  const useIp = !!mapping.ip;
  for (const r of rows) {
    const a = num(r[mapping.a]), b = mapping.b ? num(r[mapping.b]) : null, m = num(r[mapping.m]), n = mapping.n ? num(r[mapping.n]) : null;
    const v = num(r[mapping.rho]);
    const c = useIp ? num(r[mapping.ip]) : null;
    if (a == null || m == null || !(v > 0) || (useIp && c == null)) { skipped++; continue; }
    readings.push([a, b, m, n]); rho.push(v); if (useIp) ip.push(c);
  }
  const pos = [...new Set(readings.flat().filter((x) => x != null))].sort((p, q) => p - q);
  let spacing = Infinity;
  for (let i = 1; i < pos.length; i++) { const d = pos[i] - pos[i - 1]; if (d > 1e-6 && d < spacing) spacing = d; }
  const poleB = readings.some((r) => r[1] == null), poleN = readings.some((r) => r[3] == null);
  const array = poleB && poleN ? "pole-pole" : poleB ? "pole-dipole" : poleN ? "dipole-pole" : "dipole-dipole (or any 4-electrode array)";
  return { readings, rho, ip: useIp ? ip : null, skipped, spacing: Number.isFinite(spacing) ? spacing : null, span: pos.length ? [pos[0], pos[pos.length - 1]] : null, array };
}

export function lineGeometry(start, end) {
  const dx = end[0] - start[0], dy = end[1] - start[1], len = Math.hypot(dx, dy);
  if (!(len > 0)) return null;
  const u = [dx / len, dy / len];
  const azimuth = ((Math.atan2(u[0], u[1]) * 180) / Math.PI + 360) % 360;
  return { u, length: len, azimuth, at: (s) => [start[0] + u[0] * s, start[1] + u[1] * s] };
}

// Ground profile along the line from the terrain, from s0 to s1 (m along the line), for the mesh's air/ground
// boundary; null when the line leaves the terrain (the caller then asks for a flat ground elevation).
export function terrainProfile(terrain, geom, s0, s1, n = 120) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const s = s0 + ((s1 - s0) * i) / (n - 1);
    const [x, y] = geom.at(s);
    const z = terrainElevationAt(terrain, x, y);
    if (!Number.isFinite(z)) return null;
    out.push([+s.toFixed(3), +z.toFixed(3)]);
  }
  return out;
}

// Pseudo-section position of each reading (for the data preview): centre of the electrodes along the line,
// pseudo-depth = half the distance between the current and potential dipole centres (a common convention).
export function pseudoPositions(readings) {
  return readings.map(([a, b, m, n]) => {
    const ab = b == null ? a : (a + b) / 2, mn = n == null ? m : (m + n) / 2;
    return { s: (ab + mn) / 2, depth: Math.abs(mn - ab) / 2 };
  });
}

// The inverted 2D section as 3D block-model cells: each 2D cell becomes a box centred on the line at its
// distance, `thickness` m wide across the line. Cells are axis-aligned boxes (the block-model renderer's
// shape), so on an oblique line each box is the axis-aligned box around the rotated one — positions are
// exact, box outlines approximate.
export function sectionCells(result, geom, field, thickness) {
  const c = result.cells;
  const vals = c[field];
  if (!vals) return [];
  const ax = Math.abs(geom.u[0]), ay = Math.abs(geom.u[1]);
  const out = [];
  for (let i = 0; i < vals.length; i++) {
    const [x, y] = geom.at(c.s[i]);
    out.push({ x, y, z: c.z[i], dx: ax * c.ds[i] + ay * thickness, dy: ay * c.ds[i] + ax * thickness, dz: c.dz[i], value: vals[i], support: c.support[i] });
  }
  return out;
}

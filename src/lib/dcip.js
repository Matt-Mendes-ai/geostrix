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
// TASKS.csv #600 — contractor TDIP files (IRIS / Geosoft-style .dat / .ipg, e.g. a BC ARIS pole-dipole survey):
// T1X / T2X current, R1X / R2X potential, RHO, and MX = the chargeability (mV/V). "mx" used to be an alias of
// the M electrode, which would have read the chargeability column as an electrode position.
const ALIASES = {
  a: ["a", "c1", "t1x", "a_x", "ax", "a_pos", "tx1", "c1_x"],
  b: ["b", "c2", "t2x", "b_x", "bx", "b_pos", "tx2", "c2_x"],
  m: ["m", "p1", "r1x", "m_x", "m_pos", "rx1", "p1_x"],
  n: ["n", "p2", "r2x", "n_x", "nx", "n_pos", "rx2", "p2_x"],
  rho: ["rho", "rho_a", "rhoa", "app_res", "apparent_resistivity", "resistivity", "res", "rhoa_ohm_m", "rho_ohm_m"],
  ip: ["ip", "m_mv_v", "chargeability", "charg", "chg", "mv_v", "ma", "mx", "eta", "ip_mv_v"],
};

// TASKS.csv #600 — a line file that is not a plain CSV: contractor TDIP exports put metadata lines first
// (DATATYPE:TDIP, LINE:... ARRAY:PLDP ...) and then a WHITESPACE-separated table with '*' for an electrode at
// infinity. Finds the header line (the first one naming an A and an M electrode column), splits the rest on
// whitespace, keeps rows with the header's column count. Returns { headers, rows, note } or null when the text
// has no such header (then it is read as an ordinary CSV).
export function parseDcipWhitespaceText(text) {
  const lines = String(text).split(/\r?\n/);
  const isA = (t) => ALIASES.a.includes(norm(t)), isM = (t) => ALIASES.m.includes(norm(t));
  const hi = lines.findIndex((l) => { const t = l.trim().split(/\s+/); return t.length >= 4 && t.some(isA) && t.some(isM); });
  if (hi < 0) return null;
  const headers = lines[hi].trim().split(/\s+/);
  const rows = [];
  let skipped = 0;
  for (const l of lines.slice(hi + 1)) {
    if (!l.trim() || l.trim().startsWith("/")) continue;
    const t = l.trim().split(/\s+/);
    if (t.length !== headers.length) { skipped++; continue; }
    rows.push(Object.fromEntries(headers.map((h, i) => [h, t[i]])));
  }
  const meta = lines.slice(0, hi).map((l) => l.trim()).filter(Boolean).join(" · ");
  return { headers, rows, note: `Whitespace-separated line file${meta ? ` (${meta.slice(0, 160)})` : ""}; ${rows.length} readings${skipped ? `, ${skipped} line(s) with a different column count skipped` : ""}.` };
}
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
    let a = num(r[mapping.a]), b = mapping.b ? num(r[mapping.b]) : null, m = num(r[mapping.m]), n = mapping.n ? num(r[mapping.n]) : null;
    // #600 — a pole written in the FIRST column ('*' in T1X, the electrode in T2X) is the same pole array
    if (a == null && b != null) { a = b; b = null; }
    if (m == null && n != null) { m = n; n = null; }
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

// TASKS.csv #322 — what a saved line keeps of a result: the section (cells + electrodes) and the fit, not
// the predicted data / per-iteration history (re-run the inversion for those).
export function slimDcipResult(result) {
  const c = result.cells;
  const cells = { s: c.s, z: c.z, ds: c.ds, dz: c.dz, resistivity: c.resistivity, support: c.support, ...(c.chargeability ? { chargeability: c.chargeability } : {}) };
  return { kind: "dcip2d", cells, electrodes: result.electrodes, phi_d: result.phi_d, target: result.target, reachedTarget: result.reachedTarget,
    iterations: result.iterations, ip: result.ip ? { phi_d: result.ip.phi_d } : null, mesh: result.mesh, versions: result.versions };
}

// A saved line back into the panel's import shape: one row per reading under fixed headers, so the normal
// column-mapping / parse path (parseDcipRows) is reused unchanged. B / N blank = pole, as in an imported file.
export const SAVED_LINE_HEADERS = ["A", "B", "M", "N", "Apparent resistivity", "Chargeability"];
export function savedLineToFile(entry) {
  const ip = entry.ip && entry.ip.length === entry.readings.length;
  const headers = ip ? SAVED_LINE_HEADERS : SAVED_LINE_HEADERS.slice(0, 5);
  const rows = entry.readings.map((r, i) => {
    const o = { A: r[0], B: r[1] ?? "", M: r[2], N: r[3] ?? "", "Apparent resistivity": entry.rho[i] };
    if (ip) o.Chargeability = entry.ip[i];
    return o;
  });
  const mapping = { a: "A", b: "B", m: "M", n: "N", rho: "Apparent resistivity", ...(ip ? { ip: "Chargeability" } : {}) };
  return { file: { name: entry.name, headers, rows }, mapping };
}

// The inverted section as table rows: distance along the line, its x / y in the project CRS, elevation,
// cell size, values and support (normalised sensitivity).
export function sectionTableRows(result, geom) {
  const c = result.cells;
  const out = [];
  for (let i = 0; i < c.s.length; i++) {
    const [x, y] = geom.at(c.s[i]);
    const row = { distance_m: c.s[i], x: +x.toFixed(3), y: +y.toFixed(3), z: c.z[i], ds_m: c.ds[i], dz_m: c.dz[i], resistivity_ohmm: c.resistivity[i] };
    if (c.chargeability) row.chargeability_mVV = c.chargeability[i];
    row.support = c.support[i];
    out.push(row);
  }
  return out;
}

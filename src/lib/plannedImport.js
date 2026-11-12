// TASKS.csv #2651 (follow-up of #2449) — planned holes from a CSV: the rig sheet's own columns (name, E, N, Elev, azimuth, dip, length) and
// GeoStrix's own rig-sheet export (lib/rigExport.js: azimuth_grid, target_x/y/z, lift / drift, hole_type, notes) read back. Pure.
const ALIASES = {
  name: ["name", "hole", "hole_id", "holeid", "hole id", "id", "planned_hole"],
  x: ["x", "e", "east", "easting", "x_grid"],
  y: ["y", "n", "north", "northing", "y_grid"],
  z: ["z", "elev", "elevation", "rl", "collar_rl", "collar_z"],
  azimuth: ["azimuth_grid", "azimuth", "az", "azi", "bearing"],
  dip: ["dip", "inclination", "incl"],
  length: ["length", "depth", "eoh", "max_depth", "total_depth", "planned_depth", "length_m"],
  type: ["hole_type", "type", "rig"],
  notes: ["notes", "note", "comment", "comments"],
  tx: ["target_x"], ty: ["target_y"], tz: ["target_z"],
  lift: ["lift_deg_per_100m", "lift"], drift: ["drift_deg_per_100m", "drift"],
};
const norm = (h) => String(h || "").trim().toLowerCase().replace(/\s*\((m|°|deg)\)\s*$/, "").replace(/[\s-]+/g, "_");
// headers -> { field: header } (the first alias found)
export function plannedColumns(headers) {
  const byNorm = new Map((headers || []).map((h) => [norm(h), h]));
  const out = {};
  for (const [k, list] of Object.entries(ALIASES)) for (const a of list) { const h = byNorm.get(norm(a)); if (h != null) { out[k] = h; break; } }
  return out;
}
const num = (v) => { if (v == null || v === "") return NaN; const n = typeof v === "number" ? v : Number(String(v).trim().replace(/,(\d+)$/, ".$1")); return Number.isFinite(n) ? n : NaN; };

// rows (objects by header), headers -> { holes: [{ name?, x, y, z, azimuth, dip, length, ... }], skipped: [{ row, why }], cols, missing: [fields],
// allDipsPositive, onlyNonGridAzimuth: header | null, verticalBlankAz: rows read as azimuth 0, usedFallback, noOrientation }
// TASKS.csv #2963 (review #2876, WA iron) — a plan for a field of vertical holes is a list of E, N and depth, and the app's own rig sheet leaves
// a vertical hole's azimuth blank (#2454): a dip of -90 / 90 with a blank azimuth was skipped ('lines 2 (azimuth)'), and a sheet with no
// azimuth or dip column added nothing. Now a vertical row's blank azimuth reads 0 (verticalBlankAz counts them); a dip column with no
// azimuth column imports when every hole is vertical; with neither column, `fallback` ({ azimuth, dip }: the form's, asked first by the
// pane, never assumed) is used for every row (usedFallback). A blank elevation is still skipped (TASKS.csv #3004 sets which ground to trust).
const isVertical = (d) => Math.abs(Math.abs(d) - 90) < 1e-9;
export function plannedHolesFromRows(rows, headers, { fallback = null } = {}) {
  const cols = plannedColumns(headers);
  const fb = fallback && Number.isFinite(Number(fallback.azimuth)) && Number.isFinite(Number(fallback.dip)) && Math.abs(Number(fallback.dip)) <= 90 ? { azimuth: Number(fallback.azimuth), dip: Number(fallback.dip) } : null;
  const noOrientation = !cols.azimuth && !cols.dip;
  // a dip column and no azimuth column: fine when every row with a dip is vertical
  const dips = cols.dip && !cols.azimuth ? (rows || []).map((r) => num(r[cols.dip])).filter(Number.isFinite) : [];
  const allVertical = dips.length > 0 && dips.every(isVertical);
  const missing = ["x", "y", "z", "azimuth", "dip", "length"].filter((k) => !cols[k] && !(noOrientation && fb && (k === "azimuth" || k === "dip")) && !(k === "azimuth" && allVertical));
  // the rig sheet's true or magnetic azimuth alone is not the grid bearing a planned hole keeps
  const onlyNonGridAzimuth = !cols.azimuth ? (headers || []).find((h) => /^azimuth_(true|magnetic)$/i.test(norm(h))) || null : null;
  if (missing.length) return { holes: [], skipped: [], cols, missing, allDipsPositive: false, onlyNonGridAzimuth, verticalBlankAz: 0, usedFallback: false, noOrientation };
  const usedFallback = noOrientation && !!fb;
  const holes = [], skipped = [];
  let verticalBlankAz = 0;
  (rows || []).forEach((r, i) => {
    const h = { x: num(r[cols.x]), y: num(r[cols.y]), z: num(r[cols.z]), azimuth: usedFallback ? fb.azimuth : cols.azimuth ? num(r[cols.azimuth]) : NaN, dip: usedFallback ? fb.dip : num(r[cols.dip]), length: num(r[cols.length]) };
    if (!usedFallback && !Number.isFinite(h.azimuth) && Number.isFinite(h.dip) && isVertical(h.dip)) { h.azimuth = 0; verticalBlankAz++; } // #2963
    const bad = Object.entries(h).filter(([k, v]) => !Number.isFinite(v) || (k === "length" && !(v > 0)) || (k === "dip" && Math.abs(v) > 90)).map(([k]) => k);
    if (bad.length) { skipped.push({ row: i + 2, why: bad.join(", ") }); return; } // +2: the header is line 1
    h.azimuth = ((h.azimuth % 360) + 360) % 360;
    const name = cols.name ? String(r[cols.name] ?? "").trim() : "";
    if (name) h.name = name;
    if (cols.type && String(r[cols.type] ?? "").trim()) h.type = String(r[cols.type]).trim();
    if (cols.notes && String(r[cols.notes] ?? "").trim()) h.notes = String(r[cols.notes]).trim();
    const t = cols.tx && cols.ty && cols.tz ? { x: num(r[cols.tx]), y: num(r[cols.ty]), z: num(r[cols.tz]) } : null;
    if (t && [t.x, t.y, t.z].every(Number.isFinite)) h.target = t;
    for (const k of ["lift", "drift"]) if (cols[k] && Number.isFinite(num(r[cols[k]])) && num(r[cols[k]]) !== 0) h[k] = num(r[cols[k]]);
    holes.push(h);
  });
  return { holes, skipped, cols, missing, allDipsPositive: holes.length > 0 && holes.every((h) => h.dip > 0), onlyNonGridAzimuth, verticalBlankAz, usedFallback, noOrientation };
}

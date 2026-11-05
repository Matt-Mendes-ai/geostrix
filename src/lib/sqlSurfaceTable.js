// TASKS.csv #1799 (review #1646, Kodiak) — the soil program's table: 'soils with Cu > 160 and Au > 0.0096' is one query. One row per
// surface sample, one column per surface element (in its stored unit), and the sample's other columns as JSON in attrs
// (json_extract(attrs, '$.Horizon')). An element named like a fixed column (x, medium...) is left out rather than shadowing it.
const SURFACE_FIXED = ["sample_id", "x", "y", "z", "medium", "attrs"];
export function surfaceSampleColumns(surfaceElements) {
  const fixed = new Set(SURFACE_FIXED), seen = new Set();
  return (surfaceElements || []).map((e) => e.symbol).filter((s) => { const k = String(s).toLowerCase(); if (!s || fixed.has(k) || seen.has(k)) return false; seen.add(k); return true; });
}
export function createSurfaceSamplesTable(db, samples, surfaceElements) {
  if (!samples.length) return;
  const symbols = surfaceSampleColumns(surfaceElements);
  db.run(`CREATE TABLE surface_samples (sample_id TEXT, x REAL, y REAL, z REAL, medium TEXT, attrs TEXT${symbols.map((s) => `, "${s.replace(/"/g, '""')}" REAL`).join("")});`);
  const stmt = db.prepare(`INSERT INTO surface_samples VALUES (${[...SURFACE_FIXED, ...symbols].map(() => "?").join(",")})`);
  const num = (v) => (Number.isFinite(Number(v)) && v !== "" && v != null ? Number(v) : null);
  samples.forEach((s) => {
    const v = s.values || {};
    stmt.run([s.sample_id ?? null, num(s.x), num(s.y), num(s.z), s.medium ?? null, s.attrs && Object.keys(s.attrs).length ? JSON.stringify(s.attrs) : null, ...symbols.map((k) => num(v[k]))]);
  });
  stmt.free();
}

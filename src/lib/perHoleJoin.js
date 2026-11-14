// TASKS.csv #2659 (follow-up of #2459 / #2591) — a per-hole table (Hole_id, MGA_E, MGA_N, Best_Li2O_pct, Depth_of_best_m) dropped on the 3D View
// was offered as a Collars import with nothing said: every id was an existing collar at that collar's own coordinates, so importing it only
// joins its other columns onto those holes (the collar import fills values a hole does not have, #600). This says so in the dialog. Pure;
// loaded with the import dialog (a lazy chunk), never at startup.
// rows: the table's rows; mapping: { hole_id, x, y }; collars: the project's; tolM: how close counts as the same position (file units)
// -> { n, columns } when every row with an id is an existing collar within tolM, else null
// TASKS.csv #2399 (review #2325, WA uranium) — a per-hole table with NO coordinates (the gamma log's calibration table: probe, K factors, dead time,
// casing and water corrections, date logged; one row per hole) had no route at all. With no x / y mapped, a table whose every id is an existing
// collar, each once, is a join too: { n, columns, noXY: true }, its columns merged onto those holes' attributes (perHoleAttrs).
export function perHoleJoinOf(rows, mapping, collars, tolM = 1) {
  if (mapping?.hole_id && (!mapping?.x || !mapping?.y) && Array.isArray(rows) && rows.length && collars?.length) {
    const ids = new Set(collars.map((c) => String(c.hole_id).trim())), seen = new Set();
    for (const r of rows) { const id = String(r?.[mapping.hole_id] ?? "").trim(); if (!id) continue; if (!ids.has(id) || seen.has(id)) return null; seen.add(id); }
    if (!seen.size) return null;
    const used = new Set(Object.values(mapping).filter(Boolean));
    return { n: seen.size, columns: Object.keys(rows[0] || {}).filter((h) => !used.has(h)), noXY: true };
  }
  if (!mapping?.hole_id || !mapping?.x || !mapping?.y || !Array.isArray(rows) || !rows.length || !collars?.length) return null;
  const byId = new Map(collars.map((c) => [String(c.hole_id).trim(), c]));
  let n = 0;
  for (const r of rows) {
    const id = String(r?.[mapping.hole_id] ?? "").trim();
    if (!id) continue;
    const c = byId.get(id), x = Number(r[mapping.x]), y = Number(r[mapping.y]);
    if (!c || !Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x - c.x) > tolM || Math.abs(y - c.y) > tolM) return null;
    n++;
  }
  if (!n) return null;
  const used = new Set(Object.values(mapping).filter(Boolean));
  const columns = Object.keys(rows[0] || {}).filter((h) => !used.has(h));
  return { n, columns };
}

// #2399 — the attributes a no-coordinate per-hole table adds to each hole: Map(hole id -> { column: text }), blanks and no-data codes
// (isNull: layers.js isNullSentinel, -999 among them) left out, each name on one line
export function perHoleAttrs(rows, holeCol, isNull = () => false) {
  const out = new Map();
  for (const r of rows || []) {
    const id = String(r?.[holeCol] ?? "").trim(); if (!id) continue;
    const a = {};
    for (const [h, v] of Object.entries(r)) {
      if (h === holeCol || v == null) continue;
      const t = v instanceof Date ? v.toISOString().slice(0, 10) : String(v).trim();
      if (t === "" || isNull(v) || isNull(t)) continue;
      a[String(h).replace(/\s+/g, " ").trim()] = t;
    }
    out.set(id, a);
  }
  return out;
}

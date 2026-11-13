// TASKS.csv #2659 (follow-up of #2459 / #2591) — a per-hole table (Hole_id, MGA_E, MGA_N, Best_Li2O_pct, Depth_of_best_m) dropped on the 3D View
// was offered as a Collars import with nothing said: every id was an existing collar at that collar's own coordinates, so importing it only
// joins its other columns onto those holes (the collar import fills values a hole does not have, #600). This says so in the dialog. Pure;
// loaded with the import dialog (a lazy chunk), never at startup.
// rows: the table's rows; mapping: { hole_id, x, y }; collars: the project's; tolM: how close counts as the same position (file units)
// -> { n, columns } when every row with an id is an existing collar within tolM, else null
export function perHoleJoinOf(rows, mapping, collars, tolM = 1) {
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

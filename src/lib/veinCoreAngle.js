// TASKS.csv #1739 — the true thickness a vein's logged angle to core axis (alpha / TCA) implies, to set beside the modelled one.
// A vein crossed at alpha degrees to the core axis is downhole length × sin(alpha) thick. The angle may sit on the vein layer
// itself or on a custom interval layer of the same intervals (Copley's Veins table carries Vein_AvgAngle_TCA1).
const ANGLE_COL = /(^|[^a-z])(tca|alpha)([^a-z]|$)|angle_?to_?core|core_?angle/i;

// the angle column of a set of interval rows: numeric values in it, a name like TCA / alpha / angle to core; an unnumbered
// column first, else the first of a numbered set (TCA1 is the primary vein's)
export function coreAngleColumn(rows) {
  const keys = new Set();
  for (const r of (rows || []).slice(0, 500)) for (const k of Object.keys(r || {})) keys.add(k);
  const has = (k) => (rows || []).some((r) => r && r[k] != null && r[k] !== "" && Number.isFinite(Number(r[k])));
  const cands = [...keys].filter((k) => ANGLE_COL.test(k) && has(k));
  if (!cands.length) return null;
  return cands.find((k) => !/\d$/.test(k)) || cands.find((k) => /1$/.test(k)) || cands[0];
}

// intercepts: [{ holeId, from, to }] (downhole metres); sources: [{ name, rows }] tried in order, the first with an angle column
// that reaches an intercept is used. Rows with a `value` must match veinValue. -> { column, layer, n, of, min, max, mean } | null
export function coreAngleThickness(intercepts, veinValue, sources) {
  for (const src of sources || []) {
    const column = coreAngleColumn(src.rows);
    if (!column) continue;
    const byHole = new Map();
    for (const r of src.rows || []) {
      const a = Number(r?.[column]);
      if (r?.[column] == null || r[column] === "" || !(a > 0 && a <= 90)) continue;
      if (r.value != null && r.value !== "" && veinValue != null && r.value !== veinValue) continue;
      const k = r.hole_id;
      if (!byHole.has(k)) byHole.set(k, []);
      byHole.get(k).push({ from: Number(r.from), to: Number(r.to), a });
    }
    const t = [];
    for (const i of intercepts || []) {
      let w = 0, s = 0;
      for (const r of byHole.get(i.holeId) || []) {
        const ov = Math.min(r.to, i.to) - Math.max(r.from, i.from);
        if (ov > 0) { w += ov; s += ov * r.a; }
      }
      if (w > 0) t.push((i.to - i.from) * Math.sin(((s / w) * Math.PI) / 180));
    }
    if (t.length) return { column, layer: src.name, n: t.length, of: (intercepts || []).length, min: Math.min(...t), max: Math.max(...t), mean: t.reduce((a, b) => a + b, 0) / t.length };
  }
  return null;
}

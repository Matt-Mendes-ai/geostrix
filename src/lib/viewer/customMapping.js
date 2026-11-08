// TASKS.csv #1654 (review #1645, Copley) — switching an import to 'Custom layer': the value column already guessed for the previous
// kind carries over (Custom's own aliases are only 'value' / 'label'), and the hole / from / to too when Custom found none; a table
// whose From equals its To on every row (Copley's SWIR files: GEOLFROM = GEOLTO on 395 rows) is point data, so From becomes Depth and
// From / To are cleared.
const num = (v) => { const x = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(",", ".")); return Number.isFinite(x) ? x : NaN; };
export function customFromPrevious(guess, previous, rows) {
  const m = { ...guess };
  for (const k of ["hole_id", "from", "to", "depth", "value"]) if (!m[k] && previous[k]) m[k] = previous[k];
  if (m.from && m.to && !m.depth) {
    let n = 0, same = 0;
    for (const r of rows || []) { const a = num(r[m.from]), b = num(r[m.to]); if (!Number.isFinite(a) || !Number.isFinite(b)) continue; n++; if (a === b) same++; }
    if (n > 0 && same === n) { m.depth = m.from; m.from = ""; m.to = ""; }
  }
  return m;
}

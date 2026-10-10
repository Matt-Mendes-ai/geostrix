// TASKS.csv #619 — the logged lithology of each assay sample, for filtering (and colouring) geochem plots.
// Sample and log intervals rarely share boundaries, so a sample takes the logged unit it OVERLAPS most; a
// point sample (from = to) takes the unit containing it. Samples with no overlapping log interval get null
// ("not logged"). One pass per hole over intervals sorted by depth: fast for tens of thousands of samples.
export const NOT_LOGGED = "__not_logged__";

export function lithologyBySample(samples, lithoRows) {
  const byHole = new Map();
  for (const r of lithoRows || []) {
    const from = Number(r.from), to = Number(r.to);
    if (r.hole_id == null || !Number.isFinite(from) || !Number.isFinite(to) || to <= from || r.value == null || r.value === "") continue;
    let list = byHole.get(r.hole_id);
    if (!list) byHole.set(r.hole_id, (list = []));
    list.push({ from, to, value: String(r.value) });
  }
  for (const list of byHole.values()) list.sort((a, b) => a.from - b.from);
  const out = new Map();
  for (const s of samples || []) {
    const list = byHole.get(s.hole_id);
    const from = Number(s.from), to = Number(s.to);
    if (!list || !Number.isFinite(from)) { out.set(s, null); continue; }
    const top = from, bot = Number.isFinite(to) && to > from ? to : from;
    let best = null, bestLen = -1;
    // binary search for the first interval that could reach this sample
    let lo = 0, hi = list.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (list[mid].to < top) lo = mid + 1; else hi = mid; }
    for (let i = lo; i < list.length && list[i].from <= bot; i++) {
      const iv = list[i];
      const len = bot > top ? Math.min(bot, iv.to) - Math.max(top, iv.from) : (iv.from <= top && top <= iv.to ? 0 : -1);
      if (len > bestLen) { bestLen = len; best = iv.value; }
    }
    out.set(s, bestLen >= 0 ? best : null);
  }
  return out;
}

// codes with their sample counts, most common first; NOT_LOGGED last when present
export function lithologyCounts(lithMap) {
  const counts = new Map();
  for (const v of lithMap.values()) { const k = v ?? NOT_LOGGED; counts.set(k, (counts.get(k) || 0) + 1); }
  return [...counts.entries()].sort((a, b) => (a[0] === NOT_LOGGED) - (b[0] === NOT_LOGGED) || b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
}

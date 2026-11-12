// TASKS.csv #619 — the logged lithology of each assay sample, for filtering (and colouring) geochem plots.
// Sample and log intervals rarely share boundaries, so a sample takes the logged unit it OVERLAPS most; a
// point sample (from = to) takes the unit containing it. Samples with no overlapping log interval get null
// ("not logged"). One pass per hole over intervals sorted by depth: fast for tens of thousands of samples.
export const NOT_LOGGED = "__not_logged__";

// TASKS.csv #2510 (review #2486, WA lithium) — ONE rule for the logged code a sample falls in, used by the diagram filter, Grade stats and
// Thresholds: pegmatite P held 6,528 / 6,406 / 6,402 samples in the three (largest overlap here, the code at the middle in the other two,
// one of them inclusive at both ends and in file order), and the no-code class had three names. The rule: the code the sample overlaps
// most (the shallower on a tie); a point sample (from = to) takes the interval holding it, half-open (from <= depth < to); a sample
// that only touches an interval at a boundary is not in it. Empty values are no code; values are trimmed.
export const NO_CODE = "no code logged"; // the one name of the class (English: it is also a population key saved with a threshold)

// rows -> Map hole_id -> [{ from, to, value }] sorted by from, built once per layer
export function codeIndex(rows) {
  const byHole = new Map();
  for (const r of rows || []) {
    const from = Number(r?.from), to = Number(r?.to);
    const value = r?.value == null ? "" : String(r.value).trim();
    if (r?.hole_id == null || !Number.isFinite(from) || !Number.isFinite(to) || to <= from || value === "") continue;
    let list = byHole.get(r.hole_id);
    if (!list) byHole.set(r.hole_id, (list = []));
    list.push({ from, to, value });
  }
  for (const list of byHole.values()) list.sort((a, b) => a.from - b.from);
  return byHole;
}

// the code of one sample, or null (no code logged)
export function codeAt(index, hole_id, fromIn, toIn) {
  const list = index?.get(hole_id);
  const from = Number(fromIn), to = Number(toIn);
  if (!list || !Number.isFinite(from)) return null;
  const point = !(Number.isFinite(to) && to > from);
  const top = from, bot = point ? from : to;
  // binary search for the first interval that could reach this sample
  let lo = 0, hi = list.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (list[mid].to <= top) lo = mid + 1; else hi = mid; }
  let best = null, bestLen = 0;
  for (let i = lo; i < list.length && list[i].from <= bot; i++) {
    const iv = list[i];
    if (point) { if (iv.from <= top && top < iv.to) return iv.value; continue; }
    const len = Math.min(bot, iv.to) - Math.max(top, iv.from);
    if (len > bestLen) { bestLen = len; best = iv.value; }
  }
  return best;
}

export function lithologyBySample(samples, lithoRows) {
  const index = codeIndex(lithoRows);
  const out = new Map();
  for (const s of samples || []) out.set(s, codeAt(index, s.hole_id, s.from, s.to));
  return out;
}

// codes with their sample counts, most common first; NOT_LOGGED last when present
export function lithologyCounts(lithMap) {
  const counts = new Map();
  for (const v of lithMap.values()) { const k = v ?? NOT_LOGGED; counts.set(k, (counts.get(k) || 0) + 1); }
  return [...counts.entries()].sort((a, b) => (a[0] === NOT_LOGGED) - (b[0] === NOT_LOGGED) || b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
}

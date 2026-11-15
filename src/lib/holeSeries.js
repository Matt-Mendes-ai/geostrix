// TASKS.csv #3347 (review #3195, Galore Creek) — a new planned hole was named PLAN-1 on a project numbered GC23-0956 to GC23-0988. The next id of
// the project's commonest numbered series is offered instead: an id read as a prefix and its trailing digits ('GC23-0988' -> 'GC23-', 988,
// width 4); the prefix with the most ids wins (ties: the one with the highest number); the next number is one past the highest id of that
// prefix among the holes and the planned holes, padded to the series' usual width. -> 'GC23-0989', or null when no id ends in digits.
const SPLIT = /^(.*?)(\d+)$/;
export function holeSeries(ids) {
  const by = new Map();
  for (const raw of ids || []) {
    const m = SPLIT.exec(String(raw ?? "").trim());
    if (!m) continue;
    const e = by.get(m[1]) || { prefix: m[1], n: 0, max: -1, widths: new Map() };
    const v = Number(m[2]);
    e.n++; if (v > e.max) e.max = v; e.widths.set(m[2].length, (e.widths.get(m[2].length) || 0) + 1);
    by.set(m[1], e);
  }
  if (!by.size) return null;
  const best = [...by.values()].sort((a, b) => b.n - a.n || b.max - a.max)[0];
  const width = [...best.widths].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];
  return { prefix: best.prefix, next: best.max + 1, width }; // #3433: the parts, for the planned-holes line / grid
}
export function nextHoleId(ids) {
  const s = holeSeries(ids);
  return s ? `${s.prefix}${String(s.next).padStart(s.width, "0")}` : null;
}

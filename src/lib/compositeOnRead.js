// TASKS.csv #2345 (split from #2321; Matt's decision on #2177: subset first, composite only on request) — a table over the memory budget
// composited to fixed lengths AS IT IS READ, so its raw rows are never all held. Only when the user ticks it in the column chooser and types
// the length; never by default. Each hole's intervals go into bins [k*L, (k+1)*L) down the hole: a numeric column's composite is the
// length-weighted mean of its numbers, a text column's is the value over most of the bin's length. A bin's from / to are where its
// intervals actually start and stop, so a hole's last composite is a partial one. Rows of one hole that are not together in the file are
// composited all the same (the bins are per hole and depth) and counted.

// opts: { hole, from, to, lengthM } (column names, length in metres). -> { add(row), finish() -> { rows, stats } }
export function makeCompositor({ hole, from, to, lengthM }) {
  const L = Number(lengthM);
  if (!(L > 0)) throw new Error("composite length must be above 0");
  const holes = new Map(); // id -> Map(k -> bin)
  const colSeen = new Map(); // column -> { num, txt } counts, to decide numeric or text at the end
  let prev = null, rowsIn = 0, skipped = 0;
  const notTogether = new Set(), left = new Set();
  const seen = (c, kind) => { let s = colSeen.get(c); if (!s) colSeen.set(c, (s = { num: 0, txt: 0 })); s[kind]++; };
  function add(row) {
    const id = String(row?.[hole] ?? "").trim(), a = Number(row?.[from]), b = Number(row?.[to]);
    if (!id || !Number.isFinite(a) || !Number.isFinite(b) || !(b > a)) { skipped++; return; }
    rowsIn++;
    if (id !== prev) { if (prev != null) left.add(prev); if (left.has(id)) notTogether.add(id); prev = id; }
    let bins = holes.get(id);
    if (!bins) holes.set(id, (bins = new Map()));
    for (let k = Math.floor(a / L + 1e-9); k * L < b - 1e-9; k++) {
      const lo = Math.max(a, k * L), hi = Math.min(b, (k + 1) * L), w = hi - lo;
      if (!(w > 1e-9)) continue;
      let bin = bins.get(k);
      if (!bin) bins.set(k, (bin = { k, from: lo, to: hi, n: 0, num: new Map(), txt: new Map() }));
      bin.from = Math.min(bin.from, lo); bin.to = Math.max(bin.to, hi); bin.n++;
      for (const c of Object.keys(row)) {
        if (c === hole || c === from || c === to) continue;
        const v = row[c];
        if (v == null || v === "") continue;
        if (typeof v === "number" && Number.isFinite(v)) {
          seen(c, "num"); const s = bin.num.get(c) || [0, 0]; s[0] += v * w; s[1] += w; bin.num.set(c, s);
        } else {
          const t = v instanceof Date ? v.toISOString() : String(v).trim();
          if (!t) continue;
          seen(c, "txt"); let m = bin.txt.get(c); if (!m) bin.txt.set(c, (m = new Map())); m.set(t, (m.get(t) || 0) + w);
        }
      }
    }
  }
  function finish() {
    const numeric = new Set([...colSeen].filter(([, s]) => s.num > 0 && s.num >= s.txt).map(([c]) => c));
    let textInNumeric = 0;
    for (const [c, s] of colSeen) if (numeric.has(c)) textInNumeric += s.txt;
    const r6 = (v) => Math.round(v * 1e6) / 1e6, out = [];
    for (const [id, bins] of holes) {
      for (const bin of [...bins.values()].sort((p, q) => p.k - q.k)) {
        const o = { [hole]: id, [from]: r6(bin.from), [to]: r6(bin.to) };
        for (const c of colSeen.keys()) {
          if (numeric.has(c)) { const s = bin.num.get(c); o[c] = s && s[1] > 0 ? s[0] / s[1] : null; }
          else { const m = bin.txt.get(c); let best = null, bw = -1; if (m) for (const [t, w] of m) if (w > bw) { best = t; bw = w; } o[c] = best; }
        }
        out.push(o);
      }
    }
    return { rows: out, stats: { lengthM: L, rowsIn, composites: out.length, holes: holes.size, skipped, notTogether: [...notTogether], textInNumeric, numeric: [...numeric] } };
  }
  return { add, finish };
}

// guesses for the chooser: the from / to columns of an interval table
export const FROM_COL = /^(from|depth_?from|m_?from|from_?m|from_?depth|geolfrom|sampfrom|mfrom|start|depth_?start|top)$/i;
export const TO_COL = /^(to|depth_?to|m_?to|to_?m|to_?depth|geolto|sampto|mto|end|depth_?end|bottom|base)$/i;

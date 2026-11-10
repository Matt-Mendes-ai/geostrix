// TASKS.csv #2164 (WA review #2148) — the assay import dialog counted negatives (two passes per column), zeros and blanks over every
// cell of every ticked column before it could paint: four passes over a 590,000-row x 30-element file (71 M cell reads through the
// columnar row getters) froze the window for 3.1 s. One pass over the rows reads every candidate column at once, in chunks that
// yield to the window between them, with progress; ticking an element re-sums the per-column results without a rescan (#583).
import { parseAssayValue, isBlankAssayCell, isOverLimitCode, isNoDataCode, isElementColumn } from "./geochem.js"; // isNoDataCode: #2336

const yieldToWindow = () => new Promise((resolve) => setTimeout(resolve, 0));

// rows x headers -> Map(header -> { max, negs: [negative values], zeros, blank: Uint8Array(rows) }), or null when cancelled.
// max is the column's largest positive value (#1648); a zero is any cell that reads as 0 ("0", "<0" -> 0 / 2), as the dialog
// counted it (#1677); blank is a truly empty cell (#502).
export async function scanAssayColumns(rows, headers, { chunk = 25000, onProgress, isCancelled } = {}) {
  const n = (rows || []).length, H = headers.length;
  const st = headers.map(() => ({ max: 0, negs: [], zeros: 0, blank: new Uint8Array(n) }));
  for (let start = 0; start < n; start += chunk) {
    const end = Math.min(n, start + chunk);
    for (let i = start; i < end; i++) {
      const r = rows[i];
      for (let j = 0; j < H; j++) {
        const raw = r[headers[j]], s = st[j];
        if (isBlankAssayCell(raw)) { s.blank[i] = 1; continue; }
        const v = parseAssayValue(raw);
        if (v == null) continue;
        if (v > s.max) s.max = v;
        else if (v < 0) s.negs.push(v);
        else if (v === 0) s.zeros++;
      }
    }
    if (end < n) {
      onProgress?.(end / n);
      await yieldToWindow();
      if (isCancelled?.()) return null;
    }
  }
  return new Map(headers.map((h, j) => [h, st[j]]));
}

// one column's negatives by kind: over-limit codes (#1648), no-data sentinels and below-detection codes (#333)
export function columnNegatives(s) {
  if (s._neg) return s._neg;
  const c = { codes: 0, sentinels: 0, over: 0, overCode: null, sentinelCodes: new Map() }; // sentinelCodes: #2336 — value -> count
  for (const v of s.negs) {
    if (isOverLimitCode(v, s.max)) { c.over++; c.overCode = v; } else if (isNoDataCode(v, s.max)) { c.sentinels++; c.sentinelCodes.set(v, (c.sentinelCodes.get(v) || 0) + 1); } else c.codes++;
  }
  return (s._neg = c);
}

// the dialog's negatives summary over the columns being imported; overOn false = over-limit codes fall back into the other two
export function negativeSummary(stats, hs, overOn = true) {
  const t = { codes: 0, sentinels: 0, over: 0, overCols: [], overAny: 0, sentinelCols: [] }; // sentinelCols: #2336 — "P: -9999 ×20"
  for (const h of hs) {
    const s = stats.get(h);
    if (!s) continue;
    const c = columnNegatives(s);
    const back = overOn ? 0 : c.over;
    const backNoData = back && isNoDataCode(c.overCode, s.max); // #2336
    t.codes += c.codes + (back && !backNoData ? back : 0);
    t.sentinels += c.sentinels + (backNoData ? back : 0);
    if (c.sentinelCodes.size) t.sentinelCols.push(`${h}: ${[...c.sentinelCodes].map(([v, n]) => `${v} ×${n}`).join(", ")}`);
    t.over += overOn ? c.over : 0;
    if (c.over) t.overCols.push(`${h} ${c.overCode} (×${c.over})`);
    t.overAny += c.over;
  }
  return t;
}

export const zeroCount = (stats, hs) => hs.reduce((n, h) => n + (stats.get(h)?.zeros || 0), 0);

// empty cells of the columns being imported. Wide format: only in rows that have at least one result (a row with none had nothing
// analysed, #502); long format (one value column): every empty value cell.
export function blankCount(stats, hs, { long = false } = {}) {
  const cols = hs.map((h) => stats.get(h)?.blank).filter(Boolean);
  if (!cols.length) return 0;
  const n = cols[0].length;
  let total = 0;
  if (long) { for (const b of cols) for (let i = 0; i < n; i++) total += b[i]; return total; }
  for (let i = 0; i < n; i++) {
    let empty = 0;
    for (let j = 0; j < cols.length; j++) empty += cols[j][i];
    if (empty < cols.length) total += empty;
  }
  return total;
}

// TASKS.csv #2164 — what pickElementColumns counts per element column (values and the largest), for every element column in ONE pass
// over the rows in chunks: it made a full pass per column on the main thread before the dialog opened (0.85 s on 590,000 rows x 30).
// -> Map(header -> { n, max }) for pickElementColumns(headers, rows, stats)
export async function elementColumnStats(rows, headers, { chunk = 25000, onProgress } = {}) {
  const hs = headers.filter((h) => isElementColumn(h));
  const n = (rows || []).length;
  const st = hs.map(() => ({ n: 0, max: -Infinity }));
  for (let start = 0; start < n; start += chunk) {
    const end = Math.min(n, start + chunk);
    for (let i = start; i < end; i++) {
      const r = rows[i];
      for (let j = 0; j < hs.length; j++) {
        const v = parseAssayValue(r[hs[j]]);
        if (v != null && Number.isFinite(v)) { const s = st[j]; s.n++; if (v > s.max) s.max = v; }
      }
    }
    if (end < n) { onProgress?.(end / n); await yieldToWindow(); }
  }
  return new Map(hs.map((h, j) => [h, st[j]]));
}

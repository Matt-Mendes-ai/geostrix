// TASKS.csv #3197 (#3195, Galore Creek) — seven columns named *_pct held ppm (Al median 76,600 %, Cu to 64,700 %): stored as % with no word in the
// dialog, only a notice after the import. A per-cent column whose MEDIAN is over 100 cannot be weight per cent (a single value over 100 can be a
// total or a typo; most of them cannot), so the dialog says so while the unit menu is in reach, and offers ppm. Nothing is converted until the
// user chooses. Real per-cent columns (Fe, S: medians of a few %) are never flagged. Loaded with the assay dialog only.
import { parseAssayValue, oxideOfHeader, LOI } from "./geochem.js";

// rows: the file's rows; elements: the dialog's ticked elements ({ symbol, header, unit, unitChosen }). Rows sampled evenly, at most 20,000.
// -> [{ symbol, header, median, max, n }] for each element read in % (not chosen by the user, not an oxide, not LOI) whose median is over 100
export function percentColumnsReadingPpm(rows, elements, { cap = 20000 } = {}) {
  const out = [];
  const n = (rows || []).length;
  if (!n) return out;
  const step = Math.max(1, Math.floor(n / cap));
  for (const e of elements || []) {
    if (e.unit !== "%" || e.unitChosen || e.symbol === LOI || oxideOfHeader(e.header)) continue;
    const v = [];
    let max = -Infinity;
    for (let i = 0; i < n; i += step) { const x = parseAssayValue(rows[i]?.[e.header]); if (x != null && Number.isFinite(x) && x > 0) { v.push(x); if (x > max) max = x; } }
    if (v.length < 3) continue;
    v.sort((a, b) => a - b);
    const median = v.length % 2 ? v[v.length >> 1] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2;
    if (median > 100) out.push({ symbol: e.symbol, header: e.header, median, max, n: v.length });
  }
  return out;
}

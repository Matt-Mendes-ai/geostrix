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

// TASKS.csv #3294 (#3226 (7), Galore Creek) — a column whose unit lies the other way: In_MEMS61_ppm held ppb (median 530 'ppm', the upper crust
// averages 0.056 ppm) and passed every tool without a word. For the elements labs often report in ppb, a ppm column whose MEDIAN is over
// PPB_FACTOR times the upper continental crust's average (Rudnick & Gao 2014, rounded) is flagged as looking like ppb. A median, not a high
// value, so an ore grade does not trip it (Au: 7.5 g/t would be needed for every second sample). Nothing is converted until the user chooses.
export const UPPER_CRUST_PPM = { Au: 0.0015, Ag: 0.053, Pt: 0.0005, Pd: 0.0005, Ir: 0.00002, Os: 0.00003, Re: 0.0002, In: 0.056, Te: 0.005, Hg: 0.05, Se: 0.09 };
export const PPB_FACTOR = 5000;
export function ppmColumnsReadingPpb(rows, elements, { cap = 20000 } = {}) {
  const out = [];
  const n = (rows || []).length;
  if (!n) return out;
  const step = Math.max(1, Math.floor(n / cap));
  for (const e of elements || []) {
    const crust = UPPER_CRUST_PPM[e.symbol];
    if (!crust || e.unit !== "ppm" || e.unitChosen || oxideOfHeader(e.header)) continue;
    const v = [];
    for (let i = 0; i < n; i += step) { const x = parseAssayValue(rows[i]?.[e.header]); if (x != null && Number.isFinite(x) && x > 0) v.push(x); }
    if (v.length < 3) continue;
    v.sort((a, b) => a - b);
    const median = v.length % 2 ? v[v.length >> 1] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2;
    if (median > PPB_FACTOR * crust) out.push({ symbol: e.symbol, header: e.header, median, crust, n: v.length });
  }
  return out;
}

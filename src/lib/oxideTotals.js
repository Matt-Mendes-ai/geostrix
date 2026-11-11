// TASKS.csv #2506 (review #2486, WA lithium) — the analytical total as the QC of whole-rock oxides: a sample with 110.9 % Fe2O3 (stored as
// Fe 77.58 %, more iron than hematite holds) passed through every diagram and statistic and QAQC had nothing to say. With at least six
// major oxides, each sample's major-oxide sum (from the stored element or oxide, through the import's own factors), its distribution,
// the samples outside a tolerance the user types (there is no default: a total runs about 100 less the LOI, which this sum leaves out), and
// any single oxide over 100 %. Pure.
import { convertUnit, unitBasis } from "./geochem.js";

// the major oxides and the element each is computed from; total iron as Fe2O3 unless the element is stored as FeO
export const MAJOR_OXIDES = [["Si", "SiO2"], ["Ti", "TiO2"], ["Al", "Al2O3"], ["Fe", "Fe2O3"], ["Mn", "MnO"], ["Mg", "MgO"], ["Ca", "CaO"], ["Na", "Na2O"], ["K", "K2O"], ["P", "P2O5"]];
export const MIN_MAJORS = 6;

// -> [{ symbol, oxide, unit }] for the majors the project holds in a convertible unit
export function majorOxides(assayElements) {
  const out = [];
  for (const [sym, ox0] of MAJOR_OXIDES) {
    const e = (assayElements || []).find((x) => x.symbol === sym);
    if (!e || e.calculated) continue;
    const b = unitBasis(e.unit);
    if (!b.oxide && !["%", "ppm", "ppb", "g/t"].includes(String(e.unit || "ppm"))) continue;
    out.push({ symbol: sym, oxide: b.oxide && b.symbol === sym ? b.oxide : ox0, unit: e.unit || "ppm" });
  }
  return out;
}

// one sample's oxides in wt% and their sum; complete = every major present. -> { total, oxides: { SiO2: 52.1, ... }, missing: [..], over100: [..] }
export function sampleOxides(a, majors) {
  const oxides = {}, missing = [], over100 = [];
  let total = 0;
  for (const m of majors) {
    const v = a?.values?.[m.symbol];
    if (v == null || !Number.isFinite(Number(v))) { missing.push(m.oxide); continue; }
    const pct = convertUnit(Number(v), m.unit, `% ${m.oxide}`);
    if (!Number.isFinite(pct)) { missing.push(m.oxide); continue; }
    oxides[m.oxide] = pct; total += pct;
    if (pct > 100) over100.push(m.oxide);
  }
  return { total: missing.length ? null : total, oxides, missing, over100 };
}

// every sample: the complete sums, their spread, the samples with an oxide over 100 %. -> { n, incomplete, totals: [{ a, total }], median, p5, p95, over100: [{ a, oxide, value }] }
export function oxideTotals(assays, majors) {
  const totals = [], over100 = [];
  let incomplete = 0;
  for (const a of assays || []) {
    const s = sampleOxides(a, majors);
    for (const ox of s.over100) over100.push({ a, oxide: ox, value: s.oxides[ox] });
    if (s.total == null) { if (Object.keys(s.oxides).length) incomplete++; continue; }
    totals.push({ a, total: s.total });
  }
  const sorted = totals.map((t) => t.total).sort((x, y) => x - y);
  const q = (p) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))))] : null);
  return { n: totals.length, incomplete, totals, median: q(0.5), p5: q(0.05), p95: q(0.95), min: sorted[0] ?? null, max: sorted[sorted.length - 1] ?? null, over100 };
}

// the samples whose sum lies outside [lo, hi] (either bound may be blank), and every sample with an oxide over 100 %
export function outsideTolerance(result, lo, hi) {
  const L = lo === "" || lo == null || !Number.isFinite(Number(lo)) ? null : Number(lo);
  const H = hi === "" || hi == null || !Number.isFinite(Number(hi)) ? null : Number(hi);
  if (L == null && H == null) return [];
  return result.totals.filter((t) => (L != null && t.total < L) || (H != null && t.total > H));
}

// a histogram of the sums in 1 % bins over the observed range (at most 60 bins)
export function totalsHistogram(result) {
  if (!result.n) return null;
  const lo = Math.floor(result.min), hi = Math.max(lo + 1, Math.ceil(result.max));
  const w = Math.max(1, Math.ceil((hi - lo) / 60));
  const bins = new Array(Math.ceil((hi - lo) / w)).fill(0);
  for (const t of result.totals) bins[Math.min(bins.length - 1, Math.floor((t.total - lo) / w))]++;
  return { lo, w, bins, max: Math.max(...bins) };
}

// the exclusion: an assay row flagged excluded: "total" is left out wherever QC inserts are (lib/qaqc.js excludeQAQC) and from the diagrams.
// key: the same row by hole + interval + sample id. -> the new assays and how many changed
const rowKey = (a) => `${a.hole_id}|${a.from}|${a.to}|${a.sample_id ?? ""}`;
export function setTotalExclusion(assays, rows, on) {
  const keys = new Set((rows || []).map(rowKey));
  let changed = 0;
  const out = (assays || []).map((a) => {
    if (on ? !keys.has(rowKey(a)) || a.excluded === "total" : a.excluded !== "total" || (keys.size && !keys.has(rowKey(a)))) return a;
    changed++;
    if (on) return { ...a, excluded: "total" };
    const rest = { ...a };
    delete rest.excluded;
    return rest;
  });
  return { assays: out, changed };
}

// TASKS.csv #2519 (review #2486, WA lithium) — the default grade classes. The percentiles came from every stored value unless 30 % or more sat
// on the floor: Li, with 18 % of its values the half-limit substitutes of '<0.01 % Li2O', kept them (P50 0.044 %, one class from 0.09 to
// 2.4 % Li2O held 40 % of the samples), while Ta, with 35 %, dropped them: two rules side by side without a word. Now a value the lab
// flagged '<' (its stored qualifier) is left out of the class percentiles for every element; the floor test (#1696) stays for files that
// carry no flags (half the limit already substituted in the source). The range says what it was made from.
// Moved out of ViewerModule (assayRangeFor) so it can be tested and the module stays under its size cap.
import { minMax } from "./layers.js";

// rows: the assays shown (lab or pXRF); -> { min, max, p50, p90, p975, basis: { kind: "flags" | "floor" | "all", n, left, floor? } } | null
export function assayClassRange(rows, symbol) {
  const vals = [], detected = [];
  let flagged = 0, flaggedMin = Infinity;
  for (const a of rows || []) {
    const v = a?.values?.[symbol];
    if (v == null || !Number.isFinite(v)) continue;
    vals.push(v);
    if (a.qualifiers?.[symbol] === "<" || a.bdl?.includes?.(symbol)) { flagged++; if (v < flaggedMin) flaggedMin = v; } else detected.push(v);
  }
  if (!vals.length) return { ...minMax(vals), p50: undefined, p90: undefined, p975: undefined, basis: { kind: "all", n: 0, left: 0 } };
  let pool, basis;
  if (flagged) {
    pool = Float64Array.from(detected).sort();
    // #2216 — the lowest detection limit as the lab wrote it ('<0.01'): twice the stored half-limit substitute (#2520)
    basis = { kind: "flags", n: pool.length, left: flagged, limit: flaggedMin * 2 };
  } else {
    const all = Float64Array.from(vals).sort();
    let atFloor = 0; while (atFloor < all.length && all[atFloor] === all[0]) atFloor++;
    const drop = atFloor >= 0.3 * all.length && atFloor < all.length; // #1696 — a pile at the detection floor does not decide the classes
    pool = drop ? all.subarray(atFloor) : all;
    basis = drop ? { kind: "floor", n: pool.length, left: atFloor, floor: all[0] } : { kind: "all", n: all.length, left: 0 };
  }
  const q = (p) => (pool.length ? pool[Math.min(pool.length - 1, Math.floor(p * (pool.length - 1)))] : undefined);
  return { ...minMax(vals), p50: q(0.5), p90: q(0.9), p975: q(0.975), basis }; // minMax, not Math.min(...vals): a large set exceeds the spread limit
}

// a class limit rounded to two significant figures (1.126 -> 1.1, 0.0441 -> 0.044); limits that would meet stay apart by keeping more figures
export function roundBreaks(breaks) {
  const out = [];
  for (const b of [...(breaks || [])].sort((x, y) => x.max - y.max)) {
    let r = Number(Number(b.max).toPrecision(2));
    for (let p = 3; out.length && r <= out[out.length - 1].max && p <= 6; p++) r = Number(Number(b.max).toPrecision(p));
    out.push({ ...b, max: r, seeded: false });
  }
  return out;
}

// a typed cut-off as a class limit: the class holding it is split there (its colour kept above, the colour below it kept below)
export function addClassLimit(breaks, value, colourBelow) {
  const v = Number(value);
  if (!Number.isFinite(v) || (breaks || []).some((b) => b.max === v)) return breaks;
  const sorted = [...(breaks || [])].sort((x, y) => x.max - y.max);
  const at = sorted.findIndex((b) => b.max > v);
  const below = at > 0 ? sorted[at - 1].color : colourBelow;
  return [...sorted, { max: v, color: below || (sorted[0]?.color ?? "#cccccc"), label: `< ${v}`, seeded: false }].sort((x, y) => x.max - y.max);
}

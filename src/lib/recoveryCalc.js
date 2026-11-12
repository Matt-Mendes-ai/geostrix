// TASKS.csv #2891 (review #2876, WA bedded iron) — recovery.csv gives core loss and metres drilled per run (Coreloss, Metres_Drilled), no
// percentage: the Recovery % dialog matched no Value and Import stayed disabled. When the table has a core-loss (or recovered-length)
// column and a drilled-length column, or From / To to give the run length, the dialog offers Recovery % computed from them. Pure: no UI.

const key = (h) => String(h ?? "").trim().toLowerCase().replace(/[\s.-]+/g, "_");
const LOSS = /^(core_?loss|loss|loss_?m|core_?loss_?m|lost_?core|lost_?m|cl_?m)$/;
const RECOVERED = /^(recovered|recovered_?m|rec_?m|core_?rec(overed)?_?m|core_?length|recovered_?length)$/;
const DRILLED = /^(metres?_?drilled|meters?_?drilled|drilled|drilled_?m|run_?length|run_?m|drill_?length|interval_?length|advance)$/;
const r4 = (x) => Math.round(x * 1e4) / 1e4; // 75.00000000000001 -> 75
const n = (v) => (v === null || v === undefined || String(v).trim() === "" ? NaN : Number(String(v).replace(",", ".")));

// -> { loss?, recovered?, drilled? } (the columns found; drilled null: To - From is the run) | null (no loss / recovered column)
export function recoveryColumns(headers) {
  const hs = headers || [];
  const loss = hs.find((h) => LOSS.test(key(h))) || null, recovered = loss ? null : hs.find((h) => RECOVERED.test(key(h))) || null;
  if (!loss && !recovered) return null;
  return { loss, recovered, drilled: hs.find((h) => DRILLED.test(key(h))) || null };
}

// one row's recovery in %: (drilled - loss) / drilled x 100, or recovered / drilled x 100; the run is the drilled column, else To - From.
// NaN when a number is missing or the run is not positive.
export function recoveryPct(row, calc, mapping) {
  const run = calc.drilled ? n(row?.[calc.drilled]) : n(row?.[mapping?.to]) - n(row?.[mapping?.from]);
  if (!(run > 0)) return NaN;
  if (calc.loss) { const l = n(row?.[calc.loss]); return Number.isFinite(l) ? r4(((run - l) / run) * 100) : NaN; }
  const r = n(row?.[calc.recovered]); return Number.isFinite(r) ? r4((r / run) * 100) : NaN;
}

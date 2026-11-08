// TASKS.csv #1653 (review #1645, Copley) — pXRF readings whose From equals To on every row are points on core (Copley: 556 rows,
// SAMPFROM = SAMPTO). They import as points (Data QC knows pXRF points, #1695), but a file may also carry a real To column
// (Copley's XRF_To_D = from + 0.01 m) that the guess did not pick. -> { allPoints, n, candidate: header | null }
const num = (v) => { const x = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(",", ".")); return Number.isFinite(x) ? x : NaN; };
export function pointReadings(rows, headers, mapping) {
  const fc = mapping?.from, tc = mapping?.to;
  if (!fc || !tc || !rows?.length) return { allPoints: false, n: 0, candidate: null };
  let n = 0, same = 0;
  for (const r of rows) { const a = num(r[fc]), b = num(r[tc]); if (!Number.isFinite(a) || !Number.isFinite(b)) continue; n++; if (a === b) same++; }
  const allPoints = n > 0 && same === n;
  if (!allPoints) return { allPoints, n, candidate: null };
  // another column named like a To depth whose values lie just below From on (nearly) every row
  const cands = (headers || []).filter((h) => h !== tc && h !== fc && /(^|[^a-z])to([^a-z]|$)|_to_|depth_?to/i.test(h));
  for (const h of cands) {
    let ok = 0, seen = 0;
    for (const r of rows) { const a = num(r[fc]), b = num(r[h]); if (!Number.isFinite(a) || !Number.isFinite(b)) continue; seen++; if (b > a && b - a <= 50) ok++; }
    if (seen >= 0.9 * n && ok >= 0.9 * seen) return { allPoints, n, candidate: h };
  }
  return { allPoints, n, candidate: null };
}

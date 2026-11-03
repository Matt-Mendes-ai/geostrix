// TASKS.csv #1394 — when an elevation of 0 means "never filled in". #606 caught a Z column that is 0 on every row; Silvertip's
// surface files mix real elevations (1,069-2,074 m) with 57 rows at 0, which were drawn 1,400 m underground. A 0 is taken as
// missing when every other value is 0 or blank too, or when the other elevations put the program well above sea level
// (median 100 m or more): a coastal survey with real values near 0 keeps its zeros.
export function zeroMeansMissing(values) {
  let zeros = 0;
  const other = [];
  for (const v of values) { if (v === 0) zeros++; else if (Number.isFinite(v)) other.push(Math.abs(v)); }
  if (!zeros) return false;
  if (!other.length) return true;
  other.sort((a, b) => a - b);
  return other[other.length >> 1] >= 100;
}

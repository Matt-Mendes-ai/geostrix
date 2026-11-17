// TASKS.csv #3805 (Scottie Gold geophysics review) — a hole trace of 38 lines of 'X Y Z' and no header line lost its first point in Point survey > Import CSV: the
// reader took the first reading as the column names ('531797.62', '5531479.74', '1244.96'), and 37 of the 38 points came in, the collar the one missing. A first row
// that is all numbers is data. -> { headers: ['Column 1', ...], rows: [row objects incl. the first], kept: 1 } when `headers` are all numbers (3 to 12 columns), else null.
const NUM = /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/;
// the reader may have made duplicate headers unique with a suffix ('0', '0_1'); a name is a number once that is taken off
const asNumber = (h) => { const s = String(h ?? "").trim().replace(/_\d+$/, ""); return NUM.test(s) ? Number(s) : NaN; };
export function headerlessTable(headers, rows) {
  const hs = (headers || []).map((h) => String(h ?? ""));
  if (hs.length < 3 || hs.length > 12 || !hs.every((h) => Number.isFinite(asNumber(h)))) return null;
  const names = hs.map((_, i) => `Column ${i + 1}`);
  const first = {}; hs.forEach((h, i) => { first[names[i]] = asNumber(h); });
  const rest = (rows || []).map((r) => { const o = {}; hs.forEach((h, i) => { o[names[i]] = r[h]; }); return o; });
  return { headers: names, rows: [first, ...rest], kept: 1 };
}

// TASKS.csv #3382 (review #3195) — one way of printing a class bound in a key: three significant figures with thousands separators
// ('1,530,000', '16,600', '460', '0.163'), short scientific notation under 0.001 ('1.2e-5', #3396). The drill plan's key printed
// '1,531,044 – 2,046,822 m × ppm' and the legend beside it '460.0-6590 ppm' for the same element. No imports: cheap to share.
const sciShort = (v) => { const [m, e] = v.toExponential(2).split("e"); return `${+m}e${e.replace("+", "")}`; };
export function fmtSig3(x) {
  const v = Number(x);
  if (!Number.isFinite(v)) return String(x);
  if (v === 0) return "0";
  if (Math.abs(v) < 1e-3) return sciShort(v);
  return Number(v.toPrecision(3)).toLocaleString("en-US", { maximumFractionDigits: 20 });
}

// TASKS.csv #3293 (#3226 (5)) — an axis end in plain digits: toPrecision(3) wrote 1000 as "1.00e+3" beside "100"
export const axisFig = (v) => (Number.isFinite(v) ? String(+Number(v).toPrecision(3)) : "");

// TASKS.csv #3481 (#3293) — the box plot's axis ticks: about five round values between lo and hi in plain digits (1, 2 or 5 times a power of ten apart), or, on a log axis, the powers
// of ten inside the range (1, 2, 5 times them when fewer than three fall inside). -> [value]
export function axisTicks(lo, hi, log = false) {
  if (!(hi > lo) || !Number.isFinite(lo) || !Number.isFinite(hi)) return Number.isFinite(lo) ? [lo] : [];
  if (log && lo > 0) {
    const out = [];
    for (let d = Math.ceil(Math.log10(lo) - 1e-9); d <= Math.floor(Math.log10(hi) + 1e-9); d++) out.push(10 ** d);
    if (out.length >= 3) return out;
    const fine = [];
    for (let d = Math.floor(Math.log10(lo)); d <= Math.ceil(Math.log10(hi)); d++) for (const m of [1, 2, 5]) { const v = m * 10 ** d; if (v >= lo * (1 - 1e-9) && v <= hi * (1 + 1e-9)) fine.push(+v.toPrecision(12)); }
    return fine;
  }
  const raw = (hi - lo) / 5, p = 10 ** Math.floor(Math.log10(raw)), step = [1, 2, 5, 10].map((m) => m * p).find((x) => x >= raw), out = [];
  for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi + 1e-9; v += step) out.push(+v.toPrecision(12));
  return out;
}

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

// TASKS.csv #234 (independently found by two specialist-review agents, live-confirmed: real axis
// ticks rendering as "0e+0" and "16.666666666666668") — two bugs. (1) `t < 0.001` treated an exact 0
// tick as "very small, needs exponential notation" (0 < 0.001 is true), so 0.toExponential(0) rendered
// literally as "0e+0" instead of "0" — now checked first, as its own case. (2) the fallback branch for
// a non-integer tick just called the raw toString() and stripped trailing zeros, which does nothing
// for a float with no exact trailing zeros (e.g. a /6-divided axis range like 100/6 = 16.666666666666668)
// — now rounded to 4 significant figures via toPrecision before stripping.
export function fmtTick(t) {
  if (t === 0) return "0";
  const abs = Math.abs(t);
  // TASKS.csv #1678 — a wavelength axis (2,190-2,215 nm) printed '2e+3' at every tick: exponents only for the decades of a log axis
  // (and above a million); other large ticks as plain numbers to 0.1
  // TASKS.csv #3293 (reopened, Scottie Gold) — a log axis ticked '10, 100, 1e+3, 1e+4': the decades up to a million are plain digits (1000, 10000, 100000); exponents only above
  if (abs >= 1e7 || (abs >= 1e6 && Math.abs(Math.log10(abs) - Math.round(Math.log10(abs))) < 1e-9) || abs < 0.001) return t.toExponential(2).replace(/\.?0+e/, "e");
  if (abs >= 1000) return String(Math.round(t * 10) / 10);
  if (Number.isInteger(t)) return String(t);
  return t.toPrecision(4).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
}

// TASKS.csv #3754 (9) (Scottie Gold) — 4.895 printed '4.89': toFixed rounds the binary value (4.89499999...). Half up on the decimal the number is written with. -> text
export function toFixedHalfUp(v, d) {
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  const a = Math.abs(n).toPrecision(15);
  if (/e/i.test(a)) return n.toFixed(d);
  const r = Number(`${Math.round(Number(`${a}e${d}`))}e-${d}`);
  return `${n < 0 && r !== 0 ? "-" : ""}${r.toFixed(d)}`;
}

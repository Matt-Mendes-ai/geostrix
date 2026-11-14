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

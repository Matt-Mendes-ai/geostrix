// TASKS.csv #3878 (Matt's decision, 2026-11-17, option A of #3868 (7)) - a HOLE's dip is printed one way everywhere: negative for a hole pointing down, positive (with a +) for an up-hole,
// one decimal: -55.9, +12.3, 0.0. The collar table said -56, the strip-log header 55.9 (the sign dropped), the Atlas token -46, and a planned hole's row -83: four spellings of one
// number. downPositive: the dip as the collar records store it (down positive, #1033), shown negated; a planned hole stores it negative down already. Only printed text goes through
// this: the CSV columns, files and the stored values keep their own form. Pure.
export function dipPrinted(dip, { downPositive = false } = {}) {
  const n = dip === "" || dip == null ? NaN : Number(dip);
  if (!Number.isFinite(n)) return "";
  const v = downPositive ? -n : n, t = v.toFixed(1);
  if (Math.abs(v) < 0.05) return "0.0";
  return v > 0 ? `+${t}` : t;
}

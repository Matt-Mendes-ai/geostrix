// TASKS.csv #2481 (review #2325, WA uranium) — a strip-log track name too long for its track even at the smallest header size
// ('Gamma: eU3O8_cased_ppm', 95 px in 82) ran past both edges and printed cut. It goes on two lines, broken at a separator (': ', a space,
// '_'): the ': ' after a log's group name when both halves fit, else the one nearest the middle. width: the track's usable width (px); 7 px
// type is about 0.62 × 7 px a character. -> [line] or [line1, line2]
const CHAR_W = 0.62 * 7;

export function headerLines(label, width) {
  const s = String(label);
  if (s.length * CHAR_W <= width) return [s];
  const cuts = [...s.matchAll(/: |[ _]/g)].map((m) => {
    const end = m[0] === " " ? m.index : m.index + 1; // ':' and '_' stay on the first line
    const a = s.slice(0, end).trim(), b = s.slice(end).trim();
    return { a, b, colon: m[0] === ": ", fits: Math.max(a.length, b.length) * CHAR_W <= width, off: Math.abs(m.index - s.length / 2) };
  }).filter((c) => c.a && c.b);
  if (!cuts.length) return [s];
  const colon = cuts.find((c) => c.colon && c.fits);
  const best = colon || cuts.reduce((p, c) => (c.off < p.off ? c : p));
  return [best.a, best.b];
}

// TASKS.csv #2481 — an axis label to n significant figures without toPrecision's exponent ('7.46e+3' read as an error on a printed log): 7464
// at 3 figures is '7460', 0.000123 stays '0.000123'
export function sigText(v, n) {
  const x = Number(v);
  return Number.isFinite(x) ? (+x.toPrecision(n)).toLocaleString("en-US", { maximumFractionDigits: 20, useGrouping: false }) : String(v);
}

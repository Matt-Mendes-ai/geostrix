// TASKS.csv #3692 (rehearsal round 3) — a survey whose depths are in feet was imported as metres with no hint: the dialog opened on 'Metres' although the stations ran to 3.3 times the hole lengths, and the notice
// afterwards counted '487 past the end' without the word feet. The same check as the dialog's flipped-dip line: each hole's deepest depth in the file against its collar length; when most holes sit near 3.28 the
// depths are probably feet (0.305: metres read as feet). Never applied: it says so, above Units. Pure.
const FT = 3.28084;
// rows [{ hole_id, depth }]; collarLen: Map or function hole -> collar length (m) -> { ratio, holes, total } | null
export function depthUnitHint(rows, collarLen) {
  const lenOf = typeof collarLen === "function" ? collarLen : (h) => collarLen?.get?.(h);
  const deepest = new Map();
  for (const r of rows || []) { const d = Number(r?.depth); if (r?.hole_id != null && Number.isFinite(d)) deepest.set(r.hole_id, Math.max(deepest.get(r.hole_id) ?? -Infinity, d)); }
  const ratios = [];
  for (const [h, d] of deepest) { const L = Number(lenOf(h)); if (L > 0 && d > 0) ratios.push(d / L); }
  if (ratios.length < 2) return null;
  const near = (lo, hi) => ratios.filter((x) => x >= lo && x <= hi).length;
  const feet = near(FT * 0.9, FT * 1.1), metres = near(0.305 * 0.9, 0.305 * 1.1);
  const pick = feet >= ratios.length * 0.6 ? { kind: "feet", n: feet } : metres >= ratios.length * 0.6 ? { kind: "metres", n: metres } : null;
  if (!pick) return null;
  const sorted = ratios.filter((x) => (pick.kind === "feet" ? x >= FT * 0.9 && x <= FT * 1.1 : x >= 0.305 * 0.9 && x <= 0.305 * 1.1)).sort((a, b) => a - b);
  return { kind: pick.kind, ratio: sorted[sorted.length >> 1], holes: pick.n, total: ratios.length };
}
// the same on rows with from / to (an interval log or an assay file): the deepest `to` of each hole
export const intervalDepthRows = (rows) => (rows || []).map((r) => ({ hole_id: r.hole_id, depth: r.to ?? r.depth }));

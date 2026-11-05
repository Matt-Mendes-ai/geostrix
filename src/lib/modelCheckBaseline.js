// TASKS.csv #1687 (review #1645, Copley) — on 9 holes the Implicit surface reported 'passes within 5.6 m' and 'puts 95% of 2410
// logged metres in the unit' for a 'Top of Volcanic host' fitted through 9 breccia contacts in one hole, with its dip estimated
// from those same points. The model check scores only the modelled units' own intervals, so a model that called every one of them
// the most-logged unit scores that unit's share of them (here 98-100 %): 95 % does not show the surface is any good. And a dip
// estimated from points that nearly all sit in one hole is that hole's trace, not the unit's attitude. Both are now said.
import { t as tr } from "./i18n.js";
import { errorNotice } from "./notices.js";

// chk: checkAgainstLogs() -> { pct, base: { unit, pct }, margin } | null. base: every scored metre called the most-logged unit.
export function modelCheckBaseline(chk) {
  if (!chk || !(chk.total > 0) || !chk.units?.length) return null;
  const top = chk.units.reduce((a, u) => (u.logged > a.logged ? u : a));
  const pct = (100 * chk.matched) / chk.total, base = (100 * top.logged) / chk.total;
  return { pct, base: { unit: top.unit, pct: base }, margin: pct - base };
}
// -> a notice when the model does not beat that baseline by at least `by` percentage points, else null
export function baselineNotice(chk, by = 5) {
  const b = modelCheckBaseline(chk);
  if (!b || b.margin >= by) return null;
  return errorNotice(tr("Model check baseline: calling every one of these logged metres {unit} would score {base}%, so {pct}% does not show this model is better than that. The check scores only the modelled units' own intervals; judge the surface on sections, near its contacts, and with the sensitivity spread.", { unit: b.base.unit, base: Math.round(b.base.pct), pct: Math.round(b.pct) }));
}

// points: the contact points an orientation was estimated from (with hole_id) -> { hole, k, n } when one hole holds at least `share`
// of them (and there are at least 3), else null
export function oneHoleShare(points, share = 0.5) {
  const n = (points || []).length;
  if (n < 3) return null;
  const by = new Map();
  for (const p of points) if (p?.hole_id != null) by.set(p.hole_id, (by.get(p.hole_id) || 0) + 1);
  let hole = null, k = 0;
  for (const [h, c] of by) if (c > k) { hole = h; k = c; }
  return hole != null && k >= share * n ? { hole, k, n } : null;
}
export function oneHoleDipNotice(points, unitName) {
  const s = oneHoleShare(points);
  return s ? errorNotice(tr("{k} of {n} \"{unitName}\" contact points are in {hole}: the estimated dip follows that hole, not the unit. Add structure picks, or contacts in other holes, before trusting the surface's attitude.", { k: s.k, n: s.n, unitName, hole: s.hole })) : null;
}

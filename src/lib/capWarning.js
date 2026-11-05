// TASKS.csv #1676 (review #1645, Copley) — a high-grade cap that removes much of the metal. Grade stats said '41.2% of the metal
// removed' for Copley Cu's P99 with no warning, Compositing warned only above 20 %, and neither said that the 20 capped samples were
// one zone (COP-23-0001 34-57 m, 0.8-1.9 % Cu): capping it as outliers removes the deposit. Both tools now say the same thing above
// 10 % of the metal, and name the zone when the values above the cap sit together down one hole.
import { t as tr } from "./i18n.js";

export const CAP_WARN_PCT = 10;
// samples: [{ hole_id, from, to, value }] (drillhole segments); cap -> { above, inTop, top: { hole, from, to, n } | null, coherent }
// The top hole's run: the samples above the cap in the hole holding most of them, joined while the gap between them is at most
// gapM (a few unsampled or lower-grade metres inside the zone). coherent: that one run holds at least `share` of all of them.
export function capAboveZone(samples, cap, { gapM = 10, share = 0.6 } = {}) {
  const above = (samples || []).filter((s) => Number.isFinite(s.value) && s.value > cap && s.hole_id != null && Number.isFinite(s.from) && Number.isFinite(s.to));
  if (!above.length) return { above: 0, inTop: 0, top: null, coherent: false };
  const byHole = new Map();
  for (const s of above) { const k = String(s.hole_id); if (!byHole.has(k)) byHole.set(k, []); byHole.get(k).push(s); }
  let best = null;
  for (const [hole, list] of byHole) {
    list.sort((a, b) => a.from - b.from);
    let run = { hole, from: list[0].from, to: list[0].to, n: 1 };
    const consider = (r) => { if (!best || r.n > best.n) best = { ...r }; };
    for (let i = 1; i < list.length; i++) {
      const s = list[i];
      if (s.from - run.to <= gapM) { run.to = Math.max(run.to, s.to); run.n++; } else { consider(run); run = { hole, from: s.from, to: s.to, n: 1 }; }
    }
    consider(run);
  }
  return { above: above.length, inTop: best.n, top: best, coherent: above.length >= 3 && best.n >= share * above.length };
}

// pct: the share of the metal the cap removes; zone: capAboveZone() or null (surface samples) -> the warning, or "" below CAP_WARN_PCT
export function capWarningText(pct, zone = null) {
  if (!(pct > CAP_WARN_PCT)) return "";
  const head = tr("This cap removes {pct}% of the metal, more than a cap on scattered outliers usually does.", { pct: pct.toFixed(1) });
  if (zone?.coherent && zone.top) {
    const m = (v) => (Math.abs(v) >= 100 ? Math.round(v) : +v.toFixed(1));
    return `${head} ${tr("The values above it form a coherent zone ({hole} {from}–{to} m, {k} of {n} samples), not scattered outliers. Domain the mineralized zone and cap within it.", { hole: zone.top.hole, from: m(zone.top.from), to: m(zone.top.to), k: zone.inTop, n: zone.above })}`;
  }
  return `${head} ${tr("Check on the log-probability plot whether the values above it are a separate population; if so, domain it first and cap within it.")}`;
}

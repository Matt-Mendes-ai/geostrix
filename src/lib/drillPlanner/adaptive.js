// TASKS.csv #3962 (P3) — the adaptive loop (Review data\Drill planner\design.md 1.6, 3.5, 4.1). Pure.
//  - asDrilledOffers: a drilled collar with a planned hole's name, or within 10 m of its collar (Matt, 2026-11-22), is offered as that hole's
//    as-drilled hole; linking stays the geologist's click.
//  - compareToActual: a drilled hole's real composites against the prediction frozen on its plan: its best intercept by the same rules
//    (seriesIntercepts), and where its grade x metres fell against the predicted low / high (P10 / P90).
//  - calibration: the share of drilled holes whose result fell inside their P10-P90 (about 80 % when the model is honest).
//  - whatChanged: a program re-run on the new data against the planned holes still to drill: kept, consider dropping, consider adding.
import { seriesIntercepts } from "./seriesIntercepts.js";

export const LINK_M = 10;
const norm = (s) => String(s ?? "").trim().toLowerCase();

// plannedHoles: the store's; collars: the drilled ones [{ hole_id, x, y, azimuth?, dip? }]; survey (optional): its first station gives a drilled
// hole's direction. By distance, the drilled hole must also point the way the plan does (azimuth within 20°, dip within 10°; the azimuth is not
// compared for holes steeper than -80°): a fan hole on the same pad is another hole (live, P3: every suggested hole from a drilled pad was
// offered its pad's drilled hole, 0 m away). -> [{ holeId, holeName, collarId, distance, by: "name" | "distance" }]
export const LINK_AZ = 20, LINK_DIP = 10;
export function asDrilledOffers(plannedHoles, collars, within = LINK_M, survey = null) {
  const first = new Map();
  for (const s of survey || []) { const d = Number(s.depth); const f = first.get(s.hole_id); if (Number.isFinite(d) && (!f || d < f.depth)) first.set(s.hole_id, { depth: d, azimuth: Number(s.azimuth), dip: Number(s.dip) }); }
  const dirOf = (c) => { const f = first.get(c.hole_id); const az = f ? f.azimuth : Number(c.azimuth), dip = f ? f.dip : Number(c.dip); return Number.isFinite(dip) ? { az, dip: dip > 0 ? -dip : dip } : null; };
  const sameWay = (h, c) => {
    const dc = dirOf(c); if (!dc) return true; // no direction recorded: the distance alone
    const dp = Number(h.dip) > 0 ? -Number(h.dip) : Number(h.dip);
    if (Math.abs(dc.dip - dp) > LINK_DIP) return false;
    if (dp < -80 && dc.dip < -80) return true;
    return Number.isFinite(dc.az) && Math.abs(((dc.az - Number(h.azimuth)) % 360 + 540) % 360 - 180) <= LINK_AZ;
  };
  const taken = new Set((plannedHoles || []).map((h) => h.asDrilledHoleId).filter(Boolean));
  const byName = new Map((collars || []).map((c) => [norm(c.hole_id), c]));
  const out = [];
  for (const h of plannedHoles || []) {
    if (h.asDrilledHoleId) continue;
    const named = byName.get(norm(h.name));
    if (named && !taken.has(named.hole_id)) { out.push({ holeId: h.id, holeName: h.name, collarId: named.hole_id, distance: Math.hypot(Number(named.x) - Number(h.x), Number(named.y) - Number(h.y)), by: "name" }); taken.add(named.hole_id); continue; }
    let best = null;
    for (const c of collars || []) {
      if (taken.has(c.hole_id)) continue;
      const d = Math.hypot(Number(c.x) - Number(h.x), Number(c.y) - Number(h.y));
      if (d <= within && sameWay(h, c) && (!best || d < best.distance)) best = { holeId: h.id, holeName: h.name, collarId: c.hole_id, distance: d, by: "distance" };
    }
    if (best) { out.push(best); taken.add(best.collarId); }
  }
  return out;
}

// prediction: a hole's frozen record (predictionInputs.js predictionRecord); composites: the drilled hole's [{ from, to, value }] at the
// prediction's composite length. -> { gt, best, where: "inside" | "below" | "above", values: [[md, value]] } | null
export function compareToActual(prediction, composites) {
  if (!prediction || prediction.beyond || !prediction.gt || !composites?.length) return null;
  const step = prediction.step || 2;
  let L = 0; for (const c of composites) { const t = Number(c.to); if (Number.isFinite(t) && t > L) L = t; }
  const n = Math.max(1, Math.ceil(L / step));
  const tops = Float64Array.from({ length: n }, (_, i) => i * step), vals = new Float64Array(n).fill(NaN);
  for (const c of composites) { const i = Math.round(Number(c.from) / step); if (i >= 0 && i < n && Number.isFinite(c.value)) vals[i] = c.value; }
  const it = seriesIntercepts(tops, step, vals, prediction.rules);
  const gt = it.best ? it.best.gt : 0;
  const where = gt < prediction.gt[0] - 1e-9 ? "below" : gt > prediction.gt[2] + 1e-9 ? "above" : "inside";
  return { gt, best: it.best, where, values: composites.filter((c) => Number.isFinite(c.value)).map((c) => [(Number(c.from) + Number(c.to)) / 2, c.value]) };
}

// results: compareToActual outputs. -> { n, inside, share, below, above, overconfident }
export function calibration(results) {
  const r = (results || []).filter(Boolean), inside = r.filter((x) => x.where === "inside").length;
  const share = r.length ? inside / r.length : null;
  return { n: r.length, inside, below: r.filter((x) => x.where === "below").length, above: r.filter((x) => x.where === "above").length, share, overconfident: r.length >= 5 && share < 0.6 };
}

// a program's data stamp: the assays and the collars it was made from (assayStamp + the collar count)
export const dataStamp = (assayStampValue, collars) => `${assayStampValue}|${(collars || []).length}`;

// the same hole design: the same collar (within 1 m), azimuth and dip
const sameDesign = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) <= 1 && Math.abs(((a.azimuth - b.azimuth + 540) % 360) - 180) < 0.5 && Math.abs(a.dip - b.dip) < 0.5;

// remaining: the program's planned holes not yet drilled [{ id, name, x, y, azimuth, dip }]; rerun: selectProgram's chosen on the new data.
// -> { keep: [{ hole, order }], drop: [hole], add: [chosen] }
export function whatChanged(remaining, rerun) {
  const keep = [], drop = [], used = new Set();
  for (const h of remaining || []) {
    const m = (rerun || []).find((c) => !used.has(c.id) && sameDesign(h, c));
    if (m) { used.add(m.id); keep.push({ hole: h, order: m.order }); } else drop.push(h);
  }
  const add = (rerun || []).filter((c) => !used.has(c.id));
  return { keep, drop, add };
}

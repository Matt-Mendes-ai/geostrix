// TASKS.csv #1807 (review #1646, Kodiak) — the free points a cross-section carries: the visible geophysics points (a ground or 3D
// point survey: Kodiak's AMT model, 2,051 points inside a 100 m corridor) and the placed surface samples, each projected onto the line
// as { d (m along it), z, color, label }. The section said '0 points' and its elevation axis stopped at 800 m while the AMT points went
// to -100 m: only hole data was projected. Points with no elevation are left out (they have no place on a section); at most `cap`.
import { makeSurveyColorer } from "./geophysSurveys.js";
import { colorForMedium } from "./layers.js";

export function corridorScatter({ geophysPts = null, geophysStyle = {}, samples = null }, a, b, corridor, cap = 20000) {
  const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
  const project = (x, y) => { const t = (x - a.x) * ux + (y - a.y) * uy, off = Math.abs(-(x - a.x) * uy + (y - a.y) * ux); return t >= 0 && t <= L && off <= corridor ? t : null; };
  const out = [];
  let geo = 0, smp = 0;
  const pts = (geophysPts || []).filter((r) => Number.isFinite(r.x) && Number.isFinite(r.y) && Number.isFinite(r.z));
  if (pts.length) {
    const inBand = [];
    for (const r of pts) { const d = project(r.x, r.y); if (d != null) inBand.push([r, d]); }
    if (inBand.length) {
      const colorer = makeSurveyColorer(pts.filter((r) => Number.isFinite(r.value)), geophysStyle);
      for (const [r, d] of inBand) { if (out.length >= cap) break; out.push({ d, z: r.z, color: Number.isFinite(r.value) ? colorer.colorOf(r).color : "#9aa3b0", label: `${r.survey || r.label || "Geophysics"}: ${Number.isFinite(r.value) ? +Number(r.value).toPrecision(4) : "no value"}`, kind: "geophys" }); geo++; }
    }
  }
  for (const s of samples || []) {
    if (out.length >= cap) break;
    if (!Number.isFinite(s.x) || !Number.isFinite(s.y) || !Number.isFinite(s.z)) continue;
    const d = project(s.x, s.y);
    if (d == null) continue;
    out.push({ d, z: s.z, color: colorForMedium(s.medium), label: `Surface sample${s.sample_id ? ` ${s.sample_id}` : ""} (${s.medium || "sample"})`, kind: "sample" }); smp++;
  }
  out.counts = { geophys: geo, samples: smp };
  return out;
}

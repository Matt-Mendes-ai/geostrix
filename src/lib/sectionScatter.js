// TASKS.csv #1807 (review #1646, Kodiak) — the free points a cross-section carries: the visible geophysics points (a ground or 3D
// point survey: Kodiak's AMT model, 2,051 points inside a 100 m corridor) and the placed surface samples, each projected onto the line
// as { d (m along it), z, color, label }. The section said '0 points' and its elevation axis stopped at 800 m while the AMT points went
// to -100 m: only hole data was projected. Points with no elevation are left out (they have no place on a section); at most `cap`.
import { makeSurveyColorer, surveyKey } from "./geophysSurveys.js";
import { geophysLegendGroups } from "./legendGroups.js"; // TASKS.csv #3430 — the section key's survey ramps, the 3D legend's builder
import { colorForMedium } from "./layers.js";

export function corridorScatter({ geophysPts = null, geophysStyle = {}, samples = null }, a, b, corridor, cap = 20000) {
  const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
  const project = (x, y) => { const t = (x - a.x) * ux + (y - a.y) * uy, off = Math.abs(-(x - a.x) * uy + (y - a.y) * ux); return t >= 0 && t <= L && off <= corridor ? t : null; };
  const out = [];
  let geo = 0, smp = 0;
  // TASKS.csv #3430 — a survey hidden from its card (#3325) is not on the section either; the colours are still from every survey (as drawn in 3D)
  const surveys = geophysStyle.surveys || null, all = (geophysPts || []).filter((r) => Number.isFinite(r.x) && Number.isFinite(r.y) && Number.isFinite(r.z));
  const pts = all.filter((r) => !surveys?.[surveyKey(r)]?.hidden);
  const inSurveys = new Set();
  let legends = [];
  if (pts.length) {
    const inBand = [];
    for (const r of pts) { const d = project(r.x, r.y); if (d != null) inBand.push([r, d]); }
    if (inBand.length) {
      const colorer = makeSurveyColorer(all.filter((r) => Number.isFinite(r.value)), geophysStyle, surveys); // surveys: #1587
      // #3430 — the tip names the survey (rows carry _src, not 'survey': every tip read 'Geophysics: 18.7') and its units
      for (const [r, d] of inBand) {
        if (out.length >= cap) break;
        const k = surveyKey(r), u = surveys?.[k]?.units;
        inSurveys.add(k);
        out.push({ d, z: r.z, color: Number.isFinite(r.value) ? colorer.colorOf(r).color : "#9aa3b0", label: `${r._src || r.label || "Geophysics"}: ${Number.isFinite(r.value) ? `${+Number(r.value).toPrecision(4)}${u ? ` ${u}` : ""}` : "no value"}`, kind: "geophys" }); geo++;
      }
      // #3430 — one ramp per survey on the section, as the 3D legend draws it (the same builder over every survey, so the colours agree)
      legends = geophysLegendGroups({ rows: all, surveys: surveys || {}, stops: geophysStyle.stops, colorMode: geophysStyle.colorMode, min: geophysStyle.min, max: geophysStyle.max, label: [...inSurveys][0] /* one survey: named by it, not 'Geophysics points' */ })
        .filter((g) => inSurveys.has(String(g.key).replace(/^geophys_pts_/, "")));
    }
  }
  for (const s of samples || []) {
    if (out.length >= cap) break;
    if (!Number.isFinite(s.x) || !Number.isFinite(s.y) || !Number.isFinite(s.z)) continue;
    const d = project(s.x, s.y);
    if (d == null) continue;
    out.push({ d, z: s.z, color: colorForMedium(s.medium), label: `Surface sample${s.sample_id ? ` ${s.sample_id}` : ""} (${s.medium || "sample"})`, kind: "sample" }); smp++;
  }
  // #3430 — the ramps ride on counts: the payload sends scatterCounts beside the array (an array's own properties are lost on the way to
  // the section window)
  out.counts = { geophys: geo, samples: smp, legends };
  return out;
}

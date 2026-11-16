// TASKS.csv #3796 (Scottie Gold review: a narrow vein, 2 m intercepts, a stope outline as wide as the block model's 5 m cell: nothing diluted an intercept to a
// mining width) — the narrow-vein route beside the stope outlines: each composite (Best intercepts' rules) at the cut-off, its TRUE width from the typed dip of
// the body (lib/trueWidth.js: downhole length x |hole . pole|), and its grade diluted with zero-grade rock to the minimum mining width when it is narrower:
// diluted grade = grade x true width / max(true width, minimum width). A hole whose geometry cannot be resolved (no survey, no dip typed) is kept with its
// downhole length as the width and says so (trueWidthM null): never a silent downhole number under a 'true width' heading. Pure.
import { holeDirectionOverInterval, trueWidthFactor } from "./trueWidth.js";

// composites: computeBestIntercepts' rows ({ hole_id, from, to, length, avgGrade }); traces: Map hole_id -> desurveyHole's trace; opts: { dipDeg, dipDirDeg, minWidth }
// -> [{ hole_id, from, to, downholeM, trueWidthM (null: not resolved), grade, widthM (the width the grade is spread over), dilutedGrade, diluted, gramMetres }] best metal first
export function diluteIntercepts(composites, traces, { dipDeg = null, dipDirDeg = null, minWidth = 0 } = {}) {
  const out = [];
  for (const c of composites || []) {
    const grade = Number(c.avgGrade), len = Number(c.length ?? c.to - c.from);
    if (!(grade >= 0) || !(len > 0)) continue;
    const tr = traces?.get?.(c.hole_id) || null;
    const f = Number.isFinite(dipDeg) && Number.isFinite(dipDirDeg) && tr ? trueWidthFactor(holeDirectionOverInterval(tr, c.from, c.to), dipDirDeg, dipDeg) : null;
    const trueW = f == null ? null : len * f, w = trueW ?? len;
    const width = Math.max(w, Number(minWidth) || 0);
    out.push({ hole_id: c.hole_id, from: c.from, to: c.to, downholeM: len, trueWidthM: trueW, grade, widthM: width, dilutedGrade: (grade * w) / width, diluted: width > w + 1e-9, gramMetres: grade * w });
  }
  return out.sort((a, b) => b.gramMetres - a.gramMetres);
}

// the plane a block model's estimate searched along, if it kept one: { dipDeg, dipDirDeg } or null (params.searchTrend, or the plane's name 'Plane of Au >= 3 (82° → 86°)')
export function modelSearchPlane(params) {
  const t = params?.searchTrend;
  if (t && Number.isFinite(Number(t.dip)) && Number.isFinite(Number(t.dipAzimuth))) return { dipDeg: Math.round(Number(t.dip)), dipDirDeg: Math.round(Number(t.dipAzimuth)) };
  const m = /\((\d+(?:\.\d+)?)°\s*→\s*(\d+(?:\.\d+)?)°\)/.exec(String(t?.name || ""));
  return m ? { dipDeg: Math.round(Number(m[1])), dipDirDeg: Math.round(Number(m[2])) } : null;
}

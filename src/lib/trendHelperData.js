// TASKS.csv #3910 (redesign P8) — what the project holds, in the shape lib/trendCandidates.js reads: core picks (a pick's azimuth is its dip
// direction), outcrop readings, modelled surfaces (every n-th vertex), each unit's logged tops, one element's samples at or above the cut-off, every
// sample of the area (the drilling) and the contacts of the polygon map layers. Each source on its own, so one that fails leaves the others.
import { extractMapContacts } from "./mapLayers.js";
import { t as tr } from "./i18n.js";

const MAX_SURFACE_PTS = 5000; // a modelled mesh can hold 100,000 vertices: every n-th is enough for its plane
const thin = (pts) => { const P = pts || []; if (P.length <= MAX_SURFACE_PTS) return P; const k = Math.ceil(P.length / MAX_SURFACE_PTS), out = []; for (let i = 0; i < P.length; i += k) out.push(P[i]); return out; };
export function gatherTrendData({ structurePicks, surfaceStructures, surfaces, surfacePoints, units, unitTopPoints, gradeElement, samplePoints, drillingPoints, mapLayers }) {
  const safe = (f, d) => { try { return f() ?? d; } catch { return d; } };
  const structures = [
    ...(structurePicks || []).map((p) => ({ kind: String(p.value ?? "?"), dip: p.dip, dipDir: p.azimuth })),
    ...(surfaceStructures || []).filter((s) => !s.horizontal).map((s) => ({ kind: tr("{kind} (outcrop)", { kind: s.cls || s.type || "?" }), dip: s.dip, dipDir: s.dipDir, x: s.x, y: s.y })),
  ];
  const g = gradeElement ? safe(() => samplePoints?.(gradeElement), null) : null;
  return {
    structures,
    surfaces: safe(() => (surfaces || []).map((s) => ({ id: s.id, name: s.name, pts: thin(surfacePoints?.(s.id)) })), []),
    units: safe(() => (units || []).map((code) => ({ code, pts: unitTopPoints?.(code) || [] })), []),
    grade: g?.pts?.length ? { element: gradeElement, cutoff: g.cutoff, unit: g.unit, pts: g.pts } : null,
    drillingPts: safe(() => drillingPoints?.() || [], []),
    mapContacts: safe(() => (mapLayers || []).filter((l) => (l.geomType || "polygon") === "polygon" && l.styleField).flatMap((l) => extractMapContacts(l, l.styleField).contacts), []),
  };
}

// TASKS.csv #3843 (Scottie Gold surface geology review) — the Stereonet could not take the readings of one area or one class: 142 outcrop readings from prospects up to 11 km apart
// were one set, 'Vein' (65) and 'Vein Zone' (6) were separate types, the import kept no Zone, and a trend made from the mean was named 'Stereonet mean (81° → 16°)'. Pure.
import { structureClass } from "./mapStructures.js";
import { STRUCTURE_CLASS_LABELS } from "./mapLayers.js";
import { typeKeyOf } from "./stereonetTypes.js";

// the surface structure sets' readings as the Stereonet's outcrop picks, with the reading's class and area kept
export function surfacePicksOf(sets) {
  const out = [];
  for (const st of sets || []) for (const r of st.rows || []) {
    if (!Number.isFinite(r.dip) || !Number.isFinite(r.dipDir)) continue;
    out.push({ value: r.type || r.cls || "structure", dip: r.dip, azimuth: r.dipDir, x: r.x, y: r.y, outcrop: true, cls: r.cls || null, ...(r.group ? { group: r.group } : {}) });
  }
  return out;
}

// TASKS.csv #3845 - a mean of fewer than 4 readings, or one whose 95 % cone is wider than 45 degrees, is not offered as a structural trend (Fault n = 2: a cone of 180 degrees)
export const TREND_MIN_PICKS = 4, TREND_MAX_ALPHA95 = 45;

export const classOfPick = (p) => p?.cls || structureClass(p?.value);

// the classes that hold more than one structure type among the picks ('Vein' + 'Vein Zone'), each with its readings: [{ key: "class:vein", label, n, types }]
export function classEntries(picks) {
  const by = new Map();
  for (const p of picks || []) {
    const c = classOfPick(p); let e = by.get(c);
    if (!e) by.set(c, (e = { key: "class:" + c, label: STRUCTURE_CLASS_LABELS[c] || c, n: 0, types: new Set() }));
    e.n++; e.types.add(typeKeyOf(p));
  }
  return [...by.values()].filter((e) => e.types.size > 1).map((e) => ({ key: e.key, label: e.label, n: e.n, types: e.types.size })).sort((a, b) => a.label.localeCompare(b.label));
}

// the areas the readings carry: [{ key, n }] biggest first; [] when fewer than two areas (nothing to cut)
export function areaEntries(picks) {
  const m = new Map();
  for (const p of picks || []) if (p?.group) m.set(p.group, (m.get(p.group) || 0) + 1);
  return m.size < 2 ? [] : [...m].map(([key, n]) => ({ key, n })).sort((a, b) => b.n - a.n || (a.key < b.key ? -1 : 1));
}

// TASKS.csv #3843 (Matt's decision 2026-11-20) — where the readings are: the picks the view shows (a ground point in the window), and those inside a
// project boundary. A downhole pick is placed at its hole's collar (collarXY: hole id -> { x, y }), an outcrop reading at its own x, y; a pick with no
// position is kept out of a place filter. locate: { inView(x, y) -> bool | null, boundary: polylines | null, collarXY: Map }
export function pickXY(p, collarXY) {
  if (Number.isFinite(p?.x) && Number.isFinite(p?.y)) return { x: p.x, y: p.y };
  const c = collarXY?.get?.(p?.hole_id);
  return c && Number.isFinite(c.x) && Number.isFinite(c.y) ? c : null;
}
export function keepWhere(picks, locate, pointInBoundary) {
  if (!locate || (!locate.inView && !locate.boundary)) return picks;
  return (picks || []).filter((p) => { const q = pickXY(p, locate.collarXY); return !!q && (!locate.inView || locate.inView(q.x, q.y)) && (!locate.boundary || pointInBoundary(q.x, q.y, locate.boundary)); });
}

// one pick against the Structure type value ('all', a type key, or 'class:<class>') and the area ('all' or an area)
export function keepPick(p, typeFilter, area = "all") {
  if (area !== "all" && p.group !== area) return false;
  if (typeFilter === "all") return true;
  if (typeof typeFilter === "string" && typeFilter.startsWith("class:")) return classOfPick(p) === typeFilter.slice(6);
  return typeKeyOf(p) === typeFilter;
}

// what the mean is of, for the trend's name: 'Vein, Steep, 65 outcrop readings, k 3.7'
export function trendLabel({ typeLabel, area, n, k, outcropOnly }) {
  return [typeLabel, area, (n === 1 ? (outcropOnly ? "1 outcrop reading" : "1 reading") : outcropOnly ? `${n} outcrop readings` : `${n} readings`), Number.isFinite(k) ? `k ${k.toFixed(1)}` : null].filter(Boolean).join(", ");
}
// the trend's name: 'Stereonet mean (Terzaghi-weighted) (81° → 16°)' as before, with what it is the mean of when the net says: 'Mean of Vein, 65 outcrop readings (81° → 16°)' (TrendsPanel's automatic-name test already reads 'Mean of ...')
export function stereonetTrendName({ terzaghi, dip, azimuth, label }) {
  const at = `(${dip.toFixed(0)}° → ${azimuth.toFixed(0)}°)`;
  return `${label ? `Mean of ${label}` : "Stereonet mean"}${terzaghi ? " (Terzaghi-weighted)" : ""} ${at}`;
}

// TASKS.csv #3898 (Matt, 2026-11-17: "a setting for tools that need to input parameters ... that will 'do it for the user'") — the
// "Build it for me" engine's shared pieces. Each tool's auto file (autoBlockModel.js, autoGradeShell.js, autoSurface.js) reads the
// project's own data and returns { ok, values, reasons, notes, verdict }: every value comes from the data (extent, drill spacing, sample
// length, the grade distribution), never from a fixed default that would read as a fact (#264), and never from an assumed deposit style.
// Each reason and verdict is a plain sentence through tr(). Pure and cheap: large inputs are thinned to SAMPLE_MAX evenly spaced items
// first, so a choice takes well under a second. No screens here (the guided tools, batch P7, show the result and "Change these").
import { drillSiteSpacing } from "../drillSpacing.js";
import { t as tr, fmtNum } from "../i18n.js";
import { median } from "../arrayStats.js";

export const SAMPLE_MAX = 20000;

// every k-th item, evenly over the list, so a large project costs the same as a small one
export function thin(list, max = SAMPLE_MAX) {
  if (!Array.isArray(list) || list.length <= max) return list || [];
  const step = list.length / max, out = new Array(max);
  for (let i = 0; i < max; i++) out[i] = list[Math.floor(i * step)];
  return out;
}

export const fin = (v) => typeof v === "number" && Number.isFinite(v);

export { median }; // TASKS.csv #1114 — the one median of lib/arrayStats.js

// a round number near v (1, 2, 2.5 or 5 times a power of ten), so a block or a radius reads as chosen, not computed to the centimetre
export function niceNumber(v) {
  if (!fin(v) || v <= 0) return null;
  const e = 10 ** Math.floor(Math.log10(v)), f = v / e;
  const n = f < 1.5 ? 1 : f < 2.25 ? 2 : f < 3.5 ? 2.5 : f < 7.5 ? 5 : 10;
  return +(n * e).toPrecision(3);
}
// two significant figures, for a grade: 0.4237 -> 0.42, 1374 -> 1400
export const twoFigures = (v) => (fin(v) && v > 0 ? +v.toPrecision(2) : null);

export const metres = (v) => fmtNum(v, { maximumFractionDigits: v < 10 ? 2 : v < 100 ? 1 : 0 });

// the drill sites and their median spacing (collars within 2 m are one site: a fan from one pad counts once)
export function siteSpacing(collars) {
  const pts = (collars || []).filter((c) => fin(Number(c?.x)) && fin(Number(c?.y))).map((c) => ({ x: Number(c.x), y: Number(c.y) }));
  const r = drillSiteSpacing(pts);
  return { sites: r?.sites ?? new Set(pts.map((p) => `${Math.round(p.x / 2)},${Math.round(p.y / 2)}`)).size, spacing: r?.spacing ?? null };
}

// TASKS.csv #4037 (the guide's walk-through, Silvertip: holes fanned from five pads read 3 m apart at the collars, so 19 m cells were 'too coarse') —
// each hole at half its length, on a straight line from the collar along the survey station nearest that depth (else the collar's own azimuth and dip;
// none: the collar). One pass over the survey, no desurvey: spacing measured here is the spacing where the contacts are, the same for parallel holes.
// holes: [{ hole_id, x, y, length, azimuth?, dip? }] -> [{ hole_id, x, y }]
export function depthSites(holes, survey) {
  const want = new Map(), near = new Map();
  for (const h of holes || []) if (fin(Number(h.length)) && Number(h.length) > 0) want.set(h.hole_id, Number(h.length) / 2);
  for (const r of survey || []) {
    const t = want.get(r?.hole_id);
    if (t === undefined) continue;
    const dep = Number(r.depth), az = Number(r.azimuth), dip = Number(r.dip);
    if (!fin(dep) || !fin(az) || !fin(dip)) continue;
    const d = Math.abs(dep - t), b = near.get(r.hole_id);
    if (!b || d < b.d) near.set(r.hole_id, { d, az, dip });
  }
  return (holes || []).map((h) => {
    const n = near.get(h.hole_id) || (fin(Number(h.azimuth)) && fin(Number(h.dip)) ? { az: Number(h.azimuth), dip: Number(h.dip) } : null), half = want.get(h.hole_id);
    if (!n || half === undefined) return { hole_id: h.hole_id, x: h.x, y: h.y };
    const reach = half * Math.cos((n.dip * Math.PI) / 180), a = (n.az * Math.PI) / 180;
    return { hole_id: h.hole_id, x: h.x + reach * Math.sin(a), y: h.y + reach * Math.cos(a) };
  });
}

// the median length of the sampled intervals (to - from), from intervals that have both
export const sampleLength = (samples) => median((samples || []).map((s) => Number(s.to) - Number(s.from)).filter((l) => l > 0));

export function extentOf(points) {
  const e = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity };
  for (const p of points) {
    if (!fin(p.x) || !fin(p.y) || !fin(p.z)) continue;
    if (p.x < e.minX) e.minX = p.x; if (p.x > e.maxX) e.maxX = p.x;
    if (p.y < e.minY) e.minY = p.y; if (p.y > e.maxY) e.maxY = p.y;
    if (p.z < e.minZ) e.minZ = p.z; if (p.z > e.maxZ) e.maxZ = p.z;
  }
  return fin(e.minX) ? e : null;
}

export const holesOf = (points) => new Set(points.map((p) => p.hole_id).filter((h) => h != null && h !== "")).size;

// the result every auto file returns. problems: what the data cannot support (the tool then draws nothing confident-looking)
export function autoResult(values, reasons, notes, problems) {
  return problems.length
    ? { ok: false, values: null, reasons: [], notes, verdict: problems }
    : { ok: true, values, reasons, notes, verdict: null };
}
// a reason for one value: { field, text }
export const because = (field, key, vars) => ({ field, text: tr(key, vars) });
export const say = (key, vars) => tr(key, vars);

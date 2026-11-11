// TASKS.csv #1639 (review #1497, Lawyers) — a drill-hole location plan for the Layout: collars as symbols, traces as 0.3 mm lines,
// labels that do not overlap, drawn from the collars at a true map scale and independent of what the 3D scene shows. On Lawyers a
// plan of the 446 holes could not be made: at 1:20,000 the traces were 1 px lines under soils and geophysics, with no collar
// symbol or label. Pure functions; the drawing is components/DrillPlanElement.jsx.

import { collarsMatching } from "./holeFilter.js"; // TASKS.csv #2141
export const PAGE_PX_PER_PAPER_M = 96 / 0.0254; // the Layout sheet is 96 px per inch
export const pxPerMetre = (scale) => PAGE_PX_PER_PAPER_M / Math.max(1, Number(scale) || 1);

// The hole in plan, straight from the collar's azimuth, dip and length (a survey bends it little at plan scale). Dip may be
// stored positive or negative downwards; 90 (or none) is vertical, a point.
export function holePlan(c) {
  const az = ((Number(c.azimuth) || 0) * Math.PI) / 180, dip = ((Math.abs(Number(c.dip)) || 90) * Math.PI) / 180;
  const horiz = (Number(c.length) || 0) * Math.cos(dip);
  return { x0: c.x, y0: c.y, x1: c.x + Math.sin(az) * horiz, y1: c.y + Math.cos(az) * horiz };
}

const finite = (c) => Number.isFinite(c?.x) && Number.isFinite(c?.y);
// TASKS.csv #2141 (review #2013) — a program's location plan in two clicks: the filter takes collar fields too ('year=2024', 'project=Woodjam'),
// the hole-filter grammar of the hole list (#1504); a plain term still matches the hole id ('24-' kept Redgold's RG24-15 22 km north)
export const filterHoles = (collars, filter) => {
  const ok = (collars || []).filter(finite);
  return String(filter || "").trim() ? collarsMatching(ok, filter) : ok;
};

// The scale (from `presets`, smallest first) and centre that show every hole (collar and trace) inside a w x h px frame with a margin.
export function fitDrillPlan(collars, w, h, presets = [500, 1000, 2000, 2500, 5000, 10000, 20000, 25000, 50000, 100000]) {
  const cs = (collars || []).filter(finite);
  if (!cs.length) return null;
  let xmin = Infinity, ymin = Infinity, xmax = -Infinity, ymax = -Infinity;
  for (const c of cs) { const p = holePlan(c); for (const [x, y] of [[p.x0, p.y0], [p.x1, p.y1]]) { if (x < xmin) xmin = x; if (x > xmax) xmax = x; if (y < ymin) ymin = y; if (y > ymax) ymax = y; } }
  const spanX = Math.max(1, xmax - xmin), spanY = Math.max(1, ymax - ymin), m = 0.88; // 6 % margin each side
  const need = Math.max(spanX / (w * m), spanY / (h * m)) * PAGE_PX_PER_PAPER_M; // the 1:N that just fits
  const scale = presets.find((s) => s >= need) || Math.ceil(need / 1000) * 1000;
  return { scale, centre: { x: (xmin + xmax) / 2, y: (ymin + ymax) / 2 } };
}

// TASKS.csv #2305 (review #2174, WA gold) — a north-south block fitted into a landscape frame printed 36 x 61 mm in a 201 x 127 mm frame at
// 1:20,000, while the same frame turned would hold it at 1:10,000. -> the turned frame's fit when it is a larger scale (a smaller 1:N), else null
export function turnedFrameFit(collars, w, h, presets) {
  const now = fitDrillPlan(collars, w, h, presets), turned = fitDrillPlan(collars, h, w, presets);
  return now && turned && turned.scale < now.scale ? { ...turned, w: h, h: w, from: now.scale } : null;
}

// TASKS.csv #2611 — the corner of a w x h frame for a kw x kh key with the fewest holes under it (top left on a tie; bottom right sits above
// the grid caption). holes: drillPlanGeometry's (ax, ay in frame px). -> { x, y }
export function emptiestCorner(holes, w, h, kw, kh) {
  const corners = [[6, 6], [w - kw - 6, 6], [6, h - kh - 6], [w - kw - 6, h - kh - 22]];
  const under = ([x, y]) => (holes || []).reduce((n, hh) => n + (hh.ax >= x && hh.ax <= x + kw && hh.ay >= y && hh.ay <= y + kh ? 1 : 0), 0);
  const [x, y] = corners.map((c) => [c, under(c)]).sort((a, b) => a[1] - b[1])[0][0];
  return { x: Math.max(0, x), y: Math.max(0, y) };
}

// A hole's series: its id without the trailing number (21CCDD042 -> 21CCDD; 21AGBDD043B -> 21AGBDD), the year / prospect / type prefix drill programs use.
// A letter after the number (a re-drill, 21AGBDD043B) stays in its series.
export const holeSeries = (id) => String(id ?? "").replace(/[-_ ]?\d+[A-Za-z]?$/, "") || String(id ?? "");

// Labels placed greedily (right, left, above, below the collar), each kept only when it overlaps no label already placed and stays
// inside the frame. points: [{ id, x, y }] in frame px. -> { placed: [{ id, x, y, anchor }], skipped }
// avoid: boxes no label may overlap (the key, #2473)
// TASKS.csv #2611 — the boxes sit in a uniform grid of CELL px cells, so avoiding every collar of a 2,248-hole plan stays a few ms
export function placeLabels(points, { fontPx = 9, w, h, gap = 5, avoid = [] } = {}) {
  const placed = [], CELL = 48, grid = new Map();
  const cells = (b, fn) => { for (let cx = Math.floor(b.x0 / CELL); cx <= Math.floor(b.x1 / CELL); cx++) for (let cy = Math.floor(b.y0 / CELL); cy <= Math.floor(b.y1 / CELL); cy++) fn(`${cx},${cy}`); };
  const add = (b) => cells(b, (k) => { let a = grid.get(k); if (!a) grid.set(k, (a = [])); a.push(b); });
  avoid.forEach(add);
  let skipped = 0;
  const hit = (b) => { let found = false; cells(b, (k) => { if (!found) found = (grid.get(k) || []).some((o) => b.x0 < o.x1 && b.x1 > o.x0 && b.y0 < o.y1 && b.y1 > o.y0); }); return found; };
  for (const p of points) {
    const tw = String(p.id).length * fontPx * 0.56, th = fontPx;
    const tries = [
      { anchor: "start", x: p.x + gap, y: p.y + th * 0.35, b: { x0: p.x + gap, x1: p.x + gap + tw, y0: p.y - th / 2, y1: p.y + th / 2 } },
      { anchor: "end", x: p.x - gap, y: p.y + th * 0.35, b: { x0: p.x - gap - tw, x1: p.x - gap, y0: p.y - th / 2, y1: p.y + th / 2 } },
      { anchor: "middle", x: p.x, y: p.y - gap - 1, b: { x0: p.x - tw / 2, x1: p.x + tw / 2, y0: p.y - gap - th, y1: p.y - gap } },
      { anchor: "middle", x: p.x, y: p.y + gap + th, b: { x0: p.x - tw / 2, x1: p.x + tw / 2, y0: p.y + gap, y1: p.y + gap + th } },
    ];
    const ok = tries.find((t) => t.b.x0 >= 0 && t.b.x1 <= w && t.b.y0 >= 0 && t.b.y1 <= h && !hit(t.b));
    if (ok) { add(ok.b); placed.push({ id: p.id, x: ok.x, y: ok.y, anchor: ok.anchor }); } else skipped++;
  }
  return { placed, skipped };
}

// Everything the element draws, in frame px (north up, centre of the frame = el.centre). Holes wholly outside are left out.
export function drillPlanGeometry(el, collars) {
  const w = el.w || 600, h = el.h || 400, ppm = pxPerMetre(el.scale), cx = el.centre?.x ?? 0, cy = el.centre?.y ?? 0;
  const toPx = (x, y) => [w / 2 + (x - cx) * ppm, h / 2 - (y - cy) * ppm];
  const holes = [];
  for (const c of filterHoles(collars, el.holeFilter)) {
    const p = holePlan(c), [ax, ay] = toPx(p.x0, p.y0), [bx, by] = toPx(p.x1, p.y1);
    if (Math.max(ax, bx) < 0 || Math.min(ax, bx) > w || Math.max(ay, by) < 0 || Math.min(ay, by) > h) continue;
    holes.push({ id: String(c.hole_id ?? ""), series: holeSeries(c.hole_id), ax, ay, bx, by, inside: ax >= 0 && ax <= w && ay >= 0 && ay <= h });
  }
  return { w, h, ppm, holes };
}

// TASKS.csv #2301 (review #2174, WA gold) — the location plan had no coordinates at all. A grid at a round spacing (el.gridM, else about five
// lines across the frame: 1 / 2 / 2.5 / 5 x 10^n m; 0 = no grid), with easting labels along the top and northing labels down the left, in the
// project's own metres. -> { spacing, xs: [{ px, label }], ys: [{ px, label }] } or null
export function drillPlanGrid(el) {
  const w = el.w || 600, h = el.h || 400, ppm = pxPerMetre(el.scale), cx = el.centre?.x ?? 0, cy = el.centre?.y ?? 0;
  if (el.gridM === 0 || !(ppm > 0)) return null;
  let spacing = Number(el.gridM);
  if (!(spacing > 0)) { const raw = w / ppm / 5, mag = 10 ** Math.floor(Math.log10(raw)); spacing = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((v) => v >= raw); }
  const x0 = cx - w / 2 / ppm, x1 = cx + w / 2 / ppm, y0 = cy - h / 2 / ppm, y1 = cy + h / 2 / ppm;
  const fmt = (v) => Math.round(v).toLocaleString("en-US");
  const xs = [], ys = [];
  for (let x = Math.ceil(x0 / spacing) * spacing; x <= x1 && xs.length < 200; x += spacing) xs.push({ px: w / 2 + (x - cx) * ppm, label: `${fmt(x)} E` });
  for (let y = Math.ceil(y0 / spacing) * spacing; y <= y1 && ys.length < 200; y += spacing) ys.push({ px: h / 2 - (y - cy) * ppm, label: `${fmt(y)} N` });
  return { spacing, xs, ys };
}

// TASKS.csv #2473 (review #2325, WA uranium) — the plan of a flat deposit drilled with vertical holes is a collar map coloured by what
// each hole found, and the drill plan could only colour by series. el.colourBy: "none" | "series" | "attr:<collar field>" |
// "max:<element>" (the hole's highest result) | "gt:<element>" (grade x length summed over the hole's assayed metres). A plan saved
// with the older bySeries tick keeps its series colours.
export const drillPlanColourBy = (el) => el?.colourBy || (el?.bySeries ? "series" : "none");
export function colourByKind(by) {
  const s = String(by || "none"), i = s.indexOf(":");
  return i < 0 ? { kind: s, key: "" } : { kind: s.slice(0, i), key: s.slice(i + 1) };
}

// A hole's value for a grade choice, from resolved assay segments (geochem.js resolvedSegments: [{ hole_id, from, to, value }], each
// metre counted once, overlaps and zero-length QC inserts already out). kind "max" | "gt". -> Map(hole_id -> number)
export function holeGradeValues(segs, kind) {
  const out = new Map();
  for (const s of segs || []) {
    const v = Number(s.value), len = Number(s.to) - Number(s.from);
    if (!Number.isFinite(v)) continue;
    const id = String(s.hole_id ?? ""), was = out.get(id);
    if (kind === "gt") { if (len > 0) out.set(id, (was || 0) + v * len); } else if (was == null || v > was) out.set(id, v);
  }
  return out;
}

// Up to four classes cut at the 50th, 75th and 90th percentile of the holes' own values: no grade is assumed for any deposit or
// element. A cut equal to the lowest value or to another cut (many holes at one value) is dropped. -> ascending breaks, [] for none
export function gradeBreaks(values) {
  const v = [...values].filter(Number.isFinite).sort((a, b) => a - b);
  if (!v.length) return [];
  const q = (p) => v[Math.min(v.length - 1, Math.max(0, Math.ceil(p * v.length) - 1))];
  return [...new Set([0.5, 0.75, 0.9].map(q).filter((b) => b > v[0]))];
}
export const classOf = (value, breaks) => { let i = 0; while (i < breaks.length && value >= breaks[i]) i++; return i; };
export const fmtClassNumber = (x) => (Math.abs(x) >= 1000 ? Math.round(x).toLocaleString("en-US") : Number(x).toLocaleString("en-US", { maximumSignificantDigits: 3 }));
export const GRADE_COLOURS = ["#8a9bb0", "#2b83ba", "#f08a24", "#c8102e"]; // low to high, each readable on the white sheet (no yellow: #2611)
export const GRADE_RADIUS_MM = [0.6, 0.8, 1.05, 1.35]; // larger for higher classes, so the classes still read in a black-and-white print
const NONE_COLOUR = "#9aa3ad";
const rampIndex = (i, n) => (n <= 1 ? GRADE_COLOURS.length - 1 : Math.round((i * (GRADE_COLOURS.length - 1)) / (n - 1)));

// How each hole is drawn, and the key. holes: drillPlanGeometry's; opts: { segs (for max / gt), unit, palette (categorical), ink }.
// -> { by, title, note, breaks, styleOf(holeId, series) -> { colour, rMm, hollow }, key: [{ label, colour, rMm, hollow }] }
export function drillPlanColouring(el, holes, collars, { segs = null, unit = "", palette = [], ink = "#1a2028" } = {}) {
  const by = drillPlanColourBy(el), { kind, key } = colourByKind(by);
  const dot = (colour, rMm = 0.8, hollow = false) => ({ colour, rMm, hollow });
  if (kind === "series") {
    const series = [...new Set(holes.map((h) => h.series))];
    const colour = (s) => palette[series.indexOf(s) % palette.length] || ink;
    return { by, title: "", note: "", breaks: [], styleOf: (id, s) => dot(colour(s)), key: series.map((s) => ({ label: s, ...dot(colour(s)) })) };
  }
  if (kind === "attr" && key) {
    const byId = new Map((collars || []).map((c) => [String(c.hole_id ?? ""), String(c?.attrs?.[key] ?? "").trim()]));
    const vals = [...new Set(holes.map((h) => byId.get(h.id) || ""))].filter(Boolean).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const colour = (v) => palette[vals.indexOf(v) % palette.length] || ink;
    const blank = holes.some((h) => !byId.get(h.id));
    return {
      by, title: key, note: "", breaks: [],
      styleOf: (id) => { const v = byId.get(id); return v ? dot(colour(v)) : dot(NONE_COLOUR, 0.8, true); },
      key: [...vals.map((v) => ({ label: v, ...dot(colour(v)) })), ...(blank ? [{ label: "not recorded", ...dot(NONE_COLOUR, 0.8, true) }] : [])],
    };
  }
  if ((kind === "max" || kind === "gt") && key) {
    const per = holeGradeValues(segs, kind);
    // the classes come from every hole the plan takes (its hole filter), not only those in the frame, so panning keeps them
    const shown = filterHoles(collars, el.holeFilter).map((c) => per.get(String(c.hole_id ?? ""))).filter((v) => v != null);
    const breaks = gradeBreaks(shown), n = breaks.length + 1, u = kind === "gt" ? `m × ${unit || "grade"}` : unit;
    const withUnit = (t) => (u ? `${t} ${u}` : t);
    const key2 = [];
    if (shown.length) {
      if (!breaks.length) key2.push({ label: withUnit(fmtClassNumber(shown[0]) === fmtClassNumber(Math.max(...shown)) ? fmtClassNumber(shown[0]) : `${fmtClassNumber(Math.min(...shown))} – ${fmtClassNumber(Math.max(...shown))}`), ...dot(GRADE_COLOURS[rampIndex(0, 1)], GRADE_RADIUS_MM[rampIndex(0, 1)]) });
      else for (let i = 0; i < n; i++) {
        const lo = i ? breaks[i - 1] : null, hi = i < breaks.length ? breaks[i] : null, c = rampIndex(i, n);
        key2.push({ label: withUnit(lo == null ? `< ${fmtClassNumber(hi)}` : hi == null ? `≥ ${fmtClassNumber(lo)}` : `${fmtClassNumber(lo)} – ${fmtClassNumber(hi)}`), ...dot(GRADE_COLOURS[c], GRADE_RADIUS_MM[c]) });
      }
    }
    const blank = holes.some((h) => !per.has(h.id));
    return {
      by, breaks,
      title: kind === "gt" ? `${key} grade × length, whole hole` : `Highest ${key} in the hole`,
      note: breaks.length ? "classes: 50th / 75th / 90th percentile of the plan's holes" : "",
      styleOf: (id) => { const v = per.get(id); if (v == null) return dot(NONE_COLOUR, 0.6, true); const c = rampIndex(classOf(v, breaks), n); return dot(GRADE_COLOURS[c], GRADE_RADIUS_MM[c]); },
      key: [...key2, ...(blank ? [{ label: `no ${key} result`, ...dot(NONE_COLOUR, 0.6, true) }] : [])],
    };
  }
  return { by: "none", title: "", note: "", breaks: [], styleOf: () => dot(ink), key: [] };
}

// TASKS.csv #2473 — a top-down capture draws a hole steeper than this as a point. True when every hole in `ids` is (a hole with no
// dip, or none recorded, is drawn vertical), so the viewport's sidebar can point to the drill plan for a collar map.
export const STEEP_DIP = 80;
export function allHolesSteep(collars, ids, minDip = STEEP_DIP) {
  if (!ids || !ids.size) return false;
  let n = 0;
  for (const c of collars || []) {
    if (!ids.has(c.hole_id)) continue;
    n++;
    const d = Math.abs(Number(c.dip));
    if (Number.isFinite(d) && d > 0 && d < minDip && Number(c.length) > 0) return false;
  }
  return n > 0;
}

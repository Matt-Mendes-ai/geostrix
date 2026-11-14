// TASKS.csv #1639 (review #1497, Lawyers) — a drill-hole location plan for the Layout: collars as symbols, traces as 0.3 mm lines,
// labels that do not overlap, drawn from the collars at a true map scale and independent of what the 3D scene shows. On Lawyers a
// plan of the 446 holes could not be made: at 1:20,000 the traces were 1 px lines under soils and geophysics, with no collar
// symbol or label. Pure functions; the drawing is components/DrillPlanElement.jsx.

import { collarsMatching } from "./holeFilter.js"; // TASKS.csv #2141
import { PAGE_PX_PER_PAPER_M, pxPerMetre } from "./pagePxScale.js";
import { desurveyHole, normalizeDesurveyMethod, DESURVEY_METHODS } from "./desurvey.js"; // TASKS.csv #3367 (desurvey.js imports nothing)
export { PAGE_PX_PER_PAPER_M, pxPerMetre } from "./pagePxScale.js"; // TASKS.csv #3159 — moved there for the startup code

// The hole in plan, straight from the collar's azimuth, dip and length (a survey bends it little at plan scale). Dip may be
// stored positive or negative downwards; 90 (or none) is vertical, a point.
export function holePlan(c) {
  const az = ((Number(c.azimuth) || 0) * Math.PI) / 180, dip = ((Math.abs(Number(c.dip)) || 90) * Math.PI) / 180;
  const horiz = (Number(c.length) || 0) * Math.cos(dip);
  return { x0: c.x, y0: c.y, x1: c.x + Math.sin(az) * horiz, y1: c.y + Math.cos(az) * horiz };
}

const finite = (c) => Number.isFinite(c?.x) && Number.isFinite(c?.y);

// TASKS.csv #3367 (review #3195, Galore Creek) — every hole was drawn straight from its collar's planned azimuth and dip (holePlan, #1639):
// on a gyro-surveyed project 25 of 70 traces ended more than 10 m from the surveyed toe (two about 60 m), a vertical hole that drifted 20 m
// was a dot, and a top-down viewport on the same page drew the surveyed paths. A hole with survey stations is drawn along its desurveyed
// path (the project's method), projected to plan; a hole with none, and a planned hole, stay straight. -> Map hole_id -> [[x, y], ...]
// (null with no survey), kept per collars array for its survey and method
const planMemo = new WeakMap();
export function planTraces(collars, survey, method) {
  if (!survey?.length || !collars?.length) return null;
  const kept = planMemo.get(collars);
  if (kept && kept.survey === survey && kept.method === method) return kept.out;
  const by = new Map();
  for (const st of survey) { const k = String(st.hole_id ?? ""); (by.get(k) || by.set(k, []).get(k)).push(st); }
  const out = new Map();
  for (const c of collars) {
    const stations = by.get(String(c.hole_id ?? ""));
    if (!stations?.length || !finite(c)) continue;
    const t = desurveyHole({ ...c, z: Number.isFinite(c.z) ? c.z : 0 }, stations, method);
    if (t.length > 1) out.set(String(c.hole_id), t.map((q) => [q.x, q.y]));
  }
  planMemo.set(collars, { survey, method, out });
  return out;
}
// the sheet's line on how the traces were drawn (English: it is printed with the plan, as the grid caption is). surveyed / straight:
// the drilled holes in the frame drawn each way; planned: planned holes shown; method: the project's desurvey method id
export function traceCaption({ surveyed = 0, straight = 0, planned = 0, method = null } = {}) {
  const m = (DESURVEY_METHODS.find((x) => x.id === normalizeDesurveyMethod(method))?.label || "minimum curvature").toLowerCase();
  const parts = [];
  if (surveyed && !straight) parts.push(`Traces along the downhole surveys (${m})`);
  else if (surveyed) parts.push(`Traces along the downhole surveys (${m}); ${straight} hole(s) with no survey straight from the collar azimuth and dip`);
  else if (straight) parts.push("Traces straight from each collar's azimuth and dip (no downhole surveys)");
  if (planned) parts.push("planned holes straight from their design");
  return parts.join("; ");
}
// TASKS.csv #2141 (review #2013) — a program's location plan in two clicks: the filter takes collar fields too ('year=2024', 'project=Woodjam'),
// the hole-filter grammar of the hole list (#1504); a plain term still matches the hole id ('24-' kept Redgold's RG24-15 22 km north)
export const filterHoles = (collars, filter) => {
  const ok = (collars || []).filter(finite);
  return String(filter || "").trim() ? collarsMatching(ok, filter) : ok;
};

// The scale (from `presets`, smallest first) and centre that show every hole (collar and trace) inside a w x h px frame with a margin.
// traces: planTraces' Map (#3367) — a surveyed hole is framed along its path
export function fitDrillPlan(collars, w, h, presets = [500, 1000, 2000, 2500, 5000, 10000, 20000, 25000, 50000, 100000], traces = null) {
  const cs = (collars || []).filter(finite);
  if (!cs.length) return null;
  let xmin = Infinity, ymin = Infinity, xmax = -Infinity, ymax = -Infinity;
  for (const c of cs) {
    const t = traces?.get(String(c.hole_id)), p = t ? null : holePlan(c);
    for (const [x, y] of t || [[p.x0, p.y0], [p.x1, p.y1]]) { if (x < xmin) xmin = x; if (x > xmax) xmax = x; if (y < ymin) ymin = y; if (y > ymax) ymax = y; }
  }
  const spanX = Math.max(1, xmax - xmin), spanY = Math.max(1, ymax - ymin);
  // TASKS.csv #3181 (#3028 (6), review #2876) — the margin each side is 6 % of the frame or 5 mm (about two label heights), whichever is less:
  // 6 % of a 201 x 127 mm frame (12 mm a side) sent a field that 1:150,000 holds with 9 % to spare to 1:200,000
  const marginPx = (5 * PAGE_PX_PER_PAPER_M) / 1000, avail = (side) => side - 2 * Math.min(0.06 * side, marginPx);
  const need = Math.max(spanX / avail(w), spanY / avail(h)) * PAGE_PX_PER_PAPER_M; // the 1:N that just fits
  const scale = presets.find((s) => s >= need) || Math.ceil(need / 1000) * 1000;
  return { scale, centre: { x: (xmin + xmax) / 2, y: (ymin + ymax) / 2 } };
}

// TASKS.csv #2305 (review #2174, WA gold) — a north-south block fitted into a landscape frame printed 36 x 61 mm in a 201 x 127 mm frame at
// 1:20,000, while the same frame turned would hold it at 1:10,000. -> the turned frame's fit when it is a larger scale (a smaller 1:N), else null
export function turnedFrameFit(collars, w, h, presets, traces = null) { // traces: #3367
  const now = fitDrillPlan(collars, w, h, presets, traces), turned = fitDrillPlan(collars, h, w, presets, traces);
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
// TASKS.csv #3026 (review #2876, WA iron) — and after a separator too: RHRCMET_0005_A, RHRCMET_0009_A ... were each their own series (125 of
// them on the plan's key); they are RHRCMET.
export const holeSeries = (id) => String(id ?? "").replace(/[-_ ]?\d+(?:[-_ ]?[A-Za-z])?$/, "") || String(id ?? "");
// TASKS.csv #3026 — a key no taller than the frame: the rows that fit (keyLines: its title / note lines; extra: rows listed under it, the
// shapes), the last one saying how many were left out. key: [{ label, ... }] -> the same, or capped with { label, note: true }
export function capPlanKey(key, { frameH, rowPx, keyLines = 0, extra = 0, moreLabel = (n) => `+ ${n} more` }) {
  const fit = Math.floor((frameH - 18) / rowPx) - keyLines - extra;
  if (key.length <= Math.max(fit, 1)) return key;
  const keep = Math.max(fit - 1, 1);
  return [...key.slice(0, keep), { label: moreLabel(key.length - keep), note: true }];
}

// Labels placed greedily (right, left, above, below the collar), each kept only when it overlaps no label already placed and stays
// inside the frame. points: [{ id, x, y }] in frame px. -> { placed: [{ id, x, y, anchor }], skipped }
// TASKS.csv #2686 (split from #2473) — a symbol shape by a collar field (the hole type), together with the colour by grade: the field's
// three commonest values get a square, a triangle and a diamond; every other value, and a hole without the field, keeps the circle, so a
// circle never means two things. -> { shapeOf(holeId) -> shape, key: [{ label, shape, n }] } (key empty when the field is not set)
const SHAPES = ["square", "triangle", "diamond"];
export function drillPlanShapes(collars, field, holeIds = null) {
  if (!field) return { shapeOf: () => "circle", key: [] };
  const want = holeIds ? new Set(holeIds) : null;
  const valueOf = new Map(), counts = new Map();
  for (const c of collars || []) {
    if (want && !want.has(c.hole_id)) continue;
    const v = String(c?.attrs?.[field] ?? "").trim();
    valueOf.set(c.hole_id, v);
    if (v) counts.set(v, (counts.get(v) || 0) + 1);
  }
  const ranked = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], undefined, { numeric: true }));
  const shapeOfValue = new Map(ranked.slice(0, SHAPES.length).map(([v], i) => [v, SHAPES[i]]));
  const key = ranked.slice(0, SHAPES.length).map(([v, n], i) => ({ label: v, shape: SHAPES[i], n }));
  const others = [...valueOf.values()].filter((v) => !shapeOfValue.has(v)).length;
  if (others) key.push({ label: ranked.length > SHAPES.length ? "other / not recorded" : "not recorded", shape: "circle", n: others });
  return { shapeOf: (id) => shapeOfValue.get(valueOf.get(id)) || "circle", key };
}
// the outline of a symbol of radius r at (cx, cy), as an SVG path (the circle is drawn as a <circle>)
export function symbolPath(shape, cx, cy, r) {
  if (shape === "square") { const s = r * 0.9; return `M${cx - s},${cy - s}h${2 * s}v${2 * s}h${-2 * s}z`; }
  if (shape === "triangle") { const s = r * 1.25; return `M${cx},${cy - s}L${cx + s * 0.866},${cy + s * 0.5}L${cx - s * 0.866},${cy + s * 0.5}z`; }
  if (shape === "diamond") { const s = r * 1.25; return `M${cx},${cy - s}L${cx + s},${cy}L${cx},${cy + s}L${cx - s},${cy}z`; }
  return null;
}

// TASKS.csv #2738 (split from #1871) — the white box behind a label, in place of a stroked halo: a halo is drawn as a second, outlined
// copy of the text, so a PDF reader copied or searched every label twice. Width estimated as placeLabels does (0.56 em a character);
// anchor: the text's textAnchor; y is the text's baseline. -> { x, y, w, h }
export function labelBackdrop(text, x, y, fontPx, anchor = "start", pad = 1) {
  const w = String(text ?? "").length * fontPx * 0.56 + 2 * pad, h = fontPx + pad;
  const left = anchor === "end" ? x - w + pad : anchor === "middle" ? x - w / 2 : x - pad;
  return { x: left, y: y - fontPx + 1, w, h };
}

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
// traces (#3367): planTraces' Map; a hole in it carries `path` (frame px from the collar to the toe) and surveyed: true
export function drillPlanGeometry(el, collars, traces = null) {
  const w = el.w || 600, h = el.h || 400, ppm = pxPerMetre(el.scale), cx = el.centre?.x ?? 0, cy = el.centre?.y ?? 0;
  const toPx = (x, y) => [w / 2 + (x - cx) * ppm, h / 2 - (y - cy) * ppm];
  const holes = [];
  for (const c of filterHoles(collars, el.holeFilter)) {
    const t = traces?.get(String(c.hole_id));
    let ax, ay, bx, by, path = null;
    if (t) {
      path = t.map(([x, y]) => toPx(x, y));
      [ax, ay] = toPx(c.x, c.y); [bx, by] = path[path.length - 1];
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const [x, y] of path) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      if (x1 < 0 || x0 > w || y1 < 0 || y0 > h) continue;
    } else {
      const p = holePlan(c);
      [ax, ay] = toPx(p.x0, p.y0); [bx, by] = toPx(p.x1, p.y1);
      if (Math.max(ax, bx) < 0 || Math.min(ax, bx) > w || Math.max(ay, by) < 0 || Math.min(ay, by) > h) continue;
    }
    holes.push({ id: String(c.hole_id ?? ""), series: holeSeries(c.hole_id), ax, ay, bx, by, path, surveyed: !!t, inside: ax >= 0 && ax <= w && ay >= 0 && ay <= h });
  }
  return { w, h, ppm, holes };
}

// TASKS.csv #2259 (review #2174, WA gold) — a drill plan is what a program is approved and staked from, and it showed the drilled collars only:
// the planned holes (drawn in the planned colour in the 3D view and on sections) are on it too, unless the element's 'Show the planned holes'
// is off. planned: the project's plannedHoles ({ name, x, y, azimuth, dip, length }); the hole filter reads a planned hole's name as its id.
export const plannedAsCollars = (planned) => (planned || []).map((p) => ({ ...p, hole_id: p.name || p.id }));
export const showsPlanned = (el) => el?.showPlanned !== false;
// -> frame-px holes as drillPlanGeometry's, each with planned: true ([] when off or none)
export function drillPlanPlanned(el, planned) {
  if (!showsPlanned(el) || !planned?.length) return [];
  return drillPlanGeometry(el, plannedAsCollars(planned)).holes.map((h) => ({ ...h, planned: true }));
}
// the holes a 'Fit the holes' frames: the collars, and the planned holes when the plan shows them
export const holesToFit = (el, collars, planned) => /* the fit's traces: #3367, passed beside */ filterHoles([...(collars || []), ...(showsPlanned(el) ? plannedAsCollars(planned) : [])], el?.holeFilter);

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

// TASKS.csv #2685 (split from #2473) — each hole's best intercept as grade × length, from Best intercepts' own rule (geochem.js
// computeBestIntercepts: a cut-off, an internal dilution and a minimum length): the composites -> Map(hole_id -> the largest
// length × grade). The whole-hole sum ('gt') stays beside it.
export function bestInterceptGT(composites) {
  const out = new Map();
  for (const c of composites || []) {
    const v = Number(c.length) * Number(c.avgGrade), id = String(c.hole_id ?? "");
    if (!Number.isFinite(v)) continue;
    if (!out.has(id) || v > out.get(id)) out.set(id, v);
  }
  return out;
}
// the cut-off a plan opens on when none is typed: the 90th percentile of the element's positive results rounded to one figure, the
// suggestion Best intercepts makes (so the two tools agree until the user picks one). -> number or null
export function p90Cutoff(values) {
  const v = [...(values || [])].map(Number).filter((x) => Number.isFinite(x) && x > 0).sort((a, b) => a - b);
  if (!v.length) return null;
  const p = v[Math.floor(0.9 * (v.length - 1))], mag = 10 ** Math.floor(Math.log10(p));
  return Number((Math.round(p / mag) * mag).toPrecision(1));
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
export function drillPlanColouring(el, holes, collars, { segs = null, unit = "", palette = [], ink = "#1a2028", perHole = null, biRule = "" } = {}) { // perHole / biRule: #2685
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
  if ((kind === "max" || kind === "gt" || kind === "bi") && key) {
    const per = kind === "bi" ? perHole || new Map() : holeGradeValues(segs, kind); // bi: the best intercept's grade × length (#2685)
    // the classes come from every hole the plan takes (its hole filter), not only those in the frame, so panning keeps them
    const shown = filterHoles(collars, el.holeFilter).map((c) => per.get(String(c.hole_id ?? ""))).filter((v) => v != null);
    const breaks = gradeBreaks(shown), n = breaks.length + 1, u = kind === "gt" || kind === "bi" ? `m × ${unit || "grade"}` : unit;
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
      title: kind === "bi" ? `${key} best intercept, grade × length` : kind === "gt" ? `${key} grade × length, whole hole` : `Highest ${key} in the hole`,
      note: [kind === "bi" ? biRule : "", breaks.length ? "classes: 50th / 75th / 90th percentile of the plan's holes" : ""].filter(Boolean).join("; "),
      styleOf: (id) => { const v = per.get(id); if (v == null) return dot(NONE_COLOUR, 0.6, true); const c = rampIndex(classOf(v, breaks), n); return dot(GRADE_COLOURS[c], GRADE_RADIUS_MM[c]); },
      key: [...key2, ...(blank ? [{ label: kind === "bi" ? `no ${key} intercept` : `no ${key} result`, ...dot(NONE_COLOUR, 0.6, true) }] : [])],
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

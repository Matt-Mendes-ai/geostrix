// TASKS.csv #3977 (Matt's first test, #3913: "an overview pane in the cross section window displaying the maps view and highlighting where the
// cross section is ... changing when I move the section forward and backward ... move the section by dragging on the overview") — the plan the
// section window's overview pane (components/SectionOverview.jsx) draws, and the inset it puts on an export when asked.
// Built in the main window with each section it sends (ViewerModule openSectionOrSay), so it follows the ± steps, the arrows and the tabs:
//   - the visible holes' plan traces, a few points each (collar, toe and between), so 500+ holes stay a few kB and one SVG path;
//   - the visible boundaries, thinned to a vertex budget;
//   - the other sections of the series (parallel within 5°, as the ± steps find them: sectionDigitise.js stepSection) and the step they keep;
//   - the terrain's hillshade over the same ground, ~190 px across, as a PNG (cached per terrain and extent).
// Coordinates are relative to `origin` (the extent's lower-left corner) and rounded to 0.1 m: plain arrays, JSON- and clone-safe.
// The drawing is one SVG string (overviewSvg) for the pane and the export alike; pure apart from shadePng (a canvas).
import { hillshadeValues } from "./hillshade.js";
import { decodeNoDataMask, isNoData } from "./demFill.js";

export const OVERVIEW_TRACE_PTS = 6, OVERVIEW_BOUNDARY_PTS = 3000, OVERVIEW_SHADE_PX = 192, SERIES_TOL_DEG = 5;
const r1 = (v) => Math.round(v * 10) / 10;

// every n-th point of a line, its ends kept, at most `max` points
function thin(xs, ys, max) {
  const n = Math.min(xs.length, ys.length);
  if (n <= max) return Array.from({ length: n }, (_, i) => i);
  const out = [];
  for (let k = 0; k < max; k++) out.push(Math.round((k * (n - 1)) / (max - 1)));
  return [...new Set(out)];
}

const azOf = (s) => (Math.atan2(s.bx - s.ax, s.by - s.ay) * 180) / Math.PI;
// the sections parallel to this one (within tolDeg), each with its offset along the section's normal (as stepSection measures it), and the step
// of the series: the section's own (a stepped section keeps it) or the nearest spacing; null when it stands alone
export function overviewSeries(section, sections, id, { tolDeg = SERIES_TOL_DEG } = {}) {
  if (!section) return { series: [], stepM: null };
  const dx = section.bx - section.ax, dy = section.by - section.ay, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len, az = azOf(section);
  const series = [];
  for (const s of sections || []) {
    if (!s || s.id === id || ![s.ax, s.ay, s.bx, s.by].every(Number.isFinite)) continue;
    let d = Math.abs((((azOf(s) - az) % 180) + 180) % 180); d = Math.min(d, 180 - d);
    if (d > tolDeg) continue;
    const offset = ((s.ax + s.bx) / 2 - section.ax) * nx + ((s.ay + s.by) / 2 - section.ay) * ny;
    if (Math.abs(offset) > 0.5) series.push({ id: s.id, name: s.name || "", ax: s.ax, ay: s.ay, bx: s.bx, by: s.by, offset });
  }
  const own = (sections || []).find((s) => s?.id === id);
  const nearest = series.reduce((m, s) => (m == null || Math.abs(s.offset) < m ? Math.abs(s.offset) : m), null);
  return { series, stepM: own?.stepped && own.stepM > 0 ? own.stepM : nearest };
}

// traces: [{ hole_id, wx, wy }] (the main window's desurveyed traces, project CRS); visible: { hole_id: false } hides one; boundaries: the
// store's [{ visible, polylines: [[{ x, y }]] }]; section: { ax, ay, bx, by } -> the model, or null when there is nothing to place it on
export function overviewPlan({ traces = [], visible = {}, boundaries = [], sections = [], id = null, section = null, maxPts = OVERVIEW_TRACE_PTS, boundaryPts = OVERVIEW_BOUNDARY_PTS } = {}) {
  if (!section || ![section.ax, section.ay, section.bx, section.by].every(Number.isFinite)) return null;
  // framed on the section (seen live: framed on all the drilling, a 250 m section in an 8 km project was a stub too small to drag): its line,
  // padded by its own length (at least 300 m or 4 buffers), and the series' lines within three pads; holes outside the frame are left out
  let x0 = Math.min(section.ax, section.bx), y0 = Math.min(section.ay, section.by), x1 = Math.max(section.ax, section.bx), y1 = Math.max(section.ay, section.by);
  const take = (x, y) => { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; };
  const pad = Math.max(300, Math.hypot(section.bx - section.ax, section.by - section.ay), 4 * (Number(section.corridor) || 0));
  const { series, stepM } = overviewSeries(section, sections, id);
  for (const s of series) if (Math.abs(s.offset) <= 3 * pad) { take(s.ax, s.ay); take(s.bx, s.by); }
  x0 -= pad; y0 -= pad; x1 += pad; y1 += pad;
  const sq = (x1 - x0) - (y1 - y0); // a square frame, so the pane's shape does not change at each step
  if (sq > 0) { y0 -= sq / 2; y1 += sq / 2; } else { x0 += sq / 2; x1 -= sq / 2; }
  const inside = (x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
  const holes = [];
  for (const t of traces) {
    if (!t || visible[t.hole_id] === false || !t.wx?.length || !t.wy?.length) continue;
    const idx = thin(t.wx, t.wy, maxPts).filter((i) => Number.isFinite(t.wx[i]) && Number.isFinite(t.wy[i]));
    if (idx.length && idx.some((i) => inside(t.wx[i], t.wy[i]))) holes.push(idx.map((i) => [t.wx[i], t.wy[i]]));
  }
  // boundaries: only those touching the extent, thinned so all of them stay within the budget
  const lines = [];
  for (const b of boundaries || []) if (b && b.visible !== false) for (const pl of b.polylines || []) {
    const pts = (pl || []).filter((p) => Number.isFinite(p?.x) && Number.isFinite(p?.y));
    if (pts.length > 1 && pts.some((p) => p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1)) lines.push(pts);
  }
  const total = lines.reduce((n, pl) => n + pl.length, 0), stride = Math.max(1, Math.ceil(total / boundaryPts));
  const rel = (x, y) => [r1(x - x0), r1(y - y0)];
  return {
    origin: [x0, y0], size: [r1(x1 - x0), r1(y1 - y0)],
    holes: holes.map((pl) => pl.flatMap(([x, y]) => rel(x, y))),
    boundaries: lines.map((pl) => pl.filter((_, i) => i % stride === 0 || i === pl.length - 1).flatMap((p) => rel(p.x, p.y))),
    series: series.map((s) => ({ id: s.id, name: s.name, offset: r1(s.offset), line: [...rel(s.ax, s.ay), ...rel(s.bx, s.by)] })),
    stepM: stepM ? r1(stepM) : null,
    shade: null,
  };
}

// the terrain's hillshade over the extent [x0, y0, x1, y1] (project CRS), at most `px` across: grey RGBA, row 0 north, cells off the terrain
// (or in its no-data mask) transparent. -> { w, h, rgba } or null
export function shadeGrid(terrain, [x0, y0, x1, y1], px = OVERVIEW_SHADE_PX) {
  if (!terrain?.elevations || !terrain.bbox || !(terrain.gridW > 1) || !(terrain.gridH > 1) || !(x1 > x0) || !(y1 > y0)) return null;
  const [tx0, ty0, tx1, ty1] = terrain.bbox, gw = terrain.gridW, gh = terrain.gridH;
  if (tx1 < x0 || tx0 > x1 || ty1 < y0 || ty0 > y1) return null;
  const k = Math.max(x1 - x0, y1 - y0) / px, w = Math.max(2, Math.round((x1 - x0) / k)), h = Math.max(2, Math.round((y1 - y0) / k));
  const src = terrain.noDataMask ? (terrain.noDataMask instanceof Uint8Array ? terrain.noDataMask : decodeNoDataMask(String(terrain.noDataMask))) : null;
  const el = new Float32Array(w * h), mask = new Uint8Array(Math.ceil((w * h) / 8));
  let any = false;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const x = x0 + (i + 0.5) * ((x1 - x0) / w), y = y1 - (j + 0.5) * ((y1 - y0) / h), q = j * w + i;
    const c = ((x - tx0) / (tx1 - tx0)) * (gw - 1), r = ((ty1 - y) / (ty1 - ty0)) * (gh - 1);
    const ci = Math.round(c), ri = Math.round(r);
    if (c < -0.5 || r < -0.5 || c > gw - 0.5 || r > gh - 0.5 || (src && isNoData(src, ri * gw + ci))) { mask[q >> 3] |= 1 << (q & 7); el[q] = 0; continue; }
    // bilinear between the four nearest nodes
    const c0 = Math.max(0, Math.min(gw - 2, Math.floor(c))), r0 = Math.max(0, Math.min(gh - 2, Math.floor(r))), fc = Math.max(0, Math.min(1, c - c0)), fr = Math.max(0, Math.min(1, r - r0));
    const e = (rr, cc) => terrain.elevations[rr * gw + cc];
    el[q] = (e(r0, c0) * (1 - fc) + e(r0, c0 + 1) * fc) * (1 - fr) + (e(r0 + 1, c0) * (1 - fc) + e(r0 + 1, c0 + 1) * fc) * fr;
    any = true;
  }
  if (!any) return null;
  const v = hillshadeValues(el, w, h, (x1 - x0) / w, (y1 - y0) / h, { noData: mask });
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let q = 0; q < w * h; q++) {
    const g = Math.round(150 + v[q] * 105); // light: the plan's lines read over it
    rgba[q * 4] = g; rgba[q * 4 + 1] = g; rgba[q * 4 + 2] = g; rgba[q * 4 + 3] = mask[q >> 3] & (1 << (q & 7)) ? 0 : 255;
  }
  return { w, h, rgba };
}

// the hillshade as a PNG data URL (a canvas: the main window), cached per terrain and extent
const shadeCache = new WeakMap();
export function shadePng(terrain, extent) {
  if (!terrain || typeof document === "undefined") return null;
  const key = extent.map((v) => Math.round(v)).join(",");
  const hit = shadeCache.get(terrain);
  if (hit && hit.key === key) return hit.url;
  const g = shadeGrid(terrain, extent);
  let url = null;
  if (g) {
    const cv = document.createElement("canvas");
    cv.width = g.w; cv.height = g.h;
    cv.getContext("2d").putImageData(new ImageData(g.rgba, g.w, g.h), 0, 0);
    url = cv.toDataURL("image/png");
  }
  shadeCache.set(terrain, { key, url });
  return url;
}

// the whole model for a section, the hillshade included (the main window calls this with each section it sends); null on any failure, so the
// section still opens without its overview
export function sectionOverview(args, terrain) {
  try {
    const m = overviewPlan(args);
    if (!m) return null;
    const [ox, oy] = m.origin;
    try { m.shade = terrain ? shadePng(terrain, [ox, oy, ox + m.size[0], oy + m.size[1]]) : null; } catch { m.shade = null; }
    return m;
  } catch { return null; }
}

// the view of the model in a w x h box at one scale (equal in x and y), centred: px = X(x), py = Y(y) for relative metres, and back
export function overviewView(model, w, h, pad = 6) {
  const [sw, sh] = model.size, k = Math.min((w - 2 * pad) / (sw || 1), (h - 2 * pad) / (sh || 1));
  const ox = (w - sw * k) / 2, oy = (h - sh * k) / 2;
  return { k, X: (x) => ox + x * k, Y: (y) => h - oy - y * k, toRel: (px, py) => [(px - ox) / k, (h - oy - py) / k] };
}

// the section (absolute ends, corridor) relative to the model, its unit direction and normal (stepSection's: n = (-u.y, u.x))
export function sectionInModel(model, section) {
  const [ox, oy] = model.origin, a = [section.ax - ox, section.ay - oy], b = [section.bx - ox, section.by - oy];
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, u = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
  return { a, b, u, n: [-u[1], u[0]], corridor: Math.max(0, Number(section.corridor) || 0) };
}

// a drag's offset (metres along the normal) snapped to the series' step, else to a metre
export const snapOffset = (off, stepM) => (stepM > 0 ? Math.round(off / stepM) * stepM : Math.round(off));

// a round scale-bar length (1, 2 or 5 x 10^n m) near `want` metres
export function niceMetres(want) {
  if (!(want > 0)) return 1;
  const p = 10 ** Math.floor(Math.log10(want));
  return [5, 2, 1].map((f) => f * p).find((v) => v <= want) || p;
}
const fmtM = (m) => (m >= 1000 ? `${+(m / 1000).toFixed(m % 1000 ? 1 : 0)} km` : `${m} m`);
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
const pathOf = (pts, X, Y) => { let d = ""; for (let i = 0; i + 1 < pts.length; i += 2) d += `${i ? "L" : "M"}${X(pts[i]).toFixed(1)} ${Y(pts[i + 1]).toFixed(1)}`; return d; };

// the overview as one SVG string, w x h px: hillshade, boundaries, the series (faint), the holes' traces and collars, the section's buffer as a
// band and its line with ends A and B, a north arrow and a scale bar. offset: a drag in progress (metres along the normal), drawn as a dashed line
export function overviewSvg(model, section, w, h, { offset = null, font = "sans-serif" } = {}) {
  if (!model || !section) return "";
  const { X, Y, k } = overviewView(model, w, h), s = sectionInModel(model, section), fs = Math.max(8, Math.min(12, w / 22));
  const out = [`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" font-family="${esc(font)}">`, `<rect width="${w}" height="${h}" fill="#ffffff"/>`];
  if (model.shade) out.push(`<image href="${model.shade}" x="${X(0).toFixed(1)}" y="${Y(model.size[1]).toFixed(1)}" width="${(model.size[0] * k).toFixed(1)}" height="${(model.size[1] * k).toFixed(1)}" preserveAspectRatio="none"/>`);
  const bd = model.boundaries.map((pl) => pathOf(pl, X, Y)).join("");
  if (bd) out.push(`<path d="${bd}" fill="none" stroke="#b0522d" stroke-width="1" stroke-dasharray="4 2"/>`);
  const sr = model.series.map((q) => pathOf(q.line, X, Y)).join("");
  if (sr) out.push(`<path d="${sr}" fill="none" stroke="#2f6fb0" stroke-opacity="0.35" stroke-width="1"/>`);
  const tr = model.holes.filter((pl) => pl.length > 2).map((pl) => pathOf(pl, X, Y)).join("");
  if (tr) out.push(`<path d="${tr}" fill="none" stroke="#1a2028" stroke-opacity="0.55" stroke-width="0.8"/>`);
  const r = model.holes.length > 300 ? 0.9 : 1.4;
  const cl = model.holes.map((pl) => `M${(X(pl[0]) - r).toFixed(1)} ${(Y(pl[1]) - r).toFixed(1)}h${2 * r}v${2 * r}h${-2 * r}z`).join("");
  if (cl) out.push(`<path d="${cl}" fill="#1a2028"/>`);
  // the buffer as a band, the line over it
  const c = s.corridor, band = [[1, 1], [1, -1], [-1, -1], [-1, 1]].map(([e, m]) => { const p = e > 0 ? s.b : s.a; return [p[0] + s.n[0] * c * m, p[1] + s.n[1] * c * m]; });
  if (c > 0) out.push(`<path d="${pathOf(band.flat(), X, Y)}z" fill="#c0392b" fill-opacity="0.16" stroke="none"/>`);
  out.push(`<line x1="${X(s.a[0]).toFixed(1)}" y1="${Y(s.a[1]).toFixed(1)}" x2="${X(s.b[0]).toFixed(1)}" y2="${Y(s.b[1]).toFixed(1)}" stroke="#c0392b" stroke-width="2.2"/>`);
  if (offset != null && Math.abs(offset) > 0) {
    const d = [s.n[0] * offset, s.n[1] * offset];
    out.push(`<line x1="${X(s.a[0] + d[0]).toFixed(1)}" y1="${Y(s.a[1] + d[1]).toFixed(1)}" x2="${X(s.b[0] + d[0]).toFixed(1)}" y2="${Y(s.b[1] + d[1]).toFixed(1)}" stroke="#c0392b" stroke-width="1.6" stroke-dasharray="5 3"/>`);
  }
  // A at the start, B at the end, each just beyond its end of the line
  const lab = (p, dir, t) => { const x = X(p[0] + s.u[0] * dir * (fs * 0.9) / k), y = Y(p[1] + s.u[1] * dir * (fs * 0.9) / k); return `<text x="${x.toFixed(1)}" y="${(y + fs * 0.35).toFixed(1)}" font-size="${fs}" font-weight="700" fill="#c0392b" text-anchor="middle" stroke="#ffffff" stroke-width="2.5" paint-order="stroke">${t}</text>`; };
  out.push(lab(s.a, -1, "A"), lab(s.b, 1, "B"));
  // north arrow (top right) and scale bar (bottom left)
  const nx = w - fs * 1.2, ny = fs * 0.8;
  out.push(`<path d="M${nx} ${ny}l${fs * 0.4} ${fs * 1.1}l${-fs * 0.4} ${-fs * 0.3}l${-fs * 0.4} ${fs * 0.3}z" fill="#1a2028"/><text x="${nx}" y="${ny + fs * 2.1}" font-size="${fs * 0.85}" text-anchor="middle" fill="#1a2028">N</text>`);
  const m = niceMetres((w * 0.3) / k), L = m * k, by = h - fs * 0.7;
  out.push(`<rect x="${fs * 0.6}" y="${by - 3}" width="${L.toFixed(1)}" height="3" fill="#1a2028"/><text x="${fs * 0.6}" y="${by - 5}" font-size="${fs * 0.85}" fill="#1a2028" stroke="#ffffff" stroke-width="2" paint-order="stroke">${fmtM(m)}</text>`);
  out.push(`<rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" fill="none" stroke="#9aa3ad"/>`, "</svg>");
  return out.join("");
}

// the inset's size beside a figure W x H: about a fifth of its width, the plan's shape, never more than 60 % of its height
export function insetSize(model, W, H) {
  const iw = Math.round(W * 0.22), asp = model.size[1] / (model.size[0] || 1);
  const ih = Math.round(Math.min(iw * asp, H * 0.6));
  return { w: ih < iw * asp ? Math.round(ih / asp) : iw, h: ih };
}
export const INSET_GAP = 12;
// the overview put BESIDE an exported figure, at its top right (seen live: over the plot's top right corner it covered the ground line): the
// figure is widened by the inset and two gaps, on a white strip. The figure's own viewBox is read from its root tag; vb is the fallback.
export function withOverviewInset(markup, vb, model, section, opts = {}) {
  if (!markup || !model || !section) return markup;
  const tagEnd = markup.indexOf(">"), root = tagEnd > 0 ? markup.slice(0, tagEnd) : "";
  const m = /viewBox="([-\d.e]+)[ ,]+([-\d.e]+)[ ,]+([\d.e]+)[ ,]+([\d.e]+)"/.exec(root);
  const [x0, y0, W, H] = m ? m.slice(1).map(Number) : vb ? [vb.x, vb.y, vb.width, vb.height] : [];
  if (!(W > 0) || !(H > 0) || !root.startsWith("<svg")) return markup;
  const { w, h } = insetSize(model, W, H), W2 = W + w + 2 * INSET_GAP;
  let head = root.replace(/viewBox="[^"]*"/, `viewBox="${x0} ${y0} ${W2} ${H}"`);
  head = /\swidth="[^"]*"/.test(head) ? head.replace(/(\s)width="[^"]*"/, `$1width="${W2}"`) : head;
  const svg = overviewSvg(model, section, w, h, opts).replace("<svg xmlns=\"http://www.w3.org/2000/svg\"", `<svg x="${(x0 + W + INSET_GAP).toFixed(1)}" y="${(y0 + INSET_GAP).toFixed(1)}"`);
  const body = markup.slice(tagEnd), at = body.lastIndexOf("</svg>");
  if (at < 0) return markup;
  return `${head}${body.slice(0, at)}<g class="ge-section-overview-inset"><rect x="${x0 + W}" y="${y0}" width="${w + 2 * INSET_GAP}" height="${H}" fill="#ffffff"/>${svg}</g>${body.slice(at)}`;
}
// the same on the live figure, for the printed PDF: its viewBox widened and the inset added; -> the undo
export function insetOnFigure(svgEl, model, section) {
  const vb = svgEl?.viewBox?.baseVal;
  if (!vb || !(vb.width > 0) || !model || !section) return null;
  const old = svgEl.getAttribute("viewBox"), { w, h } = insetSize(model, vb.width, vb.height), x0 = vb.x, y0 = vb.y, W = vb.width, H = vb.height;
  const g = svgEl.ownerDocument.createElementNS("http://www.w3.org/2000/svg", "g");
  g.setAttribute("class", "ge-section-overview-inset");
  g.innerHTML = `<rect x="${x0 + W}" y="${y0}" width="${w + 2 * INSET_GAP}" height="${H}" fill="#ffffff"/>` + overviewSvg(model, section, w, h).replace("<svg xmlns=\"http://www.w3.org/2000/svg\"", `<svg x="${x0 + W + INSET_GAP}" y="${y0 + INSET_GAP}"`);
  svgEl.setAttribute("viewBox", `${x0} ${y0} ${W + w + 2 * INSET_GAP} ${H}`);
  svgEl.appendChild(g);
  return () => { g.remove(); if (old != null) svgEl.setAttribute("viewBox", old); else svgEl.removeAttribute("viewBox"); };
}
// an exported figure's width, from its root tag (the PNG and the Layout snapshot are sized from it)
export const figureWidth = (markup) => Number((/^<svg[^>]*?\swidth="([\d.]+)"/.exec(markup || "") || [])[1]) || null;

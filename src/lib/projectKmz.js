// TASKS.csv #3068 (Matt, 2026-11-12: "let's also give the option to export the whole project as kmz. Make sure to include all layers and have
// them organized in the kmz preserving all styles") — the whole project as one Google Earth document: every layer with a map position, in
// folders that follow the project (Drillholes with the 3D View's layer groups, Surface, Planning, Rasters and grids), each with the colours,
// classes, symbols, opacity and labels the 3D View draws it with. Pure: the caller (projectKmzExport.js) gives the transform to WGS84, the
// legend and icon images and the raster bytes, and zips the result.
//
// How each kind is written:
// - drillholes at their elevation (altitudeMode absolute) so they sit underground in Google Earth: a collar Point and a trace LineString per hole;
// - a drillhole log (a built-in layer, a custom layer, an assay element) as one Placemark per class (a MultiGeometry of every hole's runs of
//   that class), so Google Earth's sidebar lists the classes in their colours and a hidden class can be unticked there; consecutive intervals
//   of one class in a hole are one line. A numeric log with more colours than MAX_CLASSES is grouped into equal value bins, each in the colour
//   the 3D View gives its middle value;
// - map layers, boundaries, surface samples and structures on the ground (clampToGround), a map layer's categories as sub-folders;
// - rasters and grids as GroundOverlays (their own coloured image; gx:LatLonQuad, since a projected box is not a lon / lat rectangle);
// - a legend image (ScreenOverlay) per styled layer, inside the layer's folder so it shows and hides with it;
// - a hidden layer, class or hole is written unticked (<visibility>0</visibility>), not left out.
import { desurveyHole, pointOnTrace } from "./desurvey.js";
import { LAYER_META, categoryColor, categoryLabel, colorForMedium } from "./layers.js";
import { numericLayerColorFn, numericClips } from "./numericClip.js";
import { customColour } from "./customColour.js";
import { assayColorFor } from "./legendGroups.js";
import { layerCategoryValue, STRUCTURE_CLASS_COLORS, STRUCTURE_CLASS_LABELS } from "./mapLayers.js";
import { mapLayerFeatures, boundaryFeatures, surfaceStructureRows, kmlColor } from "./overlayExport.js";
import { polygonsFromRings } from "./polygonRings.js";

export const MAX_CLASSES = 16; // a numeric log with more colours than this is grouped into equal bins
const BINS = 12;
export const DOT_ICON = "files/dot.png", STRIKE_ICON = "files/strike.png";
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const num = (v) => (typeof v === "number" ? v : v == null || v === "" ? NaN : Number(v));
const fin = Number.isFinite;
const sig3 = (v) => String(Number(Number(v).toPrecision(3)));
const vis = (on) => (on ? "" : "<visibility>0</visibility>");
// the order the 3D View's sidebar lists the built-in drillhole layers in (ViewerModule ALL_LAYER_KEYS)
export const DRILLHOLE_LAYER_KEYS = ["litho", "alt", "vein", "breccia", "weath", "structzone", "mnlgy", "geotech", "recovery", "sg", "magsusc", "structure", "litho_gc", "alt_gc", "geophys_pts"];

// rows -> Map(hole -> rows sorted by from)
function byHole(rows) {
  const m = new Map();
  for (const r of rows || []) { if (r?.hole_id == null) continue; const k = String(r.hole_id); (m.get(k) || m.set(k, []).get(k)).push(r); }
  m.forEach((l) => l.sort((a, b) => num(a.from ?? a.depth) - num(b.from ?? b.depth)));
  return m;
}
// the trace between two depths: the end points and every station in between
function pathBetween(pts, a, b) {
  const p0 = pointOnTrace(pts, a), p1 = pointOnTrace(pts, b);
  if (!p0 || !p1) return null;
  const out = [p0];
  for (const p of pts) if (p.md > a && p.md < b) out.push(p);
  out.push(p1);
  return out;
}

// values -> classes. colourAt(v) the 3D View's colour; numeric: false groups by the code (labelOf), true by colour or equal bins
// -> { classOf(v) -> key, classes: Map(key -> { color, label, lo, hi, order }) }
function numericClasses(values, colourAt) {
  let lo = Infinity, hi = -Infinity;
  const colours = new Map();
  for (const v of values) {
    if (!fin(v)) continue;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
    if (colours.size <= MAX_CLASSES) { const c = colourAt(v); const e = colours.get(c); if (e) { e.lo = Math.min(e.lo, v); e.hi = Math.max(e.hi, v); } else colours.set(c, { lo: v, hi: v }); }
  }
  if (!fin(lo)) return { classOf: () => null, classes: new Map() };
  const classes = new Map();
  if (colours.size <= MAX_CLASSES) {
    // the colours the view draws (classes, a one-colour style, a short ramp): one class each, labelled with the values it holds
    [...colours].sort((a, b) => a[1].lo - b[1].lo).forEach(([c, e], i) => classes.set(c, { color: c, label: e.lo === e.hi ? sig3(e.lo) : `${sig3(e.lo)} – ${sig3(e.hi)}`, order: i }));
    return { classOf: (v) => (fin(v) ? colourAt(v) : null), classes };
  }
  const w = (hi - lo) / BINS || 1;
  for (let i = 0; i < BINS; i++) { const a = lo + i * w, b = i === BINS - 1 ? hi : a + w; classes.set(`b${i}`, { color: colourAt((a + b) / 2), label: `${sig3(a)} – ${sig3(b)}`, order: i }); }
  return { classOf: (v) => (fin(v) ? `b${Math.min(BINS - 1, Math.max(0, Math.floor((v - lo) / w)))}` : null), classes };
}

class KmlWriter {
  constructor({ toLonLat, altOf = (z) => z }) {
    this.toLonLat = toLonLat;
    this.altOf = altOf;
    this.styles = new Map();
    this.parts = [];
    this.placemarks = 0;
    this.coords = 0;
  }
  ll(x, y) { const [lon, lat] = this.toLonLat(x, y); return `${lon.toFixed(7)},${lat.toFixed(7)}`; }
  lla(x, y, z) { this.coords++; return fin(z) ? `${this.ll(x, y)},${this.altOf(z).toFixed(2)}` : this.ll(x, y); }
  // a shared style: line colour / width, fill, icon colour / scale / href, label scale -> its id
  style({ color = "#e2a63c", width = 2, fill = null, fillAlpha = 0.35, outline = true, icon = DOT_ICON, iconScale = 0.6, label = 0, alpha = 1 }) {
    const key = JSON.stringify([color, width, fill, fillAlpha, outline, icon, iconScale, label, alpha]);
    let s = this.styles.get(key);
    if (!s) {
      const id = `s${this.styles.size}`;
      // TASKS.csv #3068 follow-up (Matt, Perk-Rocky in Google Earth Pro: "Polygons are being exported with no colour") — the fill and outline
      // flags written out rather than left to the viewer's defaults
      const poly = fill == null ? "" : `<PolyStyle><color>${kmlColor(fill, fillAlpha)}</color><fill>1</fill><outline>${outline ? 1 : 0}</outline></PolyStyle>`;
      const xml = `<Style id="${id}"><IconStyle><color>${kmlColor(color, alpha)}</color><scale>${iconScale}</scale><Icon><href>${icon}</href></Icon></IconStyle><LabelStyle><scale>${label}</scale></LabelStyle><LineStyle><color>${kmlColor(color, alpha)}</color><width>${width}</width></LineStyle>${poly}</Style>`;
      s = { id, xml };
      this.styles.set(key, s);
    }
    return s.id;
  }
  push(s) { this.parts.push(s); }
  open(name, { visible = true, open = false, description = "" } = {}) { this.push(`<Folder><name>${esc(name)}</name>${vis(visible)}${open ? "<open>1</open>" : ""}${description ? `<description>${esc(description)}</description>` : ""}`); }
  close() { this.push("</Folder>"); }
  placemark(name, styleId, geom, { visible = true, data = null, inline = "", description = "" } = {}) {
    this.placemarks++;
    const ext = data ? Object.entries(data).filter(([, v]) => v !== "" && v != null && !(typeof v === "number" && !fin(v))) : [];
    this.push(`<Placemark><name>${esc(name)}</name>${vis(visible)}${description ? `<description>${esc(description)}</description>` : ""}<styleUrl>#${styleId}</styleUrl>${inline}${ext.length ? `<ExtendedData>${ext.map(([k, v]) => `<Data name="${esc(k)}"><value>${esc(v)}</value></Data>`).join("")}</ExtendedData>` : ""}${geom}</Placemark>`);
  }
  line3d(pts) { return `<LineString><altitudeMode>absolute</altitudeMode><coordinates>${pts.map((p) => this.lla(p.x, p.y, p.z)).join(" ")}</coordinates></LineString>`; }
  lineGround(xy) { return `<LineString><tessellate>1</tessellate><coordinates>${xy.map(([x, y]) => { this.coords++; return this.ll(x, y); }).join(" ")}</coordinates></LineString>`; }
  point3d(x, y, z) { return `<Point><altitudeMode>absolute</altitudeMode><coordinates>${this.lla(x, y, z)}</coordinates></Point>`; }
  pointGround(x, y) { this.coords++; return `<Point><coordinates>${this.ll(x, y)}</coordinates></Point>`; }
  polygonGround(rings) {
    const ring = (r) => { const c = r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1] ? r : [...r, r[0]]; return `<LinearRing><coordinates>${c.map(([x, y]) => { this.coords++; return this.ll(x, y); }).join(" ")}</coordinates></LinearRing>`; };
    return polygonsFromRings(rings).map(([outer, ...holes]) => `<Polygon><tessellate>1</tessellate><altitudeMode>clampToGround</altitudeMode><outerBoundaryIs>${ring(outer)}</outerBoundaryIs>${holes.map((h) => `<innerBoundaryIs>${ring(h)}</innerBoundaryIs>`).join("")}</Polygon>`).join("");
  }
  multi(geoms) { return geoms.length === 1 ? geoms[0] : `<MultiGeometry>${geoms.join("")}</MultiGeometry>`; }
}

// ctx: the store's collections and the 3D View's saved state:
//   { projectName, collars, survey, desurveyMethod, layers, customLayers, assays, assayElements, surfaceSamples, surfaceStructures, mapLayers,
//     boundaries, plannedHoles, sections, rasters, layerGroups, ui (store.viewerUiState), anomaly ({ classOf, classes } of the surface samples), epsg }
// opts: { toLonLat(x, y) -> [lon, lat], altOf(z) -> metres above sea level, legendPng(group) -> { bytes, width, height } | null,
//         rasterImage(raster) -> { bytes, ext } | null, crsLabel }
// -> { kml, files: [{ name, data }] (legend and raster images; the caller adds the icons), counts, legends }
export function buildProjectKml(ctx, opts) {
  const w = new KmlWriter(opts);
  const ui = ctx.ui || {};
  const files = [];
  const counts = { holes: 0, layers: 0, rasters: 0, legends: 0, skipped: [] };
  const legendSlots = [];
  const legend = (group, visible) => {
    if (!opts.legendPng || !(group?.items?.length || group?.ramp?.colors?.length)) return; // swatches, or a value raster's colour ramp
    const img = opts.legendPng(group);
    if (!img?.bytes) return;
    const name = `files/legend_${legendSlots.length}.png`;
    files.push({ name, data: img.bytes });
    // stacked down the left of the screen, in columns of about 640 px
    const prev = legendSlots[legendSlots.length - 1];
    let x = 10, y = 10;
    if (prev) { y = prev.y + prev.h + 8; x = prev.x; if (y + img.height > 650) { y = 10; x = prev.x + legendSlots.filter((s) => s.x === prev.x).reduce((m, s) => Math.max(m, s.w), 0) + 8; } }
    legendSlots.push({ x, y, w: img.width, h: img.height });
    counts.legends++;
    w.push(`<ScreenOverlay><name>${esc(`Legend: ${group.label}`)}</name>${vis(visible)}<Icon><href>${name}</href></Icon><overlayXY x="0" y="1" xunits="fraction" yunits="fraction"/><screenXY x="${x}" y="${y}" xunits="pixels" yunits="insetPixels"/><size x="${img.width}" y="${img.height}" xunits="pixels" yunits="pixels"/></ScreenOverlay>`);
  };

  // ---------- drillholes ----------
  const surveyBy = byHole(ctx.survey);
  const traces = new Map();
  for (const c of ctx.collars || []) {
    if (!fin(num(c.x)) || !fin(num(c.y)) || !fin(num(c.z))) continue;
    const pts = desurveyHole({ ...c, x: num(c.x), y: num(c.y), z: num(c.z) }, (surveyBy.get(String(c.hole_id)) || []).map((s) => ({ ...s, depth: num(s.depth), azimuth: num(s.azimuth), dip: num(s.dip) })), ctx.desurveyMethod);
    if (pts.length >= 2) traces.set(String(c.hole_id), { c, pts });
  }
  const holeShown = (h) => ui.visibleHoles?.[h] !== false;
  const hiddenIn = (key) => { const f = ui.categoryFilter?.[key]; return new Set(f instanceof Set ? f : Array.isArray(f) ? f : []); };

  // a log along the holes -> one Placemark per class (and per shown / hidden holes)
  // rows: { hole_id, from, to | depth, ... }; valueOf(row); cls: { classOf(v), classes }; hiddenClasses: a Set of class keys
  const writeLog = (label, rows, valueOf, cls, { visible = true, hiddenClasses = new Set(), legendLabel = label, unit = "" } = {}) => {
    const runs = new Map(); // key|shown -> { geoms, n }
    let n = 0;
    for (const [h, list] of byHole(rows)) {
      const t = traces.get(h);
      if (!t) continue;
      const shown = holeShown(h);
      let run = null;
      const flush = () => { if (!run) return; const g = run.point ? w.point3d(run.p.x, run.p.y, run.p.z) : (() => { const p = pathBetween(t.pts, run.a, run.b); return p ? w.line3d(p) : null; })(); if (g) { const k = `${run.key}|${shown ? 1 : 0}`; const e = runs.get(k) || runs.set(k, { geoms: [], n: 0 }).get(k); e.geoms.push(g); e.n += run.n; } run = null; };
      for (const r of list) {
        const key = cls.classOf(valueOf(r));
        if (key == null || !cls.classes.has(key)) continue;
        n++;
        const from = num(r.from), to = num(r.to);
        if (fin(from) && fin(to) && to > from) {
          if (run && !run.point && run.key === key && from <= run.b + 1e-6) { run.b = Math.max(run.b, to); run.n++; continue; }
          flush();
          run = { key, a: from, b: to, n: 1 };
        } else {
          const d = fin(num(r.depth)) ? num(r.depth) : from;
          if (!fin(d)) continue;
          flush();
          const p = pointOnTrace(t.pts, d);
          if (p) run = { key, point: true, p, n: 1 };
        }
      }
      flush();
    }
    if (!n) return false;
    counts.layers++;
    w.open(label, { visible });
    const classes = [...cls.classes].sort((a, b) => a[1].order - b[1].order);
    for (const [key, c] of classes) {
      for (const shown of [1, 0]) {
        const e = runs.get(`${key}|${shown}`);
        if (!e) continue;
        const sid = w.style({ color: c.color, width: 3, iconScale: 0.5 });
        w.placemark(shown ? c.label : `${c.label} (hidden holes)`, sid, w.multi(e.geoms), { visible: !!shown && !hiddenClasses.has(key), description: `${e.n.toLocaleString("en")} interval(s)` });
      }
    }
    legend({ label: unit ? `${legendLabel} (${unit})` : legendLabel, items: classes.filter(([k]) => [...runs.keys()].some((rk) => rk.startsWith(`${k}|`))).map(([, c]) => [c.label, c.color]) }, visible);
    w.close();
    return true;
  };

  const layerVisible = { litho: true, geophys_pts: true, surface_samples: true, ...(ui.layerVisible || {}) }; // the 3D View's defaults (DEFAULT_LAYER_VISIBLE)
  const ov = ui.legendOverride || {};
  const sym = ui.numericSymbology || {}, clips = numericClips(ctx.layers);
  const numColour = numericLayerColorFn(sym, clips);
  const builtIn = (key) => {
    const meta = LAYER_META[key], rows = ctx.layers?.[key] || [];
    if (!meta || !rows.length) return;
    const style = ui.layerStyles?.[key] || {};
    if (key === "geophys_pts") { // points with their own coordinates, not on a hole
      const vals = rows.map((r) => num(r.value));
      let lo = Infinity, hi = -Infinity; vals.forEach((v) => { if (fin(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); } });
      const cls = numericClasses(vals, (v) => style.color || numColour(key, v, { min: lo, max: hi }));
      const by = new Map();
      rows.forEach((r, i) => { const k = cls.classOf(vals[i]); if (k == null || !fin(num(r.x)) || !fin(num(r.y))) return; (by.get(k) || by.set(k, []).get(k)).push(fin(num(r.z)) ? w.point3d(num(r.x), num(r.y), num(r.z)) : w.pointGround(num(r.x), num(r.y))); });
      if (!by.size) return;
      counts.layers++;
      w.open(meta.label, { visible: !!layerVisible[key] });
      [...cls.classes].sort((a, b) => a[1].order - b[1].order).forEach(([k, c]) => { if (by.has(k)) w.placemark(c.label, w.style({ color: c.color, iconScale: 0.5 }), w.multi(by.get(k))); });
      legend({ label: meta.label, items: [...cls.classes].filter(([k]) => by.has(k)).map(([, c]) => [c.label, c.color]) }, !!layerVisible[key]);
      w.close();
      return;
    }
    if (meta.numeric) {
      const vals = rows.map((r) => num(r.value));
      let lo = Infinity, hi = -Infinity; vals.forEach((v) => { if (fin(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); } });
      const cls = numericClasses(vals, (v) => style.color || numColour(key, v, { min: lo, max: hi }));
      writeLog(meta.label, rows, (r) => num(r.value), cls, { visible: !!layerVisible[key] });
      return;
    }
    const values = [...new Set(rows.map((r) => String(r.value ?? "")))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const classes = new Map(values.map((v, i) => [v, { color: style.color || categoryColor(ov[key]?.[v], meta, v), label: v === "" ? "(blank)" : String(categoryLabel(ov[key]?.[v], meta, v)), order: i }]));
    writeLog(meta.label, rows, (r) => String(r.value ?? ""), { classOf: (v) => v, classes }, { visible: !!layerVisible[key], hiddenClasses: hiddenIn(key) });
  };

  w.open("Drillholes", { open: true });
  if (traces.size) {
    counts.holes = traces.size;
    const collarStyle = w.style({ color: "#1f2933", iconScale: 0.6, label: ui.holeLabelMode && ui.holeLabelMode !== "none" ? 0.7 : 0 });
    w.open("Collars");
    for (const [h, { c }] of traces) w.placemark(h, collarStyle, w.point3d(num(c.x), num(c.y), num(c.z)), { visible: holeShown(h), data: { hole_id: h, elevation: num(c.z), azimuth: num(c.azimuth), dip: num(c.dip), length: num(c.length) } });
    w.close();
    const traceStyle = w.style({ color: "#5b6573", width: 1.5 });
    w.open("Traces");
    for (const [h, { pts }] of traces) w.placemark(h, traceStyle, w.line3d(pts), { visible: holeShown(h) });
    w.close();
    // the 3D View's layer groups, then the layers in none, in the sidebar's order
    const grouped = new Set();
    for (const g of ctx.layerGroups || []) {
      const keys = (g.keys || []).filter((k) => DRILLHOLE_LAYER_KEYS.includes(k) && (ctx.layers?.[k] || []).length);
      keys.forEach((k) => grouped.add(k));
      if (!keys.length) continue;
      w.open(g.name || "Group");
      keys.forEach(builtIn);
      w.close();
    }
    DRILLHOLE_LAYER_KEYS.filter((k) => !grouped.has(k)).forEach(builtIn);
    // custom layers
    const customs = (ctx.customLayers || []).filter((l) => (l.rows || []).length);
    if (customs.length) {
      w.open("Custom layers");
      for (const L of customs) {
        const st = ui.layerStyles?.[`custom:${L.id}`] || {}, field = st.colourBy || "value";
        const raw = L.rows.map((r) => r?.[field]);
        const nums = raw.map(num), numeric = nums.filter(fin).length >= Math.max(1, raw.filter((v) => v != null && v !== "").length * 0.9);
        const shown = ui.customVisible?.[L.id] !== false;
        const label = field === "value" ? `${L.name}` : `${L.name} · ${field}`;
        if (numeric) writeLog(label, L.rows, (r) => num(r?.[field]), numericClasses(nums, (v) => customColour(L, ui.layerStyles || {}, { [field]: v })), { visible: shown, unit: L.unit || "" });
        else {
          const values = [...new Set(raw.filter((v) => v != null && v !== "").map(String))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
          writeLog(label, L.rows, (r) => (r?.[field] == null || r[field] === "" ? null : String(r[field])), { classOf: (v) => v, classes: new Map(values.map((v, i) => [v, { color: customColour(L, ui.layerStyles || {}, { [field]: v }), label: v, order: i }])) }, { visible: shown });
        }
      }
      w.close();
    }
    // assays: the elements the view shows (ticked) and those with grade classes of their own (unticked)
    const shownEls = new Set(ui.assayVisible === false ? [] : ui.assayDisplayElements || []);
    const els = (ctx.assayElements || []).filter((e) => shownEls.has(e.symbol) || ui.assayStyle?.[e.symbol]?.breaks?.length);
    const leftOut = (ctx.assayElements || []).length - els.length;
    if (leftOut > 0) counts.skipped.push({ kind: "assays", n: leftOut });
    if (els.length && (ctx.assays || []).length) {
      w.open("Assays");
      els.forEach((e) => {
        const idx = (ctx.assayElements || []).findIndex((x) => x.symbol === e.symbol);
        const st = ui.assayStyle?.[e.symbol] || {};
        const cut = num(st.minCutoff);
        const vals = ctx.assays.map((a) => num(a.values?.[e.symbol]));
        const base = numericClasses(vals.filter((v) => !fin(cut) || v >= cut), (v) => assayColorFor(v, idx, st));
        const cls = fin(cut) ? { classOf: (v) => (fin(v) && v < cut ? "below" : base.classOf(v)), classes: new Map([...base.classes, ["below", { color: "#9aa5b1", label: `below ${sig3(cut)}`, order: -1 }]]) } : base;
        writeLog(e.symbol, ctx.assays, (a) => num(a.values?.[e.symbol]), cls, { visible: shownEls.has(e.symbol), hiddenClasses: new Set(["below"]), unit: e.unit || "" });
      });
      w.close();
    }
  }
  // planned holes: straight from the collar along their azimuth and dip
  const planned = (ctx.plannedHoles || []).filter((p) => fin(num(p.x)) && fin(num(p.y)) && fin(num(p.z)));
  if (planned.length) {
    const st = w.style({ color: "#d9480f", width: 2.5, label: 0.7 });
    w.open("Planned holes");
    for (const p of planned) {
      const pts = desurveyHole({ hole_id: p.name, x: num(p.x), y: num(p.y), z: num(p.z), azimuth: num(p.azimuth), dip: num(p.dip), length: num(p.length) }, [], ctx.desurveyMethod);
      if (pts.length >= 2) w.placemark(p.name || "planned", st, w.line3d(pts), { data: { azimuth: num(p.azimuth), dip: num(p.dip), length: num(p.length), notes: p.notes || "" } });
    }
    w.close();
  }
  w.close(); // Drillholes

  // ---------- surface ----------
  const samples = (ctx.surfaceSamples || []).filter((s) => fin(num(s.x)) && fin(num(s.y)));
  const sets = (ctx.surfaceStructures || []).filter((s) => (s.rows || []).length);
  const maps = (ctx.mapLayers || []).filter((l) => (l.features || []).length);
  const bounds = (ctx.boundaries || []).filter((b) => (b.polylines || []).some((p) => p?.length >= 2));
  if (samples.length || sets.length || maps.length || bounds.length) {
    w.open("Surface", { open: true });
    if (samples.length) {
      counts.layers++;
      const sst = ui.layerStyles?.surface_samples || {};
      const an = ctx.anomaly;
      const keyOf = (s, i) => (an?.classOf ? (an.classOf[i] >= 0 ? `c${an.classOf[i]}` : "none") : sst.color ? "one" : `m:${s.medium || ""}`);
      const groups = new Map();
      (ctx.surfaceSamples || []).forEach((s, i) => { if (!fin(num(s.x)) || !fin(num(s.y))) return; const k = keyOf(s, i); (groups.get(k) || groups.set(k, []).get(k)).push(s); });
      const info = (k) => (k === "none" ? { label: "no value", color: an?.noDataColor || "#9aa5b1" } : k === "one" ? { label: "samples", color: sst.color } : k.startsWith("c") ? an.classes[Number(k.slice(1))] : { label: k.slice(2) || "(no medium)", color: colorForMedium(k.slice(2)) });
      const order = [...groups.keys()].sort((a, b) => (a.startsWith("c") && b.startsWith("c") ? Number(a.slice(1)) - Number(b.slice(1)) : String(a).localeCompare(String(b))));
      w.open("Surface samples", { visible: !!layerVisible.surface_samples });
      for (const k of order) {
        const { label, color } = info(k);
        const sid = w.style({ color, iconScale: 0.5, label: sst.label ? 0.6 : 0 });
        w.open(label);
        for (const s of groups.get(k)) w.placemark(s.sample_id ?? "", sid, w.pointGround(num(s.x), num(s.y)), { data: { medium: s.medium || "", ...Object.fromEntries(Object.entries(s.values || {}).filter(([, v]) => fin(v))) } });
        w.close();
      }
      legend({ label: an?.label || "Surface samples", items: order.map((k) => { const i = info(k); return [i.label, i.color]; }) }, !!layerVisible.surface_samples);
      w.close();
    }
    if (sets.length) {
      // #3068 part 2 — each reading drawn with its USGS (FGDC) symbol, from the icon set the outcrop KMZ uses too (lib/structureKmzIcons.js,
      // side 3's #3066 / #3091: the project's symbol per type, the set's line thickness, the true right-hand-rule strike): opts.structureIconOf
      // (row, set) -> { href, heading } | null, its PNGs added to the zip by the caller. A reading with no icon gets the plain strike symbol.
      const iconOf = opts.structureIconOf || (() => null);
      w.open("Structures");
      for (const set of sets) {
        counts.layers++;
        w.open(set.name || "Structures", { visible: set.visible !== false });
        const rows = surfaceStructureRows(set, ctx.epsg);
        const raw = (set.rows || []).filter((r) => Number.isFinite(r.x) && Number.isFinite(r.y)); // the stored rows, in the same order (surfaceStructureRows' own filter)
        const used = new Set();
        rows.forEach((r, ri) => {
          const cls = STRUCTURE_CLASS_COLORS[r.cls] ? r.cls : "other";
          used.add(cls);
          const color = STRUCTURE_CLASS_COLORS[cls];
          const strike = fin(num(r.strike_rhr_true)) ? num(r.strike_rhr_true) : fin(num(r.strike_rhr_grid)) ? num(r.strike_rhr_grid) : null;
          const icon = iconOf(raw[ri], set);
          const href = icon ? icon.href : STRIKE_ICON, heading = icon ? icon.heading : strike;
          const inline = icon || strike != null ? `<Style><IconStyle><color>${kmlColor(color)}</color><scale>0.9</scale><heading>${Math.round(heading * 10) / 10}</heading><Icon><href>${href}</href></Icon></IconStyle><LabelStyle><scale>0.6</scale></LabelStyle></Style>` : "";
          w.placemark(fin(num(r.dip)) ? String(Math.round(num(r.dip))) : "", w.style({ color, iconScale: 0.5 }), w.pointGround(num(r.x), num(r.y)), { inline, data: { class: r.cls, type: r.type, dip: r.dip, dipdir_true: r.dipdir_true, strike_rhr_true: r.strike_rhr_true, station: r.station, comment: r.comment } });
        });
        legend({ label: set.name || "Structures", items: [...used].map((c) => [STRUCTURE_CLASS_LABELS[c] || c, STRUCTURE_CLASS_COLORS[c]]) }, set.visible !== false);
        w.close();
      }
      w.close();
    }
    if (maps.length) {
      w.open("Map layers");
      for (const L of maps) {
        counts.layers++;
        const built = mapLayerFeatures(L);
        const cats = new Map((L.categories || []).map((c) => [String(c.value), c]));
        const op = fin(num(L.opacity)) ? num(L.opacity) : 0.6;
        const groups = new Map();
        for (const f of built.features) { const k = L.styleField ? layerCategoryValue(L, f) ?? "" : ""; (groups.get(k) || groups.set(k, []).get(k)).push(f); }
        w.open(L.name || "Map layer", { visible: L.visible !== false });
        const items = [];
        for (const [k, feats] of groups) {
          const cat = cats.get(String(k));
          const color = cat?.color || L.color || "#e2a63c";
          const sid = built.geomType === "polygon" ? w.style({ color: L.showOutlines === false ? color : cat?.outline || "#333333", width: 1, fill: color, fillAlpha: op, outline: L.showOutlines !== false }) : w.style({ color, width: 2, iconScale: 0.5 });
          if (L.styleField) w.open(cat?.label || String(k) || "(blank)", { visible: cat?.visible !== false });
          for (const f of feats) {
            const geom = built.geomType === "point" ? w.pointGround(f.geometry[0][0], f.geometry[0][1]) : built.geomType === "polyline" ? w.multi((f.parts || [f.geometry]).filter((p) => p.length >= 2).map((p) => w.lineGround(p))) : w.polygonGround(f.parts || [f.geometry]);
            if (geom) w.placemark(L.styleField ? String(f.attributes?.[L.styleField] ?? "") : "", sid, geom, { data: f.attributes });
          }
          if (L.styleField) w.close();
          items.push([cat?.label || String(k) || L.name || "", color]);
        }
        legend({ label: L.styleField ? `${L.name} · ${L.styleField}` : L.name || "Map layer", items }, L.visible !== false);
        w.close();
      }
      w.close();
    }
    if (bounds.length) {
      w.open("Boundaries");
      for (const b of bounds) {
        counts.layers++;
        const built = boundaryFeatures(b);
        const color = b.color || "#e2a63c", op = fin(num(b.opacity)) ? num(b.opacity) : 1;
        const sid = built.geomType === "polygon" ? w.style({ color, width: 2, fill: color, fillAlpha: 0.15 * op, alpha: op }) : w.style({ color, width: 2, alpha: op });
        w.open(b.name || "Boundary", { visible: b.visible !== false });
        for (const f of built.features) {
          const geom = built.geomType === "polygon" ? w.polygonGround(f.parts) : w.multi(f.parts.map((p) => w.lineGround(p)));
          w.placemark(f.attributes?.level != null ? String(f.attributes.level) : b.name || "", sid, geom, { data: f.attributes });
        }
        w.close();
      }
      w.close();
    }
    w.close();
  }

  // ---------- sections ----------
  const secs = (ctx.sections || []).filter((s) => [s.ax, s.ay, s.bx, s.by].every((v) => fin(num(v))));
  if (secs.length) {
    w.open("Sections");
    const lineSt = w.style({ color: "#2b6cb0", width: 2.5, label: 0.7 });
    for (const s of secs) {
      w.open(s.name || "Section");
      w.placemark(s.name || "Section", lineSt, w.lineGround([[num(s.ax), num(s.ay)], [num(s.bx), num(s.by)]]), { data: { azimuth: num(s.azimuth), corridor: num(s.corridor) } });
      for (const c of s.contacts || []) {
        const pts = (c.points || []).filter((p) => fin(num(p.x)) && fin(num(p.y)) && fin(num(p.z))).map((p) => ({ x: num(p.x), y: num(p.y), z: num(p.z) }));
        if (pts.length >= 2) w.placemark(c.unit || "contact", w.style({ color: c.color || "#222222", width: 2 }), w.line3d(pts));
      }
      w.close();
    }
    w.close();
  }

  // ---------- rasters and grids ----------
  const rasters = (ctx.rasters || []).filter((r) => Array.isArray(r.bbox) && r.bbox.every((v) => fin(num(v))) && (r.dataUrl || r.grid));
  if (rasters.length && opts.rasterImage) {
    w.open("Rasters and grids");
    rasters.forEach((r, i) => {
      const img = opts.rasterImage(r);
      if (!img?.bytes) { counts.skipped.push({ kind: "raster", name: r.name || `${i + 1}` }); return; }
      const name = `files/raster_${i}.${img.ext || "png"}`;
      files.push({ name, data: img.bytes });
      counts.rasters++;
      const [x0, y0, x1, y1] = r.bbox.map(num);
      const quad = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map(([x, y]) => w.ll(x, y)).join(" "); // lower left, lower right, upper right, upper left
      const op = fin(num(r.opacity)) ? num(r.opacity) : 1;
      w.open(r.name || `Raster ${i + 1}`, { visible: r.visible !== false });
      w.push(`<GroundOverlay><name>${esc(r.name || `Raster ${i + 1}`)}</name><color>${kmlColor("#ffffff", op)}</color><Icon><href>${name}</href></Icon><gx:LatLonQuad><coordinates>${quad}</coordinates></gx:LatLonQuad></GroundOverlay>`);
      if (img.legend) legend(img.legend, r.visible !== false);
      w.close();
    });
    w.close();
  }

  const styles = [...w.styles.values()].map((s) => s.xml).join("\n");
  const desc = `Exported from GeoStrix${opts.crsLabel ? ` (project CRS ${opts.crsLabel})` : ""}. Drillholes are drawn at their elevations, below the ground: untick Terrain in Google Earth's Layers to see them.`;
  const kml = `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:gx="http://www.google.com/kml/ext/2.2">\n<Document><name>${esc(ctx.projectName || "GeoStrix project")}</name><open>1</open><description>${esc(desc)}</description>\n${styles}\n${w.parts.join("\n")}\n</Document>\n</kml>\n`;
  counts.placemarks = w.placemarks;
  counts.coordinates = w.coords;
  return { kml, files, counts };
}

// a rough size of the KML before it is built (about 40 bytes per coordinate and 300 per placemark, plus the images), to warn before
// writing a very large project. -> bytes
export function estimateProjectKmz(ctx) {
  const ui = ctx.ui || {};
  let coords = 0, marks = 0, images = 0;
  const holes = (ctx.collars || []).length;
  coords += holes * 3; marks += holes * 2;
  coords += (ctx.survey || []).length;
  for (const k of DRILLHOLE_LAYER_KEYS) coords += 2 * (ctx.layers?.[k] || []).length;
  for (const L of ctx.customLayers || []) coords += 2 * (L.rows || []).length;
  const shownEls = new Set(ui.assayVisible === false ? [] : ui.assayDisplayElements || []);
  const nEls = (ctx.assayElements || []).filter((e) => shownEls.has(e.symbol) || ui.assayStyle?.[e.symbol]?.breaks?.length).length;
  coords += 2 * nEls * (ctx.assays || []).length;
  const ns = (ctx.surfaceSamples || []).length; coords += ns; marks += ns;
  for (const s of ctx.surfaceStructures || []) { coords += (s.rows || []).length; marks += (s.rows || []).length; }
  for (const L of ctx.mapLayers || []) for (const f of L.features || []) { marks++; for (const p of f.parts || []) coords += p?.length || 0; }
  for (const b of ctx.boundaries || []) for (const p of b.polylines || []) coords += p?.length || 0;
  for (const r of ctx.rasters || []) images += r.dataUrl ? Math.round(String(r.dataUrl).length * 0.75) : 0;
  return coords * 40 + marks * 300 + images;
}

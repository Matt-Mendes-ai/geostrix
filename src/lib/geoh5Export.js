// TASKS.csv #1993 (export step) — File > Export Project as Geoscience ANALYST (.geoh5): the project's point surveys and surface samples (with their values),
// lines (imported OMF / geoh5 lines; boundaries and map-layer lines draped on the terrain), surfaces (the model surfaces, imported surfaces, the terrain),
// block models and the drillholes (collars, surveys, path, interval and point data), written by lib/geoh5Write.js. Loaded on demand from App.jsx (h5wasm with it). The coordinates are the project's
// (a .geoh5 has no coordinate system: the message says which they are).
import { omfVolumeToGeoh5 } from "./geoh5Write.js";
import { writeGeoh5Async } from "./geoh5WriteClient.js"; // the writer in a worker: a project of 559 holes took ~45 s
import { volumeElementFromModel } from "./omfWriter.js";
import { surfaceMesh, terrainMesh } from "./kmzModels.js";
import { rowCount, fieldOf, rowAt } from "./layerColumns.js";
import { desurveyHole, pointOnTrace, normalizeDesurveyMethod } from "./desurvey.js"; // the drillhole step
import { LAYER_META } from "./layers.js";
import { saveFile, safeFileName, EXPORT_RESULT_EVENT } from "./desktop.js";
import { t as tr } from "./i18n.js";

const fin = Number.isFinite;

// the terrain's height at (x, y) (bilinear over its grid, row 0 north), or null outside it / over no-data
export function terrainZ(t, x, y) {
  const W = t?.gridW | 0, H = t?.gridH | 0, el = t?.elevations, b = t?.bbox;
  if (W < 2 || H < 2 || !el || !Array.isArray(b)) return null;
  const fx = ((x - b[0]) / (b[2] - b[0])) * (W - 1), fy = ((b[3] - y) / (b[3] - b[1])) * (H - 1);
  if (!(fx >= 0 && fy >= 0 && fx <= W - 1 && fy <= H - 1)) return null;
  const i = Math.min(W - 2, Math.floor(fx)), j = Math.min(H - 2, Math.floor(fy)), a = fx - i, c = fy - j;
  const z00 = el[j * W + i], z10 = el[j * W + i + 1], z01 = el[(j + 1) * W + i], z11 = el[(j + 1) * W + i + 1];
  if (![z00, z10, z01, z11].every(fin)) return null;
  return z00 * (1 - a) * (1 - c) + z10 * a * (1 - c) + z01 * (1 - a) * c + z11 * a * c;
}

// a polyline of [x, y, z?] / {x, y, z?} -> [x, y, z] with z its own, else the terrain's; null when a vertex has neither
function placeLine(pts, terrain, counts) {
  const out = [];
  for (const p of pts || []) {
    const x = Array.isArray(p) ? p[0] : p?.x, y = Array.isArray(p) ? p[1] : p?.y, z0 = Array.isArray(p) ? p[2] : p?.z;
    if (!fin(x) || !fin(y)) continue;
    const z = fin(z0) ? z0 : terrainZ(terrain, x, y);
    if (z == null) { counts.noZ++; return null; }
    if (!fin(z0)) counts.draped++;
    out.push([x, y, z]);
  }
  return out.length >= 2 ? out : null;
}
// lines -> one curve element (a cell per segment)
function curveOf(name, lines) {
  const vertices = [], cells = [];
  for (const l of lines) { const base = vertices.length / 3; l.forEach((p) => vertices.push(p[0], p[1], p[2])); for (let k = 0; k + 1 < l.length; k++) cells.push(base + k, base + k + 1); }
  return cells.length ? { kind: "curve", name, vertices, cells } : null;
}

// ---- the drillhole step: the project's holes as geoh5 Drillhole objects ----
// Each collar with x / y / z is one Drillhole: its Collar, its survey stations (dip written negative down, as geoh5 has it; GeoStrix keeps it positive down), its
// path (the project's desurvey method, carried to the end of the hole), and its data along the path: every interval layer that has rows on the hole (the
// built-in logs, the custom interval layers, the assays) is one set of cells with its own FROM / TO ('FROM', 'TO'; then 'FROM (1)', 'TO (1)' ...), its value
// named after the layer and its other fields by their own names; the point logs (mineralization, mag. susc., structures, custom point layers) are vertices with
// their DEPTH. lib/geoh5.js reads these back (its drillhole reader pairs the FROM / TO sets).
const INTERVAL_KEYS = ["litho", "alt", "vein", "breccia", "weath", "structzone", "geotech", "recovery", "sg", "litho_gc", "alt_gc"];
const POINT_KEYS = ["mnlgy", "magsusc", "structure"];
const SKIP_FIELDS = new Set(["hole_id", "from", "to", "depth", "value", "values", "codes", "all_codes", "color", "colour", "tip", "id", "x", "y", "z"]);
const plain = (v) => typeof v === "number" || typeof v === "string" || typeof v === "boolean";
// a row's own fields beyond the layer's value (the import's extra fields: method, comment ...)
function extraFields(row) {
  const out = [];
  for (const [k, v] of Object.entries(row || {})) if (!SKIP_FIELDS.has(k) && !k.startsWith("_") && plain(v) && v !== "") out.push([k, v]);
  return out;
}
const byHole = (rows) => {
  const m = new Map(), n = rowCount(rows);
  for (let i = 0; i < n; i++) { const r = rowAt(rows, i); if (r?.hole_id == null) continue; const k = String(r.hole_id); (m.get(k) || m.set(k, []).get(k)).push(r); }
  return m;
};
const isIntervalRows = (rows) => { const n = Math.min(rowCount(rows), 200); let iv = 0; for (let i = 0; i < n; i++) { const r = rowAt(rows, i); if (fin(r?.from) && fin(r?.to)) iv++; } return n > 0 && iv * 2 > n; };
const isPointRows = (rows) => { const n = Math.min(rowCount(rows), 200); let p = 0; for (let i = 0; i < n; i++) { const r = rowAt(rows, i); if (fin(r?.depth) && !fin(r?.from)) p++; } return n > 0 && p * 2 > n; };

export function drillholeElements(store) {
  const collars = (store.collars || []).filter((c) => c?.hole_id != null && fin(c.x) && fin(c.y) && fin(c.z));
  const left = [];
  const noXYZ = (store.collars || []).length - collars.length;
  if (noXYZ > 0) left.push(tr("{n} collar(s) without x, y and z.", { n: noXYZ.toLocaleString() }));
  if (!collars.length) return { elements: [], left };
  const method = normalizeDesurveyMethod(store.project?.desurveyMethod);
  const survey = byHole(store.survey || []);
  // the interval sources: { name (the value's column), by hole, value(row), extras(row) -> [[name, value]], units? }
  const sources = [];
  for (const k of INTERVAL_KEYS) { const rows = store.layers?.[k]; if (rowCount(rows)) sources.push({ name: LAYER_META[k]?.label || k, by: byHole(rows), value: (r) => r.value, extras: extraFields }); }
  for (const l of store.customLayers || []) if (rowCount(l?.rows) && !rowAt(l.rows, 0)?.modelled && isIntervalRows(l.rows)) sources.push({ name: String(l.name || "Custom layer"), by: byHole(l.rows), value: (r) => r.value, extras: extraFields });
  const assays = store.assays || [];
  if (assays.length) {
    const els = (store.assayElements || []).filter((e) => e?.symbol), col = (e) => (e.unit ? `${e.symbol}_${e.unit}` : e.symbol);
    sources.push({ name: null, by: byHole(assays), value: null, extras: (r) => [...(r.sample_id != null && r.sample_id !== "" ? [["sample_id", r.sample_id]] : []), ...els.map((e) => [col(e), r.values?.[e.symbol]])], units: new Map(els.map((e) => [col(e), e.unit || undefined])) });
  }
  const points = [];
  for (const k of POINT_KEYS) { const rows = store.layers?.[k]; if (rowCount(rows)) points.push({ name: LAYER_META[k]?.label || k, by: byHole(rows) }); }
  for (const l of store.customLayers || []) if (rowCount(l?.rows) && !rowAt(l.rows, 0)?.modelled && isPointRows(l.rows)) points.push({ name: String(l.name || "Custom layer"), by: byHole(l.rows) });

  const elements = [];
  for (const c of collars) {
    const id = String(c.hole_id), st = (survey.get(id) || []).filter((s) => fin(s.depth) && fin(s.azimuth) && fin(s.dip)).sort((a, b) => a.depth - b.depth);
    // TASKS.csv #3712 — each source keeps its own column suffix (its index in `sources`): the suffix was the position among the sets THIS hole has, so a hole with assays and no
    // density wrote its assay depths in the density's FROM / TO pair while the others wrote them in 'FROM (1)' / 'TO (1)'
    const sets = sources.map((s, si) => ({ s, si, rows: (s.by.get(id) || []).filter((r) => fin(r.from) && fin(r.to)) })).filter((x) => x.rows.length);
    const pts = points.map((p) => ({ p, rows: (p.by.get(id) || []).filter((r) => fin(r.depth)) })).filter((x) => x.rows.length);
    // the end of the hole: its length, else the deepest station, interval or reading
    let deepest = 0;
    for (const s of st) deepest = Math.max(deepest, s.depth);
    for (const { rows } of sets) for (const r of rows) deepest = Math.max(deepest, r.to, r.from);
    for (const { rows } of pts) for (const r of rows) deepest = Math.max(deepest, r.depth);
    const eoh = fin(c.length) && c.length > 0 ? Math.max(c.length, deepest) : deepest > 0 ? deepest : null;
    let trace = desurveyHole({ ...c, length: eoh ?? c.length }, st, method);
    if (trace.length < 2) trace = [{ md: 0, x: c.x, y: c.y, z: c.z }, { md: eoh || 1, x: c.x, y: c.y, z: c.z - (eoh || 1) }];
    const vertices = [], depth = [], cells = [];
    const vertex = (md) => { const p = pointOnTrace(trace, md) || c; vertices.push(p.x, p.y, p.z); depth.push(md); return depth.length - 1; };
    // the point readings first (their own vertices), then each interval set's ends
    const pointCols = new Map(); // name -> values by vertex
    for (const { p, rows } of pts) for (const r of rows) {
      const v = vertex(r.depth);
      const put = (k, x) => { if (!pointCols.has(k)) pointCols.set(k, []); pointCols.get(k)[v] = x; };
      if (r.value != null && r.value !== "") put(p.name, r.value);
      for (const [k, x] of extraFields(r)) put(k, x);
    }
    const cellCols = new Map(), units = new Map(); // name -> values by cell
    sets.forEach(({ s, si, rows }) => {
      const suffix = si ? ` (${si})` : "";
      for (const r of rows) {
        const a = vertex(r.from), b = vertex(r.to), cell = cells.length / 2;
        cells.push(a, b);
        const put = (name, x) => { if (!cellCols.has(name)) cellCols.set(name, []); cellCols.get(name)[cell] = x; };
        put(`FROM${suffix}`, r.from); put(`TO${suffix}`, r.to);
        if (s.value && s.name) { const v = s.value(r); if (v != null && v !== "") put(s.name, v); }
        for (const [n, x] of s.extras(r)) if (x != null && x !== "") put(n, x);
      }
      if (s.units) for (const [n, u] of s.units) if (u) units.set(n, u);
    });
    const nV = depth.length, nC = cells.length / 2, full = (arr, n) => Array.from({ length: n }, (_, i) => arr[i]);
    const data = [];
    if (nV) data.push({ name: "DEPTH", values: depth, association: "vertex", units: "m" });
    for (const [n, arr] of pointCols) data.push({ name: n, values: full(arr, nV), association: "vertex" });
    for (const [n, arr] of cellCols) data.push({ name: n, values: full(arr, nC), association: "cell", ...(units.get(n) ? { units: units.get(n) } : /^(FROM|TO)\b/.test(n) ? { units: "m" } : {}) });
    // stations as geoh5 has them (dip negative down); a hole with none: its collar's attitude, when it has one
    const surveys = st.length ? st.map((s) => [s.depth, s.azimuth, -s.dip]) : fin(c.azimuth) && fin(c.dip) ? [[0, c.azimuth, -c.dip]] : [];
    elements.push({ kind: "drillhole", name: id, collar: [c.x, c.y, c.z], endOfHole: eoh ?? undefined, surveys, trace: trace.map((p) => [p.x, p.y, p.z]), vertices, cells, data, intervalSources: sources.map((s) => s.name) /* #3712: null = the assays */ });
  }
  return { elements, left };
}

// the store -> { elements, left: [sentences] } (what is written, and what was left out and why)
export function projectGeoh5Elements(store) {
  const elements = [], left = [], terrain = store.terrain || null;
  { const dh = drillholeElements(store); elements.push(...dh.elements); left.push(...dh.left); } // the drillhole step
  // point surveys, one Points object each, the survey's value as its data (a positions-only survey has none, #3447)
  const gp = store.layers?.geophys_pts, n = rowCount(gp);
  if (n) {
    const X = fieldOf(gp, "x"), Y = fieldOf(gp, "y"), Z = fieldOf(gp, "z"), V = fieldOf(gp, "value"), S = fieldOf(gp, "_src");
    const by = new Map();
    let noZ = 0;
    for (let i = 0; i < n; i++) {
      const x = X(i), y = Y(i), z = Z(i);
      if (!fin(x) || !fin(y)) continue;
      if (!fin(z)) { noZ++; continue; }
      const k = S(i) || "(unnamed import)";
      (by.get(k) || by.set(k, { v: [], d: [] }).get(k)).v.push(x, y, z);
      by.get(k).d.push(V(i));
    }
    for (const [k, s] of by) {
      const meta = store.geophysSurveys?.[k] || {};
      elements.push({ kind: "points", name: k, vertices: s.v, data: meta.positionsOnly ? [] : [{ name: meta.method || "value", values: s.d, units: meta.units || undefined }] });
    }
    if (noZ) left.push(tr("{n} survey point(s) with no elevation.", { n: noZ.toLocaleString() }));
  }
  // surface samples, one Points object, a column per element (and the sample id), z its own or the terrain's
  const ss = store.surfaceSamples || [];
  if (ss.length) {
    const els = (store.surfaceElements || []).map((e) => e.symbol), v = [], ids = [], cols = els.map(() => []);
    let noZ = 0;
    for (const s of ss) {
      if (!fin(s?.x) || !fin(s?.y)) continue;
      const z = fin(s.z) ? s.z : terrainZ(terrain, s.x, s.y);
      if (z == null) { noZ++; continue; }
      v.push(s.x, s.y, z); ids.push(String(s.sample_id ?? ""));
      els.forEach((e, k) => cols[k].push(s.values?.[e]));
    }
    if (v.length) {
      const units = new Map((store.surfaceElements || []).map((e) => [e.symbol, e.unit]));
      elements.push({ kind: "points", name: "Surface samples", vertices: v, data: [{ name: "sample_id", values: ids }, ...els.map((e, k) => ({ name: units.get(e) ? `${e}_${units.get(e)}` : e, values: cols[k], units: units.get(e) || undefined }))] });
    }
    if (noZ) left.push(tr("{n} surface sample(s) with no elevation and no terrain under them.", { n: noZ.toLocaleString() }));
  }
  // imported objects (OMF / geoh5): points, lines and surfaces with their attributes, at their own origin
  for (const o of store.omfObjects || []) {
    const org = o.origin || [0, 0, 0], v = Array.from(o.vertices || [], (x, i) => x + (org[i % 3] || 0));
    const data = (o.attributes || []).filter((a) => a.location === "vertices" || a.location === "segments" || a.location === "faces")
      .map((a) => ({ name: a.name, values: Array.from(a.values || []), association: a.location === "vertices" ? "vertex" : "cell" }));
    if (o.kind === "points") elements.push({ kind: "points", name: o.name, vertices: v, data });
    else if (o.kind === "lines") elements.push({ kind: "curve", name: o.name, vertices: v, cells: Array.from(o.segments || []), data });
    else if (o.kind === "surface") elements.push({ kind: "surface", name: o.name, vertices: v, cells: Array.from(o.triangles || []), data });
  }
  // boundaries and map-layer lines: their own z, else draped on the terrain; with neither, left out
  const counts = { noZ: 0, draped: 0 }, noTerrain = [];
  for (const b of store.boundaries || []) {
    const lines = (b.polylines || []).map((pl) => placeLine(pl, terrain, counts)).filter(Boolean);
    const c = curveOf(b.name || "Boundary", lines);
    if (c) elements.push(c); else if ((b.polylines || []).length) noTerrain.push(b.name || "Boundary");
  }
  for (const l of store.mapLayers || []) {
    if (!/line|polygon/i.test(String(l.geomType || ""))) continue;
    const lines = (l.features || []).flatMap((f) => (f.parts || [])).map((pl) => placeLine(pl, terrain, counts)).filter(Boolean);
    const c = curveOf(l.name || "Map layer", lines);
    if (c) elements.push(c); else if ((l.features || []).length) noTerrain.push(l.name || "Map layer");
  }
  if (noTerrain.length) left.push(tr("Lines with no elevation and no terrain under them: {list}.", { list: noTerrain.join(", ") }));
  // model surfaces (implicit / explicit / generated: world coordinates in the record) and the terrain
  for (const s of store.generatedSurfaces || []) {
    const m = surfaceMesh(s);
    if (m) elements.push({ kind: "surface", name: s.name || "Surface", vertices: Array.from(m.xyz), cells: Array.from(m.indices) });
    else left.push(tr("The surface \"{name}\" has no mesh kept with the project.", { name: s.name || "?" }));
  }
  if (terrain) { const m = terrainMesh(terrain); if (m) elements.push({ kind: "surface", name: terrain.name ? `Terrain: ${terrain.name}` : "Terrain", vertices: Array.from(m.xyz), cells: Array.from(m.indices) }); }
  // block models on one regular grid (the OMF writer's own tensor), their value and per-block fields
  for (const vm of store.voxelModels || []) {
    const r = volumeElementFromModel(vm);
    if (r.error) { left.push(tr("The block model \"{name}\": {why}", { name: vm.name || "?", why: r.error })); continue; }
    elements.push(omfVolumeToGeoh5(r.element, r.shape));
  }
  return { elements, left };
}

// File > Export Project as Geoscience ANALYST: written, saved, and said (the window's export-result toast)
export async function exportProjectGeoh5(store) {
  const say = (detail) => { try { window.dispatchEvent(new CustomEvent(EXPORT_RESULT_EVENT, { detail })); } catch { /* no window */ } };
  const { elements, left } = projectGeoh5Elements(store);
  if (!elements.length) { say({ ok: false, name: "geoh5", error: tr("Nothing in this project can go to a .geoh5 yet: drillholes, point surveys, surface samples, lines, surfaces and block models do.") }); return { ok: false }; }
  const { bytes, written, skipped } = await writeGeoh5Async(elements);
  const project = store.project || {};
  const res = await saveFile({ quiet: true, suggestedName: `${safeFileName(project.name, "project")}.geoh5`, filters: [{ name: "Geoscience ANALYST (geoh5)", extensions: ["geoh5"] }], content: bytes });
  if (res?.ok) {
    const file = String(res.filePath || "").split(/[\\/]/).pop() || "project.geoh5";
    const count = (k) => written.filter((w) => w.kind === k).length;
    const crs = project.crsSet !== false && project.epsg ? `EPSG:${project.epsg}` : tr("not set");
    const message = [
      tr("Saved {file}: {d} drillhole(s), {p} point object(s), {c} curve(s), {s} surface(s), {b} block model(s).", { file, d: count("drillhole"), p: count("points"), c: count("curve"), s: count("surface"), b: count("blockmodel") }),
      tr("A .geoh5 carries no coordinate system: these are the project's coordinates ({crs}).", { crs }),
      ...left, ...skipped.map((s) => tr("Not written: {name} ({why}).", { name: s.name, why: s.reason })),
    ].join(" ");
    say({ ok: true, filePath: res.filePath || null, message });
  } else if (res?.error) say({ ok: false, error: res.error, name: "geoh5" });
  return { ...res, written, skipped, left };
}

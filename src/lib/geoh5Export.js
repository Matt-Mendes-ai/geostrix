// TASKS.csv #1993 (export step) — File > Export Project as Geoscience ANALYST (.geoh5): the project's point surveys and surface samples (with their values),
// lines (imported OMF / geoh5 lines; boundaries and map-layer lines draped on the terrain), surfaces (the model surfaces, imported surfaces, the terrain) and
// block models, written by lib/geoh5Write.js. Drillholes are a later step. Loaded on demand from App.jsx (h5wasm with it). The coordinates are the project's
// (a .geoh5 has no coordinate system: the message says which they are).
import { writeGeoh5, omfVolumeToGeoh5 } from "./geoh5Write.js";
import { volumeElementFromModel } from "./omfWriter.js";
import { surfaceMesh, terrainMesh } from "./kmzModels.js";
import { rowCount, fieldOf } from "./layerColumns.js";
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

// the store -> { elements, left: [sentences] } (what is written, and what was left out and why)
export function projectGeoh5Elements(store) {
  const elements = [], left = [], terrain = store.terrain || null;
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
  if (!elements.length) { say({ ok: false, name: "geoh5", error: tr("Nothing in this project can go to a .geoh5 yet: point surveys, surface samples, lines, surfaces and block models do (drillholes come later).") }); return { ok: false }; }
  const { bytes, written, skipped } = await writeGeoh5(elements);
  const project = store.project || {};
  const res = await saveFile({ quiet: true, suggestedName: `${safeFileName(project.name, "project")}.geoh5`, filters: [{ name: "Geoscience ANALYST (geoh5)", extensions: ["geoh5"] }], content: bytes });
  if (res?.ok) {
    const file = String(res.filePath || "").split(/[\\/]/).pop() || "project.geoh5";
    const count = (k) => written.filter((w) => w.kind === k).length;
    const crs = project.crsSet !== false && project.epsg ? `EPSG:${project.epsg}` : tr("not set");
    const message = [
      tr("Saved {file}: {p} point object(s), {c} curve(s), {s} surface(s), {b} block model(s).", { file, p: count("points"), c: count("curve"), s: count("surface"), b: count("blockmodel") }),
      tr("A .geoh5 carries no coordinate system: these are the project's coordinates ({crs}). Drillholes are not written yet.", { crs }),
      ...left, ...skipped.map((s) => tr("Not written: {name} ({why}).", { name: s.name, why: s.reason })),
    ].join(" ");
    say({ ok: true, filePath: res.filePath || null, message });
  } else if (res?.error) say({ ok: false, error: res.error, name: "geoh5" });
  return { ...res, written, skipped, left };
}

// TASKS.csv #3617 (Fireweed rehearsal) — File > Export Project as OMF: one Open Mining Format file with the drillholes, the grade shells and surfaces, the block models and the points, which is
// how a Leapfrog, Micromine or Datamine user moves a project in one step. The elements are the ones the .geoh5 export collects (lib/geoh5Export.js projectGeoh5Elements: the same project, the same
// rules, the project's coordinates) turned into OMF's: a drillhole is two line sets, its path (one polyline per hole, with the depth at each vertex) and its intervals (a segment per logged
// interval, carrying the assay elements, the density and the other numbers of that interval, NaN where the interval has no value); text columns (lithology codes) are not carried: OMF v1 holds
// numbers, and the message says how many were left out. Pure but for the save.
import { projectGeoh5Elements } from "./geoh5Export.js";
import { writeOMF } from "./omfWriter.js";
import { saveFile, safeFileName, EXPORT_RESULT_EVENT } from "./desktop.js";
import { t as tr } from "./i18n.js";

const f8 = (a) => Float64Array.from(a);
// geoh5's block order k + i·nZ + j·nU·nZ -> OMF's (i·nV + j)·nW + k (w fastest, then v, then u)
function volumeFromBlockModel(el) {
  const nu = el.u.length, nv = el.v.length, nw = el.z.length;
  const data = (el.data || []).map((d) => {
    const out = new Float64Array(nu * nv * nw);
    for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) for (let k = 0; k < nw; k++) { const v = Number(d.values[k + i * nw + j * nu * nw]); out[(i * nv + j) * nw + k] = Number.isFinite(v) ? v : NaN; }
    return { name: d.name, values: out };
  });
  return { type: "volume", name: el.name, origin: el.origin, tensor: { u: el.u, v: el.v, w: el.z }, data };
}
const numericColumn = (d, n) => { const out = new Float64Array(n); for (let i = 0; i < n; i++) { const v = d.values[i]; const x = typeof v === "number" ? v : v === "" || v == null ? NaN : Number(v); out[i] = Number.isFinite(x) ? x : NaN; } return out; };
const isNumeric = (d) => d.values.some((v) => v !== "" && v != null) && d.values.every((v) => v === "" || v == null || Number.isFinite(Number(v)));

// -> { elements: [OMF elements], left: [sentences] }
export function omfElementsFromProject(store) {
  const { elements: geo, left } = projectGeoh5Elements(store);
  const out = [], notes = [...left];
  const holes = geo.filter((e) => e.kind === "drillhole");
  if (holes.length) {
    // the paths: one line set, a polyline per hole, its distance along it at each vertex
    const pv = [], ps = [], depth = [], hole = [];
    holes.forEach((h, hi) => {
      const base = pv.length / 3; let md = 0;
      h.trace.forEach((p, k) => { pv.push(p[0], p[1], p[2]); if (k) { const q = h.trace[k - 1]; md += Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); ps.push(base + k - 1, base + k); } depth.push(md); hole.push(hi + 1); });
    });
    out.push({ type: "lines", name: "Drillholes (paths)", description: `${holes.length} holes; hole = the hole's number, depth_m = metres along the path. Holes: ${holes.map((h, i) => `${i + 1} ${h.name}`).join(", ").slice(0, 600)}`, vertices: f8(pv), segments: Uint32Array.from(ps), data: [{ name: "hole", values: f8(hole), location: "vertices" }, { name: "depth_m", values: f8(depth), location: "vertices" }] });
    // the intervals: a segment per logged interval of every hole, with the numbers of that interval
    const iv = [], is = [], cols = new Map(), rows = [];
    const textNames = new Set();
    holes.forEach((h, hi) => {
      const nC = h.cells.length / 2;
      if (!nC) return;
      const base = iv.length / 3;
      for (let v = 0; v < h.vertices.length / 3; v++) iv.push(h.vertices[v * 3], h.vertices[v * 3 + 1], h.vertices[v * 3 + 2]);
      for (let c = 0; c < nC; c++) is.push(base + h.cells[c * 2], base + h.cells[c * 2 + 1]);
      for (const d of h.data) {
        if (d.association !== "cell") continue;
        if (!isNumeric(d)) { textNames.add(d.name); continue; }
        if (!cols.has(d.name)) cols.set(d.name, { units: d.units, parts: [] });
        cols.get(d.name).parts.push({ hole: hi, values: numericColumn(d, nC) });
      }
      rows.push({ hole: hi, n: nC });
    });
    const total = rows.reduce((n, r) => n + r.n, 0);
    if (total) {
      const starts = new Map(); let at = 0; for (const r of rows) { starts.set(r.hole, at); at += r.n; }
      const data = [{ name: "hole", values: f8(rows.flatMap((r) => Array(r.n).fill(r.hole + 1))), location: "segments" }];
      for (const [name, c] of cols) {
        const a = new Float64Array(total).fill(NaN);
        for (const p of c.parts) a.set(p.values, starts.get(p.hole));
        data.push({ name: c.units ? `${name} (${c.units})` : name, values: a, location: "segments" });
      }
      out.push({ type: "lines", name: "Drillholes (intervals)", description: `A segment per logged interval: ${[...cols.keys()].filter((k) => !/^(FROM|TO)/.test(k)).slice(0, 12).join(", ")}; NaN where an interval has no value`, vertices: f8(iv), segments: Uint32Array.from(is), data });
    }
    if (textNames.size) notes.push(tr("{n} text column(s) of the drillhole logs are not in the OMF (it holds numbers): {list}.", { n: textNames.size, list: [...textNames].slice(0, 8).join(", ") + (textNames.size > 8 ? ", …" : "") }));
    out.push({ type: "points", name: "Collars", vertices: f8(holes.flatMap((h) => h.collar)), data: [{ name: "hole", values: f8(holes.map((_, i) => i + 1)), location: "vertices" }, { name: "end_of_hole_m", values: f8(holes.map((h) => (Number.isFinite(h.endOfHole) ? h.endOfHole : NaN))), location: "vertices" }] });
  }
  for (const e of geo) {
    if (e.kind === "points") out.push({ type: "points", name: e.name, vertices: f8(e.vertices), data: (e.data || []).filter((d) => isNumeric(d) && d.values.length === e.vertices.length / 3).map((d) => ({ name: d.name, values: numericColumn(d, d.values.length), location: "vertices" })) });
    else if (e.kind === "curve") out.push({ type: "lines", name: e.name, vertices: f8(e.vertices), segments: Uint32Array.from(e.cells), data: [] });
    else if (e.kind === "surface") out.push({ type: "surface", name: e.name, vertices: f8(e.vertices), triangles: Uint32Array.from(e.cells), data: [] });
    else if (e.kind === "blockmodel") out.push(volumeFromBlockModel(e));
  }
  return { elements: out, left: notes };
}

export async function exportProjectOmf(store) {
  const say = (detail) => { try { window.dispatchEvent(new CustomEvent(EXPORT_RESULT_EVENT, { detail })); } catch { /* no window */ } };
  const { elements, left } = omfElementsFromProject(store);
  if (!elements.length) { say({ ok: false, name: "OMF", error: tr("Nothing in this project can go to an OMF yet: drillholes, points, lines, surfaces and block models do.") }); return { ok: false }; }
  const project = store.project || {};
  const bytes = await writeOMF({ name: project.name || "GeoStrix project", description: `Exported from GeoStrix ${new Date().toISOString().slice(0, 10)}; coordinates are the project's`, elements });
  const res = await saveFile({ quiet: true, suggestedName: `${safeFileName(project.name, "project")}.omf`, filters: [{ name: "Open Mining Format (OMF)", extensions: ["omf"] }], content: bytes });
  if (res?.ok) {
    const file = String(res.filePath || "").split(/[\\/]/).pop() || "project.omf";
    const crs = project.crsSet !== false && project.epsg ? `EPSG:${project.epsg}` : tr("not set");
    const count = (t) => elements.filter((e) => e.type === t).length;
    const holes = (elements.find((e) => e.name === "Collars")?.vertices.length || 0) / 3;
    say({ ok: true, filePath: res.filePath || null, message: [tr("Saved {file}: {h} drillhole(s), {l} line set(s), {p} point set(s), {s} surface(s), {b} block model(s).", { file, h: holes, l: count("lines"), p: count("points"), s: count("surface"), b: count("volume") }), tr("An OMF carries no coordinate system: these are the project's coordinates ({crs}).", { crs }), ...left].join(" ") });
  } else if (res?.error) say({ ok: false, error: res.error, name: "OMF" });
  return res;
}

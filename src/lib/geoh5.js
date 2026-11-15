// TASKS.csv #1993 (design docs/ideas/geoh5-import.md; Matt's decision 2026-11-13: h5wasm, read-only first, drillholes a later step) — a Geoscience ANALYST
// .geoh5 file read into the same element shapes lib/omf.js gives, so lib/omfImport.js's conversion (point / line / surface objects, block models
// through the cell budget and the crop) is shared. Written from the public geoh5 format description (Mira Geoscience, "geoh5 file format"):
//   GEOSCIENCE/                      the workspace root group (attributes Version, Distance unit)
//     Types/Object types/{guid}      an object type: attributes Name, ID (the type GUIDs below)
//     Types/Data types/{guid}        a data type: Name, ID, Primitive type (Float / Integer / Text / Referenced ...), Value map for Referenced
//     Objects/{uuid}                 an object: attributes Name, ID (and Origin, Rotation ... by type); hard links Type and Data/{uuid}
//     Data/{uuid}                    a data entry: attributes Name, ID, Association (Vertex / Cell / Object); dataset Data; hard link Type
//   Vertices: a compound (x, y, z) per vertex; Cells: unsigned int pairs (Curve) or triples (Surface)
//   Block model: U / V / Z cell delimiters (offsets from Origin, the first 0), Rotation (degrees, counter-clockwise about z), cell index k + i·nZ + j·nU·nZ
//   2D grid: Origin, U Size / U Count, V Size / V Count, Rotation, Vertical; cell index i + j·nU
// No CRS is written in a .geoh5: the coordinates are used as they are (said by the caller). Read-only; nothing is written back.
// h5wasm (NIST, HDF5's own C library as WebAssembly, ~4 MB) is imported here only, on demand: never in the startup bundle.
import { t as tr } from "./i18n.js";

export const GEOH5_TYPES = {
  "202c5db1-a56d-4004-9cad-baafd8899406": "points",
  "6a057fdc-b355-11e3-95be-fd84a7ffcb88": "curve",
  "f26feba3-aded-494b-b9e9-b2bbcbe298e1": "surface",
  "b020a277-90e2-4cd7-84d6-612ee3f25051": "blockmodel",
  "48f5054a-1c5c-4ca4-9048-80f36dc60a06": "grid2d",
  "7caebf0e-d16e-11e3-bc69-e4632694aa37": "drillhole",
  "77ac043c-fe8d-4d14-8167-75e300fb835a": "geoimage",
  "e79f449d-74e3-4598-9c9c-351a28b8b69e": "label",
};
const LATER = { geoimage: () => tr("an image (not read)"), label: () => tr("a label (not read)") }; // drillholes: read since step 1b (#1993)
export const guidKey = (v) => String(v ?? "").trim().replace(/^\{|\}$/g, "").toLowerCase();
const FLOAT_NODATA = 1.175494351e-38, INT_NODATA = -2147483648;

let h5Ready = null, fileSeq = 0;
async function h5() { if (!h5Ready) h5Ready = import("h5wasm").then(async (m) => { const h5wasm = m.default || m; const mod = await h5wasm.ready; return { h5wasm, FS: mod.FS }; }); return h5Ready; }

const attrOf = (node, name) => { try { const a = node?.attrs?.[name]; return a == null ? undefined : a.value; } catch { return undefined; } };
const str = (v) => (v == null ? "" : Array.isArray(v) ? String(v[0] ?? "") : String(v));
const num = (v, d = 0) => { const x = Array.isArray(v) ? Number(v[0]) : Number(v); return Number.isFinite(x) ? x : d; };
const xyz = (v) => { const r = Array.isArray(v) && Array.isArray(v[0]) ? v[0] : v; return Array.isArray(r) && r.length >= 3 ? [Number(r[0]) || 0, Number(r[1]) || 0, Number(r[2]) || 0] : [0, 0, 0]; };
const getSafe = (node, path) => { try { return node?.get(path) ?? null; } catch { return null; } };
const keysOf = (node) => { try { return node?.keys?.() || []; } catch { return []; } };

// Vertices (rows [x, y, z], or a plain n x 3 array) -> a flat Float64Array
function flatVertices(ds) {
  const v = ds?.value;
  if (!v) return new Float64Array(0);
  if (Array.isArray(v)) { const out = new Float64Array(v.length * 3); v.forEach((r, i) => { out[i * 3] = +r[0]; out[i * 3 + 1] = +r[1]; out[i * 3 + 2] = +r[2]; }); return out; }
  return Float64Array.from(v);
}
const flatInts = (ds) => { const v = ds?.value; return v ? (Array.isArray(v) ? v.flat().map(Number) : Array.from(v, Number)) : []; };

// one data entry -> { name, association, kind: "numeric" | "string", values } | null (a type this step does not read)
function readData(dataNode) {
  const name = str(attrOf(dataNode, "Name")) || "data";
  const association = str(attrOf(dataNode, "Association")).toLowerCase();
  const type = getSafe(dataNode, "Type");
  const prim = str(attrOf(type, "Primitive type")).toLowerCase();
  const ds = getSafe(dataNode, "Data");
  if (!ds) return null;
  const raw = ds.value;
  if (prim === "float" || prim === "integer") {
    const nd = prim === "float" ? (v) => !Number.isFinite(v) || Math.abs(v - FLOAT_NODATA) < 1e-44 : (v) => v === INT_NODATA;
    // #1993 step 1b — a 32-bit float read back as a double carries noise past its 7 digits (0.002 read 0.0020000000949949026): rounded to what it holds
    const f32 = raw instanceof Float32Array || /^[<>]?f$/.test(String(ds.dtype || "")), clean = f32 ? (v) => +v.toPrecision(7) : (v) => v;
    const values = Float64Array.from(raw, (v) => (nd(Number(v)) ? NaN : clean(Number(v))));
    let min = Infinity, max = -Infinity;
    for (const v of values) if (Number.isFinite(v)) { if (v < min) min = v; if (v > max) max = v; }
    return { name, association, kind: "numeric", values, ...(min <= max ? { min, max } : {}) };
  }
  if (prim === "referenced") { // codes keyed into the type's Value map (0 = Unknown)
    const map = new Map();
    for (const row of getSafe(type, "Value map")?.value || []) map.set(Number(row[0]), String(row[1]));
    return { name, association, kind: "string", values: Array.from(raw, (k) => (Number(k) === 0 && (!map.has(0) || /^unknown$/i.test(map.get(0))) ? "" /* #1993 step 1b — 0 is the format's no-data ("Unknown"): blank */ : map.get(Number(k)) ?? String(k))) };
  }
  if (prim === "text") return { name, association, kind: "string", values: Array.from(raw, (s) => String(s ?? "")) };
  return null;
}

// a delimiter list (n + 1 offsets from the origin, either direction) -> { start, widths, rev }: the cells in increasing order
function axisPlan(delims) {
  const d = Array.from(delims || [], Number).filter(Number.isFinite);
  if (d.length < 2) return null;
  const rev = d[d.length - 1] < d[0], s = rev ? [...d].reverse() : d;
  return { start: s[0], widths: s.slice(1).map((v, i) => v - s[i]), rev };
}
const rotAxes = (deg) => { const r = (deg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r); return { u: [c, s, 0], v: [-s, c, 0] }; };
const addScaled = (o, a, k) => [o[0] + a[0] * k, o[1] + a[1] * k, o[2] + a[2] * k];

// geoh5 block model values (k + i·nZ + j·nU·nZ) -> OMF's order (w fastest, then v, u slowest), with reversed axes flipped
function reorderBlock(values, nu, nv, nw, ru, rv, rw) {
  const out = new Float64Array(nu * nv * nw);
  let o = 0;
  for (let iu = 0; iu < nu; iu++) {
    const i = ru ? nu - 1 - iu : iu;
    for (let iv = 0; iv < nv; iv++) {
      const j = rv ? nv - 1 - iv : iv;
      for (let iw = 0; iw < nw; iw++) { const k = rw ? nw - 1 - iw : iw; out[o++] = values[k + i * nw + j * nu * nw]; }
    }
  }
  return out;
}

function blockModel(obj, data) {
  const pu = axisPlan(getSafe(obj, "U cell delimiters")?.value), pv = axisPlan(getSafe(obj, "V cell delimiters")?.value), pw = axisPlan(getSafe(obj, "Z cell delimiters")?.value);
  if (!pu || !pv || !pw) return { kind: "skipped", reason: tr("a block model without its U / V / Z cell delimiters") };
  const { u, v } = rotAxes(num(attrOf(obj, "Rotation"), 0)), w = [0, 0, 1];
  const origin = addScaled(addScaled(addScaled(xyz(attrOf(obj, "Origin")), u, pu.start), v, pv.start), w, pw.start);
  const nu = pu.widths.length, nv = pv.widths.length, nw = pw.widths.length, n = nu * nv * nw;
  const attributes = data.filter((a) => a.kind === "numeric" && a.association === "cell" && a.values.length === n)
    .map((a) => ({ ...a, location: "cells", values: reorderBlock(a.values, nu, nv, nw, pu.rev, pv.rev, pw.rev) }));
  return { kind: "volume", origin, tensor_u: pu.widths, tensor_v: pv.widths, tensor_w: pw.widths, axis_u: u, axis_v: v, axis_w: w, attributes };
}

// a 2D grid as a block model one cell thick (a quarter of its smaller cell size), so its values show and colour like one; vertical grids stand up
function grid2d(obj, data) {
  const nu = Math.round(num(attrOf(obj, "U Count"))), nv = Math.round(num(attrOf(obj, "V Count"))), su = num(attrOf(obj, "U Size")), sv = num(attrOf(obj, "V Size"));
  if (!(nu > 0 && nv > 0 && su > 0 && sv > 0)) return { kind: "skipped", reason: tr("a 2D grid without its U / V counts and sizes") };
  const { u, v: vFlat } = rotAxes(num(attrOf(obj, "Rotation"), 0)), vertical = num(attrOf(obj, "Vertical"), 0) === 1;
  const v = vertical ? [0, 0, 1] : vFlat, w = vertical ? [u[1], -u[0], 0] : [0, 0, 1], t = Math.min(su, sv) / 4;
  const origin = addScaled(xyz(attrOf(obj, "Origin")), w, -t / 2);
  const n = nu * nv;
  const attributes = data.filter((a) => a.kind === "numeric" && a.association === "cell" && a.values.length === n).map((a) => {
    const out = new Float64Array(n); let o = 0; // geoh5 i + j·nU -> w (one) fastest, then v, u slowest
    for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) out[o++] = a.values[i + j * nu];
    return { ...a, location: "cells", values: out };
  });
  return { kind: "volume", origin, tensor_u: Array(nu).fill(su), tensor_v: Array(nv).fill(sv), tensor_w: [t], axis_u: u, axis_v: v, axis_w: w, attributes, grid2d: true };
}

// TASKS.csv #1993 step 1b — a drillhole: its collar (attribute Collar, x / y / z), Collar azimuth / dip and End of hole, the Surveys stations (Depth, Azimuth,
// Dip, as the file has them: geoh5 writes dip negative down, and the import's own sign check reads it), the interval data (cell data, with the cells'
// depths in the FROM / TO entries) and the point data (vertex data, at the DEPTH entry). Every other cell / vertex entry of the right length is one column.
// -> { kind: "drillhole", name, collar, azimuth, dip, endOfHole, surveys: [[depth, azimuth, dip]], intervals: { from, to, columns } | null, points: { depth, columns } | null }
const pick = (data, assoc, name) => data.find((a) => a.association === assoc && a.name.trim().toUpperCase() === name);
// TASKS.csv #1993 step 1b — a hole may carry more than one FROM / TO set (lithology and assays on different intervals): each FROM entry is paired with the
// TO of the same suffix ('FROM', 'TO'; 'FROM (1)', 'TO (1)'), a set is the cells where both are numbers, and every other cell entry goes to the set where it
// holds the most values. -> [{ from, to, columns }] (numeric columns as Float64Array, text as arrays), in the file's order
const isBlank = (v) => v == null || v === "" || (typeof v === "number" && !Number.isFinite(v));
function fromToSets(data) {
  const cells = data.filter((a) => a.association === "cell");
  const key = (s, w) => { const m = new RegExp(`^${w}(.*)$`, "i").exec(s.trim()); return m ? m[1].trim().toUpperCase() : null; };
  const pairs = [];
  for (const f of cells) { const k = key(f.name, "FROM"); if (k == null) continue; const to = cells.find((a) => key(a.name, "TO") === k && a.values.length === f.values.length); if (to) pairs.push({ f, to, rows: [] }); }
  if (!pairs.length) return [];
  for (const p of pairs) for (let i = 0; i < p.f.values.length; i++) if (Number.isFinite(Number(p.f.values[i])) && Number.isFinite(Number(p.to.values[i]))) p.rows.push(i);
  const used = new Set(pairs.flatMap((p) => [p.f, p.to])), owned = pairs.map(() => []);
  for (const a of cells) {
    if (used.has(a)) continue;
    let best = -1, bestN = 0;
    pairs.forEach((p, j) => { if (a.values.length !== p.f.values.length) return; const n = p.rows.reduce((s, i) => s + (isBlank(a.values[i]) ? 0 : 1), 0); if (n > bestN) { best = j; bestN = n; } });
    if (best >= 0 && !owned[best].some((x) => x.name === a.name)) owned[best].push(a);
  }
  return pairs.filter((p) => p.rows.length).map((p) => {
    const j = pairs.indexOf(p), pickRows = (vals) => (vals instanceof Float64Array ? Float64Array.from(p.rows, (i) => vals[i]) : p.rows.map((i) => vals[i]));
    return { from: p.rows.map((i) => Number(p.f.values[i])), to: p.rows.map((i) => Number(p.to.values[i])), columns: Object.fromEntries(owned[j].map((a) => [a.name, pickRows(a.values)])) };
  });
}
// the drillhole export step — every vertex carries a DEPTH (objects.rst), the intervals' ends too: the point rows are the vertices where some other vertex data has a
// value; none with values (or no other vertex data) -> null
function pointRows(t) {
  if (!t) return null;
  const cols = Object.entries(t.columns);
  if (!cols.length) return null;
  const keep = t.depth.map((_, i) => i).filter((i) => cols.some(([, v]) => !isBlank(v[i])));
  if (!keep.length) return null;
  if (keep.length === t.depth.length) return t;
  return { depth: keep.map((i) => t.depth[i]), columns: Object.fromEntries(cols.map(([k, v]) => [k, v instanceof Float64Array ? Float64Array.from(keep, (i) => v[i]) : keep.map((i) => v[i])])) };
}
function drillhole(obj, data, name) {
  const collar = xyz(attrOf(obj, "Collar"));
  const surveys = [];
  // the drillhole export step — the members by name (objects.rst lists Depth, Dip, Azimuth; files in the wild have Depth, Azimuth, Dip): positions only when unnamed
  const sds = getSafe(obj, "Surveys"), members = (() => { try { return (sds?.metadata?.compound_type?.members || []).map((m) => String(m?.name || "").trim().toLowerCase()); } catch { return []; } })();
  const at = (n, d) => { const i = members.indexOf(n); return i >= 0 ? i : d; };
  const iD = at("depth", 0), iAz = at("azimuth", members.length ? 2 : 1), iDip = at("dip", members.length ? 1 : 2);
  for (const row of sds?.value || []) { const r = Array.isArray(row) ? row : [row]; const d = Number(r[iD]), az = Number(r[iAz]), dip = Number(r[iDip]); if (Number.isFinite(d)) surveys.push([d, az, dip]); }
  surveys.sort((a, b) => a[0] - b[0]);
  const table = (assoc, keys) => {
    const at = keys.map((k) => pick(data, assoc, k));
    if (at.some((a) => !a)) return null;
    const n = at[0].values.length;
    if (at.some((a) => a.values.length !== n) || !n) return null;
    const used = new Set(at), columns = {};
    for (const a of data) if (a.association === assoc && !used.has(a) && a.values.length === n && !(a.name in columns)) columns[a.name] = a.values;
    return { ...Object.fromEntries(keys.map((k, i) => [k.toLowerCase(), Array.from(at[i].values, Number)])), columns };
  };
  const intervalSets = fromToSets(data), points = pointRows(table("vertex", ["DEPTH"]));
  return { kind: "drillhole", name, collar, azimuth: num(attrOf(obj, "Collar azimuth"), NaN), dip: num(attrOf(obj, "Collar dip"), NaN), endOfHole: num(attrOf(obj, "End of hole"), NaN), surveys, intervals: intervalSets[0] || null, intervalSets, points };
}

// bytes -> { version, distanceUnit, elements: [OMF-shaped elements, and { kind: "skipped", reason }] }
export async function parseGeoh5(arrayBuffer) {
  const { h5wasm, FS } = await h5();
  const path = `/geoh5_${Date.now()}_${fileSeq++}.geoh5`;
  FS.writeFile(path, new Uint8Array(arrayBuffer));
  let f = null;
  try {
    f = new h5wasm.File(path, "r");
    const root = getSafe(f, "GEOSCIENCE");
    if (!root) throw new Error(tr("This is not a geoh5 file: it has no GEOSCIENCE group (another kind of HDF5 file?)."));
    const objects = getSafe(root, "Objects");
    const elements = [];
    for (const id of keysOf(objects)) {
      const obj = getSafe(objects, id);
      const name = str(attrOf(obj, "Name")) || id;
      const typeNode = getSafe(obj, "Type");
      const kind = GEOH5_TYPES[guidKey(attrOf(typeNode, "ID"))];
      if (!kind) { elements.push({ name, kind: "skipped", reason: tr("an object of type \"{type}\" (not read)", { type: str(attrOf(typeNode, "Name")) || guidKey(attrOf(typeNode, "ID")) || "?" }) }); continue; }
      if (LATER[kind]) { elements.push({ name, kind: "skipped", reason: LATER[kind]() }); continue; }
      const dataGroup = getSafe(obj, "Data");
      const data = keysOf(dataGroup).map((k) => readData(getSafe(dataGroup, k))).filter(Boolean);
      try {
        if (kind === "points" || kind === "curve" || kind === "surface") {
          const vertices = flatVertices(getSafe(obj, "Vertices")), nV = vertices.length / 3;
          if (!nV) { elements.push({ name, kind: "skipped", reason: tr("no vertices") }); continue; }
          const cells = kind === "points" ? [] : flatInts(getSafe(obj, "Cells")), per = kind === "curve" ? 2 : 3, nC = cells.length / per;
          if (kind !== "points" && (!nC || cells.some((c) => !(c >= 0 && c < nV)))) { elements.push({ name, kind: "skipped", reason: tr("cells missing, or pointing past the vertices") }); continue; }
          const attributes = data.filter((a) => (a.association === "vertex" && a.values.length === nV) || (a.association === "cell" && a.values.length === nC))
            .map((a) => ({ ...a, values: Array.from(a.values), location: a.association === "vertex" ? "vertices" : kind === "curve" ? "segments" : "faces" })); // plain arrays: the objects are saved with the project
          const base = { name, description: "", color: null, origin: [0, 0, 0], vertices: Array.from(vertices), attributes };
          elements.push(kind === "points" ? { ...base, kind: "points", count: nV } : kind === "curve" ? { ...base, kind: "lines", segments: cells } : { ...base, kind: "surface", triangles: cells });
        } else if (kind === "blockmodel") {
          elements.push({ name, description: "", color: null, ...blockModel(obj, data) });
        } else if (kind === "drillhole") { // #1993 step 1b
          elements.push(drillhole(obj, data, name));
        } else if (kind === "grid2d") {
          elements.push({ name, description: "", color: null, ...grid2d(obj, data) });
        }
      } catch (e) { elements.push({ name, kind: "skipped", reason: e?.message || String(e) }); }
    }
    return { version: num(attrOf(root, "Version"), null), distanceUnit: str(attrOf(root, "Distance unit")), elements };
  } finally {
    try { f?.close(); } catch { /* already closed */ }
    try { FS.unlink(path); } catch { /* gone */ }
  }
}

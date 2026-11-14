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
const LATER = { drillhole: () => tr("a drillhole (read in a later step)"), geoimage: () => tr("an image (not read)"), label: () => tr("a label (not read)") };
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
    const values = Float64Array.from(raw, (v) => (nd(Number(v)) ? NaN : Number(v)));
    let min = Infinity, max = -Infinity;
    for (const v of values) if (Number.isFinite(v)) { if (v < min) min = v; if (v > max) max = v; }
    return { name, association, kind: "numeric", values, ...(min <= max ? { min, max } : {}) };
  }
  if (prim === "referenced") { // codes keyed into the type's Value map (0 = Unknown)
    const map = new Map();
    for (const row of getSafe(type, "Value map")?.value || []) map.set(Number(row[0]), String(row[1]));
    return { name, association, kind: "string", values: Array.from(raw, (k) => map.get(Number(k)) ?? (Number(k) === 0 ? "Unknown" : String(k))) };
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

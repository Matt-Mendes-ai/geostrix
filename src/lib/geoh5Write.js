// TASKS.csv #1993 (export step) — a Geoscience ANALYST .geoh5 written from plain elements (points with data, curves, surfaces, block models; drillholes are a
// later step), through h5wasm (loaded on demand, as lib/geoh5.js reads it: never in the startup bundle). Written from Mira Geoscience's public geoh5 format
// description (the geoh5py documentation, docs/content/geoh5_format: workspace.rst, groups.rst, objects.rst, data.rst, types.rst; read 2026-11-14), not
// from geoh5py's code:
//   workspace.rst  GEOSCIENCE: attributes Version (double), Distance unit, Contributors (1D array of str); flat groups Data, Groups, Objects, Types (Data
//                  types, Group types, Object types); Root, a hard link to the top group of the tree. 'All groups, objects and data must include a hard
//                  link to their type'; parents hold links to their children.
//   groups.rst     group attributes Name, ID, Visible, Public, Allow delete, Allow move, Allow rename; the No Type (Root) group type
//                  {dd99b610-be92-48c0-873c-5b5946ea2840}.
//   objects.rst    object attributes Name, ID, Visible, Public, Allow delete, Allow move, Allow rename. Points {202C5DB1-A56D-4004-9CAD-BAAFD8899406}:
//                  Vertices, a 1D compound [x, y, z double]. Curve {6A057FDC-B355-11E3-95BE-FD84A7FFCB88}: Cells int32 shape (N, 2). Surface
//                  {F26FEBA3-ADED-494B-B9E9-B2BBCBE298E1}: Cells int32 shape (N, 3). Block model {B020A277-90E2-4CD7-84D6-612EE3F25051}: U / V / Z cell
//                  delimiters (double; distances of the cell edges from Origin, the first 0; Z upwards), attributes Origin (compound X, Y, Z) and Rotation
//                  (double, degrees counter-clockwise); cell index = k + i·nZ + j·nU·nZ.
//   data.rst       data attributes Association (Vertex / Cell / Object ...), Name, ID, Visible, Public, Allow delete, Allow rename; data always a 1D array.
//                  Float: 32-bit, no-data 1.175494351e-38 (FLT_MIN). Text: UTF-8 variable-length strings, no-data the empty string.
//   types.rst      object types: Name, ID (Description optional); data types: Name, ID, Primitive type (Units, Description, Hidden, Transparent no data
//                  optional); group types: Name, ID, Description, Allow move contents, Allow delete contents.
// A .geoh5 has no coordinate system: the coordinates are written as they are (the caller says which CRS they are in). Pure but for the h5wasm file.
//
// elements:
//   { kind: "points", name, vertices: [x, y, z, ...], data?: [{ name, values, units? }] }                       values per vertex (numbers, or strings: Text)
//   { kind: "curve", name, vertices, cells: [a, b, ...], data? }                                                data per vertex (association "vertex", default) or "cell"
//   { kind: "surface", name, vertices, cells: [a, b, c, ...], data? }
//   { kind: "blockmodel", name, origin: [x, y, z], u: [widths], v: [widths], z: [widths], data: [{ name, values, units? }] }
//                                                                                                                values in geoh5's order, k + i·nZ + j·nU·nZ (z upwards)
export const GEOH5_WRITE_TYPES = {
  points: { id: "{202C5DB1-A56D-4004-9CAD-BAAFD8899406}", name: "Points" },
  curve: { id: "{6A057FDC-B355-11E3-95BE-FD84A7FFCB88}", name: "Curve" },
  surface: { id: "{F26FEBA3-ADED-494B-B9E9-B2BBCBE298E1}", name: "Surface" },
  blockmodel: { id: "{B020A277-90E2-4CD7-84D6-612EE3F25051}", name: "Block model" },
};
export const ROOT_GROUP_TYPE = "{dd99b610-be92-48c0-873c-5b5946ea2840}";
export const FLOAT_NO_DATA = 1.175494351e-38;
export const GEOH5_VERSION = 2.0;

let h5Ready = null, fileSeq = 0;
async function h5() { if (!h5Ready) h5Ready = import("h5wasm").then(async (m) => { const h5wasm = m.default || m; const mod = await h5wasm.ready; return { h5wasm, FS: mod.FS }; }); return h5Ready; }

const newId = () => `{${(globalThis.crypto?.randomUUID?.() || "xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx".replace(/x/g, () => ((Math.random() * 16) | 0).toString(16)))}}`;
const flags = (node, keys) => { for (const [k, v] of keys) node.create_attribute(k, v, null, "<i"); };
const xyzCompound = (rows) => new Map([["x", Float64Array.from(rows, (r) => r[0])], ["y", Float64Array.from(rows, (r) => r[1])], ["z", Float64Array.from(rows, (r) => r[2])]]);
const XYZ = (p) => new Map([["X", new Float64Array([p[0]])], ["Y", new Float64Array([p[1]])], ["Z", new Float64Array([p[2]])]]); // objects.rst: Origin [X, Y, Z]
const triples = (flat) => { const out = []; for (let i = 0; i + 2 < flat.length; i += 3) out.push([+flat[i], +flat[i + 1], +flat[i + 2]]); return out; };

// a data entry's values -> { prim, data, dtype } (Float: 32-bit, blanks and non-numbers the no-data value; Text: variable-length strings)
function dataArray(values) {
  const arr = Array.from(values || []);
  const text = arr.some((v) => typeof v === "string" && v !== "" && !Number.isFinite(Number(v)));
  if (text) return { prim: "Text", data: arr.map((v) => (v == null ? "" : String(v))) };
  const f = new Float32Array(arr.length);
  arr.forEach((v, i) => { const x = v === "" || v == null ? NaN : Number(v); f[i] = Number.isFinite(x) ? x : FLOAT_NO_DATA; });
  return { prim: "Float", data: f, dtype: "<f" };
}

// -> Uint8Array of the .geoh5 file; { written: [{ kind, name, count }], skipped: [{ name, reason }] }
export async function writeGeoh5(elements, { distanceUnit = "meter", contributors = ["GeoStrix"] } = {}) {
  const { h5wasm, FS } = await h5();
  const path = `/geoh5_out_${Date.now()}_${fileSeq++}.geoh5`;
  const written = [], skipped = [];
  const f = new h5wasm.File(path, "w");
  try {
    const root = f.create_group("GEOSCIENCE");
    root.create_attribute("Version", GEOH5_VERSION, null, "<d");
    root.create_attribute("Distance unit", distanceUnit);
    if (contributors?.length) root.create_attribute("Contributors", contributors.map(String));
    for (const g of ["Data", "Groups", "Objects", "Types", "Types/Data types", "Types/Group types", "Types/Object types"]) f.create_group(`GEOSCIENCE/${g}`);
    // the workspace's top group (groups.rst: No Type (Root)), linked as GEOSCIENCE/Root
    const gt = f.get("GEOSCIENCE/Types/Group types").create_group(ROOT_GROUP_TYPE);
    gt.create_attribute("ID", ROOT_GROUP_TYPE); gt.create_attribute("Name", "NoType"); gt.create_attribute("Description", "<Unknown>");
    flags(gt, [["Allow move contents", 1], ["Allow delete contents", 1]]);
    const rootId = newId(), rg = f.get("GEOSCIENCE/Groups").create_group(rootId);
    rg.create_attribute("ID", rootId); rg.create_attribute("Name", "Workspace");
    flags(rg, [["Visible", 1], ["Public", 1], ["Allow delete", 0], ["Allow move", 0], ["Allow rename", 0]]);
    rg.create_hard_link(`/GEOSCIENCE/Types/Group types/${ROOT_GROUP_TYPE}`, "Type");
    for (const g of ["Data", "Groups", "Objects"]) rg.create_group(g);
    root.create_hard_link(`/GEOSCIENCE/Groups/${rootId}`, "Root");
    const objTypes = new Set();
    const objectType = (kind) => {
      const t = GEOH5_WRITE_TYPES[kind];
      if (!objTypes.has(kind)) { const g = f.get("GEOSCIENCE/Types/Object types").create_group(t.id); g.create_attribute("ID", t.id); g.create_attribute("Name", t.name); g.create_attribute("Description", t.name); objTypes.add(kind); }
      return t.id;
    };
    for (const el of elements || []) {
      const name = String(el?.name || el?.kind || "object");
      try {
        const kind = el?.kind;
        if (!GEOH5_WRITE_TYPES[kind]) { skipped.push({ name, reason: `a ${kind || "?"} (not written)` }); continue; }
        const verts = kind === "blockmodel" ? [] : triples(el.vertices || []);
        if (kind !== "blockmodel" && !verts.length) { skipped.push({ name, reason: "no vertices" }); continue; }
        const per = kind === "curve" ? 2 : kind === "surface" ? 3 : 0;
        const cells = per ? Array.from(el.cells || [], Number) : [];
        if (per && (!cells.length || cells.length % per || cells.some((c) => !(Number.isInteger(c) && c >= 0 && c < verts.length)))) { skipped.push({ name, reason: "cells missing, or pointing past the vertices" }); continue; }
        let nCells = per ? cells.length / per : 0;
        if (kind === "blockmodel") {
          const ok = ["u", "v", "z"].every((a) => Array.isArray(el[a]) && el[a].length && el[a].every((w) => Number.isFinite(w) && w > 0));
          if (!ok || !Array.isArray(el.origin) || el.origin.length < 3) { skipped.push({ name, reason: "a block model without its cell widths or origin" }); continue; }
          nCells = el.u.length * el.v.length * el.z.length;
        }
        const typeId = objectType(kind);
        const id = newId(), o = f.get("GEOSCIENCE/Objects").create_group(id);
        o.create_attribute("ID", id); o.create_attribute("Name", name);
        flags(o, [["Visible", 1], ["Public", 1], ["Allow delete", 1], ["Allow move", 1], ["Allow rename", 1]]);
        o.create_hard_link(`/GEOSCIENCE/Types/Object types/${typeId}`, "Type");
        o.create_group("Data");
        if (kind === "blockmodel") {
          o.create_attribute("Origin", XYZ(el.origin));
          o.create_attribute("Rotation", 0, null, "<d");
          const delims = (w) => { const d = [0]; for (const x of w) d.push(d[d.length - 1] + x); return Float64Array.from(d); };
          o.create_dataset({ name: "U cell delimiters", data: delims(el.u) });
          o.create_dataset({ name: "V cell delimiters", data: delims(el.v) });
          o.create_dataset({ name: "Z cell delimiters", data: delims(el.z) });
        } else {
          o.create_dataset({ name: "Vertices", data: xyzCompound(verts) });
          if (per) o.create_dataset({ name: "Cells", data: Int32Array.from(cells), shape: [nCells, per], dtype: "<i" });
        }
        f.get("GEOSCIENCE/Groups").get(rootId).get("Objects").create_hard_link(`/GEOSCIENCE/Objects/${id}`, id);
        let nData = 0;
        for (const d of el.data || []) {
          const assoc = kind === "blockmodel" ? "Cell" : d.association === "cell" ? "Cell" : "Vertex";
          const n = assoc === "Cell" ? nCells : verts.length;
          const vals = Array.from(d.values || []);
          if (vals.length !== n) { skipped.push({ name: `${name} / ${d.name}`, reason: `${vals.length} values for ${n} ${assoc === "Cell" ? "cells" : "vertices"}` }); continue; }
          const { prim, data, dtype } = dataArray(vals);
          const tId = newId(), t = f.get("GEOSCIENCE/Types/Data types").create_group(tId);
          t.create_attribute("ID", tId); t.create_attribute("Name", String(d.name)); t.create_attribute("Primitive type", prim);
          if (d.units) t.create_attribute("Units", String(d.units));
          flags(t, [["Hidden", 0], ["Transparent no data", 1]]);
          const dId = newId(), g = f.get("GEOSCIENCE/Data").create_group(dId);
          g.create_attribute("ID", dId); g.create_attribute("Name", String(d.name)); g.create_attribute("Association", assoc);
          flags(g, [["Visible", 0], ["Public", 1], ["Allow delete", 1], ["Allow rename", 1]]);
          g.create_hard_link(`/GEOSCIENCE/Types/Data types/${tId}`, "Type");
          g.create_dataset(dtype ? { name: "Data", data, dtype } : { name: "Data", data });
          o.get("Data").create_hard_link(`/GEOSCIENCE/Data/${dId}`, dId);
          nData++;
        }
        written.push({ kind, name, count: kind === "blockmodel" ? nCells : verts.length, data: nData });
      } catch (e) { skipped.push({ name, reason: e?.message || String(e) }); }
    }
  } finally {
    try { f.close(); } catch { /* closed */ }
  }
  const bytes = FS.readFile(path);
  try { FS.unlink(path); } catch { /* gone */ }
  return { bytes, written, skipped };
}

// a GeoStrix block model's OMF-style volume (lib/omfWriter.js volumeElementFromModel: origin at the minimum corner, tensor widths, values w fastest,
// then v, u slowest) -> geoh5's order k + i·nZ + j·nU·nZ (objects.rst), z upwards from the origin as both use it
export function omfVolumeToGeoh5(el, shape) {
  const [nu, nv, nw] = shape;
  const data = (el.data || []).map((d) => {
    const out = new Array(nu * nv * nw);
    for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) for (let k = 0; k < nw; k++) out[k + i * nw + j * nu * nw] = d.values[(i * nv + j) * nw + k];
    return { name: d.name, values: out };
  });
  return { kind: "blockmodel", name: el.name, origin: el.origin, u: el.tensor.u, v: el.tensor.v, z: el.tensor.w, data };
}

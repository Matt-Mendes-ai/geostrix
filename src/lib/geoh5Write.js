// TASKS.csv #1993 (export step) — a Geoscience ANALYST .geoh5 written from plain elements (points with data, curves, surfaces, block models and, since the
// drillhole step, drillholes), through h5wasm (loaded on demand, as lib/geoh5.js reads it: never in the startup bundle). Written from Mira Geoscience's public geoh5
// format description (the geoh5py documentation, docs/content/geoh5_format: workspace.rst, groups.rst, objects.rst, data.rst, types.rst; read 2026-11-14), not
// from geoh5py's code:
//   workspace.rst  GEOSCIENCE: attributes Version (double), Distance unit, Contributors (1D array of str); flat groups Data, Groups, Objects, Types (Data
//                  types, Group types, Object types); Root, a hard link to the top group of the tree. 'All groups, objects and data must include a hard
//                  link to their type'; parents hold links to their children.
//   groups.rst     group attributes Name, ID, Visible, Public, Allow delete, Allow move, Allow rename; the No Type (Root) group type
//                  {dd99b610-be92-48c0-873c-5b5946ea2840}; Drillholes {825424FB-C2C6-4FEA-9F2B-6CD00023D393}, a container restricted to drillhole objects.
//   objects.rst    object attributes Name, ID, Visible, Public, Allow delete, Allow move, Allow rename. Points {202C5DB1-A56D-4004-9CAD-BAAFD8899406}:
//                  Vertices, a 1D compound [x, y, z double]. Curve {6A057FDC-B355-11E3-95BE-FD84A7FFCB88}: Cells int32 shape (N, 2). Surface
//                  {F26FEBA3-ADED-494B-B9E9-B2BBCBE298E1}: Cells int32 shape (N, 3). Block model {B020A277-90E2-4CD7-84D6-612EE3F25051}: U / V / Z cell
//                  delimiters (double; distances of the cell edges from Origin, the first 0; Z upwards), attributes Origin (compound X, Y, Z) and Rotation
//                  (double, degrees counter-clockwise); cell index = k + i·nZ + j·nU·nZ.
//                  Drillhole {7CAEBF0E-D16E-11E3-BC69-E4632694AA37}: attribute Collar (compound X, Y, Z double); datasets Surveys (compound Depth, Dip,
//                  Azimuth double) and Trace (compound X, Y, Z: the path from collar to end of hole, at least two points). Its Vertices are points along the
//                  path that carry data and 'must have a Depth property value'; its Cells are vertex pairs, the intervals (they may overlap, for data
//                  sampled on different intervals).
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
//   { kind: "drillhole", name, collar: [x, y, z], trace: [[x, y, z], ...] (>= 2), surveys?: [[depth, azimuth, dip]] (dip negative down, as geoh5 has it),
//     endOfHole?, vertices?: [x, y, z, ...] (points along the path, each with its DEPTH among the data), cells?: [a, b, ...] (intervals), data? (vertex / cell) }
//   Drillholes go into one Drillholes group under the workspace.
export const GEOH5_WRITE_TYPES = {
  points: { id: "{202C5DB1-A56D-4004-9CAD-BAAFD8899406}", name: "Points" },
  curve: { id: "{6A057FDC-B355-11E3-95BE-FD84A7FFCB88}", name: "Curve" },
  surface: { id: "{F26FEBA3-ADED-494B-B9E9-B2BBCBE298E1}", name: "Surface" },
  blockmodel: { id: "{B020A277-90E2-4CD7-84D6-612EE3F25051}", name: "Block model" },
  drillhole: { id: "{7CAEBF0E-D16E-11E3-BC69-E4632694AA37}", name: "Drillhole" }, // the drillhole step
};
export const ROOT_GROUP_TYPE = "{dd99b610-be92-48c0-873c-5b5946ea2840}";
export const DRILLHOLES_GROUP_TYPE = "{61FBB4E8-A480-11E3-8D5A-2776BDF4F982}"; // a plain container: geoh5py (Mira's reference reader) reads the {825424FB-...} Drillholes group as a CONCATENATOR (drillholes stored in its own Attributes / Data / Index tables), which these one-object-per-hole drillholes are not
export const FLOAT_NO_DATA = 1.175494351e-38;
export const GEOH5_VERSION = 2.0;

let h5Ready = null, fileSeq = 0;
async function h5() { if (!h5Ready) h5Ready = import("h5wasm").then(async (m) => { const h5wasm = m.default || m; const mod = await h5wasm.ready; return { h5wasm, FS: mod.FS }; }); return h5Ready; }

const newId = () => `{${(globalThis.crypto?.randomUUID?.() || "xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx".replace(/x/g, () => ((Math.random() * 16) | 0).toString(16)))}}`;
const flags = (node, keys) => { for (const [k, v] of keys) node.create_attribute(k, v, null, "<i"); };
const xyzCompound = (rows) => new Map([["x", Float64Array.from(rows, (r) => r[0])], ["y", Float64Array.from(rows, (r) => r[1])], ["z", Float64Array.from(rows, (r) => r[2])]]);
const XYZCompound = (rows) => new Map([["x", Float64Array.from(rows, (r) => r[0])], ["y", Float64Array.from(rows, (r) => r[1])], ["z", Float64Array.from(rows, (r) => r[2])]]); // lower-case x, y, z, as geoh5py (Mira's reference reader, and the files in the wild) names them and requires them
const XYZ = (p) => new Map([["x", new Float64Array([p[0]])], ["y", new Float64Array([p[1]])], ["z", new Float64Array([p[2]])]]); // lower-case x, y, z (see XYZCompound); Origin and Collar are written as scalar compounds (shape [])
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
    // the flat groups, opened once (the drillhole step: a path looked up per entry cost seconds on 559 holes)
    const G = { data: f.get("GEOSCIENCE/Data"), groups: f.get("GEOSCIENCE/Groups"), objects: f.get("GEOSCIENCE/Objects"), dataTypes: f.get("GEOSCIENCE/Types/Data types"), groupTypes: f.get("GEOSCIENCE/Types/Group types"), objectTypes: f.get("GEOSCIENCE/Types/Object types") };
    // a group of the tree: its type (once), the group, linked under its parent's Groups
    const groupTypes = new Set();
    const makeGroup = (typeId, typeName, name, parentId, { fixed = false } = {}) => {
      if (!groupTypes.has(typeId)) {
        const gt = G.groupTypes.create_group(typeId);
        gt.create_attribute("ID", typeId); gt.create_attribute("Name", typeName); gt.create_attribute("Description", typeName === "NoType" ? "<Unknown>" : typeName);
        flags(gt, [["Allow move contents", 1], ["Allow delete contents", 1]]);
        groupTypes.add(typeId);
      }
      const id = newId(), g = G.groups.create_group(id);
      g.create_attribute("ID", id); g.create_attribute("Name", name);
      flags(g, [["Visible", 1], ["Public", 1], ["Allow delete", fixed ? 0 : 1], ["Allow move", fixed ? 0 : 1], ["Allow rename", fixed ? 0 : 1]]);
      g.create_hard_link(`/GEOSCIENCE/Types/Group types/${typeId}`, "Type");
      for (const s of ["Data", "Groups", "Objects"]) g.create_group(s);
      if (parentId) f.get(`GEOSCIENCE/Groups/${parentId}/Groups`).create_hard_link(`/GEOSCIENCE/Groups/${id}`, id);
      return id;
    };
    // the workspace's top group (groups.rst: No Type (Root)), linked as GEOSCIENCE/Root
    const rootId = makeGroup(ROOT_GROUP_TYPE, "NoType", "Workspace", null, { fixed: true });
    root.create_hard_link(`/GEOSCIENCE/Groups/${rootId}`, "Root");
    let holesId = null; // the Drillholes group, made with the first drillhole
    const objTypes = new Set();
    const objectType = (kind) => {
      const t = GEOH5_WRITE_TYPES[kind];
      if (!objTypes.has(kind)) { const g = G.objectTypes.create_group(t.id); g.create_attribute("ID", t.id); g.create_attribute("Name", t.name); g.create_attribute("Description", t.name); objTypes.add(kind); }
      return t.id;
    };
    // the drillhole step — one data type per name, primitive and unit, shared by every object that carries such data (559 holes' 'Lithology' are one property)
    const dataTypes = new Map();
    const dataType = (name, prim, units) => {
      const key = `${name}\u0000${prim}\u0000${units || ""}`;
      if (dataTypes.has(key)) return dataTypes.get(key);
      const tId = newId(), t = G.dataTypes.create_group(tId);
      t.create_attribute("ID", tId); t.create_attribute("Name", String(name)); t.create_attribute("Primitive type", prim);
      if (units) t.create_attribute("Units", String(units));
      flags(t, [["Hidden", 0], ["Transparent no data", 1]]);
      dataTypes.set(key, tId);
      return tId;
    };
    for (const el of elements || []) {
      const name = String(el?.name || el?.kind || "object");
      try {
        const kind = el?.kind;
        if (!GEOH5_WRITE_TYPES[kind]) { skipped.push({ name, reason: `a ${kind || "?"} (not written)` }); continue; }
        const hole = kind === "drillhole";
        const verts = kind === "blockmodel" ? [] : triples(el.vertices || []);
        if (!hole && kind !== "blockmodel" && !verts.length) { skipped.push({ name, reason: "no vertices" }); continue; }
        const per = kind === "curve" || hole ? 2 : kind === "surface" ? 3 : 0;
        const cells = per ? Array.from(el.cells || [], Number) : [];
        if (!hole && per && !cells.length) { skipped.push({ name, reason: "cells missing, or pointing past the vertices" }); continue; }
        if (per && (cells.length % per || cells.some((c) => !(Number.isInteger(c) && c >= 0 && c < verts.length)))) { skipped.push({ name, reason: "cells missing, or pointing past the vertices" }); continue; }
        let nCells = per ? cells.length / per : 0;
        if (kind === "blockmodel") {
          const ok = ["u", "v", "z"].every((a) => Array.isArray(el[a]) && el[a].length && el[a].every((w) => Number.isFinite(w) && w > 0));
          if (!ok || !Array.isArray(el.origin) || el.origin.length < 3) { skipped.push({ name, reason: "a block model without its cell widths or origin" }); continue; }
          nCells = el.u.length * el.v.length * el.z.length;
        }
        const trace = hole ? (el.trace || []).filter((p) => p && [0, 1, 2].every((k) => Number.isFinite(+p[k]))) : [];
        if (hole && (!Array.isArray(el.collar) || el.collar.length < 3 || !el.collar.slice(0, 3).every((v) => Number.isFinite(+v)) || trace.length < 2)) { skipped.push({ name, reason: "a drillhole without its collar or a path of two points" }); continue; }
        const typeId = objectType(kind);
        const id = newId(), o = G.objects.create_group(id);
        o.create_attribute("ID", id); o.create_attribute("Name", name);
        flags(o, [["Visible", 1], ["Public", 1], ["Allow delete", 1], ["Allow move", 1], ["Allow rename", 1]]);
        o.create_hard_link(`/GEOSCIENCE/Types/Object types/${typeId}`, "Type");
        const oData = o.create_group("Data");
        if (kind === "blockmodel") {
          o.create_attribute("Origin", XYZ(el.origin), []);
          o.create_attribute("Rotation", 0, null, "<d");
          const delims = (w) => { const d = [0]; for (const x of w) d.push(d[d.length - 1] + x); return Float64Array.from(d); };
          o.create_dataset({ name: "U cell delimiters", data: delims(el.u) });
          o.create_dataset({ name: "V cell delimiters", data: delims(el.v) });
          o.create_dataset({ name: "Z cell delimiters", data: delims(el.z) });
        } else if (hole) {
          o.create_attribute("Collar", XYZ(el.collar.map(Number)), []); // a scalar compound (shape []), as geoh5py writes and reads it; a 1-element array was refused by geoh5py
          if (Number.isFinite(el.endOfHole)) o.create_attribute("End of hole", Number(el.endOfHole), null, "<d");
          const sv = (el.surveys || []).filter((s) => Number.isFinite(+s[0]) && Number.isFinite(+s[1]) && Number.isFinite(+s[2]));
          if (sv.length) o.create_dataset({ name: "Surveys", data: new Map([["Depth", Float32Array.from(sv, (s) => +s[0])], ["Azimuth", Float32Array.from(sv, (s) => +s[1])], ["Dip", Float32Array.from(sv, (s) => +s[2])]]) }); // the field order and float32 geoh5py (Mira's reference reader) requires: Depth, Azimuth, Dip (the spec page lists Depth, Dip, Azimuth; the fields are named, and GeoStrix's reader goes by name)
          o.create_dataset({ name: "Trace", data: XYZCompound(trace.map((p) => p.map(Number))) });
          if (verts.length) o.create_dataset({ name: "Vertices", data: xyzCompound(verts) });
          if (nCells) o.create_dataset({ name: "Cells", data: Uint32Array.from(cells), shape: [nCells, 2], dtype: "<I" });
        } else {
          o.create_dataset({ name: "Vertices", data: xyzCompound(verts) });
          if (per) o.create_dataset({ name: "Cells", data: Int32Array.from(cells), shape: [nCells, per], dtype: "<i" });
        }
        if (hole) {
          holesId ??= makeGroup(DRILLHOLES_GROUP_TYPE, "Drillholes", "Drillholes", rootId);
          f.get(`GEOSCIENCE/Groups/${holesId}/Objects`).create_hard_link(`/GEOSCIENCE/Objects/${id}`, id);
        } else f.get(`GEOSCIENCE/Groups/${rootId}/Objects`).create_hard_link(`/GEOSCIENCE/Objects/${id}`, id);
        let nData = 0;
        for (const d of el.data || []) {
          const assoc = kind === "blockmodel" ? "Cell" : d.association === "cell" ? "Cell" : "Vertex";
          const n = assoc === "Cell" ? nCells : verts.length;
          const vals = Array.from(d.values || []);
          if (vals.length !== n || !n) { skipped.push({ name: `${name} / ${d.name}`, reason: `${vals.length} values for ${n} ${assoc === "Cell" ? "cells" : "vertices"}` }); continue; }
          const { prim, data, dtype } = dataArray(vals);
          const tId = dataType(d.name, prim, d.units);
          const dId = newId(), g = G.data.create_group(dId);
          g.create_attribute("ID", dId); g.create_attribute("Name", String(d.name)); g.create_attribute("Association", assoc);
          flags(g, [["Visible", 0], ["Public", 1], ["Allow delete", 1], ["Allow rename", 1]]);
          g.create_hard_link(`/GEOSCIENCE/Types/Data types/${tId}`, "Type");
          g.create_dataset(dtype ? { name: "Data", data, dtype } : { name: "Data", data });
          oData.create_hard_link(`/GEOSCIENCE/Data/${dId}`, dId);
          nData++;
        }
        written.push({ kind, name, count: kind === "blockmodel" ? nCells : hole ? nCells + verts.length : verts.length, data: nData });
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

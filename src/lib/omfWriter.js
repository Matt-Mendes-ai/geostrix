// TASKS.csv #411 — Open Mining Format v1 WRITER (the inverse of omf.js), so block models and surfaces go
// to Leapfrog / Datamine / Vulcan / Micromine / Geosoft, which all read OMF v1. Layout copied from a file
// written by the reference implementation (omf-python 1.0.1, OMFWriter) and checked by reading GeoStrix's
// output back with that same library (see TASKS.csv #411 notes):
//   bytes 0-3 magic 84 83 82 81 | 4-35 "OMF-v0.9.0" NUL-padded | 36-51 the Project's UUID (16 bytes) |
//   52-59 uint64 LE offset of the JSON | zlib-compressed arrays | JSON: { uuid: object } for every object.
// Arrays: {start, length (compressed bytes), dtype}; ScalarArray / Vector3Array "<f8", Int2/Int3Array "<i8".
// Volume cell data order: w (vertical) FASTEST, then v, then u — C order over (nu, nv, nw), as omfvista's
// volume_to_vtk reads it and as omf.js's importer (verified on a real Geosoft file) reads it.
// Empty cells are NaN (OMF has no no-data sentinel; Leapfrog shows NaN as blank).
import { tensorFromCells } from "./modelExport.js";
import { valueColumnName, valueUnit, NOT_A_RESOURCE_SOURCE, numericCellFields } from "./blockModelExport.js"; // TASKS.csv #529, #1026; numericCellFields: #1050
import { SUPPORT_CODES } from "./estimation.js";
import { NOT_A_RESOURCE } from "./provenance.js";
import { t as tr } from "./i18n.js"; // TASKS.csv #786 — messages in the interface language

const MAGIC = [0x84, 0x83, 0x82, 0x81];
const iso = () => new Date().toISOString().replace(/\.\d+Z$/, "Z");
const uuid = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : "xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx".replace(/x/g, () => ((Math.random() * 16) | 0).toString(16)));

async function zlib(bytes) {
  const cs = new CompressionStream("deflate"); // RFC 1950 zlib wrapper, what omf-python's zlib.compress writes
  const out = new Response(new Blob([bytes]).stream().pipeThrough(cs));
  return new Uint8Array(await out.arrayBuffer());
}

// elements: [{ type: "volume", name, description?, origin:[x,y,z], tensor:{u,v,w}, data:[{name, values (w-fastest)}] }
//           | { type: "surface", name, description?, vertices: Float64Array (xyz...), triangles: Uint32Array, data? }
//           | { type: "points", name, vertices, data:[{name, values}] }
//           | { type: "lines", name, vertices, segments: Uint32Array (pairs), data:[{name, values, location:"segments"|"vertices"}] }]
export async function writeOMF({ name = "GeoStrix export", description = "", elements }) {
  const objects = {};
  const chunks = []; // compressed payloads in file order
  let offset = 60;
  const stamp = () => ({ date_created: iso(), date_modified: iso() });
  const addArray = async (cls, typed, dtype) => {
    const raw = new Uint8Array(typed.buffer, typed.byteOffset, typed.byteLength);
    const z = await zlib(raw);
    const id = uuid();
    objects[id] = { ...stamp(), array: { start: offset, dtype, length: z.length }, __class__: cls };
    chunks.push(z); offset += z.length;
    return id;
  };
  // TASKS.csv #1112 (review #1016) — preallocated arrays filled in a loop: .from(a, mapper) (and a BigInt per index) took
  // 0.3-1.4 s for a 1M-triangle surface where this takes 12-40 ms (identical bytes). i8 writes each int64 as its two 32-bit words (little-endian,
  // as the typed arrays above already assume): low = v mod 2^32, high = floor(v / 2^32), exact for |v| < 2^53.
  const f8 = (a) => { const n = a.length, out = new Float64Array(n); for (let i = 0; i < n; i++) { const v = a[i]; out[i] = Number.isFinite(v) ? v : NaN; } return out; };
  const i8 = (a) => {
    const n = a.length, out = new BigInt64Array(n), w = new Int32Array(out.buffer);
    for (let i = 0; i < n; i++) { const v = Number(a[i]); w[2 * i] = v | 0; w[2 * i + 1] = Math.floor(v / 4294967296) | 0; }
    return out;
  };
  const addData = async (d, location) => {
    const arr = await addArray("ScalarArray", f8(d.values), "<f8");
    const id = uuid();
    objects[id] = { ...stamp(), name: d.name, description: d.description || "", array: arr, location: d.location || location, __class__: "ScalarData" };
    return id;
  };
  const elementIds = [];
  for (const el of elements) {
    const id = uuid(), gid = uuid();
    const color = el.color || [127, 127, 127];
    if (el.type === "volume") {
      objects[gid] = { ...stamp(), origin: el.origin, axis_u: [1, 0, 0], axis_v: [0, 1, 0], axis_w: [0, 0, 1], tensor_u: el.tensor.u, tensor_v: el.tensor.v, tensor_w: el.tensor.w, __class__: "VolumeGridGeometry" };
      const data = []; for (const d of el.data || []) data.push(await addData(d, "cells"));
      objects[id] = { ...stamp(), name: el.name, description: el.description || "", data, color, subtype: "volume", geometry: gid, __class__: "VolumeElement" };
    } else if (el.type === "surface") {
      const v = await addArray("Vector3Array", f8(el.vertices), "<f8");
      const t = await addArray("Int3Array", i8(el.triangles), "<i8");
      objects[gid] = { ...stamp(), origin: [0, 0, 0], vertices: v, triangles: t, __class__: "SurfaceGeometry" };
      const data = []; for (const d of el.data || []) data.push(await addData(d, "vertices"));
      objects[id] = { ...stamp(), name: el.name, description: el.description || "", data, color, textures: [], subtype: "surface", geometry: gid, __class__: "SurfaceElement" };
    } else if (el.type === "points") {
      const v = await addArray("Vector3Array", f8(el.vertices), "<f8");
      objects[gid] = { ...stamp(), origin: [0, 0, 0], vertices: v, __class__: "PointSetGeometry" };
      const data = []; for (const d of el.data || []) data.push(await addData(d, "vertices"));
      objects[id] = { ...stamp(), name: el.name, description: el.description || "", data, color, textures: [], subtype: "point", geometry: gid, __class__: "PointSetElement" };
    } else if (el.type === "lines") {
      const v = await addArray("Vector3Array", f8(el.vertices), "<f8");
      const sgm = await addArray("Int2Array", i8(el.segments), "<i8");
      objects[gid] = { ...stamp(), origin: [0, 0, 0], vertices: v, segments: sgm, __class__: "LineSetGeometry" };
      const data = []; for (const d of el.data || []) data.push(await addData(d, "segments"));
      objects[id] = { ...stamp(), name: el.name, description: el.description || "", data, color, subtype: "line", geometry: gid, __class__: "LineSetElement" };
    } else throw new Error(tr("Unknown OMF element type \"{type}\".", { type: el.type }));
    elementIds.push(id);
  }
  const pid = uuid();
  objects[pid] = { ...stamp(), name, description, author: "", revision: "", units: "m", elements: elementIds, origin: [0, 0, 0], __class__: "Project" };
  const json = new TextEncoder().encode(JSON.stringify(objects));
  const out = new Uint8Array(offset + json.length);
  out.set(MAGIC, 0);
  out.set(new TextEncoder().encode("OMF-v0.9.0"), 4); // rest of the 32 bytes stay NUL
  const hex = pid.replace(/-/g, "");
  for (let i = 0; i < 16; i++) out[36 + i] = parseInt(hex.slice(2 * i, 2 * i + 2), 16);
  new DataView(out.buffer).setBigUint64(52, BigInt(offset), true);
  let p = 60; for (const c of chunks) { out.set(c, p); p += c.length; }
  out.set(json, offset);
  return out;
}

// A GeoStrix block model (cells on one tensor grid) as an OMF VolumeElement: value (+ support when present).
export function volumeElementFromModel(model) {
  const t = tensorFromCells(model.cells || []);
  if (t.error) return { error: t.error };
  const n = t.nx * t.ny * t.nz;
  const value = new Float64Array(n).fill(NaN), support = new Float64Array(n).fill(NaN), sIndex = new Float64Array(n).fill(NaN);
  let hasSupport = false, hasIndex = false;
  const k = (v) => Math.round(v * 1000);
  for (const c of model.cells) {
    const iu = t.x.index.get(k(c.x)), iv = t.y.index.get(k(c.y)), iw = t.z.index.get(k(c.z)); // z index 0 = bottom
    if (iu == null || iv == null || iw == null) continue;
    const idx = (iu * t.ny + iv) * t.nz + iw; // C order over (nu, nv, nw): w fastest
    value[idx] = c.value;
    if (Number.isFinite(c.support)) { support[idx] = c.support; hasSupport = true; }
    else if (typeof c.support === "string" && SUPPORT_CODES[c.support] != null) { support[idx] = SUPPORT_CODES[c.support]; hasSupport = true; } // #529 — the class as its code
    if (Number.isFinite(c.supportIndex)) { sIndex[idx] = c.supportIndex; hasIndex = true; }
  }
  // TASKS.csv #1050 — the other per-block fields (support and its index are written above, under their existing names)
  const extra = numericCellFields(model.cells).filter((f) => !/^SUPPORT/.test(f.name)).map(({ name, get }) => {
    const a = new Float64Array(n).fill(NaN);
    for (const c of model.cells) { const iu = t.x.index.get(k(c.x)), iv = t.y.index.get(k(c.y)), iw = t.z.index.get(k(c.z)); const v = get(c); if (iu != null && iv != null && iw != null && v != null) a[(iu * t.ny + iv) * t.nz + iw] = v; }
    return { name: name.toLowerCase(), values: a };
  });
  const valueName = valueColumnName(model); // #529 — "Au_ppm"
  const estimate = NOT_A_RESOURCE_SOURCE.test(String(model.source || "")); // geoml: #677; kriging-variance: #1026
  const codes = model.cells.some((c) => typeof c.support === "string") ? ` support = ${Object.entries(SUPPORT_CODES).map(([k, v]) => `${v} ${k}`).join(", ")}.` : "";
  return {
    element: {
      type: "volume", name: model.name, description: `Exported from GeoStrix ${new Date().toISOString().slice(0, 10)}${model.source ? ` (source: ${model.source})` : ""}${valueUnit(model) ? `; values in ${valueUnit(model)}` : ""}.${codes}${estimate ? ` ${NOT_A_RESOURCE}` : ""}`,
      origin: [t.x.min, t.y.min, t.z.min], tensor: { u: t.x.widths, v: t.y.widths, w: t.z.widths },
      data: [{ name: valueName, values: value }, ...(hasSupport ? [{ name: "support", values: support }] : []), ...(hasIndex ? [{ name: "support_index", values: sIndex }] : []), ...extra],
      color: [197, 176, 213],
    },
    shape: [t.nx, t.ny, t.nz],
  };
}

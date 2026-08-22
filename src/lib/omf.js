// TASKS.csv — Open Mining Format (OMF) import. User request: "let's build a tool to import OMF
// files. I can export that from geosoft software" — Geosoft's Oasis montaj (now under Seequent, the
// same company that originated OMF) can export .omf, as can Leapfrog and several other mine-planning
// packages, so this is a genuinely general interchange path, not a Geosoft-specific format the way
// .ply/.xyz/.gxf are.
//
// This parses OMF v1 (github.com/gmggroup/omf-python, format used since ~2017 and still what most
// real-world exporters — including Oasis montaj/Leapfrog as of this writing — actually produce).
// OMF v2 (a newer, alpha-stage ZIP-based container as of omf-python 2.0.0a0) is NOT implemented —
// parseOMF below detects it (a v2 file is a plain ZIP, "PK" magic) and reports a clear "not yet
// supported" error rather than a confusing parse failure or silent wrong result.
//
// v1 FILE STRUCTURE (reverse-engineered from omf-python's own compat/omf_v1.py reader — the reference
// implementation, not guessed from partial docs):
//   bytes 0-3    magic: 0x84 0x83 0x82 0x81
//   bytes 4-35   32-byte version string, prefix must be "OMF-v0.9.0"
//   bytes 36-51  16-byte project UUID (not needed for parsing beyond following the pointer)
//   bytes 52-59  8-byte little-endian uint64: byte offset where the trailing JSON blob starts
//   ...          binary array/image payloads, each zlib-compressed (RFC1950 "zlib" wrapper — the
//                same format the browser's native DecompressionStream('deflate') decodes), pointed to
//                by {start,length,dtype} objects inside the JSON below
//   [json_start..EOF]  UTF-8 JSON: a flat { uuid: object, ... } map. Every referenced object — the
//                project itself, every element, every geometry, every data/attribute, every array
//                descriptor — is looked up by UUID string out of this one map. Objects carry their own
//                "__class__" tag (e.g. "PointSetElement", "ScalarArray") since the map has no other
//                type information.
//
// Only what's actually useful for a geology 3D viewer is mapped out: PointSetElement, LineSetElement,
// and SurfaceElement (triangulated — SurfaceGridGeometry, a regular-grid surface with no triangulation,
// is rarer in practice for geological wireframes and is explicitly skipped with a reported reason
// rather than guessed at) become generic vector objects (see ViewerModule's omfObjects rendering).
// VolumeElement (a tensor-grid block model) is converted straight into the same {x,y,z,dx,dy,dz,value}
// cell shape the existing UBC-mesh/block-model-CSV importers already produce (see voxel.js), so it
// reuses that renderer rather than inventing a new one.

import { MAX_CELLS, planCoarsenFactors } from "./voxel.js";

const MAGIC = [0x84, 0x83, 0x82, 0x81];
const VERSION_PREFIX = "OMF-v0.9.0";
const NODATA_MAX = -1e10; // same convention voxel.js uses for UBC no-data sentinels

// numpy dtype string -> TypedArray constructor. OMF always writes little-endian ("<" prefix) on the
// platforms that produce real files; "|u1"/"|i1" (byte order irrelevant for 1-byte types) are also
// accepted since some writers use that form for byte arrays.
const DTYPE_CTORS = {
  "<f8": Float64Array, "<f4": Float32Array,
  "<i8": BigInt64Array, "<i4": Int32Array, "<i2": Int16Array, "<i1": Int8Array,
  "<u8": BigUint64Array, "<u4": Uint32Array, "<u2": Uint16Array, "<u1": Uint8Array,
  "|u1": Uint8Array, "|i1": Int8Array, "|b1": Uint8Array,
};

async function inflateZlib(bytes) {
  // Native browser API (available in any Electron/Chromium recent enough to run this app at all —
  // shipped since Chrome 80) — deliberately NOT adding pako or another npm dependency just for this,
  // consistent with this project's existing from-scratch shapefile/geosoft parsers.
  const ds = new DecompressionStream("deflate");
  const stream = new Blob([bytes]).stream().pipeThrough(ds);
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}

function readUint64LE(dv, offset) {
  const lo = dv.getUint32(offset, true);
  const hi = dv.getUint32(offset + 4, true);
  return hi * 2 ** 32 + lo; // file offsets are always well within Number.MAX_SAFE_INTEGER
}

class InvalidOMFFile extends Error {}

// ---------- low-level project-map helpers ----------

function get(project, uuid, what) {
  const v = project[uuid];
  if (v === undefined) throw new InvalidOMFFile(`Missing referenced object ${uuid}${what ? ` (${what})` : ""}.`);
  return v;
}
function attr(obj, key, required = true) {
  const v = obj?.[key];
  if (v === undefined && required) throw new InvalidOMFFile(`Missing attribute "${key}" on ${obj?.__class__ || "object"}.`);
  return v;
}

async function loadArray(fileBytes, project, arrayUuid) {
  const arrObj = get(project, arrayUuid, "array");
  const cls = attr(arrObj, "__class__");
  // Inline-JSON list arrays — no binary payload, the values are just sitting in the JSON already.
  if (cls === "StringArray" || cls === "DateTimeArray" || cls === "ColorArray") {
    return { values: attr(arrObj, "array"), numCols: cls === "ColorArray" ? 3 : 1 };
  }
  const shapeCols = { ScalarArray: 1, Int2Array: 2, Int3Array: 3, Vector2Array: 2, Vector3Array: 3 }[cls];
  if (shapeCols === undefined) throw new InvalidOMFFile(`Unsupported array class "${cls}".`);
  const base = attr(arrObj, "array");
  const start = attr(base, "start"), length = attr(base, "length"), dtype = attr(base, "dtype");
  const Ctor = DTYPE_CTORS[dtype];
  if (!Ctor) throw new InvalidOMFFile(`Unsupported array dtype "${dtype}".`);
  const compressed = fileBytes.subarray(start, start + length);
  const raw = await inflateZlib(compressed);
  // raw.byteOffset/length must align to the typed array's element size — copy into a fresh buffer
  // rather than viewing in place, since `raw` came out of DecompressionStream with no alignment
  // guarantee relative to the element width.
  const aligned = raw.slice().buffer;
  let typed = new Ctor(aligned);
  if (Ctor === BigInt64Array || Ctor === BigUint64Array) typed = Array.from(typed, (v) => Number(v));
  return { values: Array.from(typed), numCols: shapeCols };
}

// Reads a column (1 numCols) or vector (2/3 numCols) array and returns a flat plain-JS-number array
// (vectors stay flat, e.g. [x0,y0,z0,x1,y1,z1,...] — callers that need vectors index manually).
async function loadFlat(fileBytes, project, uuid) {
  const { values } = await loadArray(fileBytes, project, uuid);
  return values;
}

// ---------- attribute (data) conversion ----------

// User request: "Can we also import the colour legend" — a ScalarData object in the v1 JSON may carry
// an optional "colormap" uuid pointing to a ScalarColormap {gradient: <ColorArray uuid>, limits: [lo,hi]}.
// The gradient is a ColorArray — an inline (non-binary) JSON list of [r,g,b] triples spanning `limits`
// evenly — Geosoft/Oasis montaj and Leapfrog both write one when the source project had custom
// symbology applied. Converted here into {limits, gradient: [hex, hex, ...]} so GeophysicsModule can
// turn it straight into this app's own {value,color} "stops" list (see layers.js's colorForVoxelValue)
// without the renderer needing to know anything about OMF's own gradient representation.
async function convertColormap(fileBytes, project, colormapUuid) {
  const cm = get(project, colormapUuid, "colormap");
  if (attr(cm, "__class__") !== "ScalarColormap") return null;
  const limits = attr(cm, "limits", false) || null;
  const gradientUuid = attr(cm, "gradient", false);
  if (!gradientUuid) return { limits, gradient: null };
  const { values: rawColors } = await loadArray(fileBytes, project, gradientUuid);
  const gradient = (rawColors || []).map((c) => {
    if (!Array.isArray(c)) return "#5a9bd4";
    const [r, g, b] = c;
    const h = (v) => Math.max(0, Math.min(255, Math.round(v || 0))).toString(16).padStart(2, "0");
    return `#${h(r)}${h(g)}${h(b)}`;
  });
  return { limits, gradient: gradient.length ? gradient : null };
}

async function convertDataObject(fileBytes, project, dataUuid) {
  const d = get(project, dataUuid, "data");
  const cls = attr(d, "__class__");
  const name = attr(d, "name", false) || "";
  const location = attr(d, "location");
  const base = { name, location };

  if (cls === "ScalarData") {
    const values = await loadFlat(fileBytes, project, attr(d, "array"));
    const nums = values.filter((v) => typeof v === "number" && Number.isFinite(v));
    const colormapUuid = attr(d, "colormap", false);
    const colormap = colormapUuid ? await convertColormap(fileBytes, project, colormapUuid) : null;
    return [{ ...base, kind: "numeric", values, ...rangeOf(nums), colormap }];
  }
  if (cls === "ColorData" || cls === "Vector2Data" || cls === "Vector3Data") {
    // Vector-valued — not directly renderable as a single scalar; keep raw for completeness but don't
    // compute a numeric range (there isn't a single meaningful one).
    const values = await loadFlat(fileBytes, project, attr(d, "array"));
    return [{ ...base, kind: "vector", values }];
  }
  if (cls === "StringData" || cls === "DateTimeData") {
    const values = await loadFlat(fileBytes, project, attr(d, "array"));
    return [{ ...base, kind: "string", values }];
  }
  if (cls === "MappedData") {
    // V1's MappedData = an index array + a list of "Legend" uuids (each a column the index selects
    // into). Simplified here (matching omf-python's own v1->v2 compat note that this is "messy"): the
    // FIRST non-color legend becomes the resolved category label per row; a ColorArray-typed legend
    // (if present) becomes each category's color. Good enough for the common case (a single lithology/
    // rock-type legend, optionally with matching colors) without replicating v1's full multi-legend
    // ambiguity.
    const indexValues = await loadFlat(fileBytes, project, attr(d, "array"));
    const legendUuids = attr(d, "legends");
    let labelColumn = null, colorColumn = null, labelName = name;
    for (const legendUuid of legendUuids) {
      const legend = get(project, legendUuid, "legend");
      const valuesUuid = attr(legend, "values");
      const arrObj = get(project, valuesUuid, "legend values");
      const arrCls = attr(arrObj, "__class__");
      const { values: col } = await loadArray(fileBytes, project, valuesUuid);
      if (arrCls === "ColorArray" && !colorColumn) colorColumn = col;
      else if (!labelColumn) { labelColumn = col; labelName = attr(legend, "name", false) || name; }
    }
    const values = indexValues.map((idx) => (labelColumn && idx >= 0 && idx < labelColumn.length ? labelColumn[idx] : String(idx)));
    const colors = colorColumn ? indexValues.map((idx) => colorColumn[idx] || null) : null;
    return [{ ...base, name: labelName, kind: "category", values, colors }];
  }
  return []; // unrecognized data class — skip rather than fail the whole import over one attribute
}

function rangeOf(nums) {
  let min = Infinity, max = -Infinity;
  for (const v of nums) { if (v < min) min = v; if (v > max) max = v; }
  if (min === Infinity) return { min: 0, max: 0 };
  return { min, max };
}

async function convertDataList(fileBytes, project, dataUuids) {
  const out = [];
  for (const uuid of dataUuids || []) {
    const converted = await convertDataObject(fileBytes, project, uuid);
    out.push(...converted);
  }
  return out;
}

// ---------- element conversion ----------

async function convertPointSet(fileBytes, project, el) {
  const geomUuid = attr(el, "geometry");
  const geom = get(project, geomUuid, "geometry");
  if (attr(geom, "__class__") !== "PointSetGeometry") throw new InvalidOMFFile("PointSetElement geometry isn't PointSetGeometry.");
  const origin = attr(geom, "origin", false) || [0, 0, 0];
  const vertices = await loadFlat(fileBytes, project, attr(geom, "vertices"));
  const attributes = await convertDataList(fileBytes, project, attr(el, "data", false));
  return { kind: "points", origin, vertices, count: vertices.length / 3, attributes };
}

async function convertLineSet(fileBytes, project, el) {
  const geomUuid = attr(el, "geometry");
  const geom = get(project, geomUuid, "geometry");
  if (attr(geom, "__class__") !== "LineSetGeometry") throw new InvalidOMFFile("LineSetElement geometry isn't LineSetGeometry.");
  const origin = attr(geom, "origin", false) || [0, 0, 0];
  const vertices = await loadFlat(fileBytes, project, attr(geom, "vertices"));
  const segments = await loadFlat(fileBytes, project, attr(geom, "segments"));
  const attributes = await convertDataList(fileBytes, project, attr(el, "data", false));
  return { kind: "lines", origin, vertices, segments, attributes };
}

async function convertSurface(fileBytes, project, el) {
  const geomUuid = attr(el, "geometry");
  const geom = get(project, geomUuid, "geometry");
  const geomCls = attr(geom, "__class__");
  if (geomCls === "SurfaceGridGeometry") {
    return { kind: "skipped", reason: "grid-based surface (SurfaceGridGeometry) — not implemented, only triangulated surfaces are; the geometry itself doesn't carry per-node elevation the way a triangulated mesh's vertices do, and needs separate handling" };
  }
  if (geomCls !== "SurfaceGeometry") throw new InvalidOMFFile(`Unsupported surface geometry "${geomCls}".`);
  const origin = attr(geom, "origin", false) || [0, 0, 0];
  const vertices = await loadFlat(fileBytes, project, attr(geom, "vertices"));
  const triangles = await loadFlat(fileBytes, project, attr(geom, "triangles"));
  const attributes = await convertDataList(fileBytes, project, attr(el, "data", false));
  return { kind: "surface", origin, vertices, triangles, attributes };
}

async function convertVolume(fileBytes, project, el) {
  const geomUuid = attr(el, "geometry");
  const geom = get(project, geomUuid, "geometry");
  if (attr(geom, "__class__") !== "VolumeGridGeometry") throw new InvalidOMFFile("VolumeElement geometry isn't VolumeGridGeometry.");
  const origin = attr(geom, "origin", false) || [0, 0, 0];
  const tensor_u = attr(geom, "tensor_u"), tensor_v = attr(geom, "tensor_v"), tensor_w = attr(geom, "tensor_w");
  const axis_u = attr(geom, "axis_u", false) || [1, 0, 0];
  const axis_v = attr(geom, "axis_v", false) || [0, 1, 0];
  const axis_w = attr(geom, "axis_w", false) || [0, 0, 1];
  const attributes = await convertDataList(fileBytes, project, attr(el, "data", false));
  return { kind: "volume", origin, tensor_u, tensor_v, tensor_w, axis_u, axis_v, axis_w, attributes };
}

async function convertElement(fileBytes, project, elementUuid) {
  const el = get(project, elementUuid, "element");
  const cls = attr(el, "__class__");
  const name = attr(el, "name", false) || "unnamed";
  const description = attr(el, "description", false) || "";
  const color = attr(el, "color", false) || null;

  let converted;
  try {
    if (cls === "PointSetElement") converted = await convertPointSet(fileBytes, project, el);
    else if (cls === "LineSetElement") converted = await convertLineSet(fileBytes, project, el);
    else if (cls === "SurfaceElement") converted = await convertSurface(fileBytes, project, el);
    else if (cls === "VolumeElement") converted = await convertVolume(fileBytes, project, el);
    else return { name, description, kind: "skipped", reason: `unrecognized element class "${cls}"` };
  } catch (err) {
    return { name, description, kind: "skipped", reason: err.message };
  }
  return { name, description, color, ...converted };
}

// ---------- entry point ----------

// Converts an OMF VolumeElement (a tensor-grid block model) plus one of its own numeric cell
// attributes into the same {x,y,z (center),dx,dy,dz,value} cell shape voxel.js's UBC/CSV importers
// already produce, so it reuses the existing voxel renderer (addVoxelModel) rather than a new one.
// Cell ORDER: w (tensor_w) FASTEST, then v, then u slowest — i.e. plain C/row-major order for an
// array shaped (nu, nv, nw). This was originally implemented the other way around (u fastest, per a
// misreading of omf-python's own ravel_multi_index(order="F") convention) and shipped that way for a
// while — user report: "Our data doesn't look right... I guess GeoStrix must not be reading the omf
// right", comparing GeoStrix's render of a real Geosoft resistivity.omf (showed as flat horizontal
// stripes/bands with no coherent structure) against the same file re-opened in Geosoft Viewer (showed
// smooth, blob-shaped resistivity anomalies). Root-caused empirically rather than re-guessing at the
// spec: dumped the real file's raw flat attribute-value array, reshaped it under every plausible
// axis-order hypothesis, rendered a middle horizontal AND a middle vertical slice of each as a
// false-color image, and compared by eye against Geosoft Viewer's own render of the identical file.
// u-fastest (the old assumption) and v-fastest both produced the same kind of degenerate horizontal
// stripe pattern GeoStrix was showing Matt; only w-fastest reproduced Geosoft's smooth blob-shaped
// anomalies, in both slice orientations, conclusively. NOT the UBC importer's x-fastest/then-z/then-y
// convention either — these remain genuinely different formats with different real orderings, not the
// same thing reused. Cell CENTER position is exact regardless of grid orientation (full
// axis_u/axis_v/axis_w vector math). Cell SIZE (dx/dy/dz) assumes axis_u/v/w are the default identity
// axes ([1,0,0]/[0,1,0]/[0,0,1]) — true for the overwhelming majority of real exports — and is only an
// axis-aligned approximation for a genuinely rotated grid (rare in practice); the cell's real position
// is unaffected either way, only its rendered box size/orientation would be approximate for a rotated
// grid.
// User report (real Geosoft export, "resistivity.omf"): a 126x246x102 = 3,161,592-cell voxel model —
// over 12x MAX_CELLS — hit the exact same "hangs/crashes the 3D view" problem the UBC importer had
// before #158's coarsening fix, because this OMF volume path never got the same protection. Fixed the
// same way: planCoarsenFactors (reused as-is from voxel.js — it's generic on nx/ny/nz, not UBC-specific)
// picks per-axis merge factors, then coarsenOmfTensorGrid below block-averages the tensor grid down to
// budget BEFORE cell centers are computed, using the same w-fastest/then-v/then-u order as the main
// (un-coarsened) read below — see this file's header comment for how that order was verified against
// a real Geosoft export. NOT UBC's x-fastest/then-z/then-y order, these are genuinely different
// conventions. Coarse cell widths are the SUM of the fine widths they replace, so the coarse grid
// still covers the exact same real-world volume; a coarse cell with zero data-bearing fine cells
// underneath it is marked no-data via COARSEN_NODATA_SENTINEL rather than silently averaging one in.
const COARSEN_NODATA_SENTINEL = -1e30;

function coarsenOmfTensorGrid(tensor_u, tensor_v, tensor_w, values, fu, fv, fw) {
  const nu = tensor_u.length, nv = tensor_v.length, nw = tensor_w.length;
  if (fu <= 1 && fv <= 1 && fw <= 1) return { tensor_u, tensor_v, tensor_w, values };
  const cnu = Math.ceil(nu / fu), cnv = Math.ceil(nv / fv), cnw = Math.ceil(nw / fw);
  const groupWidths = (widths, f, cn) => {
    const out = [];
    for (let c = 0; c < cn; c++) {
      let sum = 0;
      for (let i = c * f; i < Math.min(widths.length, (c + 1) * f); i++) sum += widths[i];
      out.push(sum);
    }
    return out;
  };
  const ctu = groupWidths(tensor_u, fu, cnu), ctv = groupWidths(tensor_v, fv, cnv), ctw = groupWidths(tensor_w, fw, cnw);

  const cellCount = cnu * cnv * cnw;
  const sums = new Float64Array(cellCount);
  const counts = new Int32Array(cellCount);
  let idx = 0;
  // w fastest, then v, then u slowest — matches the main (un-coarsened) read below; the coarse flat
  // index this produces uses the identical w-fastest convention so omfVolumeToCells's own read loop
  // (unchanged either way — it just sees a smaller tensor grid) recovers the right value per cell.
  for (let i = 0; i < nu; i++) {
    const ci = Math.floor(i / fu);
    for (let j = 0; j < nv; j++) {
      const cj = Math.floor(j / fv);
      for (let k = 0; k < nw; k++) {
        const v = values[idx++];
        if (Number.isFinite(v) && v > NODATA_MAX) {
          const ck = Math.floor(k / fw);
          const cidx = ck + cj * cnw + ci * cnw * cnv;
          sums[cidx] += v;
          counts[cidx]++;
        }
      }
    }
  }
  const coarseValues = new Array(cellCount);
  for (let i = 0; i < cellCount; i++) coarseValues[i] = counts[i] ? sums[i] / counts[i] : COARSEN_NODATA_SENTINEL;

  return { tensor_u: ctu, tensor_v: ctv, tensor_w: ctw, values: coarseValues };
}

export function omfVolumeToCells(vol, attributeName = null, maxCells = MAX_CELLS) {
  const { origin, axis_u, axis_v, axis_w, attributes } = vol;
  let { tensor_u, tensor_v, tensor_w } = vol;
  const numericAttrs = (attributes || []).filter((a) => a.kind === "numeric");
  const attrObj = attributeName ? numericAttrs.find((a) => a.name === attributeName) : numericAttrs[0];
  if (!attrObj) return { cells: [], attrName: null, availableAttrs: numericAttrs.map((a) => a.name), coarsenNote: null };

  let values = attrObj.values;
  let coarsenNote = null;
  const rawTotal = tensor_u.length * tensor_v.length * tensor_w.length;
  if (rawTotal > maxCells) {
    const { fx: fu, fy: fv, fz: fw } = planCoarsenFactors(tensor_u.length, tensor_v.length, tensor_w.length, maxCells);
    const coarse = coarsenOmfTensorGrid(tensor_u, tensor_v, tensor_w, values, fu, fv, fw);
    tensor_u = coarse.tensor_u; tensor_v = coarse.tensor_v; tensor_w = coarse.tensor_w; values = coarse.values;
    const newTotal = tensor_u.length * tensor_v.length * tensor_w.length;
    coarsenNote = `Coarsened from ${rawTotal.toLocaleString()} to ${newTotal.toLocaleString()} cells (merged ${fu}×${fv}×${fw} blocks) to stay within GeoStrix's ${maxCells.toLocaleString()}-cell 3D view budget — values are block-averaged, total volume is unchanged.`;
  }

  const nu = tensor_u.length, nv = tensor_v.length, nw = tensor_w.length;
  const offsets = (tensor) => { const out = []; let c = 0; for (const w of tensor) { out.push(c + w / 2); c += w; } return out; };
  const uOff = offsets(tensor_u), vOff = offsets(tensor_v), wOff = offsets(tensor_w);

  const cells = [];
  let idx = 0;
  // w fastest, then v, then u slowest — see this file's header comment for how this was verified
  // against a real Geosoft export (the previous u-fastest assumption rendered as flat horizontal
  // stripes instead of the data's actual smooth anomaly shapes).
  for (let i = 0; i < nu; i++) {
    for (let j = 0; j < nv; j++) {
      for (let k = 0; k < nw; k++) {
        const v = values[idx++];
        if (Number.isFinite(v) && v > NODATA_MAX) {
          const x = origin[0] + axis_u[0] * uOff[i] + axis_v[0] * vOff[j] + axis_w[0] * wOff[k];
          const y = origin[1] + axis_u[1] * uOff[i] + axis_v[1] * vOff[j] + axis_w[1] * wOff[k];
          const z = origin[2] + axis_u[2] * uOff[i] + axis_v[2] * vOff[j] + axis_w[2] * wOff[k];
          cells.push({ x, y, z, dx: tensor_u[i], dy: tensor_v[j], dz: tensor_w[k], value: v });
        }
      }
    }
  }
  return { cells, attrName: attrObj.name, availableAttrs: numericAttrs.map((a) => a.name), coarsenNote, colormap: attrObj.colormap || null };
}

export async function parseOMF(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  if (bytes.length >= 2 && bytes[0] === 0x50 && bytes[1] === 0x4b) {
    throw new InvalidOMFFile("This is an OMF v2 file (ZIP-based container) — GeoStrix only supports OMF v1 so far (the format most exporters, including Oasis montaj/Leapfrog, still actually produce). Re-export as OMF v1 if your source tool offers a choice.");
  }
  if (bytes.length < 60 || !MAGIC.every((b, i) => bytes[i] === b)) {
    throw new InvalidOMFFile("Not a recognizable .omf file (missing OMF v1 magic bytes).");
  }
  const dv = new DataView(arrayBuffer);
  const versionBytes = bytes.subarray(4, 4 + VERSION_PREFIX.length);
  const versionStr = new TextDecoder("ascii").decode(versionBytes);
  if (versionStr !== VERSION_PREFIX) {
    throw new InvalidOMFFile(`Unsupported OMF version tag "${versionStr}" — expected "${VERSION_PREFIX}".`);
  }
  const jsonStart = readUint64LE(dv, 52);
  if (jsonStart >= bytes.length) throw new InvalidOMFFile("Corrupt file — JSON section start is past end of file.");
  const jsonText = new TextDecoder("utf-8").decode(bytes.subarray(jsonStart));
  let project;
  try { project = JSON.parse(jsonText); } catch (err) { throw new InvalidOMFFile(`Couldn't parse the project JSON section: ${err.message}`); }

  // The project's own top-level object is referenced by... itself not being pointed to by a fixed key
  // in v1 — the reader locates it by finding the one object whose __class__ is "Project". (omf-python's
  // reader instead threads the project_uuid read from the header's UUID bytes; re-deriving it from the
  // JSON directly here avoids needing exact byte-for-byte UUID-string formatting parity with Python's
  // uuid.UUID(bytes=...), which uses a different byte order convention than a naive hex dump would.)
  const projectUuid = Object.keys(project).find((k) => project[k]?.__class__ === "Project");
  if (!projectUuid) throw new InvalidOMFFile("No Project object found in the file's JSON section.");
  const projectObj = project[projectUuid];

  const elementUuids = attr(projectObj, "elements", false) || [];
  const elements = [];
  for (const uuid of elementUuids) {
    elements.push(await convertElement(bytes, project, uuid));
  }
  return {
    name: attr(projectObj, "name", false) || "OMF project",
    description: attr(projectObj, "description", false) || "",
    elements,
  };
}

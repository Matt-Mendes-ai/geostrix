// TASKS.csv #328 — a block model (SimPEG inversion result, or any regular grid) out to other software as
// one zip: UBC-GIF tensor mesh + model files (Oasis montaj / VOXI, UBC MeshTools3D, SimPEG / discretize,
// Leapfrog, Paraview via discretize), observed and predicted data as UBC .obs (SimPEG inversions only),
// one GeoTIFF per model level ("depth slices", for QGIS / ArcGIS) and a provenance.txt that says how the
// model was made. Loaded on demand (it pulls in the GeoTIFF writer).
//
// UBC conventions, checked against discretize's own write_UBC / SimPEG's write_mag3d_ubc and
// write_grav3d_ubc (not assumed): mesh line 2 is the TOP south-west corner; cell widths x west->east,
// y south->north, z top->bottom; model values z fastest from the TOP down, then x, then y; one value per
// line. Cells outside the model (air above the terrain, cells hidden by nothing) are written as -99999.
// Gravity .obs is positive over dense rock (UBC's sign; SimPEG flips it on read), as GeoStrix stores it.
import { writeArrayBuffer } from "geotiff";
import { buildZip } from "./shapefile.js";
import { b64ToF32 } from "./inversion.js";

export const UBC_NODATA = -99999;
const key = (v) => Math.round(v * 1000); // mm keys: cell centres from float32 storage are not bit-identical

// The tensor grid the cells sit on, or { error } when they are not one (an OcTree, a rotated or ragged model).
export function tensorFromCells(cells) {
  const axis = (c, w) => {
    const m = new Map();
    for (const cell of cells) { const k = key(cell[c]); if (!m.has(k)) m.set(k, { c: cell[c], w: cell[w] }); }
    const list = [...m.values()].sort((a, b) => a.c - b.c);
    for (let i = 1; i < list.length; i++) {
      const gap = (list[i].c - list[i].w / 2) - (list[i - 1].c + list[i - 1].w / 2);
      if (Math.abs(gap) > 0.01 * Math.min(list[i].w, list[i - 1].w)) return null;
    }
    const index = new Map(list.map((e, i) => [key(e.c), i]));
    return { centers: list.map((e) => e.c), widths: list.map((e) => e.w), index, min: list[0].c - list[0].w / 2, max: list[list.length - 1].c + list[list.length - 1].w / 2 };
  };
  if (!cells?.length) return { error: "The model has no cells." };
  const x = axis("x", "dx"), y = axis("y", "dy"), z = axis("z", "dz");
  if (!x || !y || !z) return { error: "The cells are not on one regular (tensor) grid — UBC and GeoTIFF slices need one. Export it as CSV instead." };
  return { x, y, z, nx: x.centers.length, ny: y.centers.length, nz: z.centers.length };
}

const fmt = (v) => (Number.isFinite(v) ? String(+v.toPrecision(7)) : String(UBC_NODATA));
const widthLine = (ws) => ws.map((w) => +w.toFixed(4)).join(" ");

// Values on the grid, grid[ix][iy][iz] flattened as ix + nx*(iy + ny*iz) (iz from the bottom).
function gridValues(cells, t, field) {
  const g = new Float64Array(t.nx * t.ny * t.nz).fill(NaN);
  for (const c of cells) {
    const ix = t.x.index.get(key(c.x)), iy = t.y.index.get(key(c.y)), iz = t.z.index.get(key(c.z));
    if (ix == null || iy == null || iz == null) continue;
    g[ix + t.nx * (iy + t.ny * iz)] = c[field];
  }
  return g;
}

export function ubcMeshText(t) {
  return [`${t.nx} ${t.ny} ${t.nz}`, `${+t.x.min.toFixed(4)} ${+t.y.min.toFixed(4)} ${+t.z.max.toFixed(4)}`,
    widthLine(t.x.widths), widthLine(t.y.widths), widthLine([...t.z.widths].reverse())].join("\n") + "\n";
}
export function ubcModelText(cells, t, field = "value") {
  const g = gridValues(cells, t, field);
  const out = [];
  for (let iy = 0; iy < t.ny; iy++) for (let ix = 0; ix < t.nx; ix++) for (let iz = t.nz - 1; iz >= 0; iz--) out.push(fmt(g[ix + t.nx * (iy + t.ny * iz)]));
  return out.join("\n") + "\n";
}

// stationData: compact { base:[x0,y0], x, y, z, observed, predicted, std } (base64 float32, x/y as offsets).
export function decodeStationData(sd) {
  if (!sd) return null;
  const col = (k) => (sd[k] ? Array.from(b64ToF32(sd[k])) : null);
  const x = col("x").map((v) => v + sd.base[0]), y = col("y").map((v) => v + sd.base[1]);
  return { x, y, z: col("z"), observed: col("observed"), predicted: col("predicted"), std: col("std") };
}
export function obsText(method, d, values, field) {
  const head = method === "mag"
    ? [`${field.inclination.toFixed(2)} ${field.declinationGrid.toFixed(2)} ${field.strengthNT.toFixed(2)}`, `${field.inclination.toFixed(2)} ${field.declinationGrid.toFixed(2)} 1`]
    : [];
  const rows = values.map((v, i) => `${d.x[i].toFixed(2)} ${d.y[i].toFixed(2)} ${d.z[i].toFixed(2)} ${fmt(v)} ${fmt(d.std[i])}`);
  return [...head, String(values.length), ...rows].join("\n") + "\n";
}

// One float32 GeoTIFF per model level; row 0 = north. Pixel = cell (PixelIsArea), so the grid needs
// equal widths in x and in y (true for SimPEG's core cells; refused otherwise, not resampled).
export function depthSliceTiffs(cells, t, epsg, field = "value") {
  const uniform = (ws) => ws.every((w) => Math.abs(w - ws[0]) < 1e-6 * ws[0]);
  if (!uniform(t.x.widths) || !uniform(t.y.widths)) return { error: "Depth slices need equal cell widths in x and in y." };
  const g = gridValues(cells, t, field);
  const px = t.x.widths[0], py = t.y.widths[0];
  const files = [];
  for (let iz = t.nz - 1; iz >= 0; iz--) {
    const band = new Float32Array(t.nx * t.ny);
    let any = false;
    for (let iy = 0; iy < t.ny; iy++) for (let ix = 0; ix < t.nx; ix++) {
      const v = g[ix + t.nx * (iy + t.ny * iz)];
      band[(t.ny - 1 - iy) * t.nx + ix] = Number.isFinite(v) ? v : UBC_NODATA;
      if (Number.isFinite(v)) any = true;
    }
    if (!any) continue;
    const zc = t.z.centers[iz];
    const buf = writeArrayBuffer(band, {
      width: t.nx, height: t.ny, ModelPixelScale: [px, py, 0], ModelTiepoint: [0, 0, 0, t.x.min, t.y.max, 0],
      GTModelTypeGeoKey: 1, GTRasterTypeGeoKey: 1, ProjectedCSTypeGeoKey: Number(epsg), GDAL_NODATA: String(UBC_NODATA),
    });
    files.push({ name: `z${zc < 0 ? "m" : ""}${String(Math.abs(Math.round(zc))).padStart(5, "0")}.tif`, data: new Uint8Array(buf), elevation: zc });
  }
  return { files, pixel: [px, py] };
}

export function provenanceText(model, t, files, epsg, notes) {
  const p = model.params || {};
  return [
    `GeoStrix model export — ${new Date().toISOString()}`,
    `Model: ${model.name}`,
    `Source: ${model.source || "import"}${model.property ? ` | property: ${model.property}` : ""}`,
    `CRS: EPSG:${epsg} (all coordinates, all files)`,
    `Grid: ${t.nx} x ${t.ny} x ${t.nz} cells, x ${t.x.min.toFixed(2)}-${t.x.max.toFixed(2)}, y ${t.y.min.toFixed(2)}-${t.y.max.toFixed(2)}, z ${t.z.min.toFixed(2)}-${t.z.max.toFixed(2)} m`,
    `Cells with no value (air above the terrain, outside the model) = ${UBC_NODATA} in every file.`,
    "",
    "Files:",
    ...files.map((f) => `  ${f}`),
    "",
    ...(notes || []),
    "",
    "How the model was made (as recorded when it was created):",
    JSON.stringify(p, null, 2),
    "",
    model.source === "simpeg" ? "A smooth inversion is ONE model that fits the data to the stated uncertainty, not the only one: amplitudes are underestimated and bodies smeared with depth. Not a geological boundary, not a volume, not a resource." : "",
  ].join("\n");
}

// Chunked base64 (String.fromCharCode.apply overflows the stack on large arrays in one call).
export function uint8ToBase64(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

// The whole package. Returns { zip: Uint8Array, files: [names], warnings } or { error }.
// TASKS.csv #411 — async since it now also writes the model as OMF v1 (CompressionStream).
export async function buildModelExportZip(model, epsg) {
  const cells = model.cells || [];
  const t = tensorFromCells(cells);
  if (t.error) return { error: t.error };
  const base = String(model.name || "model").replace(/[^\w\-]+/g, "_").replace(/_+/g, "_").slice(0, 60) || "model";
  const files = [];
  const enc = (s) => new TextEncoder().encode(s);
  files.push({ name: `${base}.msh`, data: enc(ubcMeshText(t)) });
  files.push({ name: `${base}.mod`, data: enc(ubcModelText(cells, t, "value")) });
  if (cells.some((c) => Number.isFinite(c.support))) files.push({ name: `${base}_support.mod`, data: enc(ubcModelText(cells, t, "support")) });
  const warnings = [];
  const notes = [];
  const d = decodeStationData(model.stationData);
  const f = model.params?.inducingField;
  if (d && model.method) {
    const okField = model.method === "grav" || (f && [f.inclination, f.declinationGrid, f.strengthNT].every(Number.isFinite));
    if (okField) {
      files.push({ name: `${base}_observed.obs`, data: enc(obsText(model.method, d, d.observed, f)) });
      files.push({ name: `${base}_predicted.obs`, data: enc(obsText(model.method, d, d.predicted, f)) });
      notes.push(`Data (.obs): the ${d.observed.length} stations the inversion used, with the uncertainty it used (column 5); observed = after the base-level removal recorded below.${model.method === "mag" ? " Header: field inclination, GRID declination, strength; then the anomaly projection (same, 1 = total-field anomaly)." : " Gravity sign: positive over dense rock (UBC's convention)."}`);
    } else warnings.push("No .obs files: the inducing field was not recorded with this model.");
  } else if (model.source === "simpeg") warnings.push("No .obs files: this model was made before GeoStrix kept its station data (re-run the inversion to get them).");
  // #411 — the same model as OMF v1 (one file Leapfrog / Datamine / Vulcan / Micromine open directly)
  const { writeOMF, volumeElementFromModel } = await import("./omfWriter.js");
  const ve = volumeElementFromModel(model);
  if (!ve.error) {
    files.push({ name: `${base}.omf`, data: await writeOMF({ name: model.name, description: `GeoStrix block model, EPSG:${epsg}`, elements: [ve.element] }) });
    notes.push("OMF (.omf): the same grid as one OMF v1 VolumeElement (value" + (ve.element.data.length > 1 ? " and support" : "") + " per cell; empty cells NaN) — opens in Leapfrog, Datamine, Vulcan, Micromine and Geosoft.");
  }
  const slices = depthSliceTiffs(cells, t, epsg);
  if (slices.error) warnings.push(`No depth slices: ${slices.error}`);
  else {
    slices.files.forEach((s) => files.push({ name: `depth_slices/${base}_${s.name}`, data: s.data }));
    notes.push(`Depth slices: one float32 GeoTIFF per model level (${slices.files.length}), named by the level's centre elevation (m; "m" prefix = below 0); pixel ${slices.pixel[0]} x ${slices.pixel[1]} m, same values as the .mod file.`);
  }
  const names = files.map((x) => x.name);
  files.push({ name: "provenance.txt", data: enc(provenanceText(model, t, [...names, "provenance.txt"], epsg, [...notes, ...warnings.map((w) => `Note: ${w}`)])) });
  return { zip: buildZip(files), files: files.map((x) => x.name), warnings, base };
}

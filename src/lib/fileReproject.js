// TASKS.csv #487 — Cartography > Reproject a file, for files that are not tables: a zipped shapefile (every
// layer in the zip) is read, every vertex moved from one CRS to another, and written back as a new zip with
// a .prj for the new CRS. Nothing is imported into the project. Heights (z) are unchanged, as everywhere in
// GeoStrix (no vertical datum model). Pure apart from the zip / DBF work in shapefile.js.
import { parseShapefileZip, shapefileZipFiles, buildZip } from "./shapefile.js";
import { guessEpsgFromPrjWkt, pointTransform, crsName } from "./reproject.js";

// zipBytes -> { layers: [{ name, epsg (from its .prj, or null), features, geomType }] }
export async function readShapefileLayers(zipBytes) {
  const first = await parseShapefileZip(zipBytes);
  const layers = [];
  for (const name of first.layerNames) {
    const p = name === first.layerName ? first : await parseShapefileZip(zipBytes, name);
    layers.push({ name, epsg: guessEpsgFromPrjWkt(p.prjWkt), hasPrj: !!p.prjWkt, features: p.features, geomType: p.geomType, skipped: p.skippedCount || 0 });
  }
  return { layers };
}

// fromEpsg: null = each layer's own .prj. Returns { bytes (the new zip), report: [{ name, from, features, vertices, failed }] }.
export async function reprojectShapefileZip(zipBytes, fromEpsg, toEpsg) {
  const { layers } = await readShapefileLayers(zipBytes);
  const files = [], report = [];
  for (const layer of layers) {
    const from = fromEpsg ? Number(fromEpsg) : layer.epsg;
    if (!from) throw new Error(`"${layer.name}" has ${layer.hasPrj ? "a .prj GeoStrix doesn't recognise" : "no .prj"} — choose its CRS under "From".`);
    const T = pointTransform(from, toEpsg);
    if (!T) throw new Error(`Can't convert from EPSG:${from} to EPSG:${toEpsg}.`);
    let vertices = 0, failed = 0;
    const move = (pt) => {
      const [x, y, z] = pt;
      if (!Number.isFinite(x) || !Number.isFinite(y)) { failed++; return pt; }
      const [nx, ny] = T(x, y);
      if (!Number.isFinite(nx) || !Number.isFinite(ny)) { failed++; return pt; }
      vertices++;
      return [nx, ny, z];
    };
    const features = layer.features.map((f) => {
      const parts = (f.parts?.length ? f.parts : [f.geometry]).map((part) => part.map(move));
      return { geometry: parts[0], parts, attributes: f.attributes };
    });
    files.push(...shapefileZipFiles({ features, geomType: layer.geomType, epsg: toEpsg, baseName: layer.name, keepFieldCase: true }));
    report.push({ name: layer.name, from, features: features.length, vertices, failed, skipped: layer.skipped });
  }
  return { bytes: buildZip(files), report };
}

export function reportShapefileText(report, toEpsg) {
  const lines = report.map((r) => `${r.name}: ${r.features.toLocaleString()} feature(s), ${r.vertices.toLocaleString()} vertices from ${crsName(r.from) || `EPSG:${r.from}`}`
    + (r.failed ? `; ${r.failed} vertices could not be converted and were kept as they were` : "")
    + (r.skipped ? `; ${r.skipped} feature(s) of a shape type GeoStrix doesn't read were left out` : ""));
  return `Saved ${report.length} layer(s) in ${crsName(toEpsg) || `EPSG:${toEpsg}`}, each with a new .prj and a UTF-8 .dbf. ${lines.join(". ")}.`;
}

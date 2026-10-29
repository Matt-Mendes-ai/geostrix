// TASKS.csv #854 — value grids out as GeoTIFF (Matt: "let's do A to D", D): single- or multi-band float32 in the project
// CRS with GDAL's no-data tag, so QGIS, ArcGIS or the EIS QGIS plugin read GeoStrix's grids directly. Same writer and
// geokeys as the terrain export (#203, raster.js) and the Sentinel-2 stack (#784, imageryFetch.js).
import { writeGeoTiff } from "./geotiffWrite.js"; // TASKS.csv #1038 — geotiff.js header, one loop for the pixels
import { b64ToF32 } from "./inversion.js";
import { saveFile, safeFileName } from "./desktop.js";
import { t as tr } from "./i18n.js"; // TASKS.csv #1095

export const GEOTIFF_NODATA = -9999;

// TASKS.csv #1095 (review #1016, geophysicist) — the raster value GeoTIFF wrote the grid GeoStrix keeps (block-averaged
// to GRID_MAX nodes on import, raster.js makeValueGrid) and dropped a filter's record, with no word of either. The
// export now says what the file holds. (GeoTIFF metadata tags are not written: the header writer has no room for them.)
export function rasterExportNote(r) {
  const g = r.grid || {};
  const f = r.filter, p = f?.params && Object.entries(f.params).filter(([, v]) => v != null && typeof v !== "object").map(([k, v]) => `${k} ${v}`).join(", ");
  return [
    tr("GeoTIFF of \"{name}\": {nx} × {ny} values at {dx} m, float32, no data {nodata}.", { name: r.name, nx: g.nx, ny: g.ny, dx: +Number(g.dx).toFixed(2), nodata: GEOTIFF_NODATA }),
    g.averagedBy > 1 && g.sourceSize ? tr("These are the values kept on import, block-averaged {f} × {f} from the {sx} × {sy} source grid: re-import the source file into QGIS for full resolution.", { f: g.averagedBy, sx: g.sourceSize[0], sy: g.sourceSize[1] }) : null,
    f ? tr("Made by {label} from \"{source}\"{params}.", { label: f.label || f.kind, source: f.sourceRaster || "?", params: p ? ` (${p})` : "" }) : null,
  ].filter(Boolean).join(" ");
}

// a grid's values as Float32Array, whether kept as base64 (#326 rasters), a typed array or a plain array
export function gridValues(v) {
  if (typeof v === "string") return b64ToF32(v);
  if (v instanceof Float32Array) return v;
  return Float32Array.from(v || []);
}

// nx, ny: cells; x0, yTop: the FIRST CELL'S CENTRE (row 0 = north); dx, dy: cell size (positive); bands: [{ values }]
// (non-finite -> nodata); epsg: the project CRS (projected). -> ArrayBuffer of a GeoTIFF
export function gridToGeoTIFF({ nx, ny, x0, yTop, dx, dy, bands, epsg, nodata = GEOTIFF_NODATA }) {
  const S = bands.length, n = nx * ny, data = new Float32Array(n * S);
  bands.forEach((b, k) => {
    const v = gridValues(b.values);
    if (v.length !== n) throw new Error(`band ${k + 1}: ${v.length} values for ${nx} x ${ny} cells`);
    for (let i = 0; i < n; i++) { const x = v[i]; data[i * S + k] = Number.isFinite(x) ? x : nodata; }
  });
  const metadata = {
    width: nx, height: ny, SamplesPerPixel: S, PlanarConfiguration: 1, BitsPerSample: Array(S).fill(32), SampleFormat: Array(S).fill(3),
    ModelPixelScale: [dx, dy, 0],
    ModelTiepoint: [0, 0, 0, x0 - dx / 2, yTop + dy / 2, 0], // pixel (0,0)'s outer corner: PixelIsArea, cell centres on the values
    GTModelTypeGeoKey: 1, GTRasterTypeGeoKey: 1,
    GDAL_NODATA: String(nodata),
  };
  if (Number.isFinite(Number(epsg))) metadata.ProjectedCSTypeGeoKey = Number(epsg);
  return writeGeoTiff(data, metadata);
}

// A node-based terrain-shaped grid ({ bbox, gridW, gridH }: nodes ON the bbox edges) -> the cell geometry above
export function nodeGridGeometry({ bbox, gridW, gridH }) {
  const [xmin, ymin, xmax, ymax] = bbox;
  return { nx: gridW, ny: gridH, x0: xmin, yTop: ymax, dx: (xmax - xmin) / Math.max(1, gridW - 1), dy: (ymax - ymin) / Math.max(1, gridH - 1) };
}

export function saveGeoTIFF(suggestedName, buf) {
  return saveFile({ suggestedName, filters: [{ name: "GeoTIFF", extensions: ["tif"] }], content: new Uint8Array(buf) /* #1040 bytes */ });
}
export { safeFileName }; // desktop.js since TASKS.csv #1114, beside saveFile

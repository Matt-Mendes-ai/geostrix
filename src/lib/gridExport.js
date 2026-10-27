// TASKS.csv #854 — value grids out as GeoTIFF (Matt: "let's do A to D", D): single- or multi-band float32 in the project
// CRS with GDAL's no-data tag, so QGIS, ArcGIS or the EIS QGIS plugin read GeoStrix's grids directly. Same writer and
// geokeys as the terrain export (#203, raster.js) and the Sentinel-2 stack (#784, imageryFetch.js).
import { writeGeoTiff } from "./geotiffWrite.js"; // TASKS.csv #1038 — geotiff.js header, one loop for the pixels
import { b64ToF32 } from "./inversion.js";
import { arrayBufferToBase64 } from "./raster.js";
import { saveFile } from "./desktop.js";

export const GEOTIFF_NODATA = -9999;

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
  return saveFile({ suggestedName, filters: [{ name: "GeoTIFF", extensions: ["tif"] }], content: arrayBufferToBase64(buf), encoding: "base64" });
}
export const safeFileName = (s) => String(s || "grid").replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60) || "grid";

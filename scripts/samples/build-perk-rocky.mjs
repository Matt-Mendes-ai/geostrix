// TASKS.csv #819 — builds sample_data/perk_rocky (the Perk-Rocky surface-mapping sample) from ARIS assessment report
// 42317's digital data. usage: node scripts/samples/build-perk-rocky.mjs "<path to the 42317Z folder>"
// Copies the report's MapInfo mapping layers as delivered (GeoStrix reads MapInfo TAB, #818) and adds a terrain over the
// mapped area from Copernicus DEM GLO-30 (fetched with GeoStrix's own reader, lib/copernicusDem.js), written as a
// Float32 GeoTIFF in NAD83 / UTM zone 10N.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeArrayBuffer } from "geotiff";
import proj4 from "proj4";
import { fetchCopernicusTerrain } from "../../src/lib/copernicusDem.js";
import { parseMapInfoTab } from "../../src/lib/mapinfoTab.js";

const src = process.argv[2];
if (!src) { console.error("usage: node scripts/samples/build-perk-rocky.mjs <42317Z folder>"); process.exit(1); }
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const out = path.join(repo, "sample_data", "perk_rocky");
fs.mkdirSync(out, { recursive: true });

export const LAYERS = ["PR-Litho_interpV3", "PR-Str_interp", "PR_Master_StLines_Sept03_2024", "PR_Master_StrPoint_Oct17_2024", "PR_Master_LithOut_Oct17_2024", "PR-Alt_interpV2"];
let box = [Infinity, Infinity, -Infinity, -Infinity];
for (const base of LAYERS) {
  for (const ext of ["TAB", "MAP", "ID", "DAT"]) fs.copyFileSync(path.join(src, "Mapping", `${base}.${ext}`), path.join(out, `${base}.${ext}`));
  const rd = (ext) => new Uint8Array(fs.readFileSync(path.join(out, `${base}.${ext}`)));
  const { layers } = parseMapInfoTab({ tab: rd("TAB"), map: rd("MAP"), id: rd("ID"), dat: rd("DAT"), name: base });
  for (const l of layers) for (const f of l.features) for (const part of f.parts) for (const [x, y] of part) box = [Math.min(box[0], x), Math.min(box[1], y), Math.max(box[2], x), Math.max(box[3], y)];
  console.log(base, layers.map((l) => `${l.features.length} ${l.geomType} EPSG:${l.epsg}`).join(", "));
}
const pad = 300;
const utm = "+proj=utm +zone=10 +datum=NAD83 +units=m +no_defs";
const corners = [[box[0] - pad, box[1] - pad], [box[2] + pad, box[1] - pad], [box[2] + pad, box[3] + pad], [box[0] - pad, box[3] + pad]].map(([x, y]) => proj4(utm, "EPSG:4326", [x, y]));
const lons = corners.map((c) => c[0]), lats = corners.map((c) => c[1]);
const t = await fetchCopernicusTerrain({ lonMin: Math.min(...lons), latMin: Math.min(...lats), lonMax: Math.max(...lons), latMax: Math.max(...lats), targetEpsg: 26910, gridMax: 320 });
const [x0, y0, x1, y1] = t.bbox, sx = (x1 - x0) / (t.gridW - 1), sy = (y1 - y0) / (t.gridH - 1);
// pixel-is-area GeoTIFF whose pixel centres are the terrain's nodes
const buf = writeArrayBuffer(Float32Array.from(t.elevations), {
  width: t.gridW, height: t.gridH, SamplesPerPixel: 1, BitsPerSample: [32], SampleFormat: [3],
  ModelPixelScale: [sx, sy, 0], ModelTiepoint: [0, 0, 0, x0 - sx / 2, y1 + sy / 2, 0], GTModelTypeGeoKey: 1, GTRasterTypeGeoKey: 1, ProjectedCSTypeGeoKey: 26910,
});
fs.writeFileSync(path.join(out, "terrain_copernicus_glo30.tif"), Buffer.from(buf));
console.log(`terrain ${t.gridW} x ${t.gridH}, ${Math.round(sx)} m, z ${Math.min(...t.elevations).toFixed(0)}-${Math.max(...t.elevations).toFixed(0)} m -> terrain_copernicus_glo30.tif`);

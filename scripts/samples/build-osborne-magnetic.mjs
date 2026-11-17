// TASKS.csv #2006 — builds sample_data/osborne/ (an airborne magnetic sample with no drillholes) from two open-licence records of Leonardo Uieda's
// "Fatiando a Terra Data" on Zenodo, both processed from Geoscience Australia's P1029 survey (MIM Data from Mt Isa Inlier, QLD, magnetic line data, AWAGS levelled):
//   - osborne-magnetic.csv.xz (10.5281/zenodo.5882209, CC BY 4.0): the survey's flight-line readings around the Osborne mine: flight line, longitude, latitude (WGS 84),
//     flight height, total-field anomaly (nT). 990,988 readings;
//   - lightning-creek-magnetic-grid.nc (10.5281/zenodo.7079711, CC BY 4.0): the Lightning Creek anomaly gridded at 50 m (UTM zone 54 south, WGS 84).
// What this script does, and nothing else: the readings are projected to UTM zone 54 south (EPSG:32754, the grid's own CRS) and every 40th reading of each flight line is
// kept (a sample, not the survey); the grid's packed 16-bit values are unpacked (value = packed x 0.1 - 1785.3 nT, the file's own scale and offset) and written as a
// float32 GeoTIFF. No value is altered or smoothed.
//
//   node scripts/samples/build-osborne-magnetic.mjs "<folder with osborne-magnetic.csv.xz and lightning-creek-magnetic-grid.nc>"
// (the .xz is read through Python's standard lzma module: python -I -c ...; nothing from the download is run)
import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { writeArrayBuffer } from "geotiff";
import h5 from "h5wasm/node";
import { reprojectXY } from "../../src/lib/reproject.js";

const src = process.argv[2];
const csvXz = src && path.join(src, "osborne-magnetic.csv.xz"), nc = src && path.join(src, "lightning-creek-magnetic-grid.nc");
if (!src || !existsSync(csvXz) || !existsSync(nc)) { console.error("usage: node scripts/samples/build-osborne-magnetic.mjs <folder with osborne-magnetic.csv.xz and lightning-creek-magnetic-grid.nc>"); process.exit(1); }
const out = path.resolve("sample_data/osborne");
mkdirSync(out, { recursive: true });
const EPSG = 32754, EVERY = 40;

// ---- the readings ----
const text = execFileSync("python", ["-I", "-c", "import lzma,sys;sys.stdout.buffer.write(lzma.open(sys.argv[1]).read())", csvXz], { maxBuffer: 1 << 30 }).toString("utf8");
const lines = text.split(/\r?\n/).filter(Boolean);
const head = lines[0].split(",");
if (head.join() !== "flight_line,longitude,latitude,height_orthometric_m,total_field_anomaly_nt") throw new Error(`unexpected header: ${head.join()}`);
const rows = ["flight_line,easting,northing,height_m,anomaly_nt"];
let k = 0, last = null, total = 0;
for (let i = 1; i < lines.length; i++) {
  const [line, lon, lat, h, nt] = lines[i].split(",");
  total++;
  if (line !== last) { last = line; k = 0; }
  if (k++ % EVERY) continue;
  const p = reprojectXY(Number(lon), Number(lat), 4326, EPSG);
  if (!p) continue;
  rows.push(`${line},${p.x.toFixed(1)},${p.y.toFixed(1)},${h},${nt}`);
}
writeFileSync(path.join(out, "osborne_magnetic.csv"), rows.join("\n") + "\n");
console.log(`osborne_magnetic.csv: ${rows.length - 1} of ${total} readings (every ${EVERY}th of each flight line), UTM 54S`);

// ---- the grid ----
await h5.ready;
const f = new h5.File(nc, "r");
const east = f.get("easting").value, north = f.get("northing").value, d = f.get("total_field_anomaly");
const scale = Number(d.attrs.scale_factor.value[0] ?? d.attrs.scale_factor.value), offset = Number(d.attrs.add_offset.value[0] ?? d.attrs.add_offset.value), fill = Number(d.attrs._FillValue.value[0] ?? d.attrs._FillValue.value);
const raw = d.value, W = east.length, H = north.length, step = east[1] - east[0];
if (raw.length !== W * H || Math.abs(north[1] - north[0] - step) > 1e-6) throw new Error("the grid is not as expected");
// the file runs south to north; a GeoTIFF row 0 is the north edge
const data = new Float32Array(W * H);
for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const v = raw[(H - 1 - j) * W + i]; data[j * W + i] = v === fill ? -99999 : Math.fround(v * scale + offset); }
const tiff = await writeArrayBuffer(data, {
  width: W, height: H, GTRasterTypeGeoKey: 1, GTModelTypeGeoKey: 1, ProjectedCSTypeGeoKey: EPSG, GeographicTypeGeoKey: 4326, ProjLinearUnitsGeoKey: 9001,
  ModelPixelScale: [step, step, 0], ModelTiepoint: [0, 0, 0, east[0] - step / 2, north[H - 1] + step / 2, 0], GDAL_NODATA: "-99999",
});
writeFileSync(path.join(out, "lightning_creek_magnetic_grid.tif"), Buffer.from(tiff));
let mn = Infinity, mx = -Infinity; for (const v of data) if (v > -99999) { if (v < mn) mn = v; if (v > mx) mx = v; }
console.log(`lightning_creek_magnetic_grid.tif: ${W} x ${H} nodes at ${step} m, ${mn.toFixed(1)} to ${mx.toFixed(1)} nT, ${tiff.byteLength.toLocaleString()} bytes`);
f.close();

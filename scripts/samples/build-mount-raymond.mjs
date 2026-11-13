// TASKS.csv #3107 — builds sample_data/mount_raymond (a surface-mapping sample with no drillholes) from the Geological Survey of
// Canada's Canadian Geoscience Map 71, second edition (2022): "Bedrock geology, Mount Raymond, Yukon, NTS 116-I/8", 1:50 000
// (https://doi.org/10.4095/329963, Open Government Licence - Canada), and a terrain cut from the federal Canadian Digital Elevation
// Model tile 116I (Natural Resources Canada, Open Government Licence - Canada).
//
//   node scripts/samples/build-mount-raymond.mjs "<the package's Data/SHP/Geology folder>" "<cdem_dem_116I.tif>"
//
// What it does, and nothing else:
//  - the map-unit polygons, contacts, faults and folds are copied as delivered (.shp / .shx / .prj / .cpg byte for byte); their .dbf
//    tables are rewritten with the descriptive columns only (the symbol, rule, reference and authority columns are left out);
//  - the 119 planar measurements (Planar.shp, points) become bedding.csv: station, easting, northing and the published attributes;
//  - the terrain is the CDEM's own elevations sampled (bilinear) at a 90 m grid in the map's CRS, NAD83 / UTM zone 8N.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fromFile, writeArrayBuffer } from "geotiff";
import proj4 from "proj4";

const [src, cdem] = process.argv.slice(2);
if (!src || !cdem || !fs.existsSync(src) || !fs.existsSync(cdem)) { console.error("usage: node scripts/samples/build-mount-raymond.mjs <Data/SHP/Geology folder> <cdem_dem_116I.tif>"); process.exit(1); }
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const out = path.join(repo, "sample_data", "mount_raymond");
fs.mkdirSync(out, { recursive: true });

// ---- DBF: read the fields and rows; write a new table with the chosen columns, each as wide as its longest value ----
function readDbf(file) {
  const b = fs.readFileSync(file), n = b.readUInt32LE(4), headLen = b.readUInt16LE(8), recLen = b.readUInt16LE(10);
  const fields = [];
  for (let o = 32; b[o] !== 0x0d; o += 32) fields.push({ name: b.subarray(o, o + 11).toString("latin1").replace(/\0.*$/, ""), type: String.fromCharCode(b[o + 11]), len: b[o + 16], dec: b[o + 17] });
  const rows = [];
  for (let i = 0; i < n; i++) {
    const r = b.subarray(headLen + i * recLen, headLen + (i + 1) * recLen), row = {};
    let p = 1;
    for (const f of fields) { row[f.name] = r.subarray(p, p + f.len).toString("utf8").trim(); p += f.len; }
    if (r[0] === 0x2a) throw new Error(`${file}: a deleted record (row ${i + 1})`);
    rows.push(row);
  }
  return { fields, rows };
}
const clean = (v) => (v === "<Null>" ? "" : v);
function writeDbf(file, names, rows) {
  const cols = names.map((name) => ({ name, len: Math.max(1, ...rows.map((r) => Buffer.byteLength(clean(r[name] ?? ""), "utf8"))) }));
  for (const c of cols) if (c.len > 254) throw new Error(`${c.name}: a value longer than 254 bytes`);
  const headLen = 32 + 32 * cols.length + 1, recLen = 1 + cols.reduce((a, c) => a + c.len, 0);
  const b = Buffer.alloc(headLen + recLen * rows.length + 1, 0x20);
  b.fill(0, 0, headLen);
  b[0] = 3; b[1] = 126; b[2] = 11; b[3] = 12; // dBase III, last update 2026-11-12
  b.writeUInt32LE(rows.length, 4); b.writeUInt16LE(headLen, 8); b.writeUInt16LE(recLen, 10);
  cols.forEach((c, i) => { const o = 32 + 32 * i; b.write(c.name, o, 11, "latin1"); b[o + 11] = 0x43; b[o + 16] = c.len; });
  b[headLen - 1] = 0x0d;
  rows.forEach((r, i) => { let p = headLen + i * recLen + 1; for (const c of cols) { b.write(clean(r[c.name] ?? ""), p, c.len, "utf8"); p += c.len; } });
  b[b.length - 1] = 0x1a;
  fs.writeFileSync(file, b);
}

// ---- the four map layers ----
const LAYERS = [
  { src: "MapUnits", dst: "map_units", keep: ["MAP_UNIT", "LABEL", "PARENTS", "MAX_AGE", "MIN_AGE", "LITH_LIST", "DESCRIPTIO", "GENESIS"] },
  { src: "Contacts", dst: "contacts", keep: ["SUBFEATURE", "CONFIDENCE", "REMARKS"] },
  { src: "Faults", dst: "faults", keep: ["SUBFEATURE", "CONFIDENCE", "NAME", "PROPERTIES", "MOVEMENT", "HWALL_DIR", "REMARKS"] },
  { src: "Folds", dst: "folds", keep: ["SUBFEATURE", "ATTITUDE", "CONFIDENCE", "NAME", "REMARKS", "ARROW_DIR"] },
];
let box = [Infinity, Infinity, -Infinity, -Infinity];
for (const L of LAYERS) {
  for (const ext of ["shp", "shx", "prj", "cpg"]) fs.copyFileSync(path.join(src, `${L.src}.${ext}`), path.join(out, `${L.dst}.${ext}`));
  const { fields, rows } = readDbf(path.join(src, `${L.src}.dbf`));
  const missing = L.keep.filter((k) => !fields.some((f) => f.name === k));
  if (missing.length) throw new Error(`${L.src}.dbf has no column ${missing.join(", ")}`);
  writeDbf(path.join(out, `${L.dst}.dbf`), L.keep, rows);
  const shp = fs.readFileSync(path.join(src, `${L.src}.shp`));
  box = [Math.min(box[0], shp.readDoubleLE(36)), Math.min(box[1], shp.readDoubleLE(44)), Math.max(box[2], shp.readDoubleLE(52)), Math.max(box[3], shp.readDoubleLE(60))];
  console.log(`${L.dst}: ${rows.length} features, ${L.keep.length} of ${fields.length} columns kept`);
}

// ---- the planar measurements -> bedding.csv ----
{
  const shp = fs.readFileSync(path.join(src, "Planar.shp"));
  if (shp.readInt32LE(32) !== 1) throw new Error("Planar.shp is not a point shapefile");
  const pts = [];
  for (let o = 100; o < shp.length; o += 28) pts.push([shp.readDoubleLE(o + 12), shp.readDoubleLE(o + 20)]);
  const { rows } = readDbf(path.join(src, "Planar.dbf"));
  if (rows.length !== pts.length) throw new Error(`Planar: ${pts.length} points but ${rows.length} rows`);
  const head = ["station", "measurement_id", "easting", "northing", "type", "dip_direction", "strike", "dip", "attitude", "younging", "method", "comment"];
  const q = (v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const lines = rows.map((r, i) => [r.STATION_ID, r.PLANAR_ID, pts[i][0].toFixed(1), pts[i][1].toFixed(1), r.SUBFEATURE, r.DIP_DIR, r.STRIKE, r.DIP, r.ATTITUDE, r.YOUNG_EVID, r.METHOD, r.REMARKS].map((v) => q(clean(String(v ?? "")))).join(","));
  fs.writeFileSync(path.join(out, "bedding.csv"), [head.join(","), ...lines].join("\n") + "\n");
  const types = {};
  rows.forEach((r) => { types[r.SUBFEATURE] = (types[r.SUBFEATURE] || 0) + 1; });
  console.log(`bedding.csv: ${rows.length} planar measurements`, types);
}

// ---- the terrain: the CDEM's elevations (NAD83(CSRS) longitude / latitude, CGVD28 heights) at a 90 m grid in NAD83 / UTM zone 8N ----
{
  const utm = "+proj=utm +zone=8 +datum=NAD83 +units=m +no_defs";
  const pad = 500, cell = 90;
  const x0 = Math.floor((box[0] - pad) / cell) * cell, y0 = Math.floor((box[1] - pad) / cell) * cell;
  const W = Math.ceil((box[2] + pad - x0) / cell) + 1, H = Math.ceil((box[3] + pad - y0) / cell) + 1;
  const tiff = await fromFile(cdem), img = await tiff.getImage();
  const [ox, oy] = img.getOrigin(), [rx, ry] = img.getResolution(); // oy = the north edge; ry's sign depends on how the file is georeferenced
  const nodata = Number(img.getGDALNoData());
  const corners = [[x0, y0], [x0 + (W - 1) * cell, y0], [x0, y0 + (H - 1) * cell], [x0 + (W - 1) * cell, y0 + (H - 1) * cell]].map((c) => proj4(utm, "EPSG:4326", c));
  const lon0 = Math.min(...corners.map((c) => c[0])) - 0.01, lon1 = Math.max(...corners.map((c) => c[0])) + 0.01, lat0 = Math.min(...corners.map((c) => c[1])) - 0.01, lat1 = Math.max(...corners.map((c) => c[1])) + 0.01;
  const c0 = Math.max(0, Math.floor((lon0 - ox) / rx)), c1 = Math.min(img.getWidth(), Math.ceil((lon1 - ox) / rx)), r0 = Math.max(0, Math.floor((oy - lat1) / Math.abs(ry))), r1 = Math.min(img.getHeight(), Math.ceil((oy - lat0) / Math.abs(ry)));
  const win = (await img.readRasters({ window: [c0, r0, c1, r1] }))[0], ww = c1 - c0, wh = r1 - r0;
  const at = (c, r) => { const v = win[Math.min(wh - 1, Math.max(0, r)) * ww + Math.min(ww - 1, Math.max(0, c))]; return v === nodata || !Number.isFinite(v) ? NaN : v; };
  const z = new Float32Array(W * H);
  let lo = Infinity, hi = -Infinity, holes = 0;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { // row 0 = north
    const [lon, lat] = proj4(utm, "EPSG:4326", [x0 + i * cell, y0 + (H - 1 - j) * cell]);
    const fc = (lon - ox) / rx - 0.5 - c0, fr = (oy - lat) / Math.abs(ry) - 0.5 - r0, ci = Math.floor(fc), ri = Math.floor(fr), tx = fc - ci, ty = fr - ri;
    const v = at(ci, ri) * (1 - tx) * (1 - ty) + at(ci + 1, ri) * tx * (1 - ty) + at(ci, ri + 1) * (1 - tx) * ty + at(ci + 1, ri + 1) * tx * ty;
    if (!Number.isFinite(v)) holes++;
    z[j * W + i] = Number.isFinite(v) ? v : -32767;
    if (Number.isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  }
  if (holes) throw new Error(`${holes} terrain nodes have no elevation`);
  const buf = writeArrayBuffer(z, { width: W, height: H, SamplesPerPixel: 1, BitsPerSample: [32], SampleFormat: [3],
    ModelPixelScale: [cell, cell, 0], ModelTiepoint: [0, 0, 0, x0 - cell / 2, y0 + (H - 1) * cell + cell / 2, 0], GTModelTypeGeoKey: 1, GTRasterTypeGeoKey: 1, ProjectedCSTypeGeoKey: 26908 });
  fs.writeFileSync(path.join(out, "terrain_cdem_90m.tif"), Buffer.from(buf));
  console.log(`terrain_cdem_90m.tif: ${W} x ${H} nodes at ${cell} m, ${lo.toFixed(0)}-${hi.toFixed(0)} m`);
}
for (const f of fs.readdirSync(out).sort()) console.log(`  ${f.padEnd(24)} ${fs.statSync(path.join(out, f)).size.toLocaleString()} bytes`);

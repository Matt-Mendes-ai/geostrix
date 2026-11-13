// TASKS.csv #3107 — builds sample_data/qc_rouyn_noranda/ from Quebec's SIGEOM (Ministère des Ressources naturelles et des Forêts,
// CC BY 4.0), cut to a 7 km block of the Rouyn-Noranda camp in the Abitibi (longitude -79.05 to -78.95, latitude 48.22 to 48.28),
// and a terrain from the federal Canadian Digital Elevation Model, tile 032D (Open Government Licence - Canada):
//   - the regional geology polygons that touch the block, and the outcrop structural measurements inside it;
//   - the diamond drillholes of the block whose location SIGEOM rates medium or high: collar, start and end azimuth and dip, depth.
// SIGEOM keeps no downhole assay table, and its service gives no log intervals: these holes are traces with a depth. Nothing is invented.
//
//   node scripts/samples/build-qc-rouyn-noranda.mjs "<folder with the service's GeoJSON answers>" "<cdem_dem_032D.tif>"
//
// The folder holds what Quebec's map service (IDS_SGM_WFS) returns for the block in EPSG:4326: Geologie_regionale.geojson,
// AG_Structures_planaires.geojson, AC_Structures_planaires.geojson and Forages_diamant.geojson.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import proj4 from "proj4";
import { fromFile, writeArrayBuffer } from "geotiff";
import { shapefileZipFiles, buildZip } from "../../src/lib/shapefile.js";

const [src, cdem] = process.argv.slice(2);
if (!src || !cdem || !existsSync(src) || !existsSync(cdem)) { console.error("usage: node scripts/samples/build-qc-rouyn-noranda.mjs <GeoJSON folder> <cdem_dem_032D.tif>"); process.exit(1); }
const out = path.resolve("sample_data/qc_rouyn_noranda");
mkdirSync(out, { recursive: true });
const EPSG = 26917, UTM = "+proj=utm +zone=17 +datum=NAD83 +units=m +no_defs"; // NAD83 / UTM zone 17N, the CRS of the Blake River gravity sample over the same ground
const toUtm = ([lon, lat]) => { const [x, y] = proj4("EPSG:4326", UTM, [lon, lat]); return [Math.round(x * 100) / 100, Math.round(y * 100) / 100]; };
const load = (n) => JSON.parse(readFileSync(path.join(src, n), "utf8")).features;
const txt = (v) => (v == null ? "" : String(v).replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim());
const csv = (name, head, rows) => { const q = (v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v); writeFileSync(path.join(out, name), [head.join(","), ...rows.map((r) => r.map((v) => q(String(v ?? ""))).join(","))].join("\n") + "\n"); console.log(`${name}: ${rows.length} rows`); };
const BOX = { lon0: -79.05, lon1: -78.95, lat0: 48.22, lat1: 48.28 };

// ---- geology: the regional polygons that touch the block, whole (not clipped), projected to UTM 17N ----
{
  const feats = [];
  let far = 0;
  for (const f of load("Geologie_regionale.geojson")) {
    const p = f.properties, g = f.geometry;
    const attributes = { UNIT: txt(p.DESC_ZONE_GEOLG), CODE: txt(p.NOM_ABRG_ETQT_LITH), STRAT: txt(p.STRATIGRAPHIE), AGE: txt(p.AGE) };
    // a unit's polygon is often a multipolygon whose pieces lie tens of km away: only the pieces within 1 km of the block are kept, each whole
    for (const rings of g.type === "Polygon" ? [g.coordinates] : g.coordinates) {
      const lons = rings[0].map((c) => c[0]), lats = rings[0].map((c) => c[1]);
      if (Math.max(...lons) < BOX.lon0 - 0.0135 || Math.min(...lons) > BOX.lon1 + 0.0135 || Math.max(...lats) < BOX.lat0 - 0.009 || Math.min(...lats) > BOX.lat1 + 0.009) { far++; continue; }
      const parts = rings.map((r) => r.map(toUtm)); feats.push({ geometry: parts[0], parts, attributes });
    }
  }
  console.log(`  ${far} polygon piece(s) farther than 1 km from the block left out`);
  const zip = buildZip(shapefileZipFiles({ features: feats, geomType: "polygon", epsg: EPSG, baseName: "geology", keepFieldCase: true, flat: true }));
  writeFileSync(path.join(out, "geology.zip"), zip);
  console.log(`geology.zip: ${feats.length} polygon parts, ${zip.length.toLocaleString()} bytes`);
}

// ---- structural measurements: strike and dip by the right-hand rule from true north (SIGEOM's documented convention). A dip of 99
// means undetermined in SIGEOM: those readings are left out and counted. ----
// The type is given in English beside SIGEOM's own French label (kept as type_sigeom), so GeoStrix classes it (bedding, cleavage ...).
const TYPES = { O: "bedding", Q: "cleavage", S: "schistosity", L: "mineral foliation", Y: "dyke", C: "shear", V: "vein", R: "minor fault", J: "joint", F: "fault", D: "compositional layering", W: "mylonitic foliation" };
{
  const rows = [];
  let unknown = 0;
  for (const [file, source] of [["AG_Structures_planaires.geojson", "outcrop (geofiche)"], ["AC_Structures_planaires.geojson", "outcrop (compilation)"]]) for (const f of load(file)) {
    const p = f.properties, dip = Number(p.PEND), strike = Number(p.AZMT);
    if (!Number.isFinite(dip) || dip === 99 || dip < 0 || dip > 90 || !Number.isFinite(strike)) { unknown++; continue; }
    const [x, y] = toUtm(f.geometry.coordinates);
    const code = txt(p.CODE_TYPE_STRU_PLAN);
    if (!(code in TYPES)) throw new Error(`structure type ${p.TYPE_STRU_PLAN}: add its English name`);
    rows.push([txt(p.NUMR_AFLR), x, y, TYPES[code], strike, dip, txt(p.TYPE_STRU_PLAN), source]);
  }
  csv("structures.csv", ["station", "easting", "northing", "type", "strike", "dip", "type_sigeom", "source"], rows);
  console.log(`  ${unknown} reading(s) with an undetermined dip left out`);
}

// ---- drillholes: location precision medium (2) or high (3), a depth and a known starting dip ----
const all = load("Forages_diamant.geojson");
const holes = all.map((f) => { const p = f.properties, [x, y] = toUtm(f.geometry.coordinates); return { id: `FD-${p.NUMR_INTER}`, x, y, lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1], length: Number(p.PROF_FIN_UNITE_LITH), year: Number(p.AN_FORG) || "", prec: Number(p.CODE_PREC_LOCL), az0: Number(p.AZMT_DEPR), az1: Number(p.AZMT_FIN), d0: Number(p.PLON_DEPR), d1: Number(p.PLON_FIN), number: txt(p.NUMR_ORGN_FORG) }; })
  .filter((h) => (h.prec === 2 || h.prec === 3) && h.length > 0 && Number.isFinite(h.d0) && h.d0 <= 0 && h.d0 >= -90 && Number.isFinite(h.az0) && h.az0 >= 0 && h.az0 <= 360
    && h.lon >= BOX.lon0 && h.lon <= BOX.lon1 && h.lat >= BOX.lat0 && h.lat <= BOX.lat1);
console.log(`holes: ${holes.length} of the block's ${all.length} kept (location precision medium or high, with a depth and a starting dip)`);

// ---- the terrain: CDEM elevations (NAD83(CSRS) longitude / latitude, CGVD28) at a 30 m grid in UTM 17N, 1 km around the block ----
const corners = [[BOX.lon0, BOX.lat0], [BOX.lon1, BOX.lat0], [BOX.lon0, BOX.lat1], [BOX.lon1, BOX.lat1]].map(toUtm);
const cell = 30, pad = 1000;
const x0 = Math.floor((Math.min(...corners.map((c) => c[0])) - pad) / cell) * cell, y0 = Math.floor((Math.min(...corners.map((c) => c[1])) - pad) / cell) * cell;
const W = Math.ceil((Math.max(...corners.map((c) => c[0])) + pad - x0) / cell) + 1, H = Math.ceil((Math.max(...corners.map((c) => c[1])) + pad - y0) / cell) + 1;
const img = await (await fromFile(cdem)).getImage();
const [ox, oy] = img.getOrigin(), [rx, ry0] = img.getResolution(), ry = Math.abs(ry0), nodata = Number(img.getGDALNoData());
const c0 = Math.max(0, Math.floor((BOX.lon0 - 0.05 - ox) / rx)), c1 = Math.min(img.getWidth(), Math.ceil((BOX.lon1 + 0.05 - ox) / rx)), r0 = Math.max(0, Math.floor((oy - (BOX.lat1 + 0.04)) / ry)), r1 = Math.min(img.getHeight(), Math.ceil((oy - (BOX.lat0 - 0.04)) / ry));
const win = (await img.readRasters({ window: [c0, r0, c1, r1] }))[0], ww = c1 - c0, wh = r1 - r0;
const at = (c, r) => { const v = win[Math.min(wh - 1, Math.max(0, r)) * ww + Math.min(ww - 1, Math.max(0, c))]; return v === nodata || !Number.isFinite(v) ? NaN : v; };
const ground = (x, y) => { const [lon, lat] = proj4(UTM, "EPSG:4326", [x, y]); const fc = (lon - ox) / rx - 0.5 - c0, fr = (oy - lat) / ry - 0.5 - r0, ci = Math.floor(fc), ri = Math.floor(fr), tx = fc - ci, ty = fr - ri;
  return at(ci, ri) * (1 - tx) * (1 - ty) + at(ci + 1, ri) * tx * (1 - ty) + at(ci, ri + 1) * (1 - tx) * ty + at(ci + 1, ri + 1) * tx * ty; };
{
  const z = new Float32Array(W * H);
  let lo = Infinity, hi = -Infinity;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const v = ground(x0 + i * cell, y0 + (H - 1 - j) * cell); if (!Number.isFinite(v)) throw new Error("a terrain node has no elevation"); z[j * W + i] = v; lo = Math.min(lo, v); hi = Math.max(hi, v); }
  const buf = writeArrayBuffer(z, { width: W, height: H, SamplesPerPixel: 1, BitsPerSample: [32], SampleFormat: [3], ModelPixelScale: [cell, cell, 0], ModelTiepoint: [0, 0, 0, x0 - cell / 2, y0 + (H - 1) * cell + cell / 2, 0], GTModelTypeGeoKey: 1, GTRasterTypeGeoKey: 1, ProjectedCSTypeGeoKey: EPSG });
  writeFileSync(path.join(out, "terrain_cdem_30m.tif"), Buffer.from(buf));
  console.log(`terrain_cdem_30m.tif: ${W} x ${H} nodes at ${cell} m, ${lo.toFixed(0)}-${hi.toFixed(0)} m`);
}

// collars: SIGEOM gives no collar elevation; z is the CDEM ground at the collar (said in the README). survey: SIGEOM's start and end
// azimuth and dip, the azimuths turned from true to grid north by the grid bearing of true north at the collar.
const northOnGrid = (x, y) => { const [lon, lat] = proj4(UTM, "EPSG:4326", [x, y]); const [x2, y2] = proj4("EPSG:4326", UTM, [lon, lat + 0.001]); return (Math.atan2(x2 - x, y2 - y) * 180) / Math.PI; };
const wrap = (a) => Math.round(((((a % 360) + 360) % 360)) * 100) / 100;
csv("collars.csv", ["hole_id", "x", "y", "z", "length", "hole_type", "year", "location_precision", "company_hole", "epsg"], holes.map((h) => [h.id, h.x, h.y, ground(h.x, h.y).toFixed(1), h.length, "DD", h.year, h.prec === 3 ? "high" : "medium", h.number, EPSG]));
const survey = [];
for (const h of holes) {
  const t = northOnGrid(h.x, h.y);
  survey.push([h.id, 0, wrap(h.az0 + t), h.d0]);
  if (Number.isFinite(h.d1) && h.d1 <= 0 && h.d1 >= -90 && Number.isFinite(h.az1) && h.az1 >= 0 && h.az1 <= 360) survey.push([h.id, h.length, wrap(h.az1 + t), h.d1]);
}
csv("survey.csv", ["hole_id", "depth", "azimuth", "dip"], survey);
console.log(`  true -> grid north at the collars: ${Math.min(...holes.map((h) => northOnGrid(h.x, h.y))).toFixed(2)} to ${Math.max(...holes.map((h) => northOnGrid(h.x, h.y))).toFixed(2)} degrees added`);

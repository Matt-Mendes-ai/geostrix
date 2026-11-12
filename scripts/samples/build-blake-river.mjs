// TASKS.csv #2829 — builds sample_data/blake_river (the Blake River gravity sample: no drillholes) from the Geological Survey of
// Canada's compilation "Blake River, QC — 100 m" as downloaded from Natural Resources Canada's geophysical data repository.
// usage: node scripts/samples/build-blake-river.mjs "<folder holding BR_bou_2009_geosoft.GRD>" "<folder holding BlakeRiverGravity.csv>"
//
// - The Bouguer anomaly grid is copied byte for byte (GeoStrix reads Geosoft .grd, #1347).
// - The stations file is a Geosoft export: eight "/" lines (one holds a server path), a 22-column header, 7,810 rows in longitude /
//   latitude (the header says WGS 84). Written here with eight columns, the coordinates projected to NAD83 / UTM zone 17N (the grid's
//   CRS) with GeoStrix's own reprojection. No measured value is changed: the other columns' text is copied as it is, except that the
//   station number and year lose their ".00".
// Nothing is synthesized. The README beside the files says the same, with the source and the licence.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { reprojectXY } from "../../src/lib/reproject.js";
import { parseTableText } from "../../src/lib/tabular.js";
import { decodeGrd } from "../../src/lib/grdFormats.js";
import zlib from "node:zlib";

const [gridDir, csvDir] = process.argv.slice(2);
if (!gridDir || !csvDir) { console.error("usage: node scripts/samples/build-blake-river.mjs <grid folder> <stations folder>"); process.exit(1); }
const out = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "sample_data", "blake_river");
fs.mkdirSync(out, { recursive: true });

// the grid, as delivered
const gridBytes = fs.readFileSync(path.join(gridDir, "BR_bou_2009_geosoft.GRD"));
fs.writeFileSync(path.join(out, "bouguer_100m.grd"), gridBytes);
const g = await decodeGrd(new Uint8Array(gridBytes), async (u8) => new Uint8Array(zlib.inflateSync(u8)));
console.log(`grid ${g.ncols} x ${g.nrows} nodes at ${g.dx} m, first node ${g.x0}, ${g.y0} -> bouguer_100m.grd (${gridBytes.length} bytes)`);

// the stations: the file's own text for every value, the position projected
const text = fs.readFileSync(path.join(csvDir, "BlakeRiverGravity.csv"), "utf8");
if (!/Projection:"WGS 84"/.test(text) || !/Unit:dega/.test(text)) throw new Error("The stations file no longer says WGS 84 degrees in its header: check it before building.");
const lines = text.split(/\r?\n/).filter((l) => l && !l.startsWith("/"));
const header = lines[0].split(",");
const col = (name) => { const i = header.indexOf(name); if (i < 0) throw new Error(`no ${name} column`); return i; };
const iX = col("X"), iY = col("Y"), iStation = col("STATION"), iYear = col("YEAR"), iElev = col("ELEVATION"), iObs = col("ADJG"), iFa = col("FREEAIR"), iBou = col("BOUGUER");
const rows = ["STATION,YEAR,EASTING,NORTHING,ELEVATION,OBSERVED_GRAVITY,FREEAIR,BOUGUER"];
const whole = (s) => s.replace(/\.0+$/, "");
for (const l of lines.slice(1)) {
  const c = l.split(",");
  const p = reprojectXY(Number(c[iX]), Number(c[iY]), 4326, 26917);
  if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) throw new Error(`could not project ${c[iX]}, ${c[iY]}`);
  rows.push([whole(c[iStation]), whole(c[iYear]), p.x.toFixed(2), p.y.toFixed(2), c[iElev], c[iObs], c[iFa], c[iBou]].join(","));
}
fs.writeFileSync(path.join(out, "stations.csv"), rows.join("\n") + "\n");
// the table reader must give back what was written
const back = parseTableText(fs.readFileSync(path.join(out, "stations.csv"), "utf8"));
if (back.rows.length !== lines.length - 1) throw new Error(`stations.csv reads back as ${back.rows.length} rows, ${lines.length - 1} written`);
console.log(`stations ${back.rows.length} rows, ${header.length} columns in, 8 out -> stations.csv (${fs.statSync(path.join(out, "stations.csv")).size} bytes)`);

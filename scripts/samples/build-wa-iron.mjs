// TASKS.csv #3107 — builds sample_data/wa_iron/ from one open-file report (A119232) of the Western Australian WAMEX mineral drillhole
// database (DEMIRS, CC BY 4.0) and a clip of Geoscience Australia's Total Magnetic Intensity Grid of Australia 2019, 80 m (CC BY 4.0).
// The report covers 6,390 holes on a flat-lying bedded iron deposit under cover in the east Pilbara; this sample is ONE BLOCK of it,
// 1.2 km by 0.8 km (MGA zone 50, E 796,348-797,548, N 7,514,298-7,515,098): every hole collared inside the block that has a surveyed
// elevation. Nothing is invented.
//
//   node scripts/samples/build-wa-iron.mjs "<the report's tables as CSV>" "<the magnetic clip, a GeoTIFF in GDA94 longitude / latitude>"
//
// The first folder is the WA drillhole review's per-report export with the database's total depth added (docs/ideas/
// wa-drillhole-database-review.md): collars.csv, survey.csv, geology.csv, assays.csv, downhole_logs.csv, company column names.
import { readFileSync, writeFileSync, mkdirSync, existsSync, createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import path from "node:path";
import Papa from "papaparse";
import proj4 from "proj4";
import { fromFile, writeArrayBuffer } from "geotiff";

const [src, tmi] = process.argv.slice(2);
if (!src || !existsSync(src) || !tmi || !existsSync(tmi)) { console.error("usage: node scripts/samples/build-wa-iron.mjs <csv folder> <tmi clip .tif>"); process.exit(1); }
const out = path.resolve("sample_data/wa_iron");
mkdirSync(out, { recursive: true });
const BOX = { x0: 796348, x1: 797548, y0: 7514298, y1: 7515098 };
const MGA50 = "+proj=utm +zone=50 +south +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs", LL = "+proj=longlat +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +no_defs";
const read = (p) => Papa.parse(readFileSync(path.join(src, p), "utf8").replace(/^﻿/, ""), { header: true, skipEmptyLines: true }).data;
const num = (v) => { const s = String(v ?? "").trim(); const n = Number(s); return s !== "" && Number.isFinite(n) ? n : null; };
const txt = (v) => String(v ?? "").trim();
const write = (name, header, rows) => {
  const body = rows.map((r) => header.map((h) => { const v = r[h]; if (v == null) return ""; const s = String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(","));
  writeFileSync(path.join(out, name), [header.join(","), ...body].join("\n") + "\n");
  console.log(`${name}: ${rows.length} rows`);
};
const round = (v, d) => (v == null ? null : Number(v.toFixed(d)));

// collars: GDA94 / MGA zone 50 (EPSG:28350) as reported; the company's surveyed elevation (AHD); the total depth the database keeps.
// A hole with no elevation is left out (one in this block).
const all = read("collars.csv").map((r) => ({ hole_id: txt(r.Hole_ID), x: num(r.Easting), y: num(r.Northing), z: num(r.Elevation), length: num(r.Total_Depth), hole_type: txt(r.DrillholeType), epsg: 28350 }))
  .filter((r) => r.hole_id && r.x >= BOX.x0 && r.x < BOX.x1 && r.y >= BOX.y0 && r.y < BOX.y1);
const collars = all.filter((r) => r.z != null && r.z !== 0 && r.length != null);
console.log(`holes in the block: ${all.length}; left out for no elevation: ${all.filter((r) => !collars.includes(r)).map((r) => r.hole_id).join(", ") || "none"}`);
write("collars.csv", ["hole_id", "x", "y", "z", "length", "hole_type", "epsg"], collars);
const holes = new Map(collars.map((c) => [c.hole_id, c]));

// survey: the source azimuths are from TRUE north (Azimuth_TRUE). GeoStrix's survey table is in grid north, so each is turned by the
// grid bearing of true north at its collar (about +1.1 degrees here, near the east edge of zone 50). Dips as reported (negative = down).
const northOnGrid = (x, y) => { const [lon, lat] = proj4(MGA50, LL, [x, y]); const [x2, y2] = proj4(LL, MGA50, [lon, lat + 0.001]); return (Math.atan2(x2 - x, y2 - y) * 180) / Math.PI; };
const turn = new Map(collars.map((c) => [c.hole_id, northOnGrid(c.x, c.y)]));
const survey = read("survey.csv").filter((r) => holes.has(txt(r.Hole_ID)))
  .map((r) => { const h = txt(r.Hole_ID), az = num(r.Azimuth_TRUE); return { hole_id: h, depth: num(r["Surveyed Depth"]), azimuth: az == null ? null : round((((az + turn.get(h)) % 360) + 360) % 360, 2), dip: num(r.Dip) }; })
  .filter((r) => r.depth != null && r.azimuth != null && r.dip != null);
write("survey.csv", ["hole_id", "depth", "azimuth", "dip"], survey);
console.log(`  true -> grid north: ${Math.min(...turn.values()).toFixed(3)} to ${Math.max(...turn.values()).toFixed(3)} degrees added`);

// lithology: the company's logged strand (the unit of the bedded sequence), one code per interval. Every row is PRIORITY 1 (the current log).
const geo = read("geology.csv").filter((r) => holes.has(txt(r.Hole_id)));
if (geo.some((r) => txt(r.PRIORITY) !== "1")) throw new Error("a geology row is not PRIORITY 1: decide which version to keep");
write("litho.csv", ["hole_id", "from", "to", "lithology"], geo.map((r) => ({ hole_id: txt(r.Hole_id), from: num(r["Depth From"]), to: num(r["Depth To"]), lithology: txt(r.Logged_Strand) }))
  .filter((r) => r.from != null && r.to != null && r.to > r.from && r.lithology));

// assays: XRF on RC chips and core, per cent, the oxides as the lab reports them. LOI is the total loss on ignition (LOITOTAL_XRF_pct).
// Left out: the rows with no results (sample type NS, and the first of a duplicate pair that has none), the trace columns and the sample weight.
const COLS = [["Fe_pct", "Fe_XRF_pct"], ["SiO2_pct", "SiO2_XRF_pct"], ["Al2O3_pct", "Al2O3_XRF_pct"], ["P_pct", "P_XRF_pct"], ["S_pct", "S_XRF_pct"], ["Mn_pct", "Mn_XRF_pct"], ["CaO_pct", "CaO_XRF_pct"], ["MgO_pct", "MgO_XRF_pct"],
  ["K2O_pct", "K2O_XRF_pct"], ["Na2O_pct", "Na2O_XRF_pct"], ["TiO2_pct", "TiO2_XRF_pct"], ["LOI_pct", "LOITOTAL_XRF_pct"]];
const assays = read("assays.csv").filter((r) => holes.has(txt(r.Hole_id)) && COLS.some(([, c]) => txt(r[c]) !== ""))
  .map((r) => { const o = { hole_id: txt(r.Hole_id), from: num(r["Depth From"]), to: num(r["Depth To"]), sample_id: txt(r["Sample ID"]) }; for (const [k, c] of COLS) o[k] = txt(r[c]); return o; })
  .filter((r) => r.from != null && r.to != null && r.to > r.from);
write("assays.csv", ["hole_id", "from", "to", "sample_id", ...COLS.map((c) => c[0])], assays);

// downhole logs: density, natural gamma and magnetic susceptibility, logged every 0.1 m; every 5th reading is kept (0.5 m). The
// database's no-data code (-999) is left blank. The source states no units (density reads as g/cm3 by its range).
{
  const rows = [], seen = new Map();
  let head = null, total = 0;
  for await (const line of createInterface({ input: createReadStream(path.join(src, "downhole_logs.csv"), "utf8") })) {
    const c = line.split(",");
    if (!head) { head = c.map((h) => h.replace(/^﻿/, "")); continue; }
    if (!holes.has(c[0])) continue;
    total++;
    if (c[head.indexOf("RUN")] !== "1") throw new Error("a repeat logging run in the block: decide which run to keep");
    const i = seen.get(c[0]) || 0; seen.set(c[0], i + 1);
    if (i % 5) continue;
    const v = (k) => { const n = num(c[head.indexOf(k)]); return n == null || n <= -99 ? "" : n; };
    rows.push({ hole_id: c[0], depth: num(c[head.indexOf("Depth From")]), density: v("Density_Best"), gamma: v("Gamma_Best"), susceptibility: v("Suscep_Best") });
  }
  write("logs.csv", ["hole_id", "depth", "density", "gamma", "susceptibility"], rows.filter((r) => r.depth != null && (r.density !== "" || r.gamma !== "" || r.susceptibility !== "")));
  console.log(`  of ${total} readings in ${seen.size} holes`);
}

// magnetics: the national grid is in GDA94 longitude / latitude (3 arc-seconds). It is resampled (bilinear) to an 80 m grid in MGA zone 50
// so that it sits in the project's coordinates with its values; 3 km around the block.
{
  const img = await (await fromFile(tmi)).getImage();
  const w = img.getWidth(), h = img.getHeight(), [ox, oy] = img.getOrigin(), [rx, ry] = img.getResolution();
  const data = (await img.readRasters())[0], nodata = Number(img.getGDALNoData());
  const at = (c, r) => { const v = data[Math.min(h - 1, Math.max(0, r)) * w + Math.min(w - 1, Math.max(0, c))]; return v === nodata || !Number.isFinite(v) ? NaN : v; };
  const cell = 80, pad = 3000, x0 = BOX.x0 - pad, y0 = BOX.y0 - pad, W = Math.round((BOX.x1 - BOX.x0 + 2 * pad) / cell) + 1, H = Math.round((BOX.y1 - BOX.y0 + 2 * pad) / cell) + 1;
  const g = new Float32Array(W * H);
  let lo = Infinity, hi = -Infinity;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { // row 0 = north
    const [lon, lat] = proj4(MGA50, LL, [x0 + i * cell, y0 + (H - 1 - j) * cell]);
    const fc = (lon - ox) / rx - 0.5, fr = (oy - lat) / Math.abs(ry) - 0.5, ci = Math.floor(fc), ri = Math.floor(fr), tx = fc - ci, ty = fr - ri;
    if (ci < 0 || ri < 0 || ci + 1 >= w || ri + 1 >= h) throw new Error("the magnetic clip does not cover the sample's grid");
    const v = at(ci, ri) * (1 - tx) * (1 - ty) + at(ci + 1, ri) * tx * (1 - ty) + at(ci, ri + 1) * (1 - tx) * ty + at(ci + 1, ri + 1) * tx * ty;
    if (!Number.isFinite(v)) throw new Error("a no-data cell in the magnetic clip");
    g[j * W + i] = v; lo = Math.min(lo, v); hi = Math.max(hi, v);
  }
  const buf = writeArrayBuffer(g, { width: W, height: H, SamplesPerPixel: 1, BitsPerSample: [32], SampleFormat: [3],
    ModelPixelScale: [cell, cell, 0], ModelTiepoint: [0, 0, 0, x0 - cell / 2, y0 + (H - 1) * cell + cell / 2, 0], GTModelTypeGeoKey: 1, GTRasterTypeGeoKey: 1, ProjectedCSTypeGeoKey: 28350 });
  writeFileSync(path.join(out, "tmi_80m.tif"), Buffer.from(buf));
  console.log(`tmi_80m.tif: ${W} x ${H} nodes at ${cell} m, ${lo.toFixed(1)} to ${hi.toFixed(1)} nT`);
}

// TASKS.csv #3107 — builds sample_data/qld_century/ from the Queensland Exploration Geochemistry and Drillhole Database, 2024 release
// (Geological Survey of Queensland, CC BY 4.0): the 37 holes of the 1992 drilling of the Century zinc-lead-silver deposit, in shale
// and siltstone of the Lawn Hill district of north-west Queensland (18.72 S, 138.6 E), with their surveys, coded lithology and assays, and the 730 soil
// samples of the same prospect; and a clip of Geoscience Australia's Total Magnetic Intensity Grid of Australia 2019, 80 m (CC BY 4.0).
// Nothing is invented.
//
//   node scripts/samples/build-qld-century.mjs "<the prospect's tables as CSV>" "<the magnetic clip, a GeoTIFF in GDA94 longitude / latitude>"
//
// The folder holds the rows of one prospect (code CRCT, sheet 6660) cut out of the database's CSV release with its own column names:
// h_Loc.csv, h_Survey.csv, h_Coded_Geology.csv, h_Sample.csv and s_Soil.csv. The database writes numbers as "$1800.00".
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import Papa from "papaparse";
import proj4 from "proj4";
import { fromFile, writeArrayBuffer } from "geotiff";
import { azimuthToGridOffset, loadIgrf } from "../../src/lib/azimuthRef.js";

const [src, tmi] = process.argv.slice(2);
if (!src || !existsSync(src) || !tmi || !existsSync(tmi)) { console.error("usage: node scripts/samples/build-qld-century.mjs <csv folder> <tmi clip .tif>"); process.exit(1); }
const out = path.resolve("sample_data/qld_century");
mkdirSync(out, { recursive: true });
const EPSG = 7854; // GDA2020 / MGA zone 54, the database's E_GDA2020z / N_GDA2020z
const read = (p) => Papa.parse(readFileSync(path.join(src, p), "utf8").replace(/^﻿/, ""), { header: true, skipEmptyLines: true }).data;
const txt = (v) => String(v ?? "").trim();
const numText = (v) => txt(v).replace(/\$/g, "").replace(/,/g, ""); // "$1800.00" -> "1800.00", "-$25.00" -> "-25.00"
const num = (v) => { const s = numText(v); const n = Number(s); return s !== "" && Number.isFinite(n) ? n : null; };
const tidy = (v) => { const n = num(v); return n == null ? "" : String(n); }; // 1800.00 -> 1800, -25.00 -> -25, 9.15 -> 9.15
const write = (name, header, rows) => {
  const body = rows.map((r) => header.map((h) => { const v = r[h]; if (v == null) return ""; const s = String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(","));
  writeFileSync(path.join(out, name), [header.join(","), ...body].join("\n") + "\n");
  console.log(`${name}: ${rows.length} rows`);
};

// collars: the database's GDA2020 zone 54 coordinates and regional RL (AHD). The database rates each location: 34 of these holes are
// good to 100 m only, 4 to 20 m; the rating is kept as a column. One hole has no RL and is left out.
const locAll = read("h_Loc.csv");
const collars = locAll.map((r) => ({ hole_id: txt(r.Hole_ID), x: num(r.E_GDA2020z), y: num(r.N_GDA2020z), z: num(r.RL_Regional), length: num(r.Final_Depth), hole_type: txt(r.Drilling_Type) === "REVC" ? "RC" : txt(r.Drilling_Type), location_accuracy_m: num(r.Location_Accuracy), epsg: EPSG }))
  .filter((r) => r.hole_id && r.x != null && r.y != null && r.z != null && r.length != null);
write("collars.csv", ["hole_id", "x", "y", "z", "length", "hole_type", "location_accuracy_m", "epsg"], collars);
console.log(`  left out for no RL: ${locAll.filter((r) => !collars.some((c) => c.hole_id === txt(r.Hole_ID))).map((r) => txt(r.Hole_ID)).join(", ") || "none"}`);
const holes = new Map(collars.map((c) => [c.hole_id, c]));

// survey: the database holds MAGNETIC azimuths only. They are turned to grid azimuths with the declination of the IGRF model at the
// prospect on 1992-09-30 (the middle of the reporting year of the source report) and the grid convergence: about +4.9 degrees.
await loadIgrf();
const off = new Map(collars.map((c) => [c.hole_id, azimuthToGridOffset("magnetic", c.x, c.y, EPSG, "1992-09-30").offset]));
const survey = read("h_Survey.csv").filter((r) => holes.has(txt(r.Hole_ID))).map((r) => { const h = txt(r.Hole_ID), az = num(r.Magnetic_Az); return { hole_id: h, depth: num(r.Depth_survey), azimuth: az == null ? null : Math.round(((((az + off.get(h)) % 360) + 360) % 360) * 100) / 100, dip: num(r.Dip) }; })
  .filter((r) => r.depth != null && r.azimuth != null && r.dip != null && r.depth <= holes.get(r.hole_id).length + 0.01);
write("survey.csv", ["hole_id", "depth", "azimuth", "dip"], survey);
console.log(`  magnetic -> grid: ${Math.min(...off.values()).toFixed(2)} to ${Math.max(...off.values()).toFixed(2)} degrees added`);

// lithology: the database's standard rock code (BLSH black shale, SLST siltstone ...), its first qualifier and the logged description.
const within = (r) => r.from != null && r.to != null && r.to > r.from;
write("litho.csv", ["hole_id", "from", "to", "lithology", "qualifier", "description"], read("h_Coded_Geology.csv").filter((r) => holes.has(txt(r.Hole_ID)))
  .map((r) => ({ hole_id: txt(r.Hole_ID), from: num(r.From_Depth), to: num(r.To_Depth), lithology: txt(r.Lith1), qualifier: txt(r.Desc11), description: txt(r.Lith_Desc) })).filter((r) => within(r) && r.lithology));

// assays: the routine samples (about 1 m). The source also holds two lab batches of composite samples over whole geological zones (154
// rows, the larger batch analysed for more elements): they overlap the routine samples and are left out, so no depth is counted twice.
// A composite batch is told by its sample lengths: a median above 3 m, against 0.7 to 1.5 m in the 22 routine batches. One row whose
// depths run backwards is left out. Units are the database's own (ppm; Fe in per cent); a negative number is its below-detection code.
// Gold is left out: of its 317 values 275 are a plain 0, which is neither a result nor a detection limit, and the highest is 0.06 ppm.
const EL = [["Zn_ppm", "Zn"], ["Pb_ppm", "Pb"], ["Ag_ppm", "Ag"], ["Cu_ppm", "Cu"], ["As_ppm", "As"], ["Cd_ppm", "Cd"], ["Co_ppm", "Co"], ["Mn_ppm", "Mn"], ["Mo_ppm", "Mo"], ["Fe_pct", "Fe"]];
const rawA = read("h_Sample.csv").filter((r) => holes.has(txt(r.Hole_ID)));
const batchLen = new Map();
for (const r of rawA) { const f = num(r.From_Depth), t = num(r.To_Depth); if (f != null && t != null && t > f) batchLen.set(txt(r.Job_No), [...(batchLen.get(txt(r.Job_No)) || []), t - f]); }
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };
const composite = new Set([...batchLen].filter(([, l]) => median(l) > 3).map(([j]) => j));
const routine = rawA.filter((r) => !composite.has(txt(r.Job_No))).map((r) => { const o = { hole_id: txt(r.Hole_ID), from: num(r.From_Depth), to: num(r.To_Depth), sample_id: txt(r.Sample) }; for (const [k, c] of EL) o[k] = tidy(r[c]); return o; });
const assays = routine.filter((r) => within(r) && EL.some(([k]) => r[k] !== "")).sort((a, b) => a.hole_id.localeCompare(b.hole_id) || a.from - b.from);
for (let i = 1; i < assays.length; i++) if (assays[i].hole_id === assays[i - 1].hole_id && assays[i].from < assays[i - 1].to - 1e-6) throw new Error(`routine samples overlap: ${assays[i].hole_id} ${assays[i - 1].from}-${assays[i - 1].to} and ${assays[i].from}-${assays[i].to}`);
write("assays.csv", ["hole_id", "from", "to", "sample_id", ...EL.map((e) => e[0])], assays);
console.log(`  of ${rawA.length} rows: ${rawA.length - routine.length} zone composites in ${composite.size} of ${batchLen.size} lab batches and ${routine.length - assays.length} with depths running backwards or no result left out`);

// soils: 730 samples (543 of the -40 mesh fraction), GDA2020 zone 54, no elevation in the source
const SEL = [["Zn_ppm", "Zn"], ["Pb_ppm", "Pb"], ["Cu_ppm", "Cu"], ["Mn_ppm", "Mn"], ["Fe_pct", "Fe"], ["Ag_ppm", "Ag"], ["As_ppm", "As"], ["Cd_ppm", "Cd"], ["Co_ppm", "Co"], ["Ni_ppm", "Ni"], ["Mo_ppm", "Mo"], ["Cr_ppm", "Cr"], ["V_ppm", "V"], ["Sb_ppm", "Sb"]];
const soils = read("s_Soil.csv").map((r) => { const o = { sample_id: txt(r.Sample), x: num(r.E_GDA2020z), y: num(r.N_GDA2020z), z: "", medium: "soil", mesh: txt(r.Mesh) }; for (const [k, c] of SEL) o[k] = tidy(r[c]); return o; }).filter((r) => r.x != null && r.y != null);
if (new Set(soils.map((r) => r.sample_id)).size !== soils.length) throw new Error("a soil sample id is repeated");
write("soils.csv", ["sample_id", "x", "y", "z", "medium", "mesh", ...SEL.map((e) => e[0])], soils);

// magnetics: the national grid (GDA94 longitude / latitude, 3 arc-seconds) resampled (bilinear) to an 80 m grid in MGA zone 54, 3 km
// around the holes. GDA94 and GDA2020 positions differ by under 2 m here, far less than a cell; the grid is placed as it is.
{
  const MGA = "+proj=utm +zone=54 +south +ellps=GRS80 +units=m +no_defs", LL = "+proj=longlat +ellps=GRS80 +no_defs";
  const img = await (await fromFile(tmi)).getImage();
  const w = img.getWidth(), h = img.getHeight(), [ox, oy] = img.getOrigin(), [rx, ry0] = img.getResolution(), ry = Math.abs(ry0);
  const data = (await img.readRasters())[0], nodata = Number(img.getGDALNoData());
  const at = (c, r) => { const v = data[Math.min(h - 1, Math.max(0, r)) * w + Math.min(w - 1, Math.max(0, c))]; return v === nodata || !Number.isFinite(v) ? NaN : v; };
  const xs = collars.map((c) => c.x), ys = collars.map((c) => c.y), cell = 80, pad = 3000;
  const x0 = Math.floor((Math.min(...xs) - pad) / cell) * cell, y0 = Math.floor((Math.min(...ys) - pad) / cell) * cell, W = Math.ceil((Math.max(...xs) + pad - x0) / cell) + 1, H = Math.ceil((Math.max(...ys) + pad - y0) / cell) + 1;
  const g = new Float32Array(W * H);
  let lo = Infinity, hi = -Infinity;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const [lon, lat] = proj4(MGA, LL, [x0 + i * cell, y0 + (H - 1 - j) * cell]);
    const fc = (lon - ox) / rx - 0.5, fr = (oy - lat) / ry - 0.5, ci = Math.floor(fc), ri = Math.floor(fr), tx = fc - ci, ty = fr - ri;
    if (ci < 0 || ri < 0 || ci + 1 >= w || ri + 1 >= h) throw new Error("the magnetic clip does not cover the sample's grid");
    const v = at(ci, ri) * (1 - tx) * (1 - ty) + at(ci + 1, ri) * tx * (1 - ty) + at(ci, ri + 1) * (1 - tx) * ty + at(ci + 1, ri + 1) * tx * ty;
    if (!Number.isFinite(v)) throw new Error("a no-data cell in the magnetic clip");
    g[j * W + i] = v; lo = Math.min(lo, v); hi = Math.max(hi, v);
  }
  const buf = writeArrayBuffer(g, { width: W, height: H, SamplesPerPixel: 1, BitsPerSample: [32], SampleFormat: [3], ModelPixelScale: [cell, cell, 0], ModelTiepoint: [0, 0, 0, x0 - cell / 2, y0 + (H - 1) * cell + cell / 2, 0], GTModelTypeGeoKey: 1, GTRasterTypeGeoKey: 1, ProjectedCSTypeGeoKey: EPSG });
  writeFileSync(path.join(out, "tmi_80m.tif"), Buffer.from(buf));
  console.log(`tmi_80m.tif: ${W} x ${H} nodes at ${cell} m, ${lo.toFixed(1)} to ${hi.toFixed(1)} nT`);
}

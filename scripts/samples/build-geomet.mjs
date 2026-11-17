// TASKS.csv #2006 — builds sample_data/geomet/ (drillholes with multi-element assays, no CRS) from the GeoMet dataset's drillholes.csv
// (Zenodo 10.5281/zenodo.7051975, CC BY 4.0; J. Hoffimann, J. Augusto, L. Resende, M. Mathias, D. Mazzinghy, M. Bianchetti, M. Mendes, T. Souza, V. Andrade,
// T. Domingues, W. Silva, R. Silva, D. Couto, E. Fonseca and K. Goncalves: IMPA, UFMG and Vale S.A.). The file is not a set of drillhole tables: it is one row per SAMPLE, with the
// sample's position in 3D (X, Y, Z in a local mine grid, metres) and its analyses (ppm). The three tables GeoStrix reads are DERIVED from those positions, and the README says so:
//   collars.csv   the hole's first sample (the highest) is its collar; azimuth and dip are those of the first segment (dip negative down)
//   survey.csv    one station per sample: the depth along the hole (the 3D distance from the collar, summed segment by segment), azimuth and dip of the segment that ends there (the first station
//                 takes the first segment's)
//   assays.csv    one interval per sample, from the midpoint with the sample above to the midpoint with the sample below (the first from 0, the last to the hole's length); the analyses as
//                 delivered ('Ag ppm' -> Ag_ppm), nothing rounded, scaled or removed
// A hole with a single sample has no direction and is left out (counted below). The hole numbers are the file's own.
//
//   node scripts/samples/build-geomet.mjs "<folder with drillholes.csv>"
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import Papa from "papaparse";

const src = process.argv[2], file = src && path.join(src, "drillholes.csv");
if (!file || !existsSync(file)) { console.error("usage: node scripts/samples/build-geomet.mjs <folder with drillholes.csv>"); process.exit(1); }
const out = path.resolve("sample_data/geomet");
mkdirSync(out, { recursive: true });
const { data, meta } = Papa.parse(readFileSync(file, "utf8"), { header: true, skipEmptyLines: true });
const elements = meta.fields.filter((f) => /\sppm$/.test(f));
if (elements.length !== 18) throw new Error(`expected 18 'X ppm' columns, found ${elements.length}`);
const by = new Map();
for (const r of data) { if (!by.has(r.HOLEID)) by.set(r.HOLEID, []); by.get(r.HOLEID).push(r); }
const num = (v) => Number(v), r2 = (v) => Math.round(v * 100) / 100;
const dir = (a, b) => { const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, h = Math.hypot(dx, dy); return { az: ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360, dip: (Math.atan2(dz, h) * 180) / Math.PI }; }; // dz < 0 going down: dip negative down

const collars = ["hole_id,x,y,z,azimuth,dip,length"], survey = ["hole_id,depth,azimuth,dip"], assays = ["hole_id,from,to,sample_id," + elements.map((e) => e.replace(/\s+/, "_")).join(",")];
let left = 0, kept = 0, samples = 0;
for (const [id, rows] of by) {
  if (rows.length < 2) { left++; continue; }
  const P = rows.map((r) => ({ x: num(r.X), y: num(r.Y), z: num(r.Z) }));
  const depth = [0];
  for (let i = 1; i < P.length; i++) depth.push(depth[i - 1] + Math.hypot(P[i].x - P[i - 1].x, P[i].y - P[i - 1].y, P[i].z - P[i - 1].z));
  const first = dir(P[0], P[1]);
  collars.push([id, r2(P[0].x), r2(P[0].y), r2(P[0].z), r2(first.az), r2(first.dip), r2(depth[depth.length - 1])].join(","));
  for (let i = 0; i < P.length; i++) { const d = i === 0 ? first : dir(P[i - 1], P[i]); survey.push([id, r2(depth[i]), r2(d.az), r2(d.dip)].join(",")); }
  for (let i = 0; i < P.length; i++) {
    const from = i === 0 ? 0 : (depth[i - 1] + depth[i]) / 2, to = i === P.length - 1 ? depth[i] : (depth[i] + depth[i + 1]) / 2;
    assays.push([id, r2(from), r2(to), `${id}-${i + 1}`, ...elements.map((e) => rows[i][e])].join(","));
    samples++;
  }
  kept++;
}
writeFileSync(path.join(out, "collars.csv"), collars.join("\n") + "\n");
writeFileSync(path.join(out, "survey.csv"), survey.join("\n") + "\n");
writeFileSync(path.join(out, "assays.csv"), assays.join("\n") + "\n");
console.log(`${kept} holes, ${samples} samples (${left} one-sample hole(s) left out); ${elements.length} elements: ${elements.map((e) => e.split(" ")[0]).join(" ")}`);

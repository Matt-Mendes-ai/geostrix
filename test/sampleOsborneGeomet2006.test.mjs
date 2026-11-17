// TASKS.csv #2006 — the data of two openly licensed samples, before they are offered: the Osborne mine airborne magnetics (Geoscience Australia P1029 as processed by L. Uieda, CC BY 4.0:
// a point survey and a 50 m grid) and the GeoMet drillholes (CC BY 4.0, a local grid: collars, survey and intervals DERIVED from the sample positions, the README says so).
import test from "node:test";
import assert from "node:assert/strict";
import { fromArrayBuffer } from "geotiff";
import { read, table, folderBytes, checkIntervals } from "./sampleChecks3107.mjs";
import { bundledData } from "../scripts/third-party-licenses.mjs";

const text = (dir, n) => read(dir, n).toString("utf8");

test("#2006 Osborne: the readings and the grid are small, finite and in the grid's CRS area; the credit lines are the owners' words", async () => {
  const dir = "osborne_magnetic";
  assert.ok(folderBytes(dir) < 1.6e6, String(folderBytes(dir)));
  const R = table(dir, "osborne_magnetic.csv");
  assert.equal(R.length, 24927); assert.equal(new Set(R.map((r) => r.flight_line)).size, 307);
  for (const r of R) assert.ok(Number.isFinite(Number(r.easting)) && Number.isFinite(Number(r.northing)) && Number.isFinite(Number(r.anomaly_nt)) && Number(r.height_m) > 200 && Number(r.height_m) < 600, JSON.stringify(r));
  const xs = R.map((r) => Number(r.easting)), ys = R.map((r) => Number(r.northing));
  assert.ok(Math.min(...xs) > 440000 && Math.max(...xs) < 490000 && Math.min(...ys) > 7540000 && Math.max(...ys) < 7600000); // UTM 54S, Mt Isa Inlier
  const b = read(dir, "lightning_creek_magnetic_grid.tif");
  const img = await (await fromArrayBuffer(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength))).getImage();
  assert.deepEqual([img.getWidth(), img.getHeight()], [346, 370]);
  const [x0, y0, x1, y1] = img.getBoundingBox();
  assert.ok(Math.abs(x0 - 465508.3) < 1 && Math.abs(x1 - 482808.3) < 1 && Math.abs(y0 - 7576343.8) < 1 && Math.abs(y1 - 7594843.8) < 1, [x0, y0, x1, y1].join());
  assert.equal(img.getGeoKeys().ProjectedCSTypeGeoKey, 32754);
  const v = (await img.readRasters())[0]; let lo = Infinity, hi = -Infinity;
  for (const x of v) { assert.ok(Number.isFinite(x) && x > -99999); if (x < lo) lo = x; if (x > hi) hi = x; }
  assert.ok(Math.abs(lo - -1785.3) < 0.2 && Math.abs(hi - 3798.1) < 0.2, `${lo} ${hi}`);
  const readme = text(dir, "README.md");
  assert.match(readme, /Contains data \(c\) Commonwealth of Australia \(Geoscience Australia\)/);
  assert.match(readme, /https:\/\/doi\.org\/10\.5281\/zenodo\.5882209/); assert.match(readme, /https:\/\/doi\.org\/10\.5281\/zenodo\.7079711/);
  assert.match(readme, /http:\/\/pid\.geoscience\.gov\.au\/dataset\/ga\/142419/); assert.match(readme, /Creative Commons Attribution 4\.0 International/);
  assert.match(readme, /"Not specified"/); // the licence uncertainty of GA's own record is said
});

test("#2006 GeoMet: the derived collars, survey and intervals pass the sample-data checks; the assays are the file's values; the README says what was derived", () => {
  const dir = "geomet";
  assert.ok(folderBytes(dir) < 0.5e6, String(folderBytes(dir)));
  const { collars, survey } = checkIntervals(dir, ["assays.csv"]);
  assert.equal(collars.length, 118); assert.equal(survey.length, 1999);
  const A = table(dir, "assays.csv");
  assert.equal(A.length, 1999);
  for (const k of ["Ag", "Al", "Au", "C", "Ca", "Cl", "Cu", "F", "Fe", "K", "Mg", "Mn", "Na", "P", "Pb", "S", "Th", "U"]) assert.ok(`${k}_ppm` in A[0], k);
  for (const r of A) for (const [k, x] of Object.entries(r)) if (/_ppm$/.test(k)) assert.ok(Number.isFinite(Number(x)) && Number(x) >= 0, `${r.hole_id} ${k} ${x}`);
  const c1 = collars.find((c) => c.hole_id === "1"); // the first sample of hole 1 in the source: collar = that sample
  assert.deepEqual([c1.x, c1.y, c1.z], ["559.73", "-513.31", "252.82"]);
  const a1 = A.find((r) => r.hole_id === "1"); assert.equal(a1.Au_ppm, "1.04"); assert.equal(a1.Ag_ppm, "0.64"); // as delivered
  const readme = text(dir, "README.md");
  assert.match(readme, /Zenodo, version v4, 7 March 2022\. https:\/\/doi\.org\/10\.5281\/zenodo\.7051975/); assert.match(readme, /Creative Commons Attribution 4\.0 International/);
  assert.match(readme, /derived from the positions/); assert.match(readme, /an assumption, not the lab's/);
  for (const n of ["Hoffimann", "Mazzinghy", "Gonçalves", "Vale S\.A\."]) assert.match(readme, new RegExp(n));
});

test("#2006 both are in the licences list with their README text", () => {
  const list = bundledData();
  const o = list.find((x) => /Osborne mine airborne magnetics/.test(x.name)), g = list.find((x) => /GeoMet drillholes/.test(x.name));
  assert.ok(o && g); assert.equal(o.license, "CC-BY-4.0"); assert.equal(g.license, "CC-BY-4.0");
  assert.match(o.text, /Commonwealth of Australia/); assert.match(g.text, /GeoMet dataset/);
});

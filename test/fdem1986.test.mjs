// TASKS.csv #1986 — FDEM soundings for the 1D inversion: Aarhus Workbench exports, DUALEM and GEM-2 CSVs, averaging along the path,
// the job request, the models as points at depth, and the wiring (the engine's side: python-sidecar/tests/test_em1d.py)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isWorkbenchXyz, parseWorkbenchXyz, fdemFromWorkbenchDat, fdemFromWorkbenchInv, isFdemCsv, fdemFromCsv, resampleAlongPath, alongLine, em1dRequest, modelPoints } from "../src/lib/fdem.js";

// the layout of the USGS Indiana release's Workbench exports (Terry et al. 2024), values made up
const HEAD = (extra) => ["/INFO", "/Aarhus Workbench export file. File created: 09-08-2023 21:49:23.", "/WB VERSION", "/6.7.1.0", "/DUMMY", "/9999",
  "/COORDINATE SYSTEM", "/WGS 84 UTM zone 16N (epsg:32616)", ...extra].join("\n");
const DUALEM_DAT = HEAD(["/NUMBER OF CHANNELS", "/6", "/FREQUENCIES", "/   9.0000E+3   9.0000E+3   9.0000E+3   9.0000E+3   9.0000E+3   9.0000E+3",
  "/COIL CONFIGURATIONS", "/VMD, VMD  VMD, HMD-x  VMD, VMD  VMD, HMD-x  VMD, VMD  VMD, HMD-x  ", "/COIL SEPARATIONS", "/1.0000E+0  1.1000E+0  2.0000E+0  2.1000E+0  4.0000E+0  4.1000E+0  ",
  "/ LINE_NO       UTMX        UTMY  RECORD  ELEVATION  NUMDATA    RESDATA   RESTOTAL      RhoA_1      RhoA_2      RhoA_3      RhoA_4      RhoA_5      RhoA_6",
  "        0  525127.24  4582812.09       1      207.4        4  1.050E+00  9.720E-01        9999        9999  2.5000E+02  4.0000E+02  2.0000E+02  5.0000E+02",
  "        0  525126.71  4582812.87       2      207.4        4  1.050E+00  9.720E-01  1.0000E+02        9999  2.5000E+02  4.0000E+02  2.0000E+02  5.0000E+02"]);
const GEM_DAT = HEAD(["/NUMBER OF CHANNELS", "/2", "/FREQUENCIES", "/   1.5300E+3   4.7970E+4", "/COIL CONFIGURATIONS", "/VMD, VMD  VMD, VMD  ", "/COIL SEPARATIONS", "/1.6600E+0  1.6600E+0  ",
  "/ LINE_NO       UTMX        UTMY  RECORD  ELEVATION  NUMDATA    RESDATA   RESTOTAL   ImagPPM_1  RealPPM_1   ImagPPM_2  RealPPM_2",
  "        0  525127.24  4582812.09       1      207.4        2  1.050E+00  9.720E-01  1.6022E+02  9999  8.4675E+02  9999"]);
const INV = HEAD(["/NUMBER OF LAYERS", "/3",
  "/ LINE_NO       UTMX        UTMY  RECORD  ELEVATION  NUMDATA    RESDATA   RESTOTAL   RHO_1   RHO_2   RHO_3   DEP_TOP_1   DEP_TOP_2   DEP_TOP_3   DEP_BOT_1   DEP_BOT_2   DOI_CONSERVATIVE   DOI_STANDARD",
  "        0  525127.24  4582812.09       1      207.4        4  1.050E+00  9.720E-01  2.0E+02  1.0E+02  5.0E+01  0.0  0.5  1.5  0.5  1.5  1.0  2.0",
  "        0  525126.71  4582812.87       2      207.4        4  1.271E+00  9.720E-01  2.0E+02  1.0E+02  5.0E+01  0.0  0.5  1.5  0.5  1.5  0.8  9999"]);

test("Aarhus Workbench data: apparent resistivity to mS/m, the coils from the header, dummies as missing, the EPSG", () => {
  assert.ok(isWorkbenchXyz(DUALEM_DAT));
  assert.equal(isWorkbenchXyz("/X Y mag\n/ line 1\n100 200 5"), false, "a Geosoft XYZ is not one");
  const w = parseWorkbenchXyz(DUALEM_DAT);
  assert.equal(w.epsg, 32616);
  const s = fdemFromWorkbenchDat(w, "dualem_dat.xyz");
  assert.equal(s.kind, "eca");
  assert.deepEqual(s.coils.map((c) => [c.geom, c.sep, c.freq]), [["HCP", 1, 9000], ["PRP", 1.1, 9000], ["HCP", 2, 9000], ["PRP", 2.1, 9000], ["HCP", 4, 9000], ["PRP", 4.1, 9000]]);
  assert.deepEqual(s.data[0], [null, null, 4, 2.5, 5, 2]); // 1000 / RhoA
  assert.equal(s.data[1][0], 10);
  assert.deepEqual([s.stations.x[0], s.stations.y[0], s.stations.z[0], s.stations.line[0]], [525127.24, 4582812.09, 207.4, 0]);
  const g = fdemFromWorkbenchDat(parseWorkbenchXyz(GEM_DAT));
  assert.equal(g.kind, "ppm");
  assert.deepEqual(g.data[0], [null, 160.22, null, 846.75]);
  assert.ok(g.coils.every((c) => c.inphase === false), "the in-phase Workbench left out stays out");
  assert.throws(() => fdemFromWorkbenchDat(parseWorkbenchXyz(INV)), /holds models/);
});

test("Aarhus Workbench models: layers from DEP_BOT, conductivity per layer, the DOI and the residual", () => {
  const r = fdemFromWorkbenchInv(parseWorkbenchXyz(INV), "inv.xyz").result;
  assert.deepEqual(r.thick, [0.5, 1]);
  assert.deepEqual(r.condMs[0], [5, 10, 20]);
  assert.deepEqual(r.doi, [2, null]);
  assert.deepEqual(r.chi, [1.05, 1.271]);
  assert.throws(() => fdemFromWorkbenchInv(parseWorkbenchXyz(DUALEM_DAT)), /holds data/);
});

test("DUALEM and GEM-2 CSVs: a citation above the header, a leading slash, + signs; coil pairs from the column names", () => {
  const dual = ['"Terry, N., ... 2024, Ground-based FDEM data ..."', "/LATd,LONd,ALTm,H1mS_m,H1ppt,P1mS_m,H2mS_m,P2mS_m,H4mS_m,P4mS_m,X,Y,dem_elevation_m",
    "41.39645,-86.69941,173.6,-0.2,0.07,-2.8,+3.8,+2.9,+5.6,+3.3,525127.2,4582812.1,207.36", "41.39646,-86.69942,173.6,,0.07,+1.0,+3.6,+2.7,+5.4,+3.1,525127.9,4582812.4,207.37"].join("\n");
  assert.ok(isFdemCsv(dual));
  const d = fdemFromCsv(dual, "d.csv");
  assert.equal(d.instrument, "DUALEM");
  assert.deepEqual(d.coils.map((c) => `${c.geom} ${c.sep}`), ["HCP 1", "PRP 1.1", "HCP 2", "PRP 2.1", "HCP 4", "PRP 4.1"]);
  assert.deepEqual(d.data[0], [-0.2, -2.8, 3.8, 2.9, 5.6, 3.3]);
  assert.equal(d.data[1][0], null, "an empty cell is missing, not 0");
  assert.equal(d.readings.zFrom, "dem_elevation_m");
  assert.ok(d.readings.lat && d.readings.x);
  const gem = ["Line,Sample,X,Y,GPSalt,I_1530Hz,Q_1530Hz,I_47970Hz,Q_47970Hz", " 0,   5,   525144.30,  4582810.53, 211.05, 8.68537e+002, 9.83790e+002, 4.99641e+002, 9.45367e+002"].join("\n");
  const g = fdemFromCsv(gem, "g.csv");
  assert.equal(g.instrument, "GEM-2");
  assert.deepEqual(g.coils.map((c) => [c.geom, c.sep, c.freq, c.inphase]), [["HCP", 1.66, 1530, false], ["HCP", 1.66, 47970, false]]);
  assert.deepEqual(g.data[0], [868.537, 983.79, 499.641, 945.367]);
  assert.throws(() => fdemFromCsv("a,b,c\n1,2,3"), /No DUALEM/);
});

test("readings averaged per metre of path; a new line or a jump starts a new stretch; missing values do not count", () => {
  const xy = [[0, 0], [0.3, 0], [0.6, 0], [1.2, 0], [1.5, 0], [100, 0], [100.4, 0]];
  const data = [[1, 10], [3, null], [5, 30], [7, 40], [9, 50], [11, 60], [13, 70]];
  const r = resampleAlongPath(xy, [10, 10, 10, 11, 11, 20, 22], null, data, { spacing: 1, gapM: 25 });
  assert.deepEqual(r.data, [[3, 20], [8, 45], [12, 65]]);
  assert.deepEqual(r.stations.n, [3, 2, 2]);
  assert.deepEqual(r.stations.z, [10, 11, 21]);
  assert.deepEqual(r.stations.line, [0, 0, 1], "the jump to x = 100 is a new stretch");
  assert.deepEqual(alongLine(r.stations).map((v) => +v.toFixed(2)), [0, 1.05, 0]);
});

test("the job request: the coils in use, GEM-2 in-phase only where ticked, every Nth sounding", () => {
  const s = fdemFromWorkbenchDat(parseWorkbenchXyz(DUALEM_DAT));
  s.coils[0].use = false;
  const { pick, request } = em1dRequest(s, { height: 0.75, errRel: 0.1, errAbs: 0.1, layers: { n: 20, first: 0.2, bottom: 16 }, every: 2 });
  assert.deepEqual(pick, [0]);
  assert.equal(request.coils.length, 5);
  assert.deepEqual(request.data, [[null, 4, 2.5, 5, 2]]);
  assert.equal(request.kind, "eca");
  const g = fdemFromWorkbenchDat(parseWorkbenchXyz(GEM_DAT));
  g.coils[1].inphase = true;
  g.data[0][2] = 12;
  assert.deepEqual(em1dRequest(g, { height: 1 }).request.data, [[null, 160.22, 12, 846.75]]);
});

test("the models as points at depth: each layer's middle below the ground, cut at the depth of investigation, log10 mS/m", () => {
  const st = { x: [1, 2, 3], y: [0, 0, 0], z: [100, null, 90], line: [0, 0, 0] };
  const result = { thick: [1, 2], condMs: [[10, 100, 1], [10, 10, 10], [1, 1, null]], doi: [1.5, 5, null] };
  const { rows, noZ } = modelPoints(st, result, { src: "s (1D models)" });
  assert.equal(noZ, 1);
  assert.deepEqual(rows.map((r) => [r.x, r.z, r.value, r.depth]), [[1, 99.5, 1, 0.5], [3, 89.5, 0, 0.5], [3, 88, 0, 2]]);
  assert.equal(modelPoints(st, result, { aboveDoi: false }).rows.filter((r) => r.x === 1).length, 3, "all layers when asked");
  const thin = modelPoints(st, result, { aboveDoi: false, maxPoints: 4 });
  assert.equal(thin.every, 2);
  assert.deepEqual([...new Set(thin.rows.map((r) => r.x))], [1, 3], "whole soundings, every 2nd");
  assert.ok(!Object.keys(thin.rows[0]).includes("_j"), "the thinning index is not saved");
});

test("wired: the pane, the ribbon, a Workbench .xyz dropped on the tab, the job, the help page; the engine's job and pins", () => {
  const g = readFileSync(new URL("../src/modules/GeophysicsModule.jsx", import.meta.url), "utf8");
  assert.match(g, /const FdemPane = React\.lazy\(\(\) => import\("\.\.\/components\/FdemPane\.jsx"\)\)/);
  assert.match(g, /label="FDEM 1D"[^\n]*\{\.\.\.geoBtn\("fdem"\)\}/);
  assert.match(g, /if \(wbs\.length\) \{ setFdemDrop\(wbs\); setGeoPane\("fdem"\); \}/);
  assert.match(readFileSync(new URL("../src/lib/desktop.js", import.meta.url), "utf8"), /export const runEm1dJob = \(request, opts\) => runSidecarJobKind\("em1d", request, opts\);/);
  assert.match(readFileSync(new URL("../src/lib/help.js", import.meta.url), "utf8"), /"FDEM 1D \(DUALEM, GEM-2\)": "fdem-1d"/);
  const main = readFileSync(new URL("../python-sidecar/app/main.py", import.meta.url), "utf8");
  assert.match(main, /if req\.get\("jobKind"\) == "em1d":/);
  assert.match(readFileSync(new URL("../python-sidecar/app/jobs.py", import.meta.url), "utf8"), /elif kind == "em1d":/);
  assert.match(readFileSync(new URL("../python-sidecar/requirements.txt", import.meta.url), "utf8"), /^empymod==2\.6\.1$/m);
  assert.match(readFileSync(new URL("../python-sidecar/constraints.txt", import.meta.url), "utf8"), /^scooby==0\.12\.1$/m);
});

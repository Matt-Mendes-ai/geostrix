// TASKS.csv #443 — calculator, spread-safe min/max, stereonet fabric, IDW, reprojection (run: npm test).
import test from "node:test";
import assert from "node:assert/strict";
import { compileCalc } from "../src/lib/calcExpr.js";
import { arrMin, arrMax } from "../src/lib/arrayStats.js";
import { fisherStats, fabricShape } from "../src/lib/stereonet.js";
import { idwGrid } from "../src/lib/idw.js";
import { reprojectXY } from "../src/lib/reproject.js";

test("#344 field calculator evaluates arithmetic and never runs code from column names", () => {
  const cols = ["Au_ppm", "Ag", "{x=globalThis.PWNED=1}"];
  const row = { Au_ppm: 2, Ag: "30", "{x=globalThis.PWNED=1}": 5 };
  assert.equal(compileCalc("Au_ppm + Ag*0.01", cols)(row), 2.3);
  assert.equal(compileCalc("-Au_ppm^2", cols)(row), -4);
  assert.equal(compileCalc("max(Au_ppm, Ag, 1)", cols)(row), 30);
  assert.ok(Number.isNaN(compileCalc("Au_ppm * 2", ["Au_ppm"])({})));
  for (const bad of ["alert(1)", "constructor", "__proto__", "Au_ppm;1", "Au_ppm)"]) assert.throws(() => compileCalc(bad, cols), bad);
  assert.equal(globalThis.PWNED, undefined);
});

test("#371 arrMin/arrMax match Math.min/max and survive 1M values", () => {
  assert.equal(arrMin([5, 2, 9]), Math.min(5, 2, 9));
  assert.equal(arrMax([]), -Infinity);
  assert.ok(Number.isNaN(arrMin([1, NaN])));
  const big = Float64Array.from({ length: 1e6 }, (_, i) => Math.sin(i) * i);
  assert.ok(arrMin(big) < -999000 && arrMax(big) > 999000);
});

test("#425 open folds are girdles, clusters stay clusters", () => {
  const limbs = (a) => a.map((x) => ({ dip: Math.abs(x), azimuth: x >= 0 ? 90 : 270 }));
  for (const set of [[30, -30], [40, -40], [60, -20]]) {
    const f = fisherStats(limbs([...Array(10).fill(set[0]), ...Array(10).fill(set[1])]));
    assert.equal(fabricShape(f.s1, f.s2, f.s3).shape, "girdle", set.join("/"));
  }
  const tight = fisherStats(Array.from({ length: 20 }, (_, i) => ({ dip: 45 + (i % 3), azimuth: 90 + (i % 4) })));
  assert.equal(fabricShape(tight.s1, tight.s2, tight.s3).shape, "cluster");
});

test("#370 IDW bucket search equals a brute-force nearest-k scan", () => {
  let seed = 3; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const pts = Array.from({ length: 400 }, () => ({ x: rnd() * 1000, y: rnd() * 1000, value: rnd() * 100 }));
  const box = { xmin: 0, ymin: 0, xmax: 1000, ymax: 1000, cellSize: 40, maxPoints: 8 };
  const { gridW, gridH, values } = idwGrid(pts, box);
  for (let row = 0; row < gridH; row += 5) for (let col = 0; col < gridW; col += 5) {
    const cx = (col + 0.5) * 40, cy = 1000 - (row + 0.5) * 40;
    const near = pts.map((p) => ({ d: Math.hypot(p.x - cx, p.y - cy), v: p.value })).sort((a, b) => a.d - b.d).slice(0, 8);
    let w = 0, s = 0; for (const n of near) { const k = 1 / n.d ** 2; w += k; s += k * n.v; }
    assert.ok(Math.abs(values[row * gridW + col] - s / w) < 1e-3, `${row},${col}`);
  }
});

test("#416 reprojection still gives the same coordinates", () => {
  const p = reprojectXY(-130.1, 56.5, 4326, 3156);
  assert.ok(Math.abs(p.x - 432287.3539) < 0.01 && Math.abs(p.y - 6262271.5643) < 0.01);
});

import proj4 from "proj4";
import { reprojectGrid, bilinearSample, getProj4DefSync } from "../src/lib/reproject.js";
test("#450 approximate grid warp matches exact per-pixel projection", () => {
  const N = 300, from = getProj4DefSync(4326), to = getProj4DefSync(32609);
  const src = { xmin: -131, ymin: 56, xmax: -130, ymax: 57, gridW: N, gridH: N, band: new Float32Array(N * N).map((_, i) => Math.sin((i % N) / 7) * 100 + ((i / N) | 0)) };
  const a = reprojectGrid(src, from, to, N, N);
  const multi = reprojectGrid({ ...src, band: undefined, bands: [src.band] }, from, to, N, N);
  const [txmin, tymin, txmax, tymax] = a.bbox, inv = proj4(to, from);
  let maxd = 0;
  for (let row = 0; row < N; row += 7) for (let col = 0; col < N; col++) {
    const [lon, lat] = inv.forward([txmin + (col / (N - 1)) * (txmax - txmin), tymax - (row / (N - 1)) * (tymax - tymin)]);
    const v = bilinearSample(src.band, N, N, src.xmin, src.ymin, src.xmax, src.ymax, lon, lat);
    const got = a.elevations[row * N + col];
    if (v !== null && !Number.isNaN(got)) maxd = Math.max(maxd, Math.abs(got - v));
    assert.ok(Object.is(multi.bandsOut[0][row * N + col], got));
  }
  assert.ok(maxd < 0.05, `max diff ${maxd}`);
});

import { azimuthToGridOffset } from "../src/lib/azimuthRef.js";
test("#396 azimuth reference offsets at the Harry property", () => {
  const x = 463333, y = 6178148;
  assert.equal(azimuthToGridOffset("grid", x, y, 3156).offset, 0);
  const t = azimuthToGridOffset("true", x, y, 3156);
  assert.ok(Math.abs(t.offset - 0.483) < 0.01, `convergence ${t.offset}`); // textbook gamma = atan(tan(dlon) sin(lat)) -> 0.483
  const m = azimuthToGridOffset("magnetic", x, y, 3156, "2026-09-01");
  assert.ok(m.declination > 17 && m.declination < 18, `declination ${m.declination}`);
  assert.equal(azimuthToGridOffset("magnetic", x, y, 3156, ""), null); // no date, no guess
  assert.equal(azimuthToGridOffset("magnetic", x, y, 3156, "1850-01-01"), null); // outside IGRF
});

import { orientFromAlphaBeta, alphaBetaFromPole, poleFromDipDD, holeDirection, referenceLine } from "../src/lib/coreOrientation.js";
test("#427 alpha/beta -> dip/dip direction round-trips through the forward model", () => {
  for (const [hAz, hDip, dd, dip] of [[90, 60, 270, 45], [0, 55, 120, 70], [215, 75, 30, 20], [45, 50, 225, 85]]) {
    const hd = holeDirection(hAz, hDip), rl = referenceLine(hd, false);
    const { alphaDeg, betaDeg } = alphaBetaFromPole(poleFromDipDD(dd, dip), hd, rl);
    const r = orientFromAlphaBeta({ alphaDeg, betaDeg, holeAzDeg: hAz, holeDipDeg: hDip });
    assert.ok(Math.abs(r.dipDeg - dip) < 1e-6 && Math.abs(((r.dipDirDeg - dd + 540) % 360) - 180) < 1e-6, JSON.stringify({ hAz, hDip, dd, dip, r }));
  }
  assert.ok(orientFromAlphaBeta({ alphaDeg: 40, betaDeg: 100, holeAzDeg: 0, holeDipDeg: 89.5 }).error); // near-vertical: refused
});

import { parseStructureRows } from "../src/lib/mapLayers.js";
import { isOverturnedValue } from "../src/lib/layers.js";
test("#430 outcrop numbers with units or labels parse; quadrant strikes stay skipped; overturned values", () => {
  const cols = { x: "x", y: "y", dip: "dip", dipDir: "dd" };
  const r = parseStructureRows([
    { x: "500100", y: "6200100", dip: "65 deg", dd: "120°" },
    { x: "500200", y: "6200200", dip: "dip 40", dd: "az: 300" },
    { x: "500300", y: "6200300", dip: "30", dd: "N45E" },
    { x: "5.001e5", y: "6200400", dip: "10", dd: "90" },
  ], cols);
  assert.deepEqual(r.rows.map((o) => [o.dip, o.dipDir]), [[65, 120], [40, 300], [10, 90]]);
  assert.equal(r.rows[2].x, 500100);
  assert.equal(r.skipped, 1);
  for (const v of ["Y", "overturned", "-1", "Down", " O/T "]) assert.equal(isOverturnedValue(v), true, v);
  for (const v of ["", "N", "up", "1", "normal", null, undefined]) assert.equal(isOverturnedValue(v), false, String(v));
});

import { solveUnoriented, roundAzimuth } from "../src/lib/coreOrientation.js";
test("#429 alpha-beta calculator: range checks, beta 360 = 0, dip-direction never 360", () => {
  const hd = holeDirection(90, 60), rl = referenceLine(hd, false);
  const base = { holeDir: hd, refLine: rl, knownDipDirDeg: 270, knownDipDeg: 45, refAlphaDeg: 40, refBetaDeg: 100, unkAlphaDeg: 50, unkBetaDeg: 200 };
  assert.equal(solveUnoriented(base).ok, true);
  assert.match(solveUnoriented({ ...base, unkAlphaDeg: 95 }).reason, /0–90/);
  assert.match(solveUnoriented({ ...base, refAlphaDeg: -1 }).reason, /0–90/);
  assert.match(solveUnoriented({ ...base, knownDipDeg: 120 }).reason, /dip must be 0–90/);
  assert.match(solveUnoriented({ ...base, refBetaDeg: 400 }).reason, /0–360/);
  const a = solveUnoriented({ ...base, unkBetaDeg: 0 }), b = solveUnoriented({ ...base, unkBetaDeg: 360 });
  assert.ok(Math.abs(a.dipDeg - b.dipDeg) < 1e-9 && Math.abs(a.dipDirDeg - b.dipDirDeg) < 1e-9);
  assert.equal(solveUnoriented({ ...base, knownDipDirDeg: 630 }).dipDirDeg.toFixed(6), solveUnoriented(base).dipDirDeg.toFixed(6)); // 630 = 270
  assert.equal(roundAzimuth(359.9996), 0);
  assert.equal(roundAzimuth(359.994), 359.99);
  assert.equal(roundAzimuth(12.345, 1), 12.3);
});

import { unitAt, unitVolumes, checkAgainstLogs } from "../src/lib/modelCheck.js";
test("#356 model check: block lookup (z fastest), volumes, logged-vs-modelled metres", () => {
  // 2 x 1 x 4 block over x 0..200, y 0..100, z -400..0; ids per column (z fastest): 3,2,2,1 bottom->top
  const block = { extent: [0, 200, 0, 100, -400, 0], resolution: [2, 1, 4], ids: [3, 2, 2, 1, 3, 3, 2, 1], labels: [null, "DACT", "VCL"] };
  assert.equal(unitAt(block, 50, 50, -50), null);
  assert.equal(unitAt(block, 50, 50, -150), "DACT");
  assert.equal(unitAt(block, 150, 50, -250), "VCL");
  assert.equal(unitAt(block, 250, 50, -50), undefined);
  const v = Object.fromEntries(unitVolumes(block).map((u) => [u.name, u.volume]));
  assert.equal(v.DACT, 3 * 100 * 100 * 100);
  const r = checkAgainstLogs(block, [{ hole_id: "A", x: 50, y: 50, z: -150, metres: 10, logged: "DACT" }, { hole_id: "A", x: 150, y: 50, z: -250, metres: 5, logged: "DACT" }, { hole_id: "B", x: 999, y: 0, z: 0, metres: 2, logged: "VCL" }]);
  assert.deepEqual([r.total, r.matched, r.outside], [15, 10, 2]);
  assert.equal(r.units[0].mostOftenModelledAs, "VCL");
});

import { blockToCells, modelledIntervals, ABOVE_TOPS } from "../src/lib/modelCheck.js";
test("#356 block -> world voxel cells (air left out) and modelled-unit intervals", () => {
  const block = { extent: [0, 200, 0, 100, -400, 0], resolution: [2, 1, 4], ids: [3, 2, 2, 1, 3, 3, 2, 1], labels: [null, "DACT", "VCL"] };
  const cells = blockToCells(block, { x: 1000, y: 5000, z: 500 });
  assert.equal(cells.length, 6); // 2 null (above tops) cells dropped
  const c0 = cells[0]; // ix 0, iz 0: centre x 50, z -350 -> world 1050 / 150; id 3 (VCL)
  assert.deepEqual([c0.x, c0.y, c0.z, c0.dx, c0.dz, c0.value], [1050, 5050, 150, 100, 100, 3]);
  const rows = modelledIntervals(block, [
    { hole_id: "A", from: 0, to: 10, x: 50, y: 50, z: -50, logged: "DACT" },
    { hole_id: "A", from: 10, to: 20, x: 50, y: 50, z: -150, logged: "DACT" },
    { hole_id: "A", from: 20, to: 30, x: 999, y: 50, z: -150, logged: "VCL" },
  ]);
  assert.deepEqual(rows.map((r) => r.value), [ABOVE_TOPS, "DACT"]); // outside -> no row
});

import { magColorRGB } from "../src/lib/layers.js";
test("#382 default ramp rises monotonically in lightness (CIE L*)", () => {
  const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const Lstar = ([r, g, b]) => { const Y = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b); return Y > 0.008856 ? 116 * Math.cbrt(Y) - 16 : 903.3 * Y; };
  let prev = -1;
  for (let i = 0; i <= 50; i++) { const L = Lstar(magColorRGB(i, 0, 50)); assert.ok(L >= prev - 0.5, `L* dropped at ${i}: ${prev} -> ${L}`); prev = L; }
  assert.ok(Lstar(magColorRGB(50, 0, 50)) - Lstar(magColorRGB(0, 0, 50)) > 60);
});

import { makeStretch } from "../src/lib/idw.js";
test("#372 colour stretch: percentile clip resists outliers, equalise is rank-uniform", () => {
  const vals = Array.from({ length: 1000 }, (_, i) => i % 100).concat([100000]); // one intrusive high
  const lin = makeStretch(vals, "linear"), p = makeStretch(vals, "p2-98"), eq = makeStretch(vals, "equalise");
  assert.ok(lin.t(99) < 0.001, "linear squeezes the real range into ~0");
  assert.ok(p.t(50) > 0.4 && p.t(50) < 0.6 && p.t(100000) === 1);
  assert.ok(Math.abs(eq.t(50) - 0.5) < 0.02);
  assert.equal(makeStretch([NaN, NaN]).lo, null);
});

import { rigRows, rigKML, rigGPX } from "../src/lib/rigExport.js";
test("#397 planned holes for the rig: lat/lon, true and magnetic azimuth, KML/GPX", () => {
  const hole = { name: "PH-1 <A&B>", x: 463333, y: 6178148, z: 1160, azimuth: 90, dip: 60, length: 300 };
  const trace = () => [{ x: 463333, y: 6178148, z: 1160 }, { x: 463483, y: 6178148, z: 900 }];
  const [r] = rigRows([hole], 3156, "2026-09-25", trace);
  assert.ok(r.lat > 55.5 && r.lat < 56 && r.lon > -130 && r.lon < -129.4, `${r.lat},${r.lon}`);
  // grid = true + c  and  grid = magnetic + D + c
  assert.ok(Math.abs(r.azimuth_true + r.convergence_deg - 90) < 0.02);
  assert.ok(Math.abs(r.azimuth_magnetic + r.declination_deg + r.convergence_deg - 90) < 0.02);
  assert.ok(r.declination_deg > 12 && r.declination_deg < 22, `declination ${r.declination_deg}`);
  const kml = rigKML([r], "Test");
  assert.match(kml, /<Point><coordinates>-129\.\d+,55\.\d+,0<\/coordinates>/);
  assert.match(kml, /PH-1 &lt;A&amp;B&gt;/);
  assert.match(kml, /<LineString>/);
  assert.match(rigGPX([r]), /<wpt lat="55\.\d+" lon="-129\.\d+">/);
});

import { reprojectXY as rxy419, guessEpsgFromPrjWkt } from "../src/lib/reproject.js";
import proj4b from "proj4";
test("#419 EPSG 4617 / 3979 / 3857 and WKT AUTHORITY detection", () => {
  // 4617 -> 3156 (both NAD83(CSRS)) must be a pure projection: same as projecting on GRS80 with no datum shift.
  const a = rxy419(-129.6, 55.73, 4617, 3156);
  const [ex, ey] = proj4b("+proj=longlat +ellps=GRS80 +no_defs", "+proj=utm +zone=9 +ellps=GRS80 +units=m +no_defs", [-129.6, 55.73]);
  assert.ok(Math.abs(a.x - ex) < 0.001 && Math.abs(a.y - ey) < 0.001, `${a.x - ex}, ${a.y - ey}`);
  // 3857: x = R * lon, y = R * ln(tan(pi/4 + lat/2)) on the sphere R = 6378137
  const m = rxy419(-129.6, 55.73, 4326, 3857), R = 6378137, rad = Math.PI / 180;
  assert.ok(Math.abs(m.x - R * -129.6 * rad) < 0.01 && Math.abs(m.y - R * Math.log(Math.tan(Math.PI / 4 + (55.73 * rad) / 2))) < 0.01);
  // 3979 round trip
  const l = rxy419(-129.6, 55.73, 4617, 3979), back = rxy419(l.x, l.y, 3979, 4617);
  assert.ok(Math.abs(back.x + 129.6) < 1e-8 && Math.abs(back.y - 55.73) < 1e-8);
  assert.ok(l.x < -2000000 && l.x > -2500000, `${l.x}`); // west of the -95 central meridian
  // WKT1: the outermost AUTHORITY (last) wins; WKT2 ID[]
  assert.equal(guessEpsgFromPrjWkt('PROJCS["NAD83(CSRS) / UTM zone 9N",GEOGCS["NAD83(CSRS)",DATUM["x",AUTHORITY["EPSG","6140"]],AUTHORITY["EPSG","4617"]],AUTHORITY["EPSG","3156"]]'), 3156);
  assert.equal(guessEpsgFromPrjWkt('GEOGCRS["NAD83(CSRS)",ID["EPSG",4617]]'), 4617);
  assert.equal(guessEpsgFromPrjWkt('PROJCS["Weird",AUTHORITY["EPSG","99999"]]'), null);
});

import { sanitizeMesh } from "../src/lib/meshSanitize.js";
test("#314 NaN/null vertices from GemPy: triangles touching them dropped, indices kept, bbox stays finite", () => {
  const v = [[0, 0, 0], [1, 0, 0], [null, 0, 0], [0, 1, 0], [1, 1, NaN]];
  const f = [[0, 1, 3], [1, 2, 3], [1, 3, 4], [0, 1, 3]];
  const r = sanitizeMesh(v, f);
  assert.equal(r.badVertices, 2); assert.equal(r.droppedFaces, 2);
  assert.deepEqual(r.faces, [[0, 1, 3], [0, 1, 3]]);
  assert.equal(r.vertices.length, 5);
  assert.ok(r.vertices.flat().every(Number.isFinite));
  assert.deepEqual(sanitizeMesh([[null, 0, 0]], [[0, 0, 0]]).vertices, []);
  const good = sanitizeMesh([[0, 0, 0]], []); assert.equal(good.badVertices, 0);
});

import { quoteIdent as dbQuote, countSql, selectSql, chunkedReadPlan } from "../src/lib/dbSql.js";
test("#349 DB browser SQL per engine: MySQL backticks + snapshot/LIMIT-OFFSET pages; Postgres unchanged", () => {
  assert.equal(dbQuote("mysql", "we`ird"), "`we``ird`");
  assert.equal(dbQuote("postgres", 'we"ird'), '"we""ird"');
  assert.equal(countSql("mysql", "geo", "litho"), "SELECT COUNT(*) AS n FROM `geo`.`litho`;");
  assert.equal(countSql(undefined, "public", "Litho"), 'SELECT COUNT(*) AS n FROM "public"."Litho";');
  assert.equal(selectSql("mysql", "geo", "t", 10), "SELECT * FROM `geo`.`t` LIMIT 10;");
  const m = chunkedReadPlan("mysql", "geo", "t");
  assert.equal(m.begin, "START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY;");
  assert.equal(m.open, null); assert.equal(m.page(20000, 40000), "SELECT * FROM `geo`.`t` LIMIT 20000 OFFSET 40000;");
  const p = chunkedReadPlan("postgres", "public", "t");
  assert.equal(p.open, 'DECLARE geostrix_import_cursor NO SCROLL CURSOR FOR SELECT * FROM "public"."t";');
  assert.equal(p.page(500), "FETCH FORWARD 500 FROM geostrix_import_cursor;");
  assert.equal(p.begin, "BEGIN READ ONLY;");
});

import { decodeTableBytes, parseTableText, toCsv } from "../src/lib/tabular.js";
test("#444 shared CSV reader/writer: Windows-1252 fallback, comma decimals, # stamp skipped, quoting", () => {
  const bytes = Uint8Array.from([...Buffer.from("x;y;dip"), 0xb0, ...Buffer.from("\n")]); // 0xB0 = "°" in Windows-1252, invalid UTF-8
  const d = decodeTableBytes(bytes);
  assert.equal(d.encoding, "windows-1252"); assert.ok(d.text.includes("dip\u00b0"));
  assert.equal(decodeTableBytes(Buffer.from("\ufeffa,b\n1,2")).text, "a,b\n1,2"); // BOM stripped, UTF-8 kept
  const t = parseTableText('# GeoStrix stamp\nx,y,value\n"412000,5","6250000,25","1,5"\n"412001,5","6250001,25","2,25"\n');
  assert.deepEqual(t.headers, ["x", "y", "value"]);
  assert.equal(t.rows.length, 2); assert.equal(t.rows[0].x, 412000.5); assert.equal(t.rows[1].value, 2.25);
  assert.ok(/comma decimals/i.test(t.note), t.note);
  assert.equal(toCsv([{ unit: 'Andesite, "upper"', hole: "A-1" }]), 'unit,hole\r\n"Andesite, ""upper""",A-1');
});

import { guessBlockModelMapping, blockModelCellsFromRows, coarsenBlockCells } from "../src/lib/blockModelCsv.js";
test("#410 block-model CSV: Micromine / Datamine / Vulcan headers map; several attributes; volume-weighted coarsening", () => {
  const mm = guessBlockModelMapping(["EAST", "NORTH", "RL", "_EAST", "AU", "CU", "ROCK"], [{ EAST: 1, NORTH: 2, RL: 3, _EAST: 5, AU: 0.5, CU: 0.1, ROCK: "AND" }]);
  assert.deepEqual([mm.mapping.x, mm.mapping.y, mm.mapping.z], ["EAST", "NORTH", "RL"]);
  assert.ok(mm.attributes.includes("AU") && mm.attributes.includes("CU") && !mm.attributes.includes("ROCK"));
  assert.deepEqual(mm.defaultAttributes, ["AU"]);
  const dm = guessBlockModelMapping(["XC", "YC", "ZC", "XINC", "YINC", "ZINC", "IJK", "AU_PPM"], [{ XC: 1, YC: 1, ZC: 1, XINC: 5, YINC: 5, ZINC: 5, IJK: 7, AU_PPM: 2 }]);
  assert.deepEqual(dm.mapping, { x: "XC", y: "YC", z: "ZC", dx: "XINC", dy: "YINC", dz: "ZINC" });
  assert.deepEqual(dm.attributes, ["AU_PPM"]); // IJK is never an attribute
  const vu = guessBlockModelMapping(["xcentre", "ycentre", "zcentre", "dim_x", "dim_y", "dim_z", "density"], [{ xcentre: 0, ycentre: 0, zcentre: 0, dim_x: 2, dim_y: 2, dim_z: 2, density: 2.7 }]);
  assert.equal(vu.mapping.dx, "dim_x"); assert.deepEqual(vu.defaultAttributes, ["density"]);
  // cells + inferred size
  const rows = [];
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) rows.push({ E: 5 + 10 * i, N: 5 + 10 * j, RL: 5, AU: i < 2 ? 1 : 3 });
  const { cells, inferred } = blockModelCellsFromRows(rows, { x: "E", y: "N", z: "RL", dx: "", dy: "", dz: "" }, "AU");
  assert.equal(cells.length, 16); assert.equal(inferred.dx, 10);
  // coarsen 16 -> <= 4: 2x2 merges; the left half averages 1, the right half 3
  const c = coarsenBlockCells(cells, 4);
  assert.equal(c.cells.length, 4); assert.deepEqual(c.factors, { fx: 2, fy: 2, fz: 1 });
  const left = c.cells.filter((k) => k.x < 20).map((k) => k.value), right = c.cells.filter((k) => k.x > 20).map((k) => k.value);
  assert.ok(left.every((v) => Math.abs(v - 1) < 1e-9) && right.every((v) => Math.abs(v - 3) < 1e-9));
  assert.equal(c.cells[0].dx, 20);
  assert.equal(coarsenBlockCells(cells, 100).factors, null);
});

import { classifyQAQCRow, excludeQAQC, excludedQAQCIds, setKnownHoleIds, sampleTypeClass } from "../src/lib/qaqc.js";
test("#400 QAQC: sample_type decides; collar holes are never QC by name; excluded ids listed", () => {
  const rows = [
    { hole_id: "BLK-22-01", from: 0, to: 1 },           // real hole whose name looks like a blank
    { hole_id: "OREAS622", from: 0, to: 0 },            // standard by name
    { hole_id: "DD-7", from: 5, to: 6, sample_type: "STD" },       // acQuire-style: QC under the real hole id
    { hole_id: "DD-7", from: 6, to: 7, sample_type: "Field Dup" },
    { hole_id: "DD-7", from: 7, to: 8, sample_type: "Sample" },
    { hole_id: "DUP-HOLE", from: 0, to: 1, sample_type: "Core" },  // type says regular even though the name says dup
  ];
  setKnownHoleIds(null);
  assert.equal(classifyQAQCRow(rows[0]), "blank"); // old behaviour without collars: the bug
  setKnownHoleIds(new Set(["BLK-22-01", "DD-7"]));
  assert.equal(classifyQAQCRow(rows[0]), "regular");
  assert.equal(classifyQAQCRow("BLK-22-01"), "regular"); // bare-id callers too
  assert.deepEqual(rows.map((r) => classifyQAQCRow(r)), ["regular", "standard", "standard", "duplicate", "regular", "regular"]);
  assert.equal(excludeQAQC(rows).length, 3);
  const ex = excludedQAQCIds(rows);
  assert.deepEqual(ex.standard.map((e) => `${e.id}:${e.rows}:${e.why}`).sort(), ["DD-7:1:sample type", "OREAS622:1:name"]);
  assert.equal(sampleTypeClass("blank"), "blank"); assert.equal(sampleTypeClass("weird"), null); assert.equal(sampleTypeClass(""), null);
  setKnownHoleIds(null);
});

import { guessMapping, TARGET_SCHEMAS } from "../src/lib/layers.js";
test("#320 interval import maps a column literally named 'value'; real names still win", () => {
  const intervalTargets = Object.keys(TARGET_SCHEMAS).filter((k) => TARGET_SCHEMAS[k].fields.some((f) => f.key === "from") && TARGET_SCHEMAS[k].fields.some((f) => f.key === "value"));
  assert.ok(intervalTargets.includes("litho"));
  for (const t of intervalTargets) assert.equal(guessMapping(t, ["hole_id", "from", "to", "value"]).value, "value", t);
  assert.equal(guessMapping("litho", ["hole_id", "from", "to", "value", "litho"]).value, "litho");
});

import { localizeVertices } from "../src/lib/meshExport.js";
test("#413 glTF: vertices written relative to a whole-metre origin keep centimetres in float32", () => {
  const v = [[463123.37, 6298450.37, 1150.12], [463223.91, 6298550.83, 1101.55]];
  assert.equal(Math.fround(6298450.37), 6298450.5); // the bug: direct world coordinates
  const { offset, local } = localizeVertices(v);
  assert.deepEqual(offset, [463123, 6298450, 1101]);
  for (let i = 0; i < v.length; i++) for (let k = 0; k < 3; k++) assert.ok(Math.abs(Math.fround(local[i][k]) + offset[k] - v[i][k]) < 0.001);
});

import { noticeText, noticeLevel, errorNotice } from "../src/lib/notices.js";
test("#390 notice severity: explicit level wins; plain strings keep the wording test", () => {
  assert.equal(noticeLevel(errorNotice("Saved OK")), "error");
  assert.equal(noticeLevel({ text: "Export failed", level: "info" }), "info");
  assert.equal(noticeLevel("DXF export failed: disk full"), "error");
  assert.equal(noticeLevel("Loaded 37 holes."), "info");
  assert.equal(noticeText(errorNotice("x")), "x");
  assert.equal(noticeText("y"), "y");
  assert.equal(noticeText(null), "");
});

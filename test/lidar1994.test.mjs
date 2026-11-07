// TASKS.csv #1994 — lidar point clouds (LAS / LAZ / COPC): header, coordinate system, the points of formats 1-8, COPC levels,
// the ground grid and the cloud, the way into the project. The fixtures are made by test/fixtures/lidar/make*.py (laspy 2.6.1 +
// lazrs 0.7.0): 600 points on a plane z = 1000 + 0.1 x' + 0.05 y' (398 ground, 199 vegetation 15 m up, 2 noise, 1 withheld), and
// a 650-point COPC of three octree levels.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { isLasPointCloud, parseLasHeader, crsFromVlrs, inspectLidar, readLidar, groundSurface, copcLevelsWithin, parseHierarchyPage, lidarResultToProject, makeAccumulator, MAX_LAZ_BYTES } from "../src/lib/lidar.js";
import { lidarCellSize, unitOfDef, thinTo, lidarCrsPlan } from "../src/lib/lidarImport.js";

const require = createRequire(import.meta.url);
const { createLazPerf } = require("laz-perf");
const lazPerfP = createLazPerf();
const fx = (n) => new URL(`./fixtures/lidar/${n}`, import.meta.url);
const memSrc = (u8) => ({ size: u8.length, read: async (a, b) => u8.subarray(a, b) });
const fileSrc = (n) => memSrc(new Uint8Array(readFileSync(fx(n))));

test("the LAS signature tells a lidar file from a LAS well log", () => {
  assert.ok(isLasPointCloud(readFileSync(fx("lidar_fmt1.las"))));
  assert.equal(isLasPointCloud(new TextEncoder().encode("~Version Information\n VERS. 2.0 :")), false);
  assert.throws(() => parseLasHeader(new TextEncoder().encode("~Version")), /LAS signature/);
});

test("every point format the fixtures carry reads the same 600 points: classes, noise, withheld, the ground mean, the first point", async () => {
  const lazPerf = await lazPerfP;
  for (const [f, fmt, kind, version] of [["lidar_fmt1.las", 1, "LAS", "1.2"], ["lidar_fmt3.laz", 3, "LAZ", "1.2"], ["lidar_fmt6.laz", 6, "LAZ", "1.4"], ["lidar_fmt7.las", 7, "LAS", "1.4"], ["lidar_fmt8.laz", 8, "LAZ", "1.4"]]) {
    const src = fileSrc(f), info = await inspectLidar(src);
    assert.equal(info.kind, kind, f); assert.equal(info.header.pointFormat, fmt, f); assert.equal(info.header.version, version, f);
    assert.equal(info.header.pointCount, 600, f);
    assert.equal(info.crs.epsg, 26910, `${f}: ${info.crs.source}`); // GeoTIFF keys in 1.2, WKT in 1.4
    assert.equal(info.crs.source, fmt >= 6 ? "wkt" : "geokeys", f);
    const r = await readLidar(src, info, { cellSize: 5, keepEvery: 1 }, { lazPerf });
    assert.deepEqual(r.classCounts, { 2: 398, 5: 199, 7: 1, 18: 1 }, f);
    assert.equal(r.noise, 2, f); assert.equal(r.withheld, 1, f); assert.equal(r.outside, 0, f);
    let s = 0, c = 0;
    for (let k = 0; k < r.grid.gCount.length; k++) { s += r.grid.gSum[k]; c += r.grid.gCount[k]; }
    assert.equal(c, 398, f);
    assert.ok(Math.abs(s / c - 1006.4545326633165) < 1e-6, `${f}: ground mean ${s / c}`);
    assert.equal(r.cloud.n, 597, `${f}: noise and the withheld point are not drawn`);
    assert.deepEqual([+r.cloud.x[0].toFixed(3), +r.cloud.y[0].toFixed(3), +r.cloud.z[0].toFixed(3), r.cloud.intensity[0], r.cloud.cls[0]], [620066.218, 5800024.314, 1022.838, 0, 5], f);
  }
});

test("LAZ needs laz-perf; one too big for the WASM heap is refused with the way out", async () => {
  const src = fileSrc("lidar_fmt3.laz"), info = await inspectLidar(src);
  await assert.rejects(readLidar(src, info, {}), /LAZ decoding is not available/);
  await assert.rejects(readLidar({ ...src, size: MAX_LAZ_BYTES + 1 }, info, {}, { lazPerf: await lazPerfP }), /Convert it to COPC/);
});

test("COPC: the hierarchy, and only the levels within the budget are decoded", async () => {
  const lazPerf = await lazPerfP, src = fileSrc("lidar_tiny.copc.laz"), info = await inspectLidar(src);
  assert.equal(info.kind, "COPC");
  assert.equal(info.nodes.length, 9);
  assert.deepEqual(copcLevelsWithin(info.nodes, 300), { maxDepth: 1, points: 250, levels: 3, allPoints: 650 });
  assert.deepEqual(copcLevelsWithin(info.nodes, 10), { maxDepth: 0, points: 50, levels: 3, allPoints: 650 }, "the root level always");
  const r = await readLidar(src, info, { cellSize: 5, copcBudget: 300 }, { lazPerf });
  assert.deepEqual(r.read, { kind: "COPC", points: 250, allPoints: 650, maxDepth: 1, levels: 3 });
  assert.deepEqual(r.classCounts, { 2: 250 }, "depth 2 (the vegetation) was not read");
  const all = await readLidar(src, info, { cellSize: 5 }, { lazPerf });
  assert.deepEqual(all.classCounts, { 2: 250, 5: 400 });
  let s = 0, c = 0;
  for (let k = 0; k < all.grid.gCount.length; k++) { s += all.grid.gSum[k]; c += all.grid.gCount[k]; }
  assert.ok(Math.abs(s / c - 510.48276) < 1e-6, `ground mean ${s / c}`);
  // a child page entry (pointCount -1) is a page, not a node
  const page = new Uint8Array(32), dv = new DataView(page.buffer);
  dv.setInt32(0, 1, true); dv.setBigUint64(16, 999n, true); dv.setInt32(24, 64, true); dv.setInt32(28, -1, true);
  assert.deepEqual(parseHierarchyPage(page)[0], { depth: 1, key: "1-0-0-0", offset: 999, byteSize: 64, pointCount: -1 });
});

test("the coordinate system: a compound WKT in feet (Autzen's), GeoTIFF keys, nothing", () => {
  const wkt = 'COMPD_CS["NAD83 / Oregon GIC Lambert (ft) + NAVD88 height (ftUS)",PROJCS["NAD83 / Oregon GIC Lambert (ft)",GEOGCS["NAD83",DATUM["North_American_Datum_1983",SPHEROID["GRS 1980",6378137,298.257222101,AUTHORITY["EPSG","7019"]],AUTHORITY["EPSG","6269"]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433,AUTHORITY["EPSG","9122"]],AUTHORITY["EPSG","4269"]],PROJECTION["Lambert_Conformal_Conic_2SP"],UNIT["foot",0.3048,AUTHORITY["EPSG","9002"]],AXIS["Easting",EAST],AXIS["Northing",NORTH],AUTHORITY["EPSG","2992"]],VERT_CS["NAVD88 height (ftUS)",VERT_DATUM["North American Vertical Datum 1988",2005,AUTHORITY["EPSG","5103"]],UNIT["US survey foot",0.304800609601219,AUTHORITY["EPSG","9003"]],AXIS["Gravity-related height",UP],AUTHORITY["EPSG","6360"]]]';
  const c = crsFromVlrs([{ userId: "LASF_Projection", recordId: 2112, data: new TextEncoder().encode(wkt + "\0") }]);
  assert.deepEqual({ epsg: c.epsg, vert: c.vertEpsg, h: c.hUnit, z: c.zUnit }, { epsg: 2992, vert: 6360, h: 0.3048, z: 0.304800609601219 });
  const wkt2 = 'PROJCRS["WGS 84 / UTM zone 10N",BASEGEOGCRS["WGS 84",DATUM["World Geodetic System 1984",ELLIPSOID["WGS 84",6378137,298.257223563,LENGTHUNIT["metre",1]]],ID["EPSG",4326]],CONVERSION["UTM zone 10N",METHOD["Transverse Mercator"]],CS[Cartesian,2],LENGTHUNIT["metre",1],ID["EPSG",32610]]';
  const c2 = crsFromVlrs([{ userId: "LASF_Projection", recordId: 2112, data: new TextEncoder().encode(wkt2) }]);
  assert.deepEqual([c2.epsg, c2.hUnit], [32610, 1], "WKT2: the outer ID, not the base CRS's");
  assert.deepEqual(crsFromVlrs([]), { source: null, epsg: null, vertEpsg: null, name: null, hUnit: null, zUnit: null });
  assert.equal(unitOfDef("+proj=lcc +units=ft"), 0.3048); assert.equal(unitOfDef("+proj=utm +zone=10 +units=m"), 1); assert.equal(unitOfDef("+proj=tmerc +to_meter=0.3048006096012192"), 0.3048006096012192);
});

test("the ground grid fills small gaps from neighbours and leaves the far ones out; no ground class: the lowest point", () => {
  const h = { min: [0, 0, 0], max: [100, 100, 0], pointCount: 10, scale: [1, 1, 1], offset: [0, 0, 0], pointFormat: 6 };
  const acc = makeAccumulator(h, { cellSize: 10, wantCloud: false });
  const rec = (x, y, z, cls) => { const b = new DataView(new ArrayBuffer(30)); b.setInt32(0, x, true); b.setInt32(4, y, true); b.setInt32(8, z, true); b.setUint8(16, cls); return b; };
  for (let x = 5; x < 100; x += 10) for (let y = 5; y < 100; y += 10) if (!(x === 55 && y === 55)) acc.add(rec(x, y, 100 + x, 2), 0); // one empty cell in the middle
  acc.add(rec(55, 55, 400, 6), 0); // a roof over it
  const g = groundSurface(acc.result().grid);
  assert.equal(g.from, "ground");
  assert.equal(g.measured, 99);
  const k = (100 - 55 - 5) / 10 * g.gridW + 5; // the empty cell (row from the north)
  assert.ok(Math.abs(g.z[k] - 155) < 1e-9, `filled from the neighbours, not the roof: ${g.z[k]}`);
  const acc2 = makeAccumulator(h, { cellSize: 10, wantCloud: false });
  acc2.add(rec(5, 5, 50, 1), 0); acc2.add(rec(5, 5, 70, 1), 0);
  const g2 = groundSurface(acc2.result().grid, { fillPasses: 1 });
  assert.equal(g2.from, "lowest");
  assert.equal(g2.z[Math.floor((100 - 5) / 10) * g2.gridW], 50, "the lower of the two"); // row 9 of 11 (floor + 1 rows: the maximum is inside)
  assert.ok(g2.empty > 0, "cells beyond the fill distance stay empty");
});

test("into the project: same CRS gives the grid in the project's units; another CRS reprojects the cells and the cloud", async () => {
  const lazPerf = await lazPerfP, src = fileSrc("lidar_fmt7.las"), info = await inspectLidar(src);
  const r = await readLidar(src, info, { cellSize: 10, keepEvery: 2, cloudClasses: "ground" }, { lazPerf });
  assert.equal(r.cloud.n, 199, "every second of the 398 ground points");
  const same = lidarResultToProject(r, { zFactor: 1, src: "t.las" });
  assert.equal(same.terrain.kind, "grid");
  assert.equal(same.rows.length, 199);
  assert.ok(same.rows.every((q) => q.cls === 2 && q.value === q.z && q._src === "t.las"));
  const shift = lidarResultToProject(r, { reproject: (x, y) => ({ x: x + 1000, y }), zFactor: 0.3048, colourBy: "intensity" });
  assert.equal(shift.terrain.kind, "points");
  assert.ok(shift.terrain.points.length > 0 && shift.terrain.points.every((p) => p.x > 621000));
  assert.ok(Math.abs(shift.rows[0].z - r.cloud.z[0] * 0.3048) < 1e-9 && shift.rows[0].value === r.cloud.intensity[0]);
  // the plan: same CRS, no reprojection, metres
  const plan = await lidarCrsPlan(info, 26910);
  assert.deepEqual([plan.reproject, plan.zFactor, plan.problem], [null, 1, null]);
  const plan2 = await lidarCrsPlan(info, 32610);
  assert.equal(typeof plan2.reproject, "function");
  const q = plan2.reproject(620050, 5800030);
  assert.ok(Math.abs(q.x - 620050) < 5 && Math.abs(q.y - 5800030) < 5, "NAD83 to WGS 84 UTM 10N: within a few metres");
});

test("cell size and thinning", () => {
  const h = { min: [0, 0], max: [4000, 2000] };
  assert.equal(lidarCellSize(h, 200, 1e8), 20, "the detail setting when the points are dense");
  assert.ok(Math.abs(lidarCellSize(h, 200, 2000) - 2 * Math.sqrt(4000)) < 1e-9, "twice the point spacing when they are sparse");
  const t = thinTo([...Array(250).keys()], 100);
  assert.deepEqual([t.every, t.rows.length, t.rows[1]], [3, 84, 3]);
});

test("wired: the Geophysics tab's button, drop and survey method; the 3D View sends lidar there; laz-perf's licence text ships", () => {
  const g = readFileSync(new URL("../src/modules/GeophysicsModule.jsx", import.meta.url), "utf8");
  assert.match(g, /accept="\.las,\.laz"/);
  assert.match(g, /<LidarImportBox key=/);
  assert.match(g, /\["euler_depth", "mt_bostick", "lidar", "em1d_cond"\]\.includes\(meta\.method\)/);
  const v = readFileSync(new URL("../src/modules/viewer/useImportPipeline.js", import.meta.url), "utf8");
  assert.match(v, /requestModuleAction\("maps-lidar", \{ file:/);
  assert.match(readFileSync(new URL("../src/modules/MapsModule.jsx", import.meta.url), "utf8"), /useModuleAction\(\["maps-lidar"\], \(_a, p\) => \{ setPane\("terrain"\); requestModuleAction\("open-lidar", p\); \}\);/);
  assert.match(g, /if \(forcePane === "terrain" && p\?\.file\) openLidar\(p\.file\)/);
  assert.match(readFileSync(new URL("../src/lib/geophysSurveys.js", import.meta.url), "utf8"), /lidar: \{ label: "Lidar point cloud"/);
  assert.match(readFileSync(new URL("../scripts/licence-texts/laz-perf.txt", import.meta.url), "utf8"), /Apache License\s+Version 2\.0/);
  assert.match(readFileSync(new URL("../src/lib/lidar.worker.js", import.meta.url), "utf8"), /laz-perf\/lib\/worker\/laz-perf\.wasm\?url/);
  // survey points (a lidar cloud is one) are built as pick-only stand-ins (#1500), not one Mesh and material each
  assert.ok(readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8").includes('const mesh = new PickStandIn(proto, { color, transparent: st.opacity < 1, opacity: st.opacity, side: st.shape === "disc" ? THREE.DoubleSide : THREE.FrontSide }); // #312; #1994'));
});

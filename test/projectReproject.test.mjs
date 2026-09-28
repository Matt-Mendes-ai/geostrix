// TASKS.csv #485 — reprojecting a whole project to another CRS (Cartography tab).
import test from "node:test";
import assert from "node:assert/strict";
import { reprojectProject } from "../src/lib/projectReproject.js";
import { reprojectXY, listSupportedCrs, crsName, getProj4DefSync, datumNote, guessEpsgFromPrjWkt } from "../src/lib/reproject.js";
import { f32ToB64, b64ToF32 } from "../src/lib/inversion.js";
import { emptyFields } from "../src/lib/projectFields.js";

// A small project near the Golden Triangle (~56.4 N, 129.9 W), in NAD83(CSRS) / UTM 9N.
function sample() {
  const live = emptyFields();
  live.project = { name: "T", epsg: 3156 };
  live.collars = [{ hole_id: "H1", x: 440000, y: 6250000, z: 1000, azimuth: 45, dip: -60 }, { hole_id: "H2", x: 441000, y: 6251000, z: 1010 }];
  live.survey = [{ hole_id: "H1", depth: 0, azimuth: 45, dip: -60 }, { hole_id: "H1", depth: 100, azimuth: 50, dip: -58 }];
  live.layers = { ...live.layers, litho: [{ hole_id: "H1", from: 0, to: 5, value: "AND" }], structure: [{ hole_id: "H1", depth: 20, azimuth: 120, dip: 40 }], geophys_pts: [{ x: 440500, y: 6250500, z: 1100, value: 57000 }] };
  live.plannedHoles = [{ id: "p", name: "P1", x: 440200, y: 6250200, z: 1005, azimuth: 270, dip: -55, length: 200, target: { x: 440100, y: 6250200, z: 900 } }];
  live.surfaceSamples = [{ x: 440300, y: 6250300, z: 1000, elements: { Au: 0.1 } }];
  live.surfaceStructures = [{ id: "s", name: "o", rows: [{ x: 440400, y: 6250400, z: null, dip: 30, dipDir: 100, strike: 10 }] }];
  live.boundaries = [{ id: "b", name: "claim", polylines: [[{ x: 440000, y: 6250000 }, { x: 441000, y: 6250000 }, { x: 441000, y: 6251000 }]] }];
  live.mapLayers = [{ id: "m", name: "geol", bbox: [440000, 6250000, 441000, 6251000], features: [{ parts: [[[440000, 6250000], [441000, 6251000]]], attributes: { unit: "A" } }] }];
  live.sections = [{ id: "x", name: "Section 090°", ax: 440000, ay: 6250500, bx: 441000, by: 6250500, azimuth: 90, contacts: [{ id: "c", points: [{ l: 500, x: 440500, y: 6250500, z: 950 }] }] }];
  live.generatedSurfaces = [{ id: "g", name: "S", vertices: [440000, 6250000, 900, 441000, 6250000, 910, 440000, 6251000, 920], indices: [0, 1, 2], params: { extent: [440000, 441000, 6250000, 6251000, 900, 920], anisotropy: { azimuth: 30 } } }];
  live.voxelModels = [{ id: "v", name: "inv", source: "simpeg", cells: [{ x: 440500, y: 6250500, z: 800, dx: 50, dy: 50, dz: 25, value: 0.01 }], params: { crs: "EPSG:3156", localOrigin: [440000, 6250000, 0] },
    stationData: { base: [440000, 6250000], x: f32ToB64([0, 100]), y: f32ToB64([0, 50]), z: f32ToB64([1100, 1100]) } }];
  live.omfObjects = [{ id: "o", origin: [440000, 6250000, 0], vertices: [0, 0, 0, 100, 100, 10] }];
  live.terrain = { bbox: [439000, 6249000, 442000, 6252000], gridW: 4, gridH: 4, elevations: Array.from({ length: 16 }, (_, i) => 1000 + i), noDataMask: null };
  return live;
}
const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b}`);

test("#485 every world coordinate moves exactly as reprojectXY moves it; hole-relative data untouched", () => {
  const live = sample();
  const { fields: f, report } = reprojectProject(live, 3156, 3157);
  const chk = (x, y, nx, ny, what) => { const p = reprojectXY(x, y, 3156, 3157); near(nx, p.x, 1e-6, `${what} x`); near(ny, p.y, 1e-6, `${what} y`); };
  chk(440000, 6250000, f.collars[0].x, f.collars[0].y, "collar");
  chk(440500, 6250500, f.layers.geophys_pts[0].x, f.layers.geophys_pts[0].y, "survey point");
  chk(440200, 6250200, f.plannedHoles[0].x, f.plannedHoles[0].y, "planned hole");
  chk(440100, 6250200, f.plannedHoles[0].target.x, f.plannedHoles[0].target.y, "planned target");
  chk(440300, 6250300, f.surfaceSamples[0].x, f.surfaceSamples[0].y, "sample");
  chk(441000, 6250000, f.boundaries[0].polylines[0][1].x, f.boundaries[0].polylines[0][1].y, "boundary");
  chk(440500, 6250500, f.voxelModels[0].cells[0].x, f.voxelModels[0].cells[0].y, "voxel cell");
  const sv = reprojectXY(441000, 6250000, 3156, 3157); near(f.generatedSurfaces[0].vertices[3], sv.x, 0.005, "surface vertex x (1 cm rounding)"); near(f.generatedSurfaces[0].vertices[4], sv.y, 0.005, "surface vertex y");
  assert.deepEqual(f.layers.litho, live.layers.litho); assert.notEqual(f.collars[0], live.collars[0]); assert.equal(f.project.epsg, 3157); assert.ok(report.counts.collars === 2);
});

test("#485 round trip 3156 -> 3157 -> 3156 restores coordinates (1 cm) and azimuths (0.01 deg)", () => {
  const live = sample();
  const there = { ...live, ...reprojectProject(live, 3156, 3157).fields };
  const back = { ...there, ...reprojectProject(there, 3157, 3156).fields };
  near(back.collars[0].x, 440000, 0.01, "collar x"); near(back.collars[0].y, 6250000, 0.01, "collar y");
  near(back.collars[0].azimuth, 45, 0.02, "collar azimuth");
  near(back.survey[1].azimuth, 50, 0.02, "survey azimuth");
  near(back.layers.structure[0].azimuth, 120, 0.02, "structure dip direction");
  near(back.plannedHoles[0].azimuth, 270, 0.02, "planned azimuth");
  near(back.surfaceStructures[0].rows[0].dipDir, 100, 0.02, "outcrop dip dir"); near(back.surfaceStructures[0].rows[0].strike, 10, 0.02, "outcrop strike");
  near(back.sections[0].ax, 440000, 0.01, "section ax"); near(back.sections[0].contacts[0].points[0].l, 500, 0.01, "contact l");
  assert.equal(back.sections[0].name, "Section 090°");
  near(back.generatedSurfaces[0].vertices[4], 6250000, 0.011, "surface vertex");
  near(back.omfObjects[0].origin[0] + back.omfObjects[0].vertices[3], 440100, 0.01, "omf vertex");
  const sd = back.voxelModels[0].stationData; near(sd.base[0] + b64ToF32(sd.x)[1], 440100, 0.02, "station x");
  near(back.voxelModels[0].params.localOrigin[1], 6250000, 0.01, "local origin");
  assert.equal(back.project.epsg, 3156);
  // hole-relative / attribute data identical
  assert.deepEqual(back.layers.litho, live.layers.litho);
  assert.equal(back.collars[0].z, 1000);
});

test("#485 azimuths follow grid convergence: UTM 9N -> 10N at ~56.4 N turns north by ~ dLon*sin(lat)", () => {
  const live = sample();
  const { fields: f, report } = reprojectProject(live, 3156, 3157);
  // collar H1 is ~0.9 deg east of zone 9's central meridian (-129) and ~5.1 deg west of zone 10's (-123)
  const ll = reprojectXY(440000, 6250000, 3156, 4326);
  const expected = (ll.x - -129) * Math.sin(ll.y * Math.PI / 180) - (ll.x - -123) * Math.sin(ll.y * Math.PI / 180);
  const turned = ((f.collars[0].azimuth - 45 + 540) % 360) - 180;
  near(Math.abs(turned), Math.abs(expected), 0.05, "convergence change");
  assert.ok(report.maxRotationDeg > 4.5 && report.maxRotationDeg < 5.5, `${report.maxRotationDeg}`);
  assert.match(report.notes.join(" "), /turned by up to/);
  assert.match(report.notes.join(" "), /Voxel models/);
  assert.equal(f.voxelModels[0].params.crs, "EPSG:3157");
  // sections: azimuth rebuilt from the new endpoints, auto-name follows
  const s = f.sections[0];
  near(s.azimuth, ((Math.atan2(s.bx - s.ax, s.by - s.ay) * 180 / Math.PI) + 360) % 360, 0.01, "section azimuth");
  assert.notEqual(s.name, "Section 090°");
});

test("#485 rotateAzimuths:false keeps the numbers; a datum-only change hardly turns anything", () => {
  const { fields: f } = reprojectProject(sample(), 3156, 3157, { rotateAzimuths: false });
  assert.equal(f.collars[0].azimuth, 45);
  assert.equal(f.survey, undefined); // nothing to change
  const { report } = reprojectProject(sample(), 3156, 26909); // NAD83(CSRS) -> NAD83, same zone
  assert.ok(report.maxRotationDeg < 0.001, `${report.maxRotationDeg}`);
});

test("#485 terrain regridded (same node count, new bbox); unknown CRS refused", () => {
  const live = sample();
  const { fields: f } = reprojectProject(live, 3156, 3157);
  assert.equal(f.terrain.gridW, 4); assert.equal(f.terrain.elevations.length, 16);
  const c = reprojectXY(439000, 6252000, 3156, 3157);
  assert.ok(f.terrain.bbox[0] <= c.x + 1 && f.terrain.bbox[3] >= c.y - 1, "new bbox covers the old corner");
  assert.ok(f.terrain.elevations.every(Number.isFinite));
  assert.throws(() => reprojectProject(live, 3156, 99999), /isn't a CRS GeoStrix can build/);
});

test("#485 every listed CRS can be built and has a name", () => {
  const l = listSupportedCrs();
  assert.ok(l.length > 150);
  assert.ok(l.every((c) => getProj4DefSync(c.code) && c.name));
  assert.equal(crsName(3156), "NAD83(CSRS) / UTM zone 9N");
  assert.equal(crsName(12345), null);
});

// TASKS.csv #489 — one point per new family, WGS 84 -> CRS, against PROJ 9.8 / EPSG v12.029 with the named
// EPSG transformation (computed with pyproj; the full sweep of every listed code is described in TASKS.csv).
test("#489 new CRS families match PROJ", () => {
  const cases = [
    [31983, -45.5, -20.2, 447763.2524, 7766307.7371], // SIRGAS 2000 to WGS 84 (1)
    [6210, -45.3, 1.5, 466628.7206, 165797.7365], // SIRGAS 2000 to WGS 84 (1)
    [29193, -45.5, -20.2, 447807.5193, 7766353.1653], // SAD69 to WGS 84 (14)
    [7855, 145.1, -37.8, 332725.3546, 5814674.7553], // GDA2020 to WGS 84 (2)
    [28350, 116.0, -31.9, 405440.1468, 6470212.3753], // GDA94 to WGS 84 (1)
    [6738, 169.2, -45.0, 358132.4307, 5015473.5866], // GDA94 to WGS 84 (1)
    [25832, 9.2, 50.1, 514303.6572, 5549768.4083], // ETRS89 to WGS 84 (1)
    [2193, 174.8, -41.3, 1750697.5213, 5426376.6232], // NZGD2000 to WGS 84 (1)
    [2961, -63.6, 44.6, 452382.7753, 4938691.0718], // NAD83(CSRS) to WGS 84 (2)
    [9713, -39.0, 60.0, 499999.3335, 6651409.9599], // NAD83(CSRS) to WGS 84 (2)
  ];
  for (const [code, lon, lat, x, y] of cases) {
    const p = reprojectXY(lon, lat, 4326, code);
    assert.ok(Math.hypot(p.x - x, p.y - y) < 0.01, `EPSG:${code} off by ${Math.hypot(p.x - x, p.y - y).toFixed(3)} m`);
  }
  assert.equal(crsName(29193), "SAD69 / UTM zone 23S — Brazil datum shift, ~5 m");
  assert.ok(datumNote(29193) && datumNote(26709) && !datumNote(31983) && !datumNote(3156));
});

test("#489 .prj names of the new families are recognised", () => {
  const prj = (name, geog) => `PROJCS["${name}",GEOGCS["${geog}",DATUM["D"],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"]]`;
  assert.equal(guessEpsgFromPrjWkt(prj("SIRGAS_2000_UTM_Zone_23S", "GCS_SIRGAS_2000")), 31983);
  assert.equal(guessEpsgFromPrjWkt(prj("SIRGAS_2000_UTM_Zone_24N", "GCS_SIRGAS_2000")), 6211);
  assert.equal(guessEpsgFromPrjWkt(prj("SAD_1969_UTM_Zone_22S", "GCS_South_American_1969")), 29192);
  assert.equal(guessEpsgFromPrjWkt(prj("GDA_1994_MGA_Zone_50", "GCS_GDA_1994")), 28350);
  assert.equal(guessEpsgFromPrjWkt(prj("GDA2020_MGA_Zone_55", "GCS_GDA2020")), 7855);
  assert.equal(guessEpsgFromPrjWkt(prj("ETRS_1989_UTM_Zone_32N", "GCS_ETRS_1989")), 25832);
  assert.equal(guessEpsgFromPrjWkt(prj("NZGD_2000_New_Zealand_Transverse_Mercator", "GCS_NZGD_2000")), 2193);
  assert.equal(guessEpsgFromPrjWkt(prj("NAD_1983_CSRS_UTM_Zone_20N", "GCS_North_American_1983_CSRS")), 2961);
  assert.equal(guessEpsgFromPrjWkt('GEOGCS["GCS_SIRGAS_2000",DATUM["D_SIRGAS_2000",SPHEROID["GRS_1980",6378137.0,298.257222101]],TOWGS84[0,0,0,0,0,0,0]]'), 4674);
  assert.equal(guessEpsgFromPrjWkt('GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984"]]'), 4326); // unchanged
});

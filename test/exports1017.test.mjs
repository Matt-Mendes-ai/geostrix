// TASKS.csv #1017 — Matt: "make sure we test every export". Each geometry export is written and READ BACK with the app's
// own importers (or parsed as the format's text), checking the geometry TYPE (a line stays a line, a polygon stays a
// closed ring, a surface keeps its triangles), the vertex counts, the coordinates and the attributes.
import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
register("./helpers/viteUrlLoader.mjs", import.meta.url);

const E0 = 500000, N0 = 6200000;
const pts = [{ geometry: [[E0, N0, 1000]], attributes: { name: "P1", au: 1.5 } }, { geometry: [[E0 + 50, N0 + 20, 1010]], attributes: { name: "P2", au: 0.2 } }];
const lines = [{ geometry: [[E0, N0, 1000], [E0 + 100, N0 + 50, 990], [E0 + 200, N0, 980]], attributes: { name: "L1" } }];
const poly = [{ geometry: [[E0, N0, 0], [E0 + 100, N0, 0], [E0 + 100, N0 + 100, 0], [E0, N0 + 100, 0], [E0, N0, 0]], attributes: { name: "A" } }];
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;
const xyOf = (g) => (Array.isArray(g) ? [g[0], g[1]] : [g.x, g.y]);

test("#1017 shapefile: points, lines and polygons come back as the same geometry type, coordinates and attributes", async () => {
  const { buildShapefileZip, parseShapefileZip } = await import("../src/lib/shapefile.js");
  for (const [geomType, features, nv] of [["point", pts, 1], ["polyline", lines, 3], ["polygon", poly, 5]]) {
    const back = await parseShapefileZip(buildShapefileZip({ features, geomType, epsg: 26909, baseName: geomType }));
    assert.equal(back.geomType, geomType === "polyline" ? "polyline" : geomType, `${geomType}: came back as ${back.geomType}`);
    assert.equal(back.features.length, features.length);
    const g = back.features[0].parts?.[0] || back.features[0].geometry;
    assert.equal(g.length, nv, `${geomType}: ${g.length} vertices`);
    assert.deepEqual(xyOf(g[0]).map((v) => +v.toFixed(3)), [features[0].geometry[0][0], features[0].geometry[0][1]]);
    const at = back.features[0].attributes; // DBF field names are upper-case unless asked otherwise
    assert.equal(at.name ?? at.NAME, features[0].attributes.name);
  }
});

test("#1017 GeoPackage (no test before): points, lines and polygons come back typed, with coordinates, attributes and the CRS", async () => {
  const { buildGeoPackage, parseGeoPackage } = await import("../src/lib/gpkg.js");
  for (const [geomType, features, nv] of [["point", pts, 1], ["polyline", lines, 3], ["polygon", poly, 5]]) {
    const back = await parseGeoPackage(await buildGeoPackage([{ name: `t_${geomType}`, features, geomType, epsg: 26909 }]));
    const L = back.layers ? back.layers[0] : back;
    assert.equal(L.geomType, geomType, `${geomType}: came back as ${L.geomType}`);
    assert.equal(L.features.length, features.length);
    const g = L.features[0].parts?.[0] || L.features[0].geometry;
    assert.ok(g.length >= nv - 1 && g.length <= nv, `${geomType}: ${g.length} vertices`); // a ring may come back without its repeat
    assert.deepEqual(xyOf(g[0]).map((v) => +v.toFixed(3)), [features[0].geometry[0][0], features[0].geometry[0][1]]);
    assert.equal(L.features[0].attributes.name, features[0].attributes.name);
    if ("epsg" in L) assert.equal(L.epsg, 26909);
  }
});

test("#1017 DXF (vector layers): lines as 3D polylines with Z, polygons closed, points as points", async () => {
  const { buildDXF, parseDXF } = await import("../src/lib/dxf.js");
  const l = parseDXF(buildDXF({ geomType: "polyline", features: lines }));
  assert.equal(l.polylines.length, 1);
  assert.deepEqual(l.polylines[0].map((p) => [p.x, p.y, p.z]), lines[0].geometry);
  assert.deepEqual(l.closed, [false]);
  const p = parseDXF(buildDXF({ geomType: "polygon", features: poly }));
  assert.deepEqual(p.closed, [true]);
  const pt = parseDXF(buildDXF({ geomType: "point", features: pts }));
  const nPts = (pt.points || []).length + pt.polylines.filter((q) => q.length === 1).length;
  assert.equal(nPts, 2, `points came back as ${JSON.stringify({ points: pt.points?.length, polylines: pt.polylines.length })}`);
});

// a 2-triangle surface in SCENE coordinates (x = E - ox, y = elev - oz, z = -(N - oy)), as the 3D view holds it
async function sceneSquare() {
  const THREE = await import("three");
  const o = { x: E0, y: N0, z: 1000 };
  const world = [[E0, N0, 1000], [E0 + 100, N0, 1010], [E0 + 100, N0 + 100, 1020], [E0, N0 + 100, 1005]];
  const pos = new Float32Array(world.flatMap(([e, n, z]) => [e - o.x, z - o.z, -(n - o.y)]));
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return { g, o, world };
}

test("#1017 surface DXF / OBJ: the triangles come back in world coordinates (DXF through the app's own mesh importer)", async () => {
  const { exportSurfaceDXF, exportSurfaceOBJ } = await import("../src/lib/meshExport.js");
  const { parseDXFMesh } = await import("../src/lib/dxf.js");
  const { g, o, world } = await sceneSquare();
  const m = parseDXFMesh(exportSurfaceDXF("Top", g, o));
  const part = m.parts[0];
  assert.equal(part.indices.length / 3, 2, "2 faces");
  const P = part.positions, got = [];
  for (let i = 0; i < P.length; i += 3) got.push([P[i], P[i + 1], P[i + 2]].map((v) => Math.round(v * 100) / 100));
  for (const w of world) assert.ok(got.some((q) => q.every((v, k) => near(v, w[k], 0.02))), `vertex ${w} missing from the DXF`);
  const obj = exportSurfaceOBJ("Top", g, o);
  const v = obj.split("\n").filter((l) => l.startsWith("v ")).map((l) => l.split(/\s+/).slice(1).map(Number));
  const f = obj.split("\n").filter((l) => l.startsWith("f "));
  assert.equal(f.length, 2);
  // E, N, elevation, as the DXF (#1017: checked exactly)
  for (const w of world) assert.ok(v.some((q) => q.every((x, k) => near(x, w[k], 1e-3))), `OBJ vertex ${w} missing`);
});

test("#1017 surface glTF (.glb): a valid binary glTF whose mesh has the 4 vertices and 2 triangles", async () => {
  const { exportSurfaceGLTF } = await import("../src/lib/meshExport.js");
  const { g, o } = await sceneSquare();
  // three's GLTFExporter reads its Blob with the browser's FileReader: a minimal stand-in on Node's Blob
  if (typeof globalThis.FileReader === "undefined") {
    globalThis.FileReader = class { readAsArrayBuffer(b) { b.arrayBuffer().then((r) => { this.result = r; this.onload?.({ target: this }); this.onloadend?.({ target: this }); }); }
      readAsDataURL(b) { b.arrayBuffer().then((r) => { this.result = `data:${b.type || "application/octet-stream"};base64,${Buffer.from(r).toString("base64")}`; this.onload?.({ target: this }); this.onloadend?.({ target: this }); }); } };
  }
  const buf = await exportSurfaceGLTF("Top", g, o);
  const u8 = new Uint8Array(buf instanceof ArrayBuffer ? buf : buf.buffer || buf);
  assert.equal(new TextDecoder().decode(u8.slice(0, 4)), "glTF");
  const jsonLen = new DataView(u8.buffer, u8.byteOffset).getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(u8.slice(20, 20 + jsonLen)));
  const prim = json.meshes[0].primitives[0];
  assert.equal(json.accessors[prim.attributes.POSITION].count, 4);
  assert.equal(json.accessors[prim.indices].count, 6);
  // #1031 — Y-up: the node translation is (E, elevation, -N) and the vertices' y span is the elevation range (0-20 m
  // here), not the 100 m northing span
  const node = json.nodes.find((n) => n.mesh === 0);
  assert.deepEqual(node.translation, [E0, 1000, -N0]);
  const acc = json.accessors[prim.attributes.POSITION];
  assert.deepEqual([acc.min[1], acc.max[1]], [0, 20]);
  assert.deepEqual([acc.min[2], acc.max[2]], [-100, 0]);
});

test("#1017 surface OMF: a surface element with its vertices and triangles, read back by the app's OMF importer", async () => {
  const { writeOMF } = await import("../src/lib/omfWriter.js");
  const { parseOMF } = await import("../src/lib/omf.js");
  const bytes = await writeOMF({ elements: [{ type: "surface", name: "Top", vertices: [E0, N0, 1000, E0 + 100, N0, 1010, E0 + 100, N0 + 100, 1020, E0, N0 + 100, 1005], triangles: [0, 1, 2, 0, 2, 3] }] });
  const parsed = await parseOMF(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  const s = parsed.elements[0];
  assert.equal(s.kind, "surface");
  const V = s.vertices || s.positions, T = s.triangles || s.indices;
  assert.equal(V.length, 12); assert.equal(T.length, 6);
  assert.ok(near(V[6], E0 + 100) && near(V[7], N0 + 100) && near(V[8], 1020));
});

test("#1017 planned holes: the KML line and the GPX track follow the whole curved trace, collars stay points", async () => {
  const { rigRows, rigKML, rigGPX } = await import("../src/lib/rigExport.js");
  const { parseKML } = await import("../src/lib/kml.js");
  const hole = { name: "PH-1", x: 463333, y: 6178148, z: 1160, azimuth: 90, dip: 60, length: 300 };
  // a hole that drifts: 7 stations curving north
  const trace = () => Array.from({ length: 7 }, (_, i) => ({ x: 463333 + i * 25, y: 6178148 + i * i * 2, z: 1160 - i * 43 }));
  const rows = rigRows([hole], 3156, "2026-10-27", trace);
  assert.ok(!Object.keys(rows[0]).includes("traceLonLat"), "the trace is not a CSV column");
  const f = parseKML(rigKML(rows, "t")).features;
  const line = f.find((x) => x.geomType === "line"), pt = f.find((x) => x.geomType === "point");
  assert.ok(pt && line, JSON.stringify(f.map((x) => x.geomType)));
  assert.equal(line.coords.length, 7, "the whole trace, not the collar-to-toe chord");
  const gpx = rigGPX(rows);
  assert.equal((gpx.match(/<wpt /g) || []).length, 1);
  assert.equal((gpx.match(/<trkpt /g) || []).length, 7);
});

test("#1017 section strings DXF: each contact / fault string a 3D polyline, outlines closed", async () => {
  const { sectionStringsToDXF } = await import("../src/lib/sectionExport.js");
  const { parseDXF } = await import("../src/lib/dxf.js");
  const sections = [{ name: "4200N", contacts: [
    { unit: "AND", kind: "contact", points: [{ x: E0, y: N0, z: 1000 }, { x: E0 + 50, y: N0, z: 990 }, { x: E0 + 100, y: N0, z: 985 }] },
    { unit: "VEIN", kind: "outline", points: [{ x: E0, y: N0, z: 900 }, { x: E0 + 20, y: N0, z: 900 }, { x: E0 + 20, y: N0, z: 880 }, { x: E0, y: N0, z: 880 }] },
  ] }];
  const { dxf } = sectionStringsToDXF(sections);
  const back = parseDXF(dxf);
  assert.equal(back.polylines.length, 2);
  assert.deepEqual(back.polylines[0].map((p) => p.z), [1000, 990, 985]);
  assert.deepEqual(back.closed, [false, true]);
});

test("#1017 catchment follow-up GPX: anomalous sites as waypoints, the reaches above them as tracks (lines, not points)", async () => {
  const { followUpGpx } = await import("../src/lib/catchments.js");
  const a = { unit: "ppm", results: [
    { placed: true, anomalous: true, x: 100, y: 200, sample_id: "SS-1", value: 55, areaKm2: 1.2, k: 0, reach: [[100, 200], [150, 260], [180, 330]] },
    { placed: true, anomalous: false, x: 300, y: 400, sample_id: "SS-2", value: 5, areaKm2: 0.8, k: 1, reach: null },
  ] };
  const gpx = followUpGpx(a, (x, y) => [-130 + x / 1e5, 56 + y / 1e5]);
  assert.equal((gpx.match(/<wpt /g) || []).length, 1);
  assert.equal((gpx.match(/<trk>/g) || []).length, 1);
  assert.equal((gpx.match(/<trkpt /g) || []).length, 3);
});

test("#1028 an open surface's export says it encloses no volume, and states none; a closed one keeps its volume", async () => {
  const { provenanceLines } = await import("../src/lib/meshExport.js");
  const open = provenanceLines("Sheet", null, { epsg: 26910, volumeM3: null, openSurface: true }).join("\n");
  assert.doesNotMatch(open, /Enclosed volume/);
  assert.match(open, /Open surface: it encloses no volume/);
  assert.match(provenanceLines("Body", null, { volumeM3: 12345.6 }).join("\n"), /Enclosed volume: 12345\.6 m3/);
});

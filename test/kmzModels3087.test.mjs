// TASKS.csv #3087 part 2 — the project KMZ's 3D models: generated surfaces, block models and the terrain as COLLADA models, the section images as
// textured upright pictures; each placed by a KML <Model> in metres east / north / up of its own origin (exact, through Earth-centred
// coordinates); colours as materials (Google Earth draws no vertex colours); a part added to the dialog later starts ticked.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { modelFrame, vertexNormals, daeDocument, surfaceMesh, terrainMesh, voxelMeshes, sectionImageMesh, buildModel, hexColour, BOX_MAX_CELLS } from "../src/lib/kmzModels.js";
import { buildProjectKml, estimateProjectKmz, KMZ_PARTS } from "../src/lib/projectKmz.js";

const toLonLat = (x, y) => [-130 + (x - 500000) / 1e5, 56 + (y - 6200000) / 1e5]; // as test/projectKmz3068's: about 1.1 m per metre north
const D = Math.PI / 180, A = 6378137, F = 1 / 298.257223563, E2 = F * (2 - F);
const ecef = (lon, lat, h) => { const s = Math.sin(lat * D), N = A / Math.sqrt(1 - E2 * s * s); return [(N + h) * Math.cos(lat * D) * Math.cos(lon * D), (N + h) * Math.cos(lat * D) * Math.sin(lon * D), (N * (1 - E2) + h) * s]; };

test("the frame: every distance kept exactly (a rotation of Earth-centred coordinates), up is up, and the curvature comes off far from the origin", () => {
  const xyz = [500000, 6200000, 1000, 504000, 6200000, 1000, 500000, 6204000, 1200, 502000, 6202000, 900];
  const fr = modelFrame(xyz, toLonLat);
  assert.equal(fr.origin.alt, 900); // the lowest point
  const P = (i) => ecef(...toLonLat(xyz[3 * i], xyz[3 * i + 1]), xyz[3 * i + 2]), L = (i) => [fr.local[3 * i], fr.local[3 * i + 1], fr.local[3 * i + 2]];
  for (const [a, b] of [[0, 1], [0, 2], [1, 3], [2, 3]]) {
    const pa = P(a), pb = P(b), la = L(a), lb = L(b);
    assert.ok(Math.abs(Math.hypot(...pa.map((v, k) => v - pb[k])) - Math.hypot(...la.map((v, k) => v - lb[k]))) < 1e-6, `distance ${a}-${b}`);
  }
  assert.ok(L(3)[2] > -1 && L(3)[2] < 1, "the middle point sits near the origin's height"); // 900 at the centre of the box
  assert.ok(L(1)[0] - L(0)[0] > 2400 && Math.abs(L(1)[1] - L(0)[1]) < 1e-6, "east is east"); // 0.04 degrees of longitude at 56 N: about 2.5 km
  // 2.55 km from the centre, the tangent plane is d^2 / 2R = 0.51 m above the point
  assert.ok(L(0)[2] - 100 < -0.3 && L(0)[2] - 100 > -0.7, `curvature ${L(0)[2] - 100}`);
  assert.equal(modelFrame([1, 2, 3], () => [NaN, 0]), null, "a vertex that does not transform");
});

test("normals, colours and the DAE: counts that agree, a transparent material only below 1, Google Earth's double-sided flag, a texture", () => {
  const n = vertexNormals(new Float64Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), [0, 1, 2]);
  assert.deepEqual([...n.slice(0, 3)], [0, 0, 1]);
  assert.equal(hexColour(0xc08040), "#c08040"); assert.equal(hexColour("C08040"), "#c08040"); assert.equal(hexColour("red"), null);
  const pos = new Float64Array([0, 0, 0, 10, 0, 0, 0, 10, 0, 10, 10, 0]);
  const dae = daeDocument("Two & <three>", [
    { positions: pos, normals: vertexNormals(pos, [0, 1, 2, 1, 3, 2]), indices: [0, 1, 2, 1, 3, 2], color: "#ff0000", alpha: 1 },
    { positions: pos, normals: vertexNormals(pos, [0, 1, 2]), indices: [0, 1, 2], uvs: [0, 0, 1, 0, 0, 1, 1, 1], color: "#ffffff", alpha: 0.4, doubleSided: true, texture: "sec_0.png" },
  ]);
  assert.match(dae, /<up_axis>Z_UP<\/up_axis>/); assert.match(dae, /<unit name="meter" meter="1"\/>/);
  assert.match(dae, /<visual_scene id="scene" name="Two &amp; &lt;three&gt;">/);
  const tris = [...dae.matchAll(/<triangles material="m(\d)" count="(\d+)">(.*?)<p>([^<]*)<\/p>/g)];
  assert.deepEqual(tris.map((t) => [t[2], t[4].split(" ").length]), [["2", 12], ["1", 9]]); // count x 3 vertices x (2 or 3 inputs)
  assert.equal((dae.match(/<transparent opaque="A_ONE"><color>1 1 1 0.4<\/color><\/transparent>/g) || []).length, 1);
  assert.equal((dae.match(/<double_sided>1<\/double_sided>/g) || []).length, 1);
  assert.match(dae, /<image id="img1"><init_from>sec_0\.png<\/init_from><\/image>/);
  assert.match(dae, /<bind_vertex_input semantic="uv0" input_semantic="TEXCOORD" input_set="0"\/>/);
  for (const [, count, body] of dae.matchAll(/<float_array id="[^"]+" count="(\d+)">([^<]*)</g)) assert.equal(body.split(" ").length, Number(count));
});

test("a block model as the 3D View shows it: the cells in its cutoff band, their outer faces, one material per colour, outward winding", () => {
  const cells = [];
  for (let k = 0; k < 2; k++) for (let j = 0; j < 3; j++) for (let i = 0; i < 4; i++) cells.push({ x: 500000 + 25 * i + 12.5, y: 6200000 + 25 * j + 12.5, z: 900 + 10 * k + 5, dx: 25, dy: 25, dz: 10, value: i + 4 * j + 12 * k });
  const model = { id: "v", name: "Block model", cells, threshold: 10, stops: [{ value: 0, color: "#0000ff" }, { value: 23, color: "#ff0000" }], colorMode: "discrete", opacity: 0.6 };
  const v = voxelMeshes(model);
  assert.equal(v.cells, 14); // the top slab (12) and the two cells of 10 and 11 below it
  assert.equal(v.faces, 44); // the slab's 38 less the 2 bottoms covered, plus the 8 open faces of the two below (counted by hand)
  assert.deepEqual(v.parts.map((p) => [p.color, p.indices.length / 6, p.alpha]), [["#0000ff", 41, 0.6], ["#ff0000", 3, 0.6]]); // discrete: only 23 is red (its top, east and north)
  for (const p of v.parts) for (let f = 0; f < p.indices.length / 6; f++) {
    const c = [0, 1, 2].map((q) => [0, 1, 2].map((a) => p.xyz[(f * 4 + q) * 3 + a]));
    const u = c[1].map((x, a) => x - c[0][a]), w = c[2].map((x, a) => x - c[0][a]);
    const cr = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    assert.ok(cr[0] * p.normals[f * 12] + cr[1] * p.normals[f * 12 + 1] + cr[2] * p.normals[f * 12 + 2] > 0, "winding agrees with the normal");
  }
  // the top faces are at the slab's top (920 m), in world coordinates
  const tops = v.parts.flatMap((p) => [...Array(p.indices.length / 6).keys()].filter((f) => p.normals[f * 12 + 2] === 1).map((f) => p.xyz[f * 12 + 2]));
  assert.deepEqual([...new Set(tops)], [920]); assert.equal(tops.length, 12);
  // not on a rectilinear grid: whole boxes; a cutoff that hides everything: nothing
  const odd = voxelMeshes({ ...model, cells: [...cells.slice(0, 5), { x: 500010, y: 6200010, z: 905, dx: 7, dy: 7, dz: 10, value: 20 }] });
  assert.equal(odd.cells, 1); assert.equal(odd.faces, 6);
  assert.equal(voxelMeshes({ ...model, threshold: 99 }), null);
  assert.ok(BOX_MAX_CELLS >= 100_000);
});

test("the terrain: thinned, holes left open, every triangle facing up; a generated surface's colour and style; a section image's quad", () => {
  const el = []; for (let j = 0; j < 4; j++) for (let i = 0; i < 5; i++) el.push(j === 2 && i === 2 ? NaN : 1000 + i * 2 + j);
  const t = terrainMesh({ bbox: [500000, 6200000, 500400, 6200300], gridW: 5, gridH: 4, elevations: el });
  assert.equal(t.indices.length / 3, 18); // 24 less the 6 that touch the missing node
  for (let k = 0; k < t.indices.length; k += 3) {
    const [a, b, c] = [0, 1, 2].map((q) => [t.xyz[3 * t.indices[k + q]], t.xyz[3 * t.indices[k + q] + 1]]);
    assert.ok((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) > 0);
  }
  assert.equal(t.xyz[1], 6200300); // row 0 is the north edge
  assert.equal(t.color, "#8a7f68"); // the 3D View's terrain colour
  const big = terrainMesh({ bbox: [0, 0, 1000, 1000], gridW: 1201, gridH: 1201, elevations: new Float64Array(1201 * 1201).fill(5) });
  assert.equal(big.thinnedBy, 4); assert.equal(big.xyz.length / 3, 301 * 301);
  const s = surfaceMesh({ vertices: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: [0, 1, 2], color: 0x336699, opacity: 0.5 });
  assert.deepEqual([s.color, s.alpha, s.doubleSided], ["#336699", 0.5, true]);
  assert.deepEqual([surfaceMesh({ vertices: [[0, 0, 0], [1, 0, 0], [0, 1, 0]], indices: [0, 1, 2], color: 0x336699, style: { color: "#aa0000", opacity: 0.9 } })].map((m) => [m.color, m.alpha]), [["#aa0000", 0.9]]);
  assert.equal(surfaceMesh({ vertices: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: [0, 1, 7] }), null, "an index past the vertices");
  const q = sectionImageMesh({ corners: [[0, 0, 10], [10, 0, 10], [10, 0, 0], [0, 0, 0]], opacity: 0.8 }, "sec_0.jpg");
  assert.deepEqual([q.indices.length, q.uvs.length, q.texture, q.alpha, q.doubleSided], [6, 8, "sec_0.jpg", 0.8, true]);
  assert.equal(sectionImageMesh({ corners: [[0, 0, 10], [10, 0, 10]] }, "x"), null);
  const m = buildModel("Surface", [s], (x, y) => toLonLat(500000 + x, 6200000 + y));
  assert.equal(m.triangles, 1); assert.match(m.dae, /<COLLADA /);
});

test("in the project KMZ: a 3D models folder (surfaces, block models with their legend, the terrain unticked), the section images under Sections, the files beside", () => {
  const cells = [];
  for (let i = 0; i < 3; i++) cells.push({ x: 500000 + 10 * i, y: 6200000, z: 800, dx: 10, dy: 10, dz: 10, value: i });
  const ctx = {
    projectName: "Models",
    generatedSurfaces: [{ id: "s1", name: "Grade shell 0.5 g/t", type: "shell", visible: true, color: 0xffaa00, opacity: 0.6, vertices: [500000, 6200000, 800, 500100, 6200000, 810, 500000, 6200100, 820], indices: [0, 1, 2] },
      { id: "s2", name: "Fault", visible: false, color: 0x0000ff, vertices: [500000, 6200000, 800, 500100, 6200000, 810, 500000, 6200100, 820], indices: [0, 2, 1] }],
    voxelModels: [{ id: "v1", name: "Mag inversion", cells, min: 0, max: 2, opacity: 1, visible: true }],
    terrain: { name: "DEM", bbox: [500000, 6200000, 500200, 6200200], gridW: 3, gridH: 3, elevations: [900, 901, 902, 903, 904, 905, 906, 907, 908], visible: true },
    sectionImages: [{ id: "i1", name: "L100 scan", dataUrl: "data:image/jpeg;base64,/9j/", corners: [[500000, 6200000, 900], [500300, 6200000, 900], [500300, 6200000, 600], [500000, 6200000, 600]], opacity: 1, visible: true }],
  };
  const legends = [];
  const opts = { toLonLat, legendPng: (g) => { legends.push(g.label); return { bytes: new Uint8Array([1]), width: 100, height: 40 }; }, imageBytes: (u) => (String(u).startsWith("data:image/jpeg") ? { bytes: new Uint8Array([255, 216]), ext: "jpg" } : null) };
  const out = buildProjectKml(ctx, opts);
  const k = out.kml;
  assert.ok(k.indexOf("<name>3D models</name>") > 0 && k.indexOf("<name>Generated surfaces</name>") > k.indexOf("<name>3D models</name>"));
  assert.match(k, /<Placemark><name>Grade shell 0\.5 g\/t<\/name><styleUrl>[^<]+<\/styleUrl><ExtendedData>.*?<\/ExtendedData><Model><altitudeMode>absolute<\/altitudeMode><Location><longitude>-129\.9995/);
  assert.match(k, /<Placemark><name>Fault<\/name><visibility>0<\/visibility>/);
  assert.match(k, /<Folder><name>Terrain<\/name><description>Unticked: Google Earth draws its own terrain[^<]*<\/description>\n<Placemark><name>DEM<\/name><visibility>0<\/visibility>/);
  assert.match(k, /<Folder><name>Sections<\/name>\n<Folder><name>Section images<\/name>\n<Placemark><name>L100 scan<\/name>/);
  assert.ok(legends.includes("Mag inversion"), "the block model's legend");
  const names = out.files.map((f) => f.name);
  assert.deepEqual(names.filter((n) => n.startsWith("models/")), ["models/model_0.dae", "models/sec_0.jpg", "models/model_1.dae", "models/model_2.dae", "models/model_3.dae", "models/model_4.dae"]); // Sections come before 3D models
  assert.ok(out.files.filter((f) => f.name.endsWith(".dae")).every((f) => f.deflate === true));
  const secDae = new TextDecoder().decode(out.files.find((f) => f.name === "models/model_0.dae").data);
  assert.match(secDae, /<init_from>sec_0\.jpg<\/init_from>/); // beside the .dae in models/
  assert.equal(out.counts.models, 5);
  // the dialog's parts: without "models" no models folder (the section images go with Sections)
  const noModels = buildProjectKml(ctx, { ...opts, include: new Set(["sections"]) });
  assert.ok(!noModels.kml.includes("<name>3D models</name>") && noModels.kml.includes("<name>Section images</name>"));
  // a model whose vertex does not transform is left out and said so
  const bad = buildProjectKml({ generatedSurfaces: [ctx.generatedSurfaces[0]] }, { toLonLat: () => [NaN, NaN] });
  assert.deepEqual(bad.counts.skipped, [{ kind: "model-place", name: "Grade shell 0.5 g/t" }]);
  assert.ok(estimateProjectKmz(ctx) > estimateProjectKmz({}));
  assert.ok(KMZ_PARTS.some((p) => p.key === "models"));
});

test("the dialog: a part added later starts ticked (the unticked parts are remembered); the old list form is read against the parts it knew", async () => {
  const src = readFileSync(new URL("../src/components/ProjectKmzDialog.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n"); // a CRLF checkout: the cut below looks for LF line ends
  assert.match(src, /models: any\(store\.generatedSurfaces\) \|\| any\(store\.voxelModels\) \|\| !!store\.terrain/);
  assert.match(src, /sections: any\(store\.sections\) \|\| any\(store\.sectionImages\)/);
  assert.match(src, /localStorage\.setItem\(PREF, JSON\.stringify\(\{ off: /);
  // the function itself, without React: cut out of the file
  const fn = src.slice(src.indexOf("const FIRST_PARTS"), src.indexOf("\n}\n", src.indexOf("export function pickedFromPref")) + 2).replace("export function", "function");
  const pickedFromPref = new Function(`${fn}; return pickedFromPref;`)();
  const keys = KMZ_PARTS.map((p) => p.key);
  assert.deepEqual([...pickedFromPref(["drillholes", "surface"], keys)], ["drillholes", "surface", "models"]);
  assert.deepEqual([...pickedFromPref({ off: ["models"] }, keys)], ["drillholes", "surface", "sections", "design", "rasters"]);
  assert.deepEqual([...pickedFromPref(null, keys)], keys);
  const exp = readFileSync(new URL("../src/lib/projectKmzExport.js", import.meta.url), "utf8");
  assert.match(exp, /generatedSurfaces: store\.generatedSurfaces, voxelModels: store\.voxelModels, terrain: store\.terrain, sectionImages: store\.sectionImages/);
  assert.match(exp, /include, imageBytes: dataUrlBytes \}\)/);
});

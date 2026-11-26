// TASKS.csv #4078 — inversion models beside their mesh that were not read: a mesh named .mesh, a .res model, a Res3DInv .inv (its own blocks and
// models), a model with no mesh and a Geosoft .con that is no model. Synthetic files only, of the shapes side 1's harvest found.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isRes3dinvText, parseRes3dinvModel, res3dinvTensor, res3dinvIpProperty, looksNorthingFirst } from "../src/lib/res3dinv.js";
import { UBC_MESH_NAME, UBC_MODEL_NAME, looksLikeUbcModelText, isGeosoftControlText, ubcLoneAdvice } from "../src/lib/ubcFiles.js";
import { ubcMeshToCells, isUBCMeshText, parseUBCMesh, parseUBCModel } from "../src/lib/voxel.js";

// a Res3DInv .inv as Res3DInv writes it after an inversion: head, two readings, layers and blocks, then MODEL / IP MODEL per iteration
function makeInv({ xs, ys, depths, value, iterations = 2, ip = true, model = true }) {
  const L = ["Synthetic 3D IP survey", String(xs.length), String(ys.length), "Nonuniform grid", "X-location of grid-lines", xs.join(" "), "Y-location of grid-lines", ys.join(" "), "11", "0",
    "Type of data (0=apparent resistivity,1=resistance)", "0", "2"];
  if (ip) L.push("IP present", "Chargeability", "mV/V", "0.500 1.100");
  L.push(`3 ${xs[0]} ${ys[0]} ${xs[1]} ${ys[1]} ${xs[2]} ${ys[1]} 120.5 4.2`, `3 ${xs[0]} ${ys[0]} ${xs[2]} ${ys[1]} ${xs[3] ?? xs[2]} ${ys[1]} 98.1 3.9`);
  if (!model) return L.join("\r\n") + "\r\n";
  const nbx = xs.length - 1, nby = ys.length - 1;
  L.push(String(depths.length - 1), depths.map((d) => d.toFixed(4)).join(" "), "Coordinates of blocks");
  for (let k = 0; k < depths.length - 1; k++) {
    L.push(`Layer ${k + 1}`, `${nbx}  ${nby}`);
    let b = 1;
    for (let j = 0; j < nby; j++) for (let i = 0; i < nbx; i++) {
      L.push(`Block ${b++}`);
      for (const z of [depths[k], depths[k + 1]]) for (const [x, y] of [[xs[i], ys[j]], [xs[i], ys[j + 1]], [xs[i + 1], ys[j + 1]], [xs[i + 1], ys[j]]]) L.push(`${x.toFixed(4)}  ${y.toFixed(4)}  ${z.toFixed(4)}`);
    }
  }
  for (let it = 1; it <= iterations; it++) {
    for (const kind of ip ? ["res", "ip"] : ["res"]) {
      L.push(kind === "res" ? "MODEL" : "IP MODEL");
      for (let k = 0; k < depths.length - 1; k++) {
        L.push(`LAYER ${k + 1}`);
        for (let j = 0; j < nby; j++) L.push(Array.from({ length: nbx }, (_, i) => value(kind, i, j, k, it).toFixed(3)).join("     "));
      }
    }
    L.push("CALCULATED APPARENT RESISTIVITY", "120.0", "98.0");
  }
  L.push("Iteration 1 - Time taken in seconds 1.00, Abs. error 5.0", "RES3DINV ver. 2.16.79");
  return L.join("\r\n") + "\r\n";
}
const val = (kind, i, j, k, it) => (kind === "res" ? 100 * it + 10 * k + i + 0.1 * j : it + 0.5 * k + 0.01 * i);

test("#4078 a Res3DInv .inv: its blocks and the LAST iteration's resistivity and IP models", () => {
  const text = makeInv({ xs: [500000, 500050, 500100, 500200], ys: [7000000, 7000050, 7000100], depths: [0, 10, 25], value: val, iterations: 3 });
  assert.equal(isRes3dinvText(text.slice(0, 600)), true);
  const p = parseRes3dinvModel(text);
  assert.equal(p.layers.length, 2);
  assert.deepEqual([p.layers[0].nbx, p.layers[0].nby], [3, 2]);
  assert.equal(p.iterations, 3);
  assert.equal(p.ipQuantity, "Chargeability"); assert.equal(p.ipUnit, "mV/V");
  assert.equal(res3dinvIpProperty(p.ipQuantity, p.ipUnit), "Chargeability (mV/V)");
  assert.equal(res3dinvIpProperty("Chargeability", "msec"), null, "another unit is not passed off as mV/V");
  const t = res3dinvTensor(p);
  assert.equal(t.swapped, false);
  assert.deepEqual([t.mesh.nx, t.mesh.ny, t.mesh.nz], [3, 2, 2]);
  assert.deepEqual(t.mesh.dx, [50, 50, 100]); assert.deepEqual(t.mesh.dz, [10, 15]);
  assert.equal(t.depth, 25);
  const cells = ubcMeshToCells(t.mesh, t.resistivity);
  assert.equal(cells.length, 12);
  // block i = 2 (500100-500200), j = 1 (7000050-7000100), layer 2 (10-25 m), iteration 3: 300 + 10 + 2 + 0.1
  const c = cells.find((q) => q.x === 500150 && q.y === 7000075 && q.z === -17.5);
  assert.ok(c, "the block's centre: x, y, and its depth below a 0 m top");
  assert.equal(c.value, 312.1);
  assert.equal(c.dx, 100); assert.equal(c.dz, 15);
  const ipc = ubcMeshToCells(t.mesh, t.ip).find((q) => q.x === 500025 && q.y === 7000025 && q.z === -5);
  assert.equal(ipc.value, 3, "the IP model after the last MODEL: iteration 3, layer 1, block 0");
});

test("#4078 a northing written as X (Hillside) is read the other way round, and said", () => {
  assert.equal(looksNorthingFirst(6173000, 762100), true);
  assert.equal(looksNorthingFirst(762100, 6173000), false);
  assert.equal(looksNorthingFirst(1000, 2000), false, "a local grid is left alone");
  const text = makeInv({ xs: [6173000, 6173200, 6173400], ys: [762100, 762300, 762500, 762700], depths: [0, 12.5], value: (kind, i, j) => (kind === "res" ? 10 * i + j : 1), iterations: 1 });
  const t = res3dinvTensor(parseRes3dinvModel(text));
  assert.equal(t.swapped, true);
  assert.deepEqual([t.mesh.nx, t.mesh.ny], [3, 2], "the file's 2 × 3 blocks become 3 (easting) × 2 (northing)");
  assert.equal(t.mesh.x0, 762100); assert.equal(t.mesh.y0, 6173000);
  // the file's block i = 1 (X 6173200-6173400 = northing), j = 2 (Y 762500-762700 = easting): value 12
  const c = ubcMeshToCells(t.mesh, t.resistivity).find((q) => q.x === 762600 && q.y === 6173300);
  assert.equal(c.value, 12);
});

test("#4078 a .inv with the readings only, or no MODEL, is refused in words", () => {
  const dataOnly = makeInv({ xs: [0, 10, 20], ys: [0, 10], depths: [0, 5], value: val, model: false });
  assert.equal(isRes3dinvText(dataOnly), true);
  assert.throws(() => parseRes3dinvModel(dataOnly), /No inverted model in this file/);
  const noModel = makeInv({ xs: [0, 10, 20], ys: [0, 10], depths: [0, 5], value: val, iterations: 0 });
  assert.throws(() => parseRes3dinvModel(noModel), /No inverted model in this file/);
  assert.equal(isRes3dinvText("1.0E-02\n1.0E-02\n1.0E-02\n1.0E-02\n"), false, "a UBC model is not a .inv");
  const noIp = parseRes3dinvModel(makeInv({ xs: [0, 10, 20], ys: [0, 10], depths: [0, 5], value: val, ip: false, iterations: 1 }));
  assert.equal(noIp.ip, null);
});

test("#4078 a .mesh is a mesh, a .res a model; a lone model and a Geosoft .con are named", () => {
  assert.ok(UBC_MESH_NAME.test("3dip.mesh") && UBC_MESH_NAME.test("inv.msh") && !UBC_MESH_NAME.test("mesh.txt"));
  assert.ok(UBC_MODEL_NAME.test("model_004.res") && UBC_MODEL_NAME.test("dcinv3d.con") && UBC_MODEL_NAME.test("ipinv3d.chg") && !UBC_MODEL_NAME.test("model.inv"));
  const mesh = " 3 2 2\n 500000.0 7000000.0 300.0\n 3*50.0\n 2*50.0\n 10.0 15.0\n";
  assert.equal(isUBCMeshText(mesh), true);
  const model = Array.from({ length: 12 }, (_, i) => ` ${(0.01 * (i + 1)).toExponential(5)}`).join("\n") + "\n";
  assert.equal(parseUBCModel(model, parseUBCMesh(mesh)).length, 12, "a .res beside a .mesh reads like any UBC model");
  assert.equal(looksLikeUbcModelText(model), true);
  assert.match(ubcLoneAdvice("dcinv3d.con", model), /a UBC model\. Drop it with its mesh \(\.msh\)\./);
  const geosoft = "\n\nDATT s1=kt100\nDATT s2=kt200\nMGRP Surround,0,0\nSURR s3\nRPLS $LLOFF,\"0.1\"\nIFNE 3,0\nENDF\n";
  assert.equal(isGeosoftControlText(geosoft), true);
  assert.equal(looksLikeUbcModelText(geosoft), false);
  assert.match(ubcLoneAdvice("_basemap.con", geosoft), /a Geosoft map-control file, not a model\./);
  assert.equal(ubcLoneAdvice("notes.con", "some text\nmore text\n"), null);
});

test("#4078 Block models' import and the 3D View drop use them", () => {
  const g = readFileSync(new URL("../src/modules/GeophysicsModule.jsx", import.meta.url), "utf8");
  assert.match(g, /for \(const f of files\) \{ if \(UBC_MESH_NAME\.test\(f\.name\) \|\| \(f\.size < 5e6 && await looksLikeMesh\(f\)\)\) meshFiles\.push\(f\); \}/);
  assert.match(g, /if \(\/\\\.inv\$\/i\.test\(f\.name\)\) \{ try \{ if \(isRes3dinvText\(await f\.slice\(0, 4096\)\.text\(\)\)\) invFiles\.push\(f\);/);
  assert.match(g, /const infoNotes = \[\.\.\.invNotes\], failed = \[\.\.\.invFailed\];/);
  assert.match(g, /isGeosoftControlText\(await modelFile\.slice\(0, 4096\)\.text\(\)\)\) throw new Error\(tr\("a Geosoft map-control file, not a model"\)\)/);
  assert.match(g, /const oneCellY = mesh\.ny === 1;/);
  assert.match(g, /addVoxelModel\(\{ name, source: "res3dinv", cells, min, max, \.\.\.\(property \? \{ property \} : \{\}\)/);
  assert.match(g, /model\.source === "res3dinv" \? "Res3DInv"/);
  const d = readFileSync(new URL("../src/modules/viewer/importPipelineImpl.js", import.meta.url), "utf8");
  assert.match(d, /const ubcModels = grouped\.files\.filter\(\(x\) => UBC_MODEL_NAME\.test\(x\.name\)\);/);
  assert.match(d, /for \(const f of grouped\.files\.filter\(\(x\) => UBC_MESH_NAME\.test\(x\.name\)\)\) \{/);
  assert.match(d, /else if \(isDcip2dMeshText\(new TextDecoder\(\)\.decode\(head\)\)\)/);
  assert.match(d, /const toBlocks = \[\.\.\.\(ubcModels\.length && ubcMeshes\.length === 1 \? \[ubcMeshes\[0\], \.\.\.ubcModels\] : \[\]\), \.\.\.invFiles\];/);
  assert.match(d, /if \(!ubcPaired\.size\) for \(const f of ubcModels\) \{ try \{ const a = ubcLoneAdvice\(f\.name, await f\.slice\(0, 4096\)\.text\(\)\);/);
  assert.match(d, /- leapfrogN \/\*/, "the skipped count: the meshes the solid import took, no longer every .msh not advised");
});

test("#4078 its words are in every language", () => {
  const keys = ["No inverted model in this file: open the .inv saved after the inversion.", "Not the Res3DInv model layout GeoStrix reads (line {n}).",
    "{name}: a Geosoft map-control file, not a model.",
    "{name}: a UBC model. Drop it with its mesh (.msh).",
    "a Geosoft map-control file, not a model", "One cell thick: DC / IP reads it as a section too.",
    "{name}: a 2D UBC mesh. Open it with its model in DC / IP.",
    "{names}: a Res3DInv inversion, opened in Geophysics › Block models.",
    "Res3DInv, the last of {n} saved models: {list}; depths from a 0 m top, {m} m deep.{swap}",
    " X and Y swapped (X held the northing).", "its layers' blocks differ in plan: not read yet",
    "Choose the mesh (.msh, .mesh or mesh.txt) and its model files together."];
  for (const l of ["es", "pt", "fr", "ar"]) {
    const j = JSON.parse(readFileSync(new URL(`../src/locales/${l}.json`, import.meta.url), "utf8"));
    assert.deepEqual(keys.filter((k) => !j[k]), [], l);
  }
});

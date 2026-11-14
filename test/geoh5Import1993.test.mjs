// TASKS.csv #1993 — the read-only .geoh5 import (h5wasm): points, curves, surfaces, block models and 2D grids read into OMF's element shapes and the
// same project objects; drillholes and other types listed as not read. SYNTHETIC file written by test/helpers/geoh5Fixture.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { geoh5FixtureBytes } from "./helpers/geoh5Fixture.mjs";
import { parseGeoh5, guidKey, GEOH5_TYPES } from "../src/lib/geoh5.js";
import { geoh5ToProjectObjects } from "../src/lib/geoh5Import.js";

const buf = (b) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
const near = (a, b, e = 1e-6) => Math.abs(a - b) < e;

test("the type GUIDs, with or without braces and in either case", () => {
  assert.equal(GEOH5_TYPES[guidKey("{202C5DB1-A56D-4004-9CAD-BAAFD8899406}")], "points");
  assert.equal(GEOH5_TYPES[guidKey("48F5054A-1C5C-4CA4-9048-80F36DC60A06")], "grid2d");
});

test("points, curve, surface: vertices, cells, data by association; no-data, referenced codes and a wrong-length entry", async () => {
  const ws = await parseGeoh5(buf(await geoh5FixtureBytes()));
  assert.equal(ws.version, 2); assert.equal(ws.distanceUnit, "meter");
  const by = Object.fromEntries(ws.elements.map((e) => [e.name, e]));
  const pts = by["Soil samples"];
  assert.equal(pts.kind, "points"); assert.equal(pts.count, 5); assert.deepEqual(pts.vertices.slice(0, 6), [1000, 2000, 350, 1010, 2000, 351]);
  const att = Object.fromEntries(pts.attributes.map((a) => [a.name, a]));
  assert.ok(Number.isNaN(att.Cu_ppm.values[2]), "the float no-data value is blank"); assert.equal(att.Cu_ppm.max, 300);
  assert.ok(Number.isNaN(att.Rank.values[2]), "the integer no-data value is blank");
  assert.deepEqual(att.Lith.values, ["Basalt", "Andesite", "Unknown", "Basalt", "Andesite"]); assert.equal(att.Lith.kind, "string");
  assert.equal(att.Short, undefined, "a data entry of the wrong length is not read");
  assert.ok(Array.isArray(pts.vertices) && Array.isArray(att.Cu_ppm.values), "plain arrays: the objects are saved with the project");
  assert.equal(by.Contact.kind, "lines"); assert.deepEqual(by.Contact.segments, [0, 1, 1, 2, 2, 3]); assert.equal(by.Contact.attributes[0].location, "segments");
  assert.equal(by["Pit shell"].kind, "surface"); assert.deepEqual(by["Pit shell"].triangles, [0, 1, 2, 0, 2, 3]);
  assert.equal(by["Broken surface"].kind, "skipped", "a cell pointing past the vertices");
  assert.match(by["DH-1"].reason, /drillhole/); assert.match(by.Mystery.reason, /Something new/);
});

test("the block model: delimiters running down, values in the format's order land in the right cells", async () => {
  const r = await geoh5ToProjectObjects(buf(await geoh5FixtureBytes()), 1e6);
  const bm = r.voxelModels.find((m) => m.name === "Resistivity (Rho)");
  assert.equal(bm.cells.length, 12); assert.equal(bm.source, "geoh5");
  const at = (x, y, z) => bm.cells.find((c) => near(c.x, x) && near(c.y, y) && near(c.z, z))?.value;
  // value 100·i + 10·j + k, k counting down from the origin's 300 m
  assert.equal(at(1005, 2005, 297.5), 0); assert.equal(at(1005, 2005, 292.5), 1);
  assert.equal(at(1025, 2015, 292.5), 211); assert.equal(at(1015, 2005, 297.5), 100);
  assert.ok(bm.cells.every((c) => c.dx === 10 && c.dy === 10 && c.dz === 5));
});

test("a rotated block model turns about its origin; a 2D grid is a one-cell-thick model in i + j·nU order", async () => {
  const r = await geoh5ToProjectObjects(buf(await geoh5FixtureBytes({ blockRotation: 90 })), 1e6);
  const bm = r.voxelModels.find((m) => m.name === "Resistivity (Rho)");
  const c = bm.cells.find((x) => x.value === 100); // i = 1, j = 0, top layer: 15 m along U, which now runs north
  assert.ok(near(c.x, 1000 - 5) && near(c.y, 2000 + 15) && near(c.z, 297.5), JSON.stringify(c));
  const g = r.voxelModels.find((m) => m.name === "Mag grid (TMI)");
  assert.equal(g.cells.length, 6);
  const gv = (x, y) => g.cells.find((c) => near(c.x, x) && near(c.y, y))?.value;
  assert.equal(gv(1010, 2012.5), 0); assert.equal(gv(1030, 2012.5), 1); assert.equal(gv(1050, 2037.5), 12);
  assert.ok(g.cells.every((c) => near(c.z, 350) && c.dz === 5));
  assert.ok(r.notes.some((n) => /2D grids \(Mag grid\)/.test(n)) && r.notes.some((n) => /no coordinate system/.test(n)));
  assert.deepEqual(r.omfObjects.map((o) => o.kind).sort(), ["lines", "points", "surface"]);
  assert.equal(r.skipped.length, 3);
});

test("another HDF5 file is refused with a reason", async () => {
  await assert.rejects(parseGeoh5(buf(await geoh5FixtureBytes({ notGeoscience: true }))), /not a geoh5 file/);
});

test("h5wasm only on demand: the reader imports it dynamically, nothing in the startup path names it", () => {
  const g = fs.readFileSync(new URL("../src/lib/geoh5.js", import.meta.url), "utf8");
  assert.match(g, /import\("h5wasm"\)/); assert.doesNotMatch(g, /^import .* from "h5wasm"/m);
  const gm = fs.readFileSync(new URL("../src/modules/GeophysicsModule.jsx", import.meta.url), "utf8");
  assert.match(gm, /await import\("\.\.\/lib\/geoh5Import\.js"\)/);
  assert.doesNotMatch(gm, /^import .*geoh5/m);
  const v = fs.readFileSync(new URL("../vite.config.js", import.meta.url), "utf8");
  assert.ok(v.includes("robust-predicates|h5wasm)"), "kept out of the eager vendor chunk");
});

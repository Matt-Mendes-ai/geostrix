// TASKS.csv #2121 (review #2013, Woodjam) — Boundaries / Claims read a loose .shp with the .prj / .dbf / .cpg chosen beside it, and a
// .shp read alone says no .prj was read (not 'it states no CRS').
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { groupShapefileParts } from "../src/lib/viewer/importHelpers.js";
const g = readFileSync(new URL("../src/modules/GeophysicsModule.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("the .shp's same-name sidecars ride on it and leave the list", () => {
  const f = (name) => ({ name });
  const { files, unmatched } = groupShapefileParts([f("iplines_9n.shp"), f("iplines_9n.prj"), f("iplines_9n.dbf"), f("iplines_9n.shx"), f("claims.zip"), f("other.prj")]);
  assert.deepEqual(files.map((x) => x.name), ["iplines_9n.shp", "claims.zip"]);
  assert.deepEqual(Object.keys(files[0].shpParts).sort(), ["dbf", "prj"]);
  assert.deepEqual(unmatched.map((x) => x.name), ["other.prj"]);
});

test("both import handlers group the parts; the reader passes them; the pickers accept them; the note is honest", () => {
  assert.equal((g.match(/= groupShapefileParts\(Array\.from\(fileList \|\| \[\]\)\.filter\(Boolean\)\)\.files;/g) || []).length, 2);
  assert.match(g, /parseShapefileParts\(\{ shp: new Uint8Array\(buf\), dbf: parts\.dbf \?/);
  assert.match(g, /parts\.prj \? await parts\.prj\.text\(\) : null\);/);
  assert.equal((g.match(/accept="\.ply,\.dxf,\.zip,\.shp,\.prj,\.dbf,\.shx,\.cpg,/g) || []).length, 2);
  assert.match(g, /no \.prj was read with it \(select the \.zip, or the \.prj with the \.shp\)/);
});

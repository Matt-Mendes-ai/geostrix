// TASKS.csv #3613 / #3615 (Fireweed rehearsal) — the collar fields (hole type, year, property, prospect, news release) survive every export, one column each, and the table set opens in the
// app with no question about the CRS: collar.attrs flattened in the CSV tables, the Shapefile, the GeoPackage and the KMZ balloon; the epsg column written; a re-import reads them back.
// Collars shaped as the import makes them from the bundled Macpass sample (used with its owner's permission).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import Papa from "papaparse";
import { collarAttrPairs, collarAttrNames } from "../src/lib/collarAttrExport.js";
import { collarTableRows, drillholeTableFiles } from "../src/lib/drillholeTables.js";
import { buildVectorFeatures } from "../src/lib/viewer/vectorFeatures.js";
import { shapefileZipFiles } from "../src/lib/shapefile.js";
import { surfaceAttrColumns } from "../src/lib/geochemColumns.js";
import { normalizeHoleType } from "../src/lib/holeType.js";
import { EPSG_COL_ALIASES } from "../src/lib/layers.js";

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const rd = (f) => Papa.parse(read(`../sample_data/yk_macpass/${f}`), { header: true, skipEmptyLines: true }).data;
// the import's shape: the file's columns as text under attrs, the app's normalized 'hole type' beside them
const collars = rd("collars.csv").slice(0, 60).map((r) => ({ hole_id: r.hole_id, x: +r.x, y: +r.y, z: +r.z, length: +r.length, attrs: { hole_type: r.hole_type, year: r.year, property: r.property, prospect: r.prospect, news_release: r.news_release, "hole type": normalizeHoleType(r.hole_type) } }));

test("the pairs: one per field, the file's hole_type kept and the derived 'hole type' left out; a name already written gets _file; objects are JSON; blanks skipped", () => {
  const p = collarAttrPairs(collars[0], ["hole_id", "x"]);
  assert.deepEqual(p.map((x) => x[0]), ["hole_type", "year", "property", "prospect", "news_release"]);
  assert.equal(p[0][1], collars[0].attrs.hole_type);
  // alone, the app's own hole type is the hole_type column
  assert.deepEqual(collarAttrPairs({ attrs: { "hole type": "Diamond (DD)" } }), [["hole_type", "Diamond (DD)"]]);
  assert.deepEqual(collarAttrPairs({ attrs: { x: 5, area: "A", blank: "", nil: null, obj: { a: 1 } } }, ["x"]), [["x_file", 5], ["area", "A"], ["obj", '{"a":1}']]);
  assert.deepEqual(collarAttrPairs({}), []); assert.deepEqual(collarAttrPairs(null), []);
  assert.deepEqual(collarAttrNames([{ attrs: { a: 1 } }, { attrs: { b: 2, a: 3 } }]), ["a", "b"]);
});

test("the CSV tables: collars.csv has a column per field (not an 'attrs' JSON cell) and the epsg column", () => {
  const rows = collarTableRows(collars, { epsg: 26909 });
  assert.deepEqual(Object.keys(rows[0]), ["hole_id", "x", "y", "z", "azim_grid", "dip", "length", "epsg", "hole_type", "year", "property", "prospect", "news_release"]);
  assert.equal(rows[0].epsg, 26909); assert.equal(rows[0].year, collars[0].attrs.year);
  assert.ok(rows.every((r) => !("attrs" in r)));
  const f = drillholeTableFiles({ collars, epsg: 26909, version: "t" }).find((x) => x.name === "collars.csv");
  assert.doesNotMatch(f.text, /\[object Object\]|"\{""hole_type""/);
  const body = f.text.split("\n").filter((l) => !l.startsWith("#"));
  assert.match(body[0], /^hole_id,x,y,z,azim_grid,dip,length,epsg,hole_type,year,property,prospect,news_release/);
  // with no CRS set there is no epsg column
  assert.ok(!("epsg" in collarTableRows(collars, { epsg: null })[0]));
});

test("a re-import reads the fields back: every field column is kept as a collar attribute, and the epsg column is the one the importer reads", () => {
  const rows = collarTableRows(collars, { epsg: 26909 }).map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, String(v)])));
  const headers = Object.keys(rows[0]);
  const kept = surfaceAttrColumns(headers, rows, { hole_id: "hole_id", x: "x", y: "y", z: "z", length: "length", azimuth: "azim_grid", dip: "dip", _epsg: "epsg" });
  for (const k of ["hole_type", "year", "property", "prospect", "news_release"]) assert.ok(kept.includes(k), `${k} is kept on re-import (${kept.join(", ")})`);
  assert.ok(EPSG_COL_ALIASES.includes("epsg"), "the importer guesses an 'epsg' column as the CRS");
});

test("the Shapefile and the GeoPackage features: a real value per field, no object, names that fit the dbf", () => {
  const { features } = buildVectorFeatures("collars", "collars", { collars, epsg: 26909 });
  const a = features[0].attributes;
  for (const k of ["hole_type", "year", "property", "prospect", "news_release"]) assert.equal(a[k], collars[0].attrs[k], k);
  assert.ok(!("attrs" in a)); assert.ok(Object.values(a).every((v) => v === null || typeof v !== "object"));
  const zip = shapefileZipFiles({ features, geomType: "point", epsg: 26909, baseName: "collars" });
  const dbf = zip.find((f) => /\.dbf$/i.test(f.name));
  const text = new TextDecoder("latin1").decode(dbf.data);
  assert.doesNotMatch(text, /\[object Object\]/);
  assert.match(text, /NEWS_RELEA/, "a field name cut to the dbf's 10 characters");
  assert.ok(text.includes(collars[0].attrs.prospect), "the prospect's text is in the file");
});

test("the KMZ balloon carries the collar's own fields; and the sources are wired", () => {
  const k = read("../src/lib/projectKmz.js");
  assert.match(k, /\.\.\.Object\.fromEntries\(collarAttrPairs\(c, \["hole_id", "elevation", "azimuth", "dip", "length", "angles"\]\)\)/);
  assert.match(read("../src/lib/drillholeTables.js"), /\.\.\.\(epsg \? \{ epsg \} : \{\}\)/);
});

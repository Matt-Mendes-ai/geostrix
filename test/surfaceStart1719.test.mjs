// TASKS.csv #1719 — start mapping without a file: a typed measurement and a template the importer reads straight
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { guessStructureColumns, parseStructureRows } from "../src/lib/mapLayers.js";

const HEADERS = ["Station", "Easting", "Northing", "Elevation", "Type", "Dip", "Dip direction", "Comments"];

test("the template's headers are all recognized by the importer", () => {
  const g = guessStructureColumns(HEADERS);
  assert.deepEqual({ x: g.x, y: g.y, z: g.z, dip: g.dip, dipDir: g.dipDir, type: g.type, station: g.station, comment: g.comment },
    { x: "Easting", y: "Northing", z: "Elevation", dip: "Dip", dipDir: "Dip direction", type: "Type", station: "Station", comment: "Comments" });
  const p = readFileSync(new URL("../src/components/SurfaceMappingPanel.jsx", import.meta.url), "utf8");
  assert.ok(p.includes(`content: "${HEADERS.join(",")}\\r\\n"`), "the template carries exactly these headers and no example numbers");
});

test("a typed row parses as an imported one", () => {
  const row = { Station: "CP-12", Easting: "381900", Northing: "5956400", Elevation: "", Type: "bedding", Dip: "35", "Dip direction": "120", Comments: "" };
  const out = parseStructureRows([row], { x: "Easting", y: "Northing", z: null, dip: "Dip", dipDir: "Dip direction", strike: null, type: "Type", station: "Station", comment: "Comments" });
  assert.equal(out.rows.length, 1);
  assert.equal(out.rows[0].dip, 35); assert.equal(out.rows[0].dipDir, 120); assert.equal(out.rows[0].z ?? null, null);
});

test("wired: the form goes through the import review; typed sets gather per north reference", () => {
  const p = readFileSync(new URL("../src/components/SurfaceMappingPanel.jsx", import.meta.url), "utf8");
  assert.match(p, /setPendingStruct\(\{ name: "Typed measurements", typed: true/);
  assert.match(p, /const typedSet = p\.typed \? surfaceStructures\.find\(\(s\) => s\.typed && s\.azimuthRef === north\.ref/);
  assert.match(p, /\{!terrain && <div[^\n]*No terrain yet/);
});

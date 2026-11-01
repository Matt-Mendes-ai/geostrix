// TASKS.csv #1235 collars in degrees; #1270 every field in SQL; #1178 significant figures; #1183 the table keeps its rows; #1233 the structure table
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { lonLatForCollars } from "../src/lib/projectCrs.js";

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("#1235 longitude and latitude map to a collar file's X and Y, in WGS 84", () => {
  const rows = [{ Longitude: "-121.49", Latitude: "52.23" }, { Longitude: "-121.50", Latitude: "52.24" }];
  const r = lonLatForCollars("collars", { hole_id: "Hole" }, ["Hole", "Longitude", "Latitude"], rows);
  assert.equal(r.mapping.x, "Longitude");
  assert.equal(r.mapping.y, "Latitude");
  assert.equal(r.mapping.hole_id, "Hole");
  assert.equal(r.sourceEpsg, "4326");
});

test("#1235 nothing changes when X and Y matched, for other tables, or for values that are not degrees", () => {
  const rows = [{ Longitude: "-121.49", Latitude: "52.23" }];
  assert.equal(lonLatForCollars("collars", { x: "E" }, ["E", "Longitude", "Latitude"], rows), null);
  assert.equal(lonLatForCollars("survey", {}, ["Longitude", "Latitude"], rows), null);
  assert.equal(lonLatForCollars("collars", {}, ["Longitude", "Latitude"], [{ Longitude: "615006.5", Latitude: "5789576.4" }]), null);
});

test("#1270 the SQL snapshot has every stored field of a layer", () => {
  const s = read("src/lib/sqlWorkspace.js");
  assert.match(s, /extraCols\.forEach\(\(k\) => cols\.push/);
  assert.match(s, /extraCols\.forEach\(\(k\) => \{ const v = r\[k\]/);
});

test("#1178 #1183 #1233 readouts and tables", () => {
  const g = read("src/modules/GeophysicsModule.jsx");
  assert.match(g, /\{sigFigs\(displayThreshold\)\}/);
  assert.match(g, /min: sigFigs\(model\.min\)/);
  assert.match(read("src/components/BestIntercepts.jsx"), /minHeight: 180, flexShrink: 0/);
  assert.match(read("src/components/LayerInspector.jsx"), /\[r\.dip, r\.azimuth, r\.alpha, r\.beta\]/);
});

// TASKS.csv #2492 (review #2486, WA lithium) — a collar file with two coordinate sets: the dialog says which is used and that the other
// is kept, X / Y / Z from different sets and mine-grid eastings into a UTM / MGA project are questioned, and the notice names what it
// did not import
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { coordColumn, coordinateSets, judgeCoordMapping, unusedSetColumns, setText, isUtmLikeEpsg } from "../src/lib/coordSets.js";
import { smallGridCoordinates } from "../src/lib/crsFromColumns.js";

const H = ["Hole_ID", "MGA_E", "MGA_N", "MGA_Z", "GBMG_East", "GBMG_North", "GBMG_RL", "Total_Depth", "Drill_Code", "Tenement", "Dip", "Azimuth"];

test("columns: prefix and suffix forms, a bare axis, latitude / longitude as a set of their own", () => {
  assert.deepEqual(coordColumn("MGA_E"), { key: "MGA", axis: "x" });
  assert.deepEqual(coordColumn("GBMG_RL"), { key: "GBMG", axis: "z" });
  assert.deepEqual(coordColumn("Easting_GDA2020"), { key: "GDA2020", axis: "x" });
  assert.deepEqual(coordColumn("Northing"), { key: "", axis: "y" });
  assert.deepEqual(coordColumn("Lat"), { key: "LAT/LONG", axis: "y" });
  assert.equal(coordColumn("Total_Depth"), null);
  assert.equal(coordColumn("MGAE"), null); // glued: not split
  assert.deepEqual(coordinateSets(["HoleID", "Easting", "Northing", "RL", "Local_E", "Local_N", "Local_RL"]).map(setText), ["Easting / Northing / RL", "Local_E / Local_N / Local_RL"]);
  assert.deepEqual(coordinateSets(["HOLEID", "EAST", "NORTH", "RL", "DEPTH", "SAMPLE_N"]).map((s) => s.key), [""]); // SAMPLE_N alone is no set
});

test("the review's file: MGA used, GBMG kept; its columns are kept whatever their distinct values", () => {
  const j = judgeCoordMapping(H, { hole_id: "Hole_ID", x: "MGA_E", y: "MGA_N", z: "MGA_Z" });
  assert.equal(setText(j.used), "MGA_E / MGA_N / MGA_Z");
  assert.deepEqual(j.others.map(setText), ["GBMG_East / GBMG_North / GBMG_RL"]);
  assert.equal(j.mixed, null);
  assert.deepEqual(unusedSetColumns(H, { x: "MGA_E", y: "MGA_N", z: "MGA_Z" }), ["GBMG_East", "GBMG_North", "GBMG_RL"]);
  assert.deepEqual(coordinateSets(["HoleID", "X", "Y", "Z"]).length, 1);
  assert.deepEqual(judgeCoordMapping(["HoleID", "X", "Y", "Z"], { x: "X", y: "Y", z: "Z" }).others, []);
});

test("X / Y on the mine grid with Z from MGA (1,000 m apart in the review): mixed, GBMG's own set offered", () => {
  const j = judgeCoordMapping(H, { x: "GBMG_East", y: "GBMG_North", z: "MGA_Z" });
  assert.deepEqual(j.mixed.cols, ["GBMG_East", "GBMG_North", "MGA_Z"]);
  assert.equal(setText(j.mixed.whole), "GBMG_East / GBMG_North / GBMG_RL");
  assert.equal(judgeCoordMapping(H, { x: "MGA_E", y: "GBMG_North" }).used, null);
  assert.ok(judgeCoordMapping(H, { x: "MGA_E", y: "GBMG_North" }).mixed);
});

test("mine-grid eastings into a UTM / MGA project: smallGridCoordinates on the mapped pair, only for UTM-type CRSs", () => {
  assert.ok(isUtmLikeEpsg(28350) && isUtmLikeEpsg(7850) && isUtmLikeEpsg(32609) && isUtmLikeEpsg(26910) && isUtmLikeEpsg(3157));
  assert.ok(!isUtmLikeEpsg(3005) && !isUtmLikeEpsg(4326)); // BC Albers, degrees
  const gbmg = [{ x: 12000, y: 8000 }, { x: 12040, y: 8025 }];
  assert.ok(smallGridCoordinates(gbmg));
  assert.equal(smallGridCoordinates([{ x: 405000, y: 6252000 }]), null);
});

test("the dialog shows the note for collars; the commit keeps the other set and names what it left out", () => {
  const m = readFileSync(new URL("../src/components/ImportMappingModal.jsx", import.meta.url), "utf8");
  assert.match(m, /<CoordSetsNote modal=\{modal\} project=\{storeProject\} \/>/);
  const n = readFileSync(new URL("../src/components/CoordSetsNote.jsx", import.meta.url), "utf8");
  assert.match(n, /if \(modal\.target !== "collars"\) return null;/);
  assert.match(n, /!project\?\.crsSet \|\| !isUtmLikeEpsg\(project\.epsg\) \|\| modal\.localGridOn/);
  const u = readFileSync(new URL("../src/modules/viewer/useImportPipeline.js", import.meta.url), "utf8");
  assert.match(u, /for \(const c of collarAlwaysKept\(collarHdrs, attrMapping\)\) if \(!attrCols\.includes\(c\)\) attrCols\.push\(c\);/); // #2190 widened it to dates
  assert.match(u, /column\(s\) not imported, each with more than 100 different values/);
});

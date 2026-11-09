// TASKS.csv #2155 / #2156 / #2181 (WA drillhole and WA gold reviews) — the collar file's own grid names (GRIDNAME = MGA94_51, Datum + Zone,
// AMG84_51, LL_WGS84) pre-select the CRS; local grid names and eastings no UTM / MGA zone has are said; rows in two frames are said, and
// the CRS dialog counts the collars landing far from the others. AGD84 / AGD66 AMG zones are defined (EPSG's national shifts).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { epsgFromGridName, gridFrameFromRows, smallGridCoordinates } from "../src/lib/crsFromColumns.js";
import { reprojectXY, getProj4DefSync, datumNote } from "../src/lib/reproject.js";
import { collarSpread } from "../src/lib/projectCrs.js";
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("#2155 grid names -> EPSG", () => {
  const cases = { MGA94_51: 28351, MGA94_Z50: 28350, GDA94_51S: 28351, "MGA Zone 51": 28351, "GDA2020 MGA 50": 7850, MGA2020_51: 7851, AMG84_51: 20351, AMG66_50: 20250, LL_WGS84: 4326, LL_GDA94: 4283, "WGS84 UTM 51S": 32751, "NAD83 UTM 10N": 26910 };
  for (const [n, e] of Object.entries(cases)) assert.equal(epsgFromGridName(n)?.epsg, e, n);
  for (const n of ["MINE", "PAN", "TRI_MINE", "WALLABY"]) assert.equal(epsgFromGridName(n)?.local, true, n);
  for (const n of ["AMG_51", "UTM 51", "GDA94"]) assert.equal(epsgFromGridName(n)?.unknown, true, n); // not enough to name one system
});

test("#2155 / #2181 frames in the rows: one name, Datum + Zone, a mix, all local", () => {
  assert.equal(gridFrameFromRows(["HOLEID", "GRIDNAME"], [{ GRIDNAME: "MGA94_51" }, { GRIDNAME: "MGA94_51" }]).epsg, 28351);
  assert.equal(gridFrameFromRows(["HOLEID", "Datum", "Zone"], [{ Datum: "GDA94", Zone: "51" }]).epsg, 28351);
  const mixed = gridFrameFromRows(["GRIDNAME"], [..."aaaaa"].map(() => ({ GRIDNAME: "MGA94_51" })).concat([..."bbb"].map(() => ({ GRIDNAME: "WALLABY" }))));
  assert.equal(mixed.mixed, true); assert.equal(mixed.epsg, null);
  assert.deepEqual(mixed.groups.map((g) => [g.name, g.rows]), [["MGA94_51", 5], ["WALLABY", 3]]);
  assert.equal(gridFrameFromRows(["GRIDNAME"], [{ GRIDNAME: "MINE" }]).local, true);
  assert.equal(gridFrameFromRows(["GRIDNAME"], [{ GRIDNAME: "MGA94_51" }, { GRIDNAME: "MGA 94 zone 51" }]).mixed, false); // two spellings, one frame
  assert.equal(gridFrameFromRows(["HOLEID", "EAST"], [{}]), null);
});

test("#2156 eastings no UTM / MGA zone has", () => {
  assert.deepEqual(smallGridCoordinates([{ x: 31950, y: 807798 }, { x: 32315, y: 808239 }, { x: 400000, y: 6800000 }]), { n: 2, of: 3, x: [31950, 32315], y: [807798, 808239] });
  assert.equal(smallGridCoordinates([{ x: 611185, y: 5791908 }, { x: 400000, y: 6800000 }]), null);
  assert.equal(smallGridCoordinates([{ x: 122.3, y: -28.8 }]), null); // degrees are not a grid
});

test("#2155 AGD84 / AGD66 AMG: defined, and AGD84 AMG 51 lands within 1 m of PROJ 9.1's grid-based answer", () => {
  for (const c of [20349, 20351, 20356, 20249, 20258, 4203, 4202]) assert.ok(getProj4DefSync(c), String(c));
  assert.equal(getProj4DefSync(20348), null); // deprecated in EPSG
  const p = reprojectXY(400000, 6800000, 20351, 28351);
  assert.ok(Math.hypot(p.x - 400137.570, p.y - 6800158.084) < 1, JSON.stringify(p)); // cs2cs EPSG:20351 -> EPSG:28351
  assert.match(datumNote(20351), /EPSG:1280, about 1 m/);
  assert.match(datumNote(20251), /EPSG:15979, about 3 m/);
});

test("#2181 the CRS dialog's spread: 3 local-grid collars among 5 MGA ones land far away", () => {
  const mga = [400000, 400200, 400400, 400100, 400300].map((x, i) => ({ x, y: 6800000 + i * 100 }));
  const local = [{ x: 31867, y: 808636 }, { x: 31950, y: 808800 }, { x: 32047, y: 808920 }];
  const s = collarSpread([...mga, ...local], 28351);
  assert.equal(s.far, 3); assert.equal(s.total, 8); assert.ok(s.km > 300);
  assert.equal(collarSpread(mga, 28351).far, 0);
  assert.match(read("src/components/ProjectCrsModal.jsx"), /spread\?\.far > 0/);
  const p = read("src/modules/viewer/useImportPipeline.js");
  assert.match(p, /const byHeader = epsgFromColumns\(hdrs\), named = byHeader \|\| frame\?\.epsg \|\| null;/);
  assert.match(p, /names more than one frame/);
  assert.match(p, /which no UTM \/ MGA zone has/);
});

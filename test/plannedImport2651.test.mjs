// TASKS.csv #2651 — planned holes from a CSV: a rig sheet's own columns, and GeoStrix's own rig-sheet export read back
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { parseTableText } from "../src/lib/tabular.js";
import { plannedHolesFromRows, plannedColumns } from "../src/lib/plannedImport.js";
import { rigRows } from "../src/lib/rigExport.js";

const read = (text) => { const { rows, headers } = parseTableText(text); return plannedHolesFromRows(rows, headers); };

test("a rig sheet: Hole, Easting, Northing, RL, Azimuth, Dip, EOH; bad rows skipped with their line; 360 wraps to 0", () => {
  const r = read("Hole,Easting,Northing,RL,Azimuth,Dip,EOH,Comments\nPD-01,413650,6253130,231.5,90,-60,150,first\nPD-02,413700,6253130,232,360,-55,120,\nPD-03,413750,x,232,0,-60,100,\nPD-04,413800,6253130,232,0,-60,0,\n");
  assert.deepEqual(r.missing, []);
  assert.deepEqual(r.holes.map((h) => [h.name, h.x, h.y, h.z, h.azimuth, h.dip, h.length]), [["PD-01", 413650, 6253130, 231.5, 90, -60, 150], ["PD-02", 413700, 6253130, 232, 0, -55, 120]]);
  assert.equal(r.holes[0].notes, "first"); assert.equal(r.holes[1].notes, undefined);
  assert.deepEqual(r.skipped, [{ row: 4, why: "y" }, { row: 5, why: "length" }]);
  assert.equal(r.allDipsPositive, false);
});

test("positive dips are flagged (asked in the pane, never assumed); a missing column or only a true / magnetic azimuth is refused", () => {
  assert.equal(read("name,E,N,Elev,Az,Dip,Length\nA,1,2,3,10,60,100\nB,1,2,3,10,75,100\n").allDipsPositive, true);
  const m = read("name,E,N,Elev,Dip,Length\nA,1,2,3,-60,100\n");
  assert.deepEqual(m.missing, ["azimuth"]); assert.equal(m.holes.length, 0);
  const t = read("name,x,y,z,azimuth_true,dip,length\nA,1,2,3,10,-60,100\n");
  assert.deepEqual(t.missing, ["azimuth"]); assert.equal(t.onlyNonGridAzimuth, "azimuth_true");
  assert.deepEqual(plannedColumns(["E (m)", "N (m)", "Elev (m)", "Az (°)", "Dip (°)", "Length (m)"]), { x: "E (m)", y: "N (m)", z: "Elev (m)", azimuth: "Az (°)", dip: "Dip (°)", length: "Length (m)" });
});

test("GeoStrix's own rig-sheet export comes back: grid azimuth, target, lift / drift, type, notes", () => {
  const holes = [{ name: "PLAN-1", type: "RC", x: 500000, y: 5000000, z: 1000, azimuth: 45, dip: -70, length: 200, target: { x: 500050, y: 5000050, z: 850 }, lift: 1.5, drift: -0.5, notes: "test" }];
  const rows = rigRows(holes, 32610, "2026-11-11", () => [{ x: 500000, y: 5000000, z: 1000, md: 0 }, { x: 500048, y: 5000048, z: 812, md: 200 }]);
  const csv = [Object.keys(rows[0]).join(","), Object.values(rows[0]).map((v) => (typeof v === "string" && v.includes(",") ? `"${v}"` : v)).join(",")].join("\n");
  const r = read(csv);
  assert.equal(r.holes.length, 1);
  const h = r.holes[0];
  assert.deepEqual([h.name, h.type, h.x, h.y, h.z, h.azimuth, h.dip, h.length, h.notes, h.lift, h.drift], ["PLAN-1", "RC", 500000, 5000000, 1000, 45, -70, 200, "test", 1.5, -0.5]);
  assert.deepEqual(h.target, { x: 500050, y: 5000050, z: 850 });
});

test("the form's Import CSV button adds through onAdd and asks about positive dips", () => {
  const p = fs.readFileSync("src/components/PlannedHoleParts.jsx", "utf8");
  assert.match(p, /holes\.forEach\(\(h\) => \{ const \{ zFromGround, \.\.\.rest \} = h; onAdd\(\{ \.\.\.rest, zSource: zFromGround \? `\$\{groundWords\} \(Elev blank in \$\{file\.name\}\)` : `imported from \$\{file\.name\}` \}\); \}\);/ /* the ground for a blank Elev: #2963 */);
  assert.match(p, /if \(r\.allDipsPositive && window\.confirm\(tr\("Every dip in \{f\} is positive\./);
  assert.match(p, /accept=".csv,.txt,.tsv"/);
});

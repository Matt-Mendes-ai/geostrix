// TASKS.csv #2963 (review #2876, WA iron) — Planned holes > Import CSV refused a vertical drill program: a dip of -90 with a blank azimuth was
// skipped ('lines 2 (azimuth)'), and a sheet of Hole / E / N / RL / Depth added nothing. A blank elevation is still skipped (TASKS.csv #3004).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { plannedHolesFromRows } from "../src/lib/plannedImport.js";

const sheet = (header, lines) => { const h = header.split(","); return [lines.map((l) => Object.fromEntries(h.map((k, i) => [k, l.split(",")[i] ?? ""]))), h]; };

test("#2963 a vertical row's blank azimuth is 0; an inclined one's is still a missing value", () => {
  const r = plannedHolesFromRows(...sheet("Hole,Type,Easting,Northing,RL,Azimuth,Dip,Depth", ["A,RC,1,2,440,,-90,52", "B,RC,1,3,440,0,-90,52", "C,RC,1,4,440,,90,52", "D,RC,1,5,440,,-60,52"]));
  assert.deepEqual(r.holes.map((h) => [h.name, h.azimuth, h.dip]), [["A", 0, -90], ["B", 0, -90], ["C", 0, 90]]);
  assert.equal(r.verticalBlankAz, 2);
  assert.deepEqual(r.skipped, [{ row: 5, why: "azimuth" }]);
});

test("#2963 no azimuth or dip column: nothing until the form's Az / Dip is given, then every row takes it", () => {
  const s = sheet("Hole,Easting,Northing,RL,Depth", ["A,1,2,440,52", "B,1,3,440,40"]);
  const none = plannedHolesFromRows(...s);
  assert.deepEqual(none.missing, ["azimuth", "dip"]); assert.equal(none.noOrientation, true); assert.equal(none.holes.length, 0);
  const fb = plannedHolesFromRows(...s, { fallback: { azimuth: 0, dip: -90 } });
  assert.equal(fb.usedFallback, true);
  assert.deepEqual(fb.holes.map((h) => [h.name, h.azimuth, h.dip, h.length]), [["A", 0, -90, 52], ["B", 0, -90, 40]]);
  assert.deepEqual(plannedHolesFromRows(...sheet("Hole,Easting,Northing,RL,Azimuth,Depth", ["A,1,2,440,0,52"]), { fallback: { azimuth: 0, dip: -90 } }).missing, ["dip"], "an azimuth column without a dip: still refused");
});

test("#2963 a dip column and no azimuth column: imported when every hole is vertical, refused otherwise", () => {
  assert.equal(plannedHolesFromRows(...sheet("Hole,Easting,Northing,RL,Dip,Depth", ["A,1,2,440,-90,52", "B,1,3,440,-90,40"])).holes.length, 2);
  assert.deepEqual(plannedHolesFromRows(...sheet("Hole,Easting,Northing,RL,Dip,Depth", ["A,1,2,440,-90,52", "B,1,3,440,-60,40"])).missing, ["azimuth"]);
});

test("#2963 a blank elevation is still skipped (waits on #3004); the pane asks before using the form's Az / Dip and says what it did", () => {
  assert.deepEqual(plannedHolesFromRows(...sheet("Hole,Easting,Northing,RL,Azimuth,Dip,Depth", ["A,1,2,,0,-90,52"])).skipped, [{ row: 2, why: "z" }]);
  const p = fs.readFileSync(new URL("../src/components/PlannedHoleParts.jsx", import.meta.url), "utf8");
  assert.ok(p.includes('window.confirm(tr("{f} has no azimuth or dip column. Add every hole at the form\'s Az {a}° / Dip {d}°?"'));
  assert.ok(p.includes("r = plannedHolesFromRows(rows, headers, { fallback: { azimuth: az, dip: d } });"));
  assert.ok(p.includes("Every hole takes the form's Az {a}° / Dip {d}° (the file has no azimuth or dip column)."));
  assert.ok(p.includes("{n} vertical row(s) with a blank azimuth read as azimuth 0."));
});

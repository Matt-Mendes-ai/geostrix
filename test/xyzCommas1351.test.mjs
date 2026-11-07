// TASKS.csv #1351 — a Geosoft "CSV EXPORT" saved as .XYZ (Poplar 42711Z): comma-separated header and data lines, read like any XYZ.
import test from "node:test";
import assert from "node:assert/strict";
import { parseXYZ, xyzTokens } from "../src/lib/geosoft.js";
import { streamXyzRows } from "../src/lib/streamTable.js";

const COMMA = [
  "/ ------------------------------------------------------------------------------",
  "/ CSV EXPORT [08/14/2024]",
  "/ DATABASE   [.\\24167_Poplar_Final_VLF_EM_Data.gdb]",
  "/",
  "/X_WGS84,Y_WGS84,Lon_deg,Lat_deg,GPSTime,Galt,_24_8_IP,_248_RC",
  "//Flight 0",
  "Line  10",
  "616295.71,5985421.97,-127.22558,54.00398,19:02:06.10,1104.72,-19.9,*",
  "616295.86,5985415.96,-127.22558,54.00393,19:02:06.30,1104.53,,1.02",
  "Line  20",
  "616395.50,5985409.61,-127.22559,54.00387,19:05:00.00,1104.36,-14.4,0.98",
].join("\n");

test("comma lines split on commas, an empty field and * are nulls, Line kept, clock times read", () => {
  const r = parseXYZ(COMMA);
  assert.deepEqual(r.columns, ["X_WGS84", "Y_WGS84", "Lon_deg", "Lat_deg", "GPSTime", "Galt", "_24_8_IP", "_248_RC"]);
  assert.equal(r.rows.length, 3);
  assert.equal(r.rows[0].X_WGS84, 616295.71);
  assert.equal(r.rows[0]._248_RC, null);
  assert.equal(r.rows[1]._24_8_IP, null);
  assert.equal(r.rows[1]._248_RC, 1.02);
  assert.equal(r.rows[2]._line, "20");
  assert.ok(Math.abs(r.rows[0].GPSTime - (19 * 3600 + 2 * 60 + 6.1)) < 1e-6);
});

test("white-space XYZ is read as before", () => {
  assert.deepEqual(xyzTokens("1.5   2.5\t*"), ["1.5", "2.5", "*"]);
  const r = parseXYZ("/ X Y TMI\nLine 1\n100 200 55000.1\n101 201 *\n");
  assert.deepEqual(r.columns, ["X", "Y", "TMI"]);
  assert.deepEqual(r.rows.map((x) => x.TMI), [55000.1, null]);
});

test("the streamed reader gives the same rows as parseXYZ for a comma file, across small chunks", async () => {
  const whole = parseXYZ(COMMA);
  const s = await streamXyzRows(new Blob([COMMA]), { columns: whole.columns, chunkBytes: 37 });
  assert.equal(s.seen, 3);
  assert.deepEqual(s.rows, whole.rows);
});

test("the reference field (IGRF, its declination / inclination) is never guessed as the value; TMI is", async () => {
  const { guessXyzChannels } = await import("../src/lib/geosoft.js");
  const columns = ["X_WGS84", "Y_WGS84", "Galt", "Basemag", "IGRF", "Declin", "Inclin", "Mag1_head", "TMI", "RMI"];
  const rows = Array.from({ length: 20 }, (_, i) => Object.fromEntries(columns.map((c, k) => [c, 1000 + i * (k + 1)])));
  assert.equal(guessXyzChannels(columns, rows).value, "TMI");
  assert.equal(guessXyzChannels(["X", "Y", "mag_igrf_removed"], rows.map((r) => ({ X: r.X_WGS84, Y: r.Y_WGS84, mag_igrf_removed: r.TMI }))).value, "mag_igrf_removed");
});

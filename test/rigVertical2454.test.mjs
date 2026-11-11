// TASKS.csv #2454 — a vertical hole reaches the rig as 'Vertical': no true / magnetic bearing, no one-point plan trace
import test from "node:test";
import assert from "node:assert/strict";
import { rigRows, rigKML, rigGPX } from "../src/lib/rigExport.js";
import { plannedTrace } from "../src/lib/holePlanning.js";

const collar = { x: 575659.4, y: 6681871.3, z: 340 };

test("a dip -90 hole: blank true / magnetic azimuths, 'Vertical' in the KML and GPX, no trace", () => {
  const [r] = rigRows([{ name: "INF-01", ...collar, azimuth: 0, dip: -90, length: 74.6 }], 28351, "2026-11-09", plannedTrace);
  assert.equal(r.azimuth_true, ""); assert.equal(r.azimuth_magnetic, "");
  assert.equal(r.azimuth_grid, 0);
  assert.notEqual(r.declination_deg, ""); // the field facts stay
  const kml = rigKML([r], "t"), gpx = rigGPX([r]);
  assert.match(kml, /Vertical \(dip -90°\)\. Length 74\.6 m\./);
  assert.ok(!/trace \(plan\)/.test(kml), "no trace placemark");
  assert.match(gpx, /<desc>Vertical, dip -90, 74\.6 m<\/desc>/);
  assert.ok(!/<trk>/.test(gpx));
});

test("an inclined hole keeps its bearings and its trace; a vertical hole with lift is not 'vertical'", () => {
  const [r] = rigRows([{ name: "P", ...collar, azimuth: 45, dip: -60, length: 100 }], 28351, "2026-11-09", plannedTrace);
  assert.notEqual(r.azimuth_true, "");
  assert.match(rigKML([r], "t"), /trace \(plan\)/);
  const [v] = rigRows([{ name: "V", ...collar, azimuth: 45, dip: -90, length: 100, lift: 2 }], 28351, "2026-11-09", plannedTrace);
  assert.notEqual(v.azimuth_true, "");
});

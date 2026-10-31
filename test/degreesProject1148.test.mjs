// TASKS.csv #1148 — latitude / longitude is never offered as a project CRS when the place is known, and a project in degrees finds its metric CRS.
import test from "node:test";
import assert from "node:assert/strict";
import { askAdoptCrs } from "../src/lib/adoptCrs.js";
import { degreesCentre, crsCandidatesAt } from "../src/lib/projectCrs.js";
import { isMetricProjectedEpsg, crsName } from "../src/lib/reproject.js";

const OUTBACK = { lon: 133.9, lat: -23.7 }; // Alice Springs: UTM 53 S

test("#1148 public samples in latitude / longitude: the metric CRS for the place is offered, not degrees", () => {
  let asked = "";
  const pick = askAdoptCrs({ isEmpty: true, currentEpsg: 3156, declaredEpsg: 4326, fileName: "public.csv", at: OUTBACK }, (m) => { asked = m; return true; });
  assert.equal(isMetricProjectedEpsg(pick), true);
  assert.match(crsName(pick), /53/);
  assert.match(crsName(pick), /^GDA/); // Australia's own datum first
  assert.match(asked, /latitude and longitude/);
  assert.ok(!asked.includes("use EPSG:4326"));
  // Cancel keeps what the project had; a metric file is offered as itself, as before
  assert.equal(askAdoptCrs({ isEmpty: true, currentEpsg: 3156, declaredEpsg: 4326, fileName: "x", at: OUTBACK }, () => false), null);
  assert.equal(askAdoptCrs({ isEmpty: true, currentEpsg: 3156, declaredEpsg: 32753, fileName: "x", at: OUTBACK }, () => true), 32753);
  // already the right CRS: nothing to ask
  const right = crsCandidatesAt(OUTBACK.lon, OUTBACK.lat)[0].code;
  assert.equal(askAdoptCrs({ isEmpty: true, currentEpsg: right, declaredEpsg: 4326, fileName: "x", at: OUTBACK }, () => { throw new Error("asked"); }), null);
  // a project with data: no offer at all
  assert.equal(askAdoptCrs({ isEmpty: false, currentEpsg: 3156, declaredEpsg: 4326, fileName: "x", at: OUTBACK }, () => true), null);
});

test("#1148 the middle of a project in degrees: collars, then samples, then terrain, then map layers", () => {
  const s = [{ x: 133, y: -23 }, { x: 134, y: -24 }, { x: 135, y: -25 }];
  assert.deepEqual(degreesCentre({ surfaceSamples: s }), { lon: 134, lat: -24 });
  assert.deepEqual(degreesCentre({ collars: [{ x: 10, y: 20 }], surfaceSamples: s }), { lon: 10, lat: 20 });
  assert.deepEqual(degreesCentre({ terrain: { bbox: [133, -25, 135, -23] } }), { lon: 134, lat: -24 });
  assert.deepEqual(degreesCentre({ mapLayers: [{ features: [{ geometry: [[140, -30]] }] }] }), { lon: 140, lat: -30 });
  assert.equal(degreesCentre({}), null);
  assert.equal(degreesCentre({ surfaceSamples: [{ x: 500000, y: 6000000 }] }), null); // not degrees
  assert.equal(isMetricProjectedEpsg(4326), false); // what shows the banner
});

test("#1148 moving the project out of degrees turns a terrain grid into metres, heights kept", async () => {
  const { reprojectProject } = await import("../src/lib/projectReproject.js");
  const gridW = 21, gridH = 21, elevations = new Float32Array(gridW * gridH).fill(600);
  const terrain = { name: "SRTM", gridW, gridH, bbox: [133.5, -24, 134, -23.5], elevations };
  const to = crsCandidatesAt(133.75, -23.75)[0].code;
  const { fields, report } = reprojectProject({ project: { epsg: 4326 }, terrain, collars: [], surfaceSamples: [{ x: 133.75, y: -23.75, z: 600 }] }, 4326, to, {});
  const [x0, y0, x1, y1] = fields.terrain.bbox;
  assert.ok(x1 - x0 > 40000 && x1 - x0 < 60000, `width ${x1 - x0} m`); // half a degree here is about 51 km
  assert.ok(y1 - y0 > 50000 && y1 - y0 < 60000, `height ${y1 - y0} m`);
  assert.ok(x0 > 100000 && y0 > 7000000); // MGA zone 53 eastings and southern-hemisphere northings
  const v = Array.from(fields.terrain.elevations).filter(Number.isFinite);
  assert.ok(v.length > 300 && v.every((z) => Math.abs(z - 600) < 1e-3));
  assert.ok(fields.surfaceSamples[0].x > 100000 && fields.surfaceSamples[0].z === 600);
  assert.equal(report.counts.terrain, 1);
});

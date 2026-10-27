// TASKS.csv #844 — the survey planner: soil-grid layout clipped to the area (rotation, stagger, line-km), stream sites
// on tributaries just above their confluences, numbering with QC slots at the user's rates, and the exports
import test from "node:test";
import assert from "node:assert/strict";
import { soilGrid, streamSites, numberSamples, planGpx, planKml, planCsvRows, planFieldSheet } from "../src/lib/surveyPlan.js";
import { routeTerrain } from "../src/lib/hydrology.js";

const rect = [[0, 0], [1000, 0], [1000, 500], [0, 500]];

test("#844 a north-south grid over a 1 km x 0.5 km rectangle", () => {
  const g = soilGrid(rect, { azimuth: 0, lineSpacing: 100, stationSpacing: 25 });
  assert.equal(g.lines.length, 10, "lines every 100 m from the west edge (line 0) to 900 m; the east edge at 1000 m is a zero-length touch");
  assert.equal(g.stations.length, 210);
  assert.equal(g.lineKm, 5);
  assert.deepEqual([g.stations[0].x, g.stations[0].y, g.stations[0].name], [0, 0, "L+0 S+0"]);
});

test("#844 rotated and staggered grids stay inside the area", () => {
  const g = soilGrid(rect, { azimuth: 45, lineSpacing: 100, stationSpacing: 25, stagger: true });
  assert.ok(g.stations.length > 150 && g.stations.every((s) => s.x >= -1e-6 && s.x <= 1000 + 1e-6 && s.y >= -1e-6 && s.y <= 500 + 1e-6));
  assert.ok(Math.abs(g.lineKm - 5) < 0.05, "line-km = area / line spacing");
  const odd = g.stations.filter((s) => (s.line / 100) % 2 !== 0), even = g.stations.filter((s) => (s.line / 100) % 2 === 0);
  assert.ok(odd.every((s) => Math.abs(s.station % 25) === 12 || Math.abs(s.station % 25) === 13) && even.every((s) => s.station % 25 === 0), "alternate lines offset by half a station");
});

test("#844 a concave area: a line crossing it twice gets two segments", () => {
  const u = [[0, 0], [300, 0], [300, 300], [200, 300], [200, 100], [100, 100], [100, 300], [0, 300]];
  const g = soilGrid(u, { azimuth: 90, lineSpacing: 100, stationSpacing: 50 });
  assert.ok(g.lines.some((l) => Math.abs(l[0][1] - 200) < 1e-6), "the line at y = 200 exists");
  assert.equal(g.lines.filter((l) => Math.abs(l[0][1] - 200) < 1e-6).length, 2, "and crosses the U twice");
  assert.ok(!g.stations.some((s) => s.x > 100 + 1e-6 && s.x < 200 - 1e-6 && s.y > 100 + 1e-6), "no station in the notch");
});

test("#844 numbering: QC slots at each insert's own rate, duplicates point to their original and its site", () => {
  const sites = Array.from({ length: 40 }, (_, i) => ({ x: i, y: 0 }));
  const rows = numberSamples(sites, { prefix: "SL24-", start: 1001, digits: 4, qc: [{ kind: "standard", every: 20, label: "OREAS 45" }, { kind: "blank", every: 30 }, { kind: "duplicate", every: 20, label: "field duplicate" }] });
  assert.equal(rows.length, 45);
  const qc = rows.filter((r) => r.kind !== "sample").map((r) => [r.sample_id, r.kind, r.parent]);
  assert.deepEqual(qc, [["SL24-1021", "standard", null], ["SL24-1022", "duplicate", "SL24-1020"], ["SL24-1033", "blank", null], ["SL24-1044", "standard", null], ["SL24-1045", "duplicate", "SL24-1043"]]);
  assert.equal(rows.find((r) => r.sample_id === "SL24-1022").site, 19);
  assert.equal(new Set(rows.map((r) => r.sample_id)).size, rows.length, "no number reused");
});

test("#844 stream sites: one per tributary just above the confluence, not along the main stem", () => {
  const w = 101, h = 101, dx = 10, z = new Float32Array(w * h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const main = 0.1 * Math.abs(i - 50) * dx + 0.02 * (h - 1 - j) * dx; const trib = i > 50 ? 0.1 * Math.abs(j - 60) * dx + 0.02 * (i - 50) * dx + 0.02 * 40 * dx : Infinity; z[j * w + i] = Math.min(main, trib) + 100; }
  const terrain = { bbox: [0, 0, 1000, 1000], gridW: w, gridH: h, elevations: z };
  const st = streamSites(routeTerrain(terrain), terrain, { minAreaKm2: 0.05, maxAreaKm2: 5, orders: [2], streamKm2: 0.003 });
  assert.deepEqual(st.map((s) => [s.x, s.y]).sort(), [[500, 400], [510, 400]].sort());
  const clipped = streamSites(routeTerrain(terrain), terrain, { minAreaKm2: 0.05, maxAreaKm2: 5, orders: [2], streamKm2: 0.003, polygon: [[505, 300], [600, 300], [600, 500], [505, 500]] });
  assert.equal(clipped.length, 1);
});

test("#844 exports: GPX and KML waypoints for the sites, CSV and field sheet with the QC slots", () => {
  const g = soilGrid(rect, { lineSpacing: 500, stationSpacing: 250 });
  const rows = numberSamples(g.stations, { prefix: "S", digits: 3, qc: [{ kind: "blank", every: 3 }] });
  const ll = (x, y) => [-121 + x / 1e5, 52 + y / 1e5];
  const gpx = planGpx(rows, g.stations, ll, "t");
  assert.equal((gpx.match(/<wpt /g) || []).length, g.stations.length, "QC inserts have no waypoint");
  // #1018 — a soil grid's KML: the lines as LineStrings, the stations (pins) in a folder that starts hidden
  const kml = planKml(rows, g.stations, ll, "t");
  assert.match(kml, /<Placemark><name>Line \+0<\/name>.*<LineString><tessellate>1<\/tessellate><coordinates>-121\.000000,52\.000000,0 -121\.000000,52\.002500,0 -121\.000000,52\.005000,0<\/coordinates>/);
  assert.match(kml, /<Folder><name>Sample stations<\/name><visibility>0<\/visibility>/);
  assert.match(kml, /<Placemark><visibility>0<\/visibility><name>S001<\/name><description>L\+0 S\+0<\/description><Point><coordinates>-121\.000000,52\.000000,0/);
  assert.match(gpx, /<trk><name>Line \+0<\/name><trkseg><trkpt lat="52\.000000" lon="-121\.000000"\/>/);
  const csv = planCsvRows(rows, g.stations, ll);
  assert.equal(csv.find((r) => r.type === "blank").site, "");
  const html = planFieldSheet(rows, g.stations, { title: "Grid" });
  assert.match(html, /<h2>Line \+0<\/h2>/);
  assert.match(html, /class="qc"/);
});

test("#1018 soil lines: one per traverse in station order, split at a gap, read back by the KML importer as lines; stream sites stay points", async () => {
  const { soilLines } = await import("../src/lib/surveyPlan.js");
  const { parseKML } = await import("../src/lib/kml.js");
  const ll = (x, y) => [-121 + x / 1e5, 52 + y / 1e5];
  // line 0 with stations 0, 25, 50 then a gap (a concave area) and 150, 175; line 100 with 0..50
  const st = (line, station) => ({ line, station, name: `L${line} S${station}`, x: line, y: station });
  const sites = [st(0, 50), st(0, 0), st(0, 25), st(0, 175), st(0, 150), st(100, 0), st(100, 25), st(100, 50)];
  const L = soilLines(sites);
  assert.deepEqual(L.map((l) => [l.name, l.stations.map((s) => s.station)]), [["Line +0 (a)", [0, 25, 50]], ["Line +0 (b)", [150, 175]], ["Line +100", [0, 25, 50]]]);
  const rows = numberSamples(sites);
  const parsed = parseKML(planKml(rows, sites, ll, "grid"));
  const feats = parsed.features || parsed;
  assert.deepEqual(feats.filter((f) => f.geomType === "line").map((f) => [f.name, f.coords.length]), [["Line +0 (a)", 3], ["Line +0 (b)", 2], ["Line +100", 3]]);
  assert.equal(feats.filter((f) => f.geomType === "point").length, sites.length); // the stations, in the hidden folder
  // stream sites (no line): points, as before, no folders
  const stream = [{ name: "A", x: 1, y: 2 }, { name: "B", x: 3, y: 4 }];
  const sk = planKml(numberSamples(stream), stream, ll, "s");
  assert.equal((sk.match(/<Point>/g) || []).length, 2);
  assert.ok(!/LineString|<Folder>/.test(sk));
});

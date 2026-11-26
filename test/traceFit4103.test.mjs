// TASKS.csv #4103 — a fault or vein plane fitted from a LINE (a KML trace draped on the terrain): the known plane is recovered, a poorly constrained dip is said in words, the order-N
// surface shows its residuals and its cautions, and any line can be used whatever its attributes. Synthetic: a V-shaped valley terrain and a plane of known attitude whose trace
// crosses the valley.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { traceLines, drapeTrace, fitTracePlane, fitTraceSurface, orientationsAlong, tracedEvidence, looksLikeDegrees, MAX_DIP_ERROR_DEG } from "../src/lib/traceFit.js";
import { FAULT_TEXT, mappedFaultFeatures } from "../src/lib/faultInventory.js";

const rad = (d) => (d * Math.PI) / 180;
// a V-shaped valley running east-west (axis y = 2000): z falls 0.25 m a metre towards the axis; the ground is the same everywhere along x
const valley = (x, y) => 300 + 0.25 * Math.sqrt((y - 2000) ** 2 + 400);
// the trace of a plane (strike / dip, dipping towards strike + 90) on that ground, as vertices every `dy` metres across the valley; the plane through (x0, y0, z0)
function planeTrace({ strike = 30, dip = 55, x0 = 500, y0 = 2000, from = 1500, to = 2500, dy = 25, noise = 0 } = {}) {
  const dd = rad(strike + 90), t = Math.tan(rad(dip));
  const z0 = valley(x0, y0);
  let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 - 0.5; };
  const out = [];
  for (let y = from; y <= to; y += dy) {
    const g = valley(0, y), x = x0 + (z0 - g - t * (y - y0) * Math.cos(dd)) / (t * Math.sin(dd)); // the plane's height equals the ground's
    out.push([Math.round(x * 100) / 100, y, g + noise * rnd() * 2]);
  }
  return out;
}
const angleDiff = (a, b) => Math.abs(((a - b + 540) % 360) - 180);

test("#4103 a known plane sampled along a valley-crossing trace: the dip, strike and dip direction come back, and the dip is well constrained", () => {
  const part = planeTrace({ strike: 30, dip: 55 });
  const dr = drapeTrace(part.map(([x, y]) => [x, y]), { ground: valley, stepM: 25 });
  assert.equal(dr.source, "terrain");
  assert.ok(dr.points.length > 30);
  const f = fitTracePlane(dr.points, { vertices: part.length });
  assert.ok(f.ok && f.wellConstrained, JSON.stringify(f.problems));
  assert.ok(Math.abs(f.dip - 55) < 1, `dip ${f.dip}`);
  assert.ok(angleDiff(f.strike, 30) < 2, `strike ${f.strike}`);
  assert.ok(angleDiff(f.dipDir, 120) < 2, `dip direction ${f.dipDir}`);
  assert.ok(f.rms < 0.5 && f.dipErrorDeg < 2);
  assert.equal(f.n, dr.points.length);
});

test("#4103 with the heights noisy by a few metres the dip is still within a few degrees, and the error says so", () => {
  const part = planeTrace({ dip: 40, strike: 100, noise: 3 });
  const f = fitTracePlane(part.map(([x, y, z]) => ({ x, y, z })), { vertices: part.length });
  assert.ok(f.ok && Math.abs(f.dip - 40) < 4, `dip ${f.dip}`);
  assert.ok(f.dipErrorDeg > 0 && f.dipErrorDeg < 6);
});

test("#4103 a straight trace is flagged: the points lie along a line, so any plane through it fits", () => {
  // a straight line in plan over ground that rises evenly: the 3D points are one straight line
  const ground = (x, y) => 100 + 0.1 * x + 0.05 * y;
  const part = Array.from({ length: 30 }, (_, i) => [1000 + i * 20, 2000 + i * 20]);
  const dr = drapeTrace(part, { ground, stepM: 25 });
  const f = fitTracePlane(dr.points, { vertices: part.length });
  assert.equal(f.ok, false);
  assert.equal(f.why, "straight");
  assert.deepEqual(f.problems, ["straight"]);
  // a nearly straight trace (a faint bend, little relief across it): fitted, but the dip is poorly constrained and it says why
  const bent = Array.from({ length: 30 }, (_, i) => [1000 + i * 20, 2000 + i * 20 + 6 * Math.sin(i / 4)]);
  const g2 = fitTracePlane(drapeTrace(bent, { ground, stepM: 25 }).points, { vertices: bent.length });
  assert.ok(!g2.ok || (!g2.wellConstrained && g2.problems.length), `a near-straight trace is flagged: ${JSON.stringify(g2.problems)}`);
});

test("#4103 a trace on level ground says nothing about a dip: flagged as the ground itself", () => {
  const level = () => 250;
  const curve = Array.from({ length: 40 }, (_, i) => [1000 + i * 25, 2000 + 200 * Math.sin(i / 6)]);
  const f = fitTracePlane(drapeTrace(curve, { ground: level, stepM: 25 }).points, { vertices: curve.length });
  assert.ok(f.ok && !f.wellConstrained && f.problems.includes("level"), JSON.stringify(f.problems));
  assert.ok(f.dip < 1);
});

test("#4103 little relief along the trace: poorly constrained, in words (a code), with a large dip error", () => {
  // a gentle valley (relief a few metres) crossed by a plane: the plane is mathematically there but its tilt is not known to better than the heights are
  const gentle = (x, y) => 250 + 0.004 * Math.abs(y - 2000);
  const dd = rad(120), t = Math.tan(rad(55)), z0 = gentle(500, 2000);
  const part = Array.from({ length: 40 }, (_, i) => { const y = 1900 + i * 5, g = gentle(0, y), x = 500 + (z0 - g - t * (y - 2000) * Math.cos(dd)) / (t * Math.sin(dd)); return [x, y, g]; });
  const f = fitTracePlane(part.map(([x, y, z]) => ({ x, y, z })), { vertices: part.length });
  // either a near-straight set (no plane at all) or a plane whose dip is known to worse than 10 degrees: never reported as a well-constrained dip
  assert.ok(!f.ok ? f.why === "straight" : !f.wellConstrained && f.dipErrorDeg > 10 && f.problems.some((q) => q === "little-relief" || q === "straight"), JSON.stringify(f));
});

test("#4103 the line's own altitudes are used when the file carries them (and said), the terrain's otherwise, a mix is a mix, off-terrain points are counted", () => {
  const ground = (x, y) => (x > 1900 ? NaN : 100);
  const withZ = [[1000, 1000, 250], [1100, 1000, 260], [1200, 1000, 270]];
  assert.equal(drapeTrace(withZ, { ground }).source, "line");
  assert.deepEqual(drapeTrace(withZ, { ground, stepM: 25 }).points.map((p) => p.z).slice(0, 2), [250, 252.5]);
  assert.equal(drapeTrace(withZ, { ground, heights: "terrain" }).source, "terrain");
  assert.equal(drapeTrace(withZ.map(([x, y]) => [x, y]), { ground }).source, "terrain");
  const mixed = [[1000, 1000, 250], [1100, 1000], [1200, 1000, 270]];
  assert.equal(drapeTrace(mixed, { ground }).source, "mixed");
  const off = drapeTrace([[1800, 1000], [1950, 1000], [2000, 1000]], { ground, stepM: 25 });
  assert.ok(off.dropped > 0 && off.points.every((p) => p.x <= 1900));
  assert.equal(drapeTrace(withZ, { ground, heights: "line" }).dropped, 0);
});

test("#4103 order 2 and 3: the residuals drop on a bent surface; the cautions fire for a line of points and for too few points; order 1 is the plane", () => {
  // a plane that bends: a gentle fold of the fault surface along the trace, sampled across the valley AND along strike (two traces at different heights)
  const surf = (x, y) => 400 - 0.9 * y + 0.0008 * (x - 1000) ** 2 + 0.2 * x;
  const pts = [];
  for (let x = 600; x <= 1400; x += 50) for (const y of [100, 220, 340, 460]) pts.push({ x, y, z: surf(x, y) });
  const o1 = fitTraceSurface(pts, 1), o2 = fitTraceSurface(pts, 2), o3 = fitTraceSurface(pts, 3);
  assert.ok(o1.ok && o2.ok && o3.ok);
  assert.equal(o1.terms, 3); assert.equal(o2.terms, 6); assert.equal(o3.terms, 10);
  assert.ok(o2.rms < o1.rms / 5, `order 2 rms ${o2.rms} vs order 1 ${o1.rms}`);
  assert.ok(o3.rms <= o2.rms + 1e-6);
  assert.equal(o2.residuals.length, pts.length);
  assert.ok(o1.caution.length === 0 && o2.caution.includes("extrapolates"));
  const a = o2.normalAt(600, 100, surf(600, 100)), b = o2.normalAt(1400, 100, surf(1400, 100));
  assert.ok(Math.abs(a.dip - b.dip) > 3 || angleDiffDeg(a.dipDir, b.dipDir) > 3, "the bend shows in the dip along the trace");
  // few points for the terms: overfit
  const few = pts.slice(0, 14).map((p) => ({ ...p, z: p.z + Math.sin(p.x) }));
  assert.ok(fitTraceSurface(few, 3, { vertices: 8 }).caution.includes("overfit"), "14 points that stand for 8 independent ones, ten terms");
  // points along one line in the plane's frame (a trace and nothing across it): the surface across is not fixed
  const line = Array.from({ length: 30 }, (_, i) => ({ x: 1000 + i * 10, y: 200 + i * 5, z: 300 + 0.3 * i + (i % 3) }));
  const L2 = fitTraceSurface(line, 2, { vertices: 30 });
  assert.ok(L2.ok === false ? L2.why === "straight" : L2.caution.includes("line"), "a line of points: refused as straight, or fitted with the line caution");
  // a trace that bends in plan but stays in one plane through the ground (an arc): the surface across it is still not fixed
  const arc = Array.from({ length: 40 }, (_, i) => { const a = i / 8; return { x: 1000 + 200 * Math.sin(a), y: 200 + 200 * (1 - Math.cos(a)) * 0.2, z: 300 + 2 * Math.cos(a) + 0.3 * i }; });
  const A2 = fitTraceSurface(arc, 2, { vertices: 40 });
  assert.ok(A2.ok === false || A2.caution.includes("extrapolates"));
  // too few for the terms: not fitted
  assert.equal(fitTraceSurface(pts.slice(0, 5), 3).ok, false);
});
const angleDiffDeg = (a, b) => Math.abs(((a - b + 540) % 360) - 180);

test("#4103 orientations along the trace come from the surface's own dip there", () => {
  const surf = (x, y) => 400 - 0.9 * y + 0.0008 * (x - 1000) ** 2 + 0.2 * x;
  const pts = []; for (let x = 600; x <= 1400; x += 50) for (const y of [100, 220, 340, 460]) pts.push({ x, y, z: surf(x, y) });
  const s = fitTraceSurface(pts, 2);
  const ori = orientationsAlong(pts, s, 5);
  assert.equal(ori.length, 5);
  assert.ok(ori.every((o) => Number.isFinite(o.dip) && Number.isFinite(o.azimuth) && o.dip >= 0 && o.dip <= 90));
});

test("#4103 tracedEvidence: an item the Faults builder takes; the fit, the map dip on request, and a flagged trace falls back to the map / default dip when asked", () => {
  const part = planeTrace({ strike: 30, dip: 55 });
  const line = { id: "trace:1:0:0", name: "Falha 1", part: part.map(([x, y]) => [x, y]), feature: { attributes: { name: "Falha 1" }, parts: [part] }, lengthM: 1000 };
  const r = tracedEvidence(line, { ground: valley });
  assert.ok(r.ok);
  assert.equal(r.item.kind, "traced"); assert.equal(r.item.id, "trace:1:0:0"); assert.equal(r.item.holes, 0);
  assert.equal(r.item.orientations.length, 1);
  assert.ok(Math.abs(r.item.orientations[0].dip - 55) < 1 && r.fit.wellConstrained && r.fit.source === "terrain" && !r.fit.usedMapDip);
  assert.ok(r.item.points.length > 15 && r.item.points.every((p) => Number.isFinite(p.z)));
  // the map / default dip instead
  const m = tracedEvidence(line, { ground: valley, mapDip: true });
  assert.ok(m.fit.usedMapDip && m.item.orientations.length >= 2 && m.fit.mapSource === "default" && m.item.dipSource === "default");
  assert.equal(m.fit.dip, m.item.orientations[0].dip);
  // a dip attribute on the line is the map's dip
  const withDip = { ...line, feature: { attributes: { dip: 70 }, parts: [part] } };
  assert.equal(tracedEvidence(withDip, { ground: valley, mapDip: true }).fit.dip, 70);
  // order 2: orientations along the trace
  const o2 = tracedEvidence(line, { ground: valley, order: 2 });
  assert.ok(o2.item.orientations.length > 1 && o2.fit.surface?.ok && o2.fit.surface.order === 2);
  // a straight line: the fit is not defined, so the map / default dip is used, and says why
  const straightLine = { id: "t", name: "Straight", part: Array.from({ length: 30 }, (_, i) => [1000 + i * 20, 2000 + i * 20]), feature: { attributes: {}, parts: [] }, lengthM: 800 };
  const s = tracedEvidence(straightLine, { ground: (x, y) => 100 + 0.1 * x + 0.05 * y });
  assert.ok(s.ok && s.fit.usedMapDip && s.fit.problems.includes("straight") && s.item.orientations.length >= 2);
  // no height at all: not an item
  assert.equal(tracedEvidence(line, { ground: () => NaN }).ok, false);
});

test("#4103 every imported line is offered, whatever its attributes; polygons and points are not; the fault words in four languages read a line as a fault", () => {
  const layers = [
    { id: "a", name: "lines", geomType: "polyline", features: [{ parts: [[[0, 0], [100, 0], [200, 50]]], attributes: { name: "Falha 1" } }, { parts: [[[0, 10], [50, 90]]], attributes: {} }] },
    { id: "b", name: "polys", geomType: "polygon", features: [{ parts: [[[0, 0], [10, 0], [10, 10], [0, 0]]], attributes: {} }] },
    { id: "c", name: "drawn", geomType: "polyline", interpretation: true, features: [{ parts: [[[5, 5], [60, 60]]], attributes: { type: "contact" } }] },
  ];
  const lines = traceLines(layers);
  assert.deepEqual(lines.map((l) => l.id), ["trace:a:0:0", "trace:a:1:0", "trace:c:0:0"]);
  assert.equal(lines[0].name, "Falha 1"); assert.ok(lines[1].name.startsWith("Line "));
  assert.ok(lines.every((l) => l.lengthM > 0 && l.vertices >= 2));
  assert.equal(traceLines([{ id: "z", features: [] }, null, { id: "y" }]).length, 0);
  for (const w of ["Falha 1", "falla del valle", "Filão de quartzo", "filao", "Veta principal", "Faille nord", "fault", "thrust", "shear zone"]) assert.ok(FAULT_TEXT.test(w), w);
  for (const w of ["Rio", "Vetas", "caveta", "contact", "road"]) assert.ok(!FAULT_TEXT.test(w), w);
  // the automatic case: a Google Earth line with only a name 'Falha 1' is now read as a fault
  assert.equal(mappedFaultFeatures([layers[0]]).length, 1);
});

test("#4103 order 2 / 3 on points along ONE trace (what a line gives) keep the plane's dip, with centimetre noise on the heights (live: an exact 55 degree plane read 15-30 degrees at order 2)", () => {
  const part = planeTrace({ strike: 30, dip: 55, dy: 30 }).map(([x, y, z]) => [x, y, Math.round(z * 100) / 100 + ((x * 7 + y * 3) % 5) * 0.01]); // 1 cm rounding and a little noise
  const pts = drapeTrace(part.map(([x, y]) => [x, y]), { ground: (x, y) => valley(x, y) + ((x * 7 + y * 3) % 5) * 0.01, stepM: 50 }).points;
  for (const order of [2, 3]) {
    const s = fitTraceSurface(pts, order, { vertices: part.length });
    assert.ok(s.ok, `order ${order}`);
    const ori = orientationsAlong(pts, s, 6);
    for (const o of ori) { assert.ok(Math.abs(o.dip - 55) < 4, `order ${order}: dip ${o.dip}`); assert.ok(angleDiff(o.azimuth, 120) < 6, `order ${order}: dip direction ${o.azimuth}`); }
    assert.ok(s.rms < 0.5);
  }
});

test("#4103 the KML arrives in EPSG:4326: the REAL import path (parse, map layer, reprojection into the project CRS) gives metres, and the plane is fitted in them, not in degrees", async () => {
  const { createRequire } = await import("node:module");
  const proj4 = createRequire(import.meta.url)("proj4");
  const { parseKML, kmlToMapLayers } = await import("../src/lib/kml.js");
  const { buildLayer } = await import("../src/lib/mapLayerBuild.js");
  const UTM = "+proj=utm +zone=33 +datum=WGS84 +units=m +no_defs";
  const part = planeTrace({ strike: 30, dip: 55, x0: 500000, y0: 5001500, from: 5000600, to: 5002400 }).map(([x, y]) => [x, y]);
  const ground = (x, y) => 300 + 0.25 * Math.sqrt((y - 5001500) ** 2 + 400);
  // planeTrace's valley is centred on y = 2000: shift it to the UTM valley used here by building the trace on this ground
  const dd = rad(120), t = Math.tan(rad(55)), z0 = ground(0, 5001500), utm = [];
  for (let y = 5000600; y <= 5002400; y += 30) utm.push([500000 + (z0 - ground(0, y) - t * (y - 5001500) * Math.cos(dd)) / (t * Math.sin(dd)), y]);
  const kml = `<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><Placemark><name>Falha 1</name><LineString><altitudeMode>clampToGround</altitudeMode><coordinates>${utm.map((p) => proj4(UTM, "EPSG:4326", p).map((v) => v.toFixed(8)).join(",")).join(" ")}</coordinates></LineString></Placemark></Document></kml>`;
  const parsed = kmlToMapLayers(parseKML(kml).features).find((l) => l.geomType === "polyline");
  assert.equal(parsed.epsg, 4326);
  assert.ok(Math.abs(parsed.features[0].parts[0][0][0]) < 180, "as written: degrees");
  const built = buildLayer(parsed, { sourceName: "valley.kml", projectEpsg: 32633 });
  assert.match(built.crsNote, /EPSG:4326.*EPSG:32633/);
  const first = built.features[0].parts[0][0];
  assert.ok(Math.abs(first[0] - utm[0][0]) < 0.5 && Math.abs(first[1] - utm[0][1]) < 0.5, `reprojected: ${first}`);
  const lines = traceLines([{ ...built, id: "k" }]);
  assert.equal(lines.length, 1); assert.equal(lines[0].name, "Falha 1");
  const r = tracedEvidence(lines[0], { ground });
  assert.ok(r.ok && Math.abs(r.fit.dip - 55) < 1, `dip ${r.fit?.dip}`);
  assert.ok(angleDiff(r.fit.dipDir, 120) < 2);
  // the same line left in degrees (a project whose CRS could not take it): said, never fitted
  const onTerrain = (x, y) => (x > 1000 ? ground(x, y) : NaN); // a real terrain answers NaN off its box: a line in degrees is nowhere on it
  const left = tracedEvidence({ id: "d", name: "Falha 1", part: parsed.features[0].parts[0], feature: parsed.features[0], lengthM: 1000 }, { ground: onTerrain });
  assert.equal(left.ok, false); assert.equal(left.why, "degrees");
  assert.ok(looksLikeDegrees(parsed.features[0].parts[0]) && !looksLikeDegrees(utm));
  // a small local grid (metres) is not degrees: with no terrain under it the message is the height one
  const local = [[10, 20], [60, 80], [120, 90]];
  assert.equal(looksLikeDegrees(local), false);
  assert.equal(tracedEvidence({ id: "l", name: "L", part: local, feature: { attributes: {}, parts: [local] }, lengthM: 200 }, { ground: () => NaN }).why, "no-height");
});

test("#4103 the poorly-constrained threshold is a named, commented constant that decides; a looser one trusts the same trace", () => {
  const src = fs.readFileSync(new URL("../src/lib/traceFit.js", import.meta.url), "utf8");
  assert.match(src, /POORLY CONSTRAINED: the dip's standard error[\s\S]{0,400}export const MAX_DIP_ERROR_DEG = 10;/);
  assert.equal(MAX_DIP_ERROR_DEG, 10);
  const gentle = (x, y) => 250 + 0.05 * Math.abs(y - 2000); // a 300 m trace over gentle relief: the dip is known to about 15 degrees
  const dd = rad(120), t = Math.tan(rad(55)), z0 = gentle(500, 2000);
  const part = Array.from({ length: 50 }, (_, i) => { const y = 1850 + i * (300 / 49), g = gentle(0, y); return { x: 500 + (z0 - g - t * (y - 2000) * Math.cos(dd)) / (t * Math.sin(dd)), y, z: g }; });
  const strict = fitTracePlane(part, { vertices: 50, maxErrorDeg: 1 }), loose = fitTracePlane(part, { vertices: 50, maxErrorDeg: 90 });
  assert.ok(strict.ok && loose.ok);
  assert.ok(!strict.wellConstrained && strict.problems.includes("little-relief"));
  assert.ok(!loose.problems.includes("little-relief"), "the same trace under a looser threshold is not flagged");
  assert.equal(strict.dipErrorDeg, loose.dipErrorDeg);
});

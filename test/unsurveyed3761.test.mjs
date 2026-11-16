// TASKS.csv #3761 (Scottie Gold review) — the unsurveyed part of a hole was marked only on the bare trace below its LAST station: under the lithology
// tubes SR23-313's last 108 m (survey to 71 m of 179 m) looked measured, Identify there said 'survey method measured', and SR23-299's 339 m between its
// first two stations (0 m, then 339 m) was not marked at all. Synthetic holes of those shapes.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as THREE from "three";
import { unsurveyedSpans, assumedSpanAt, GAP_MIN_M } from "../src/lib/viewer/unsurveyedTail.js";
import { sleeveGeometry, sleeveMeshes, SLEEVE_MAX_HOLES } from "../src/lib/viewer/assumedSleeve.js";
import { describeHits, assumedPositionField } from "../src/lib/viewer/identify.js";

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const trace = (end, step = 3) => { const out = []; for (let md = 0; md < end; md += step) out.push({ md, x: 0, y: -md, z: 0 }); out.push({ md: end, x: 0, y: -end, z: 0 }); return out; };

test("SR23-313: the tail below the last station (71 m of 179 m) is a span; a hole surveyed to its end has none", () => {
  const sp = unsurveyedSpans([{ depth: 0 }, { depth: 30 }, { depth: 71 }], trace(179));
  assert.equal(sp.length, 1);
  assert.deepEqual([sp[0].kind, sp[0].from, sp[0].to], ["tail", 71, 179]);
  const pts = trace(179);
  assert.ok(pts[sp[0].i0].md <= 71 && pts[sp[0].i0 + 1].md > 71, "starts at the point of the last station");
  assert.equal(sp[0].i1, pts.length - 1);
  assert.deepEqual(unsurveyedSpans([{ depth: 0 }, { depth: 60 }, { depth: 120 }, { depth: 175 }], trace(179)), [], "a tail under 10 m is a last few metres");
  assert.deepEqual(unsurveyedSpans([], trace(100)), [], "no survey rows: the assumed stick, dashed whole already");
});

test("SR23-299: stations at 0 m and then from 339 m - the 339 m between is a span; stations 30 m apart are not", () => {
  const sp = unsurveyedSpans([{ depth: 0 }, { depth: 339 }, { depth: 360 }, { depth: 390 }, { depth: 420 }], trace(420));
  assert.deepEqual(sp.map((s) => [s.kind, s.from, s.to]), [["gap", 0, 339]]);
  assert.ok(sp[0].i1 > sp[0].i0);
  assert.equal(unsurveyedSpans([{ depth: 0 }, { depth: 30 }, { depth: 60 }, { depth: 90 }, { depth: 120 }], trace(120)).length, 0);
  assert.equal(unsurveyedSpans([{ depth: 0 }, { depth: GAP_MIN_M }, { depth: 150 }], trace(150)).length, 0, "exactly the limit is not over it");
  const both = unsurveyedSpans([{ depth: 0 }, { depth: 339 }, { depth: 360 }], trace(480));
  assert.deepEqual(both.map((s) => s.kind), ["gap", "tail"], "a gap and a tail on one hole");
});

test("the span a depth falls in", () => {
  const sp = unsurveyedSpans([{ depth: 0 }, { depth: 71 }], trace(179));
  assert.equal(assumedSpanAt(sp, 119).kind, "tail");
  assert.equal(assumedSpanAt(sp, 50), null);
  assert.equal(assumedSpanAt(sp, 71), null, "the last station itself is measured");
  assert.equal(assumedSpanAt(null, 119), null);
});

test("the sleeve: an open tube, a ring per trace point, one mesh per hole, never picked, hidden with its hole", () => {
  const pts = trace(60).map((p) => ({ x: p.x + p.md * 0.2, y: p.y, z: p.z }));
  const g = sleeveGeometry(pts);
  assert.equal(g.attributes.position.count, pts.length * 8);
  assert.equal(g.index.count, (pts.length - 1) * 8 * 6);
  const r = (i) => Math.hypot(g.attributes.position.getX(i) - pts[0].x, g.attributes.position.getZ(i) - pts[0].z);
  assert.ok(Math.abs(g.attributes.position.getY(0) - pts[0].y) < 1e-6 || r(0) > 0, "a ring around the first point");
  const ms = sleeveMeshes([{ holeId: "SR23-299", spans: [pts, pts.map((p) => ({ ...p, y: p.y - 100 }))] }, { holeId: "X", spans: [[pts[0]]] }]);
  assert.equal(ms.length, 1, "a span of one point makes nothing");
  assert.equal(ms[0].userData.holeId, "SR23-299");
  assert.equal(ms[0].geometry.attributes.position.count, pts.length * 8 * 2, "both spans of the hole in one mesh");
  assert.deepEqual(ms[0].raycast(), undefined, "not pickable");
  assert.equal(ms[0].material.depthWrite, false); assert.equal(ms[0].material.depthTest, true);
  const many = sleeveMeshes(Array.from({ length: SLEEVE_MAX_HOLES + 50 }, (_, i) => ({ holeId: `H${i}`, spans: [pts] })));
  assert.equal(many.length, SLEEVE_MAX_HOLES, "capped: past it the dashed trace says it alone");
});

test("Identify: on the bare trace past the last station it says the position is assumed and does not say 'survey method measured'", () => {
  const holes = {};
  const tr = trace(179);
  const spans = unsurveyedSpans([{ depth: 0 }, { depth: 71 }], tr);
  const collar = { hole_id: "SR23-313", length: 179, attrs: { "survey method": "measured", "hole type": "diamond" } };
  const ctx = { origin: { x: 0, y: 0, z: 0 }, rayDirection: new THREE.Vector3(0, -1, 0), isHole: (id) => id === "SR23-313", traceOf: () => tr, assumedSpansOf: () => spans, collarOf: () => collar, layerOf: (x) => (x.parent === holes ? "Drillholes" : null), rasterOf: () => null, mapLayerOf: () => null, structureSetOf: () => null, kindOf: () => null, tolerance: () => 1 };
  const line = { userData: { holeId: "SR23-313" }, parent: holes, visible: true };
  const at = (y) => describeHits([{ object: line, point: new THREE.Vector3(0, -y, 0), distance: 1 }], ctx)[0];
  const past = at(119), before = at(50);
  const text = (it) => it.fields.map((f) => f.join(": ")).join("\n");
  assert.match(text(past), /Position: assumed: beyond the last survey station \(71 m\)/);
  assert.doesNotMatch(text(past), /survey method/, "not 'measured' where the position is assumed");
  assert.match(text(past), /hole type: diamond/, "the rest of the collar's record stays");
  assert.doesNotMatch(text(before), /Position/);
  assert.match(text(before), /survey method: measured/, "measured where it is");
  const gap = assumedPositionField({ kind: "gap", from: 0, to: 339 });
  assert.match(gap[1], /no survey station between 0 m and 339 m \(339 m apart\)/);
});

test("Identify: an interval tube on the unsurveyed stretch says so too", () => {
  const lith = {};
  const tr = trace(179), spans = unsurveyedSpans([{ depth: 0 }, { depth: 71 }], tr);
  const tube = { userData: { tip: "SR23-313\nLithology: ANDS\n100–120 m", holeId: "SR23-313", row: { hole_id: "SR23-313", from: 100, to: 120, value: "ANDS" } }, parent: lith, visible: true };
  const ctx = { origin: { x: 0, y: 0, z: 0 }, rayDirection: new THREE.Vector3(0, -1, 0), isHole: (id) => id === "SR23-313", traceOf: () => tr, assumedSpansOf: () => spans, layerOf: (x) => (x.parent === lith ? "Lithology" : null), rasterOf: () => null, mapLayerOf: () => null, structureSetOf: () => null, kindOf: () => null, tolerance: () => 1 };
  const it = describeHits([{ object: tube, point: new THREE.Vector3(0, -110, 0), distance: 1 }], ctx)[0];
  assert.ok(it.fields.some((f) => f[0] === "Position" && /beyond the last survey station \(71 m\)/.test(f[1])), JSON.stringify(it.fields));
  const early = { ...tube, userData: { ...tube.userData, row: { hole_id: "SR23-313", from: 10, to: 20, value: "ANDS" } } };
  assert.ok(!describeHits([{ object: early, point: new THREE.Vector3(0, -15, 0), distance: 1 }], ctx)[0].fields.some((f) => f[0] === "Position"));
});

test("wiring: the scene builds every span (dashed trace + sleeve) and hands the spans to Identify through the trace record", () => {
  const sc = read("../src/modules/viewer/drillholeScene.js");
  assert.match(sc, /e\.spans = assumedVertical \? \[\] : unsurveyedSpans\(e\.hs, e\.pts\)/);
  assert.match(sc, /assumed: e\.spans \}/);
  assert.match(sc, /sleeveHoles\.push\(\{ holeId: c\.hole_id, spans: spans\.map\(\(sp\) => pts\.slice\(sp\.i0, sp\.i1 \+ 1\)\) \}\)/);
  assert.match(sc, /import\("\.\.\/\.\.\/lib\/viewer\/assumedSleeve\.js"\)\.then\(\(\{ sleeveMeshes \}\) => \{ if \(sleeveToken\.get\(groups\) !== tok\) return; for \(const m of sleeveMeshes\(sleeveHoles\)\) groups\.holes\.add\(m\)/); // loaded when a hole has an unsurveyed stretch
  assert.doesNotMatch(sc, /^import .*assumedSleeve/m);
  assert.match(read("../src/lib/viewer/identify.js"), /assumedSpansOf: \(id\) => r\.tracesRef\.current\.find\(\(t\) => t\.hole_id === id\)\?\.assumed/);
  for (const l of ["es", "pt", "fr", "ar"]) { const j = JSON.parse(read(`../src/locales/${l}.json`)); assert.ok(j["Position"], l); assert.ok(j["assumed: beyond the last survey station ({m} m), the hole's last attitude is carried on"], l); }
});

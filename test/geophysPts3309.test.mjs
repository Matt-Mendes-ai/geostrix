// TASKS.csv #3309 (Galore Creek review: 543,820 IP points; every zoom, Fit, Method pick, units keystroke, import or removal froze the window
// 3-8 s) — lib/viewer/geophysPts.js draws the survey points per survey into compact batches (no object per point) and rebuilds a survey only
// when what it draws changed; a tooltip is made when read. Colours are makeSurveyColorer's.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { syncGeophysPts, rowsSignature, symbolRadius, geophysTipText } from "../src/lib/viewer/geophysPts.js";
import { makeSurveyColorer } from "../src/lib/geophysSurveys.js";
import { colorFrom } from "../src/lib/viewer/pickStandIn.js";

const proto = new THREE.SphereGeometry(1, 8, 6);
const style = { color: null, opacity: 1, size: 1, shape: "sphere" };
const origin = { x: 400000, y: 6300000, z: 0 };
const cloud = (n, src, f) => Array.from({ length: n }, (_, i) => ({ x: 400000 + (i % 100) * 25, y: 6300000 + Math.floor(i / 100) * 25, z: 1000 - (i % 7), value: f(i), _src: src }));
const ip = cloud(3000, "IP.xyz", (i) => 5 + (i % 50) / 5), res = cloud(2000, "Res.xyz", (i) => 10 ** (1 + (i % 30) / 10));
const tips = [];
const base = (over = {}) => ({ opts: {}, surveys: null, style, proto, minR: 0.5, origin, tipOf: (row) => { tips.push(row); return geophysTipText(row, over.surveysForTip || null); }, ...over });
const batchesOf = (g, key) => g.children.filter((c) => c.userData.geophysSurvey === key);

test("each survey in its own compact batches; an unchanged sync keeps every batch object", () => {
  const g = new THREE.Group();
  const r1 = syncGeophysPts(g, [...ip, ...res], base());
  assert.deepEqual(r1.rebuilt.sort(), ["IP.xyz", "Res.xyz"]);
  const ipB = batchesOf(g, "IP.xyz");
  assert.ok(ipB.length >= 1 && ipB.every((b) => b.isInstancedMesh && b.userData.compact));
  assert.equal(ipB.reduce((n, b) => n + b.count, 0), 3000);
  const r2 = syncGeophysPts(g, [...ip, ...res], base());
  assert.deepEqual(r2.kept.sort(), ["IP.xyz", "Res.xyz"]); assert.deepEqual(r2.rebuilt, []);
  assert.equal(batchesOf(g, "IP.xyz")[0], ipB[0], "the same batch object");
});

test("a units / label / method edit redraws nothing; a legend edit redraws that survey only", () => {
  const g = new THREE.Group();
  syncGeophysPts(g, [...ip, ...res], base({ surveys: { "IP.xyz": { method: "ip" } } }));
  const r = syncGeophysPts(g, [...ip, ...res], base({ surveys: { "IP.xyz": { method: "ip", units: "mV/V", label: "Chargeability" }, "Res.xyz": { method: "mt" } } }));
  assert.deepEqual(r.rebuilt, []);
  const resBatch = batchesOf(g, "Res.xyz")[0];
  const l = syncGeophysPts(g, [...ip, ...res], base({ surveys: { "IP.xyz": { legend: { min: 6, max: 12 } } } }));
  assert.deepEqual(l.rebuilt, ["IP.xyz"]); assert.deepEqual(l.kept, ["Res.xyz"]);
  assert.equal(batchesOf(g, "Res.xyz")[0], resBatch);
});

test("a survey added then removed: the others kept (the same row objects in a new array)", () => {
  const g = new THREE.Group(), small = cloud(514, "Electrodes.csv", (i) => i);
  syncGeophysPts(g, [...ip, ...res], base());
  const a = syncGeophysPts(g, [...ip, ...res, ...small], base());
  assert.deepEqual(a.rebuilt, ["Electrodes.csv"]); assert.deepEqual(a.kept.sort(), ["IP.xyz", "Res.xyz"]);
  const b = syncGeophysPts(g, [...ip, ...res], base());
  assert.deepEqual(b.removed, ["Electrodes.csv"]); assert.deepEqual(b.rebuilt, []);
  assert.equal(batchesOf(g, "Electrodes.csv").length, 0);
  // a filter that hides some IP points: IP rebuilt, Res kept
  const f = syncGeophysPts(g, [...ip.slice(0, 2500), ...res], base());
  assert.deepEqual(f.rebuilt, ["IP.xyz"]); assert.deepEqual(f.kept, ["Res.xyz"]);
});

test("the zoom: under the base size nothing is rebuilt; above it, the sizes are; the origin moves everything", () => {
  const g = new THREE.Group();
  syncGeophysPts(g, [...ip, ...res], base({ minR: 0.2 }));
  assert.deepEqual(syncGeophysPts(g, [...ip, ...res], base({ minR: 1.3 })).rebuilt, []);
  const ipB = batchesOf(g, "IP.xyz")[0], s0 = ipB.instanceMatrix.array[0];
  const z = syncGeophysPts(g, [...ip, ...res], base({ minR: 6 }));
  assert.deepEqual(z.resized.sort(), ["IP.xyz", "Res.xyz"]); assert.deepEqual(z.rebuilt, []);
  assert.equal(batchesOf(g, "IP.xyz")[0], ipB, "rescaled in place, the same batch");
  const t0 = (ip[0].value - 5) / 9.8; // the robust range of 5..14.8
  assert.ok(ipB.instanceMatrix.array[0] > s0 && Math.abs(ipB.instanceMatrix.array[0] - symbolRadius(Math.min(1, Math.max(0, t0)), 6)) < 0.2, `${s0} -> ${ipB.instanceMatrix.array[0]}`);
  assert.equal(ipB.userData.compact.moves, undefined, "the pick index is not rebuilt for a size change");
  assert.equal(syncGeophysPts(g, [...ip, ...res], base({ minR: 6, origin: { x: 400100, y: 6300000, z: 0 } })).rebuilt.length, 2);
  assert.equal(symbolRadius(0.5, 0.2), 1.4 + 1.4); assert.equal(symbolRadius(0, 6), 6);
  // batches taken out of the group by someone else: rebuilt, not trusted
  for (const c of [...g.children]) g.remove(c);
  assert.equal(syncGeophysPts(g, [...ip, ...res], base({ minR: 6, origin: { x: 400100, y: 6300000, z: 0 } })).rebuilt.length, 2);
});

test("the colours are makeSurveyColorer's, and a point's tooltip is made only when read, with the survey's units then", () => {
  const g = new THREE.Group(), rows = [...ip, ...res];
  tips.length = 0;
  syncGeophysPts(g, rows, base());
  assert.equal(tips.length, 0, "no tooltip made by the build");
  const col = makeSurveyColorer(rows, {}, null);
  const b = batchesOf(g, "Res.xyz")[0], cp = b.userData.compact;
  for (const i of [0, 777, 1999]) {
    const row = cp.rows[i].row, want = colorFrom(col.colorOf(row).color, true);
    const a = b.instanceColor.array;
    assert.ok(Math.abs(a[i * 3] - want.r) < 1e-6 && Math.abs(a[i * 3 + 1] - want.g) < 1e-6 && Math.abs(a[i * 3 + 2] - want.b) < 1e-6, `point ${i}`);
  }
  const tip = cp.rows[5].tip;
  assert.equal(tips.length, 1); assert.match(tip, /^Res\.xyz\nvalue: /);
  assert.match(geophysTipText(ip[0], { "IP.xyz": { units: "mV/V" } }), /value: 5 mV\/V\n400000E 6300000N 1000Z$/);
});

test("rowsSignature: the same row objects in a new array match; one changed object does not", () => {
  assert.equal(rowsSignature([...ip]), rowsSignature(ip));
  const copy = [...ip]; copy[ip.length - 1] = { ...ip[ip.length - 1] };
  assert.notEqual(rowsSignature(copy), rowsSignature(ip));
});

test("245,066 points: built in well under the 2.8 s one cloud took; an unchanged sync in a fraction of that", () => {
  const big = cloud(245066, "IP.xyz", (i) => (i % 997) / 10), g = new THREE.Group();
  let t0 = performance.now();
  syncGeophysPts(g, big, base());
  const build = performance.now() - t0;
  t0 = performance.now();
  syncGeophysPts(g, [...big], base({ surveys: { "IP.xyz": { units: "mV/V" } } }));
  const again = performance.now() - t0;
  assert.ok(build < 2500, `build ${Math.round(build)} ms`);
  assert.ok(again < 400, `unchanged ${Math.round(again)} ms`);
});

test("wired: the 3D View's build syncs per survey and keeps the surveys for the tooltip", () => {
  const v = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(v, /syncGeophysPts\(g, rows, \{ opts: \{ stops: geophysPtsStops, colorMode: geophysPtsColorMode, min: geophysPtsMin, max: geophysPtsMax \}, surveys: geophysSurveys,/);
  assert.match(v, /tipOf: \(row\) => geophysTipText\(row, geophysSurveysRef\.current\)/);
  assert.doesNotMatch(v.slice(v.indexOf("const buildGeophysPts = () => {"), v.indexOf("const geophysSymbolMppRef")), /PickStandIn|clearGroup/);
  // out of the startup bundle (#3159): imported when there is a survey to draw
  assert.match(v, /if \(rows\.length\) import\("\.\.\/lib\/viewer\/geophysPts\.js"\)\.then\(\(m\) => \{ geophysPtsLib = m; buildGeophysPtsRef\.current\(\); \}\)/);
  assert.doesNotMatch(v, /^import [^\n]*lib\/viewer\/geophysPts\.js/m);
  // zooming in: shrunk at once, not after the zoom settles
  assert.match(v, /if \(name === "geophys_pts" && mpp < builtRef\.current \/ 2 && floored\(builtRef\.current, mpp\)\) \{ zr\.key = key; zr\.at = Infinity; buildRef\.current\(\); continue; \}/);
});

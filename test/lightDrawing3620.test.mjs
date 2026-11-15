// TASKS.csv #3620 — light drawing for a software renderer: decided from the GPU's name and a stored choice; fewer triangles per marker; the draw counts readable
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { decideLight, isLight, setLight, lightDrawingNotice, registerRenderer, renderStats, LIGHT_LOD_SCALE, LIGHT_ASSAY_AUTO_LIMIT } from "../src/lib/viewer/lightDrawing.js";
import { INTERVAL_PROTO, PROTO_CYLINDER, PROTO_CYLINDER_16, PROTO_PRISM_4, PROTO_SPHERE_10, PROTO_SOLID_LOW, POINT_PROTO, intervalProto, lightSolid } from "../src/lib/viewer/protos.js";
import { assayProto, assayShapeFor, ASSAY_TRACE, ASSAY_AUTO_LIMIT } from "../src/lib/viewer/assayShape.js";
import { lodWanted, LOD_ON_PX, LOD_OFF_PX } from "../src/lib/viewer/assayLod.js";
const tris = (g) => (g.index ? g.index.count : g.attributes.position.count) / 3;
const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("#3620 light drawing is on for a software renderer, off for a GPU, and the stored choice wins", () => {
  setLight(false);
  assert.equal(decideLight("ANGLE (Microsoft, Microsoft Basic Render Driver (0x0000008C) Direct3D11 vs_5_0 ps_5_0, D3D11)", "auto"), true);
  assert.equal(decideLight("Google SwiftShader", "auto"), true);
  assert.equal(decideLight("llvmpipe (LLVM 15.0.7, 256 bits)", "auto"), true);
  assert.equal(decideLight("ANGLE (Intel, Intel(R) Iris(R) Xe Graphics (0x00009A49) Direct3D11 vs_5_0 ps_5_0, D3D11)", "auto"), false);
  assert.equal(decideLight("NVIDIA GeForce RTX 3060", "auto"), false);
  assert.equal(decideLight("NVIDIA GeForce RTX 3060", "on"), true);
  assert.equal(decideLight("Microsoft Basic Render Driver", "off"), false);
  assert.equal(decideLight("", "auto"), false); // not known: full drawing
});

test("#3620 the notice says what was found, only when light drawing came by itself", () => {
  decideLight("Microsoft Basic Render Driver", "auto");
  const n = lightDrawingNotice("Microsoft Basic Render Driver", "auto");
  assert.match(n.text, /Software rendering detected \(Microsoft Basic Render Driver\)/); assert.equal(n.level, "info");
  assert.equal(lightDrawingNotice("Microsoft Basic Render Driver", "on"), null, "asked for: nothing to say");
  decideLight("NVIDIA", "auto"); assert.equal(lightDrawingNotice("NVIDIA", "auto"), null);
});

test("#3620 light drawing: prisms for intervals, a 20-triangle solid for a sphere, assays along the hole sooner, coarse detail from 12 px", () => {
  setLight(false);
  assert.equal(intervalProto("cylinder"), PROTO_CYLINDER); assert.equal(assayProto("sphere"), POINT_PROTO.sphere); assert.equal(assayProto(ASSAY_TRACE), PROTO_CYLINDER);
  assert.equal(assayShapeFor({}, 32546), "sphere"); assert.equal(assayShapeFor({}, ASSAY_AUTO_LIMIT + 1), ASSAY_TRACE);
  assert.equal(lodWanted(2, 0.5, false), false); // 4 px a sample: full
  setLight(true);
  assert.equal(intervalProto("cylinder"), PROTO_PRISM_4); assert.equal(intervalProto("smooth"), PROTO_PRISM_4); assert.equal(intervalProto("square"), PROTO_PRISM_4);
  assert.equal(assayProto("sphere"), PROTO_SOLID_LOW); assert.equal(assayProto(ASSAY_TRACE), PROTO_PRISM_4); assert.equal(assayProto("cube"), POINT_PROTO.cube);
  assert.equal(lightSolid(PROTO_SPHERE_10), PROTO_SOLID_LOW);
  assert.equal(assayShapeFor({}, 32546), ASSAY_TRACE, "Macpass's 32,546 assays: along the hole"); assert.equal(assayShapeFor({}, LIGHT_ASSAY_AUTO_LIMIT), "sphere"); assert.equal(assayShapeFor({}, LIGHT_ASSAY_AUTO_LIMIT + 1), ASSAY_TRACE);
  assert.equal(assayShapeFor({ shape: "sphere" }, 90000), "sphere", "the user's own shape wins");
  assert.equal(lodWanted(2, 0.5, false), true); // 4 px a sample: coarse (under 12)
  assert.equal(lodWanted(2, 0.1, false), false); assert.equal(lodWanted(2, 0.1, true), false); assert.equal(lodWanted(2, 0.12, true), true); // 20 px: full; the margin: still coarse under 18 px (16.7)
  assert.equal(LIGHT_LOD_SCALE * LOD_ON_PX, 12); assert.equal(LIGHT_LOD_SCALE * LOD_OFF_PX, 18);
  setLight(false);
});

test("#3620 triangles a marker: the 10 x 10 sphere 180, the light solid 20, the 6-sided interval 24 with its caps, the prism 16", () => {
  assert.equal(tris(PROTO_SPHERE_10), 180); assert.equal(tris(PROTO_SOLID_LOW), 20);
  assert.equal(tris(PROTO_PRISM_4), 4 * 2 + 4 + 4); // 4 sides x 2 triangles, two 4-triangle caps
  assert.ok(tris(PROTO_PRISM_4) < tris(PROTO_CYLINDER) && tris(PROTO_CYLINDER) < tris(PROTO_CYLINDER_16));
});

test("#3620 the draw counts of the registered renderer are readable (window.__geostrixRenderInfo, the problem report)", () => {
  assert.equal(renderStats() === null || typeof renderStats() === "object", true);
  const fake = { info: { render: { calls: 41, triangles: 1234567, points: 0, lines: 559, frame: 9 }, memory: { geometries: 12, textures: 3 }, programs: [1, 2, 3] }, getSize: (t) => t.set(1614, 806), getContext: () => ({ getExtension: () => null, getParameter: () => "Microsoft Basic Render Driver", RENDERER: 1 }) };
  setLight(true); registerRenderer(fake);
  assert.deepEqual(renderStats(), { renderer: "Microsoft Basic Render Driver", gpu: "software", light: true, calls: 41, triangles: 1234567, points: 0, lines: 559, geometries: 12, textures: 3, programs: 3, canvas: "1614x806" });
  setLight(false);
});

test("#3620 wiring: the view decides before it makes the renderer, registers it, says so, and the problem report carries the counts", () => {
  const v = read("../src/modules/ViewerModule.jsx");
  assert.match(v, /const light = decideLight\(\);[^\n]*\n    const renderer = new THREE\.WebGLRenderer\(\{ antialias: !light, stencil: true \}\);/);
  assert.match(v, /renderer\.setPixelRatio\(light \? 1 : Math\.min\(window\.devicePixelRatio, 2\)\);/);
  assert.match(v, /registerRenderer\(renderer\); \{ const ln = lightDrawingNotice\(\); if \(ln\) setNotices\(\(p\) => \[\.\.\.p, ln\]\); \}/);
  assert.match(read("../src/components/ReportProblemModal.jsx"), /info: \{ \.\.\.info, render: window\.__geostrixRenderInfo\?\.\(\) \?\? null/);
  assert.match(read("../src/modules/viewer/drillholeScene.js"), /geo = intervalProto\(st\.shape, /);
});

import { PROTO_CROSS, PROTO_PRISM_4 as PRISM, PROTO_CYLINDER as CYL } from "../src/lib/viewer/protos.js";
import { LIGHT_LINES_MIN, lightPref, applyLightPref } from "../src/lib/viewer/lightDrawing.js";

test("#3620 a big interval layer is crossed ribbons in light drawing (4 triangles), a small one a prism; full drawing is unchanged", () => {
  setLight(true);
  assert.equal(tris(PROTO_CROSS), 4); assert.equal(PROTO_CROSS.attributes.normal.count, 8);
  assert.equal(intervalProto("cylinder", LIGHT_LINES_MIN - 1), PRISM); assert.equal(intervalProto("cylinder", LIGHT_LINES_MIN), PROTO_CROSS);
  assert.equal(intervalProto("smooth", 32498), PROTO_CROSS); assert.equal(intervalProto("square", 32498), PROTO_CROSS); assert.equal(intervalProto("square", 10), PRISM);
  assert.equal(intervalProto("cylinder"), PRISM, "no count: the prism");
  setLight(false);
  assert.equal(intervalProto("cylinder", 99999), CYL); assert.equal(intervalProto("square", 99999), PRISM);
});

test("#3620 the choice: auto follows the GPU, on and off decide; applying it decides at once", () => {
  const store = new Map();
  globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  try {
    assert.equal(lightPref(), "auto");
    assert.equal(applyLightPref("on"), true); assert.equal(isLight(), true); assert.equal(lightPref(), "on");
    assert.equal(applyLightPref("off"), false); assert.equal(isLight(), false); assert.equal(lightPref(), "off");
    applyLightPref("auto"); assert.equal(lightPref(), "auto"); assert.equal(store.has("geostrix.lightDrawing"), false, "auto is the absence of a choice");
  } finally { delete globalThis.localStorage; setLight(false); }
});

test("#3620 wiring: the sidebar control rebuilds the scene, the big layers take the ribbons with both sides drawn", () => {
  assert.match(read("../src/modules/ViewerModule.jsx"), /<LightDrawingControl onChange=\{\(\) => setRebuildSeq\(\(n\) => n \+ 1\)\} \/>/);
  const d = read("../src/modules/viewer/drillholeScene.js");
  assert.match(d, /geo = intervalProto\(st\.shape, \(layers\?\.\[groupKey\] \|\| \[\]\)\.length\);/);
  assert.match(d, /side: geo === PROTO_CROSS \? THREE\.DoubleSide : THREE\.FrontSide/);
  assert.match(d, /side: iproto === PROTO_CROSS \? THREE\.DoubleSide : THREE\.FrontSide/);
  assert.match(read("../src/modules/viewer/LightDrawingControl.jsx"), /applyLightPref\(v\); onChange\?\.\(\);/);
});

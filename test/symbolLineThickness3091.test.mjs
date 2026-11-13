// TASKS.csv #3091 — Matt: "I wanna have the option to adjust the thickness of lines of symbols": a Line thickness per outcrop set, in the 3D
// view (ribbons, as WebGL lines are 1 px), the KMZ icons, the legends / Layout and the panel's own symbols
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { SYMBOLS, symbolGeometry, strokeTriangles, symbolSvg, lineScaleOf, LINE_MM } from "../src/lib/structureSymbols.js";
import { symbolPixels, symbolPng } from "../src/lib/structureSymbolPng.js";
import { syncSurfaceStructures } from "../src/lib/viewer/sceneBuilders.js";
import { outcropLegendGroup } from "../src/lib/legendGroups.js";

const triArea = (t) => Math.abs((t[2] - t[0]) * (t[5] - t[1]) - (t[4] - t[0]) * (t[3] - t[1])) / 2;

test("each segment carries its weight; the ribbons are weight x thickness wide, half a width past each end", () => {
  const geo = symbolGeometry(SYMBOLS["6.2"]);
  assert.equal(geo.widths.length, geo.segments.length); assert.ok(geo.widths.every((w) => w === LINE_MM));
  assert.ok(symbolGeometry(SYMBOLS["2.15.1"]).widths.some((w) => w === 0.375), "a fault's own weight");
  for (const scale of [1, 3]) {
    const tris = strokeTriangles(geo, scale);
    assert.equal(tris.length, geo.segments.length * 2);
    const [u1, v1, u2, v2] = geo.segments[0], L = Math.hypot(u2 - u1, v2 - v1), w = LINE_MM * scale;
    assert.ok(Math.abs(triArea(tris[0]) + triArea(tris[1]) - (L + w) * w) < 1e-9, String(scale));
  }
});

test("lineScaleOf: 1 by default, kept within 0.25-6", () => {
  assert.equal(lineScaleOf(null), 1); assert.equal(lineScaleOf({ lineScale: 2.5 }), 2.5); assert.equal(lineScaleOf({ lineScale: 0.1 }), 0.25); assert.equal(lineScaleOf({ lineScale: 9 }), 6); assert.equal(lineScaleOf({ lineScale: "x" }), 1);
});

test("the SVG strokes and the KMZ icon get bolder with it", () => {
  const sw = (svg) => [...svg.matchAll(/stroke-width="([\d.]+)"/g)].map((m) => Number(m[1]));
  // the icons: by the square root, capped at 1.2 mm of symbol (22 px: 4.06 px), so a small icon keeps its shape
  const a = sw(symbolSvg(SYMBOLS["6.2"], { px: 22 })), b = sw(symbolSvg(SYMBOLS["6.2"], { px: 22, lineScale: 3 })), c = sw(symbolSvg(SYMBOLS["6.2"], { px: 22, lineScale: 1.5 }));
  assert.equal(a.length, b.length); a.forEach((v, i) => { assert.ok(b[i] > v && c[i] > v && b[i] >= c[i], `${v} -> ${c[i]} -> ${b[i]}`); assert.ok(b[i] <= (1.2 * 22) / 6.5 + 0.01, String(b[i])); });
  assert.ok(Math.abs(c[0] - a[0] * Math.sqrt(1.5)) < 0.02);
  const ink = (p) => { let n = 0; for (let i = 3; i < p.rgba.length; i += 4) if (p.rgba[i]) n++; return n; };
  assert.ok(ink(symbolPixels(SYMBOLS["6.2"], 64, { strokePx: 2 * 3 })) > 2 * ink(symbolPixels(SYMBOLS["6.2"], 64, { strokePx: 2 })));
  assert.notDeepEqual(symbolPng(SYMBOLS["6.2"], 64, { strokeScale: 3 }), symbolPng(SYMBOLS["6.2"], 64));
});

test("3D: the set's ribbons lie flat with the lines, as wide as the thickness asks", () => {
  const set = (lineScale) => ({ id: "s", size: 50, rows: [{ x: 100, y: 200, z: 300, dip: 35, dipDir: 120, cls: "bedding", type: "Bedding" }], ...(lineScale ? { lineScale } : {}) });
  const area = (ls) => {
    const g = new THREE.Group(), cache = {};
    syncSurfaceStructures(g, cache, [set(ls)], { origin: { x: 0, y: 0, z: 0 }, terrain: null });
    const mesh = cache.s.children.find((c) => c.isMesh && !c.isInstancedMesh), a = mesh.geometry.attributes.position.array;
    const y = a[1]; for (let i = 1; i < a.length; i += 3) assert.ok(Math.abs(a[i] - y) < 1e-4, "flat");
    let s = 0; for (let i = 0; i < a.length; i += 9) s += Math.abs((a[i + 3] - a[i]) * (a[i + 8] - a[i + 2]) - (a[i + 6] - a[i]) * (a[i + 5] - a[i + 2])) / 2;
    assert.ok(cache.s.children.some((c) => c.isLineSegments), "the 1 px lines stay under the ribbons");
    return s;
  };
  const a1 = area(null), a3 = area(3);
  assert.ok(a1 > 0 && a3 > 2.5 * a1, `${a1} ${a3}`); // ~3x the width (the ends grow too)
});

test("the legend row and the panel take the set's thickness; the panel saves it like the size", () => {
  const g = outcropLegendGroup({ surfaceStructures: [{ name: "a", lineScale: 2, rows: [{ type: "Bedding", cls: "bedding", dip: 30 }] }] });
  const w = (svg) => Number(svg.match(/stroke-width="([\d.]+)"/)[1]);
  const g1 = outcropLegendGroup({ surfaceStructures: [{ name: "a", rows: [{ type: "Bedding", cls: "bedding", dip: 30 }] }] });
  assert.ok(w(g.items[0][2].svg) > w(g1.items[0][2].svg), "bolder in the legend");
  const p = readFileSync(new URL("../src/components/SurfaceMappingPanel.jsx", import.meta.url), "utf8");
  assert.match(p, /\{tr\("Line thickness"\)\}<\/span>\s*<input type="range" min=\{0\.25\} max=\{6\} step=\{0\.25\} value=\{lineScaleOf\(s\)\} onChange=\{\(e\) => updateSurfaceStructureSet\(s\.id, \{ lineScale: Number\(e\.target\.value\) \}\)\}/);
  assert.match(p, /symbolSvg\(sym, \{ px: 22, color: STRUCTURE_CLASS_COLORS\[t\.cls\] \|\| "#333", lineScale: lineScaleOf\(s\)/);
});

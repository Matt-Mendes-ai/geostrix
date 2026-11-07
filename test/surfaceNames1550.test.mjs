// TASKS.csv #1550 / #1374 — repeated runs read 'Top of V-Ash Tuff' three times in the list, Check relationships, Solid blocks and the
// Explicit 'Trim at the fault' select (only the vein-solid dropdowns told them apart), and a surface could not be renamed
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { surfaceOptionLabels } from "../src/lib/viewer/surfaceLabels.js";

const src = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

test("the shared rule: a repeated name carries its run's time", () => {
  const L = surfaceOptionLabels([
    { id: "a", name: "Top of V-Ash Tuff", params: { generatedAt: "2026-11-03T15:52:00Z" } },
    { id: "b", name: "Top of V-Ash Tuff", params: { generatedAt: "2026-11-03T16:04:00Z" } },
    { id: "c", name: "Vn1a" },
  ]);
  assert.notEqual(L.get("a"), L.get("b"));
  assert.match(L.get("a"), /^Top of V-Ash Tuff \(\d\d:\d\d\)$/);
  assert.equal(L.get("c"), "Vn1a");
});

test("the list, the relationship check, Surface query, Solid blocks and the trim select all use it; the row can be renamed", () => {
  const v = src("../src/modules/ViewerModule.jsx");
  assert.match(v, /faceCount: s\.faceCount \}\)\}>\{surfaceLabels\.get\(s\.id\) \?\? s\.name\}<\/div>/);
  assert.match(v, /id: s\.id, name: surfaceLabels\.get\(s\.id\) \?\? s\.name, type: s\.type, closure: s\.closure/);
  assert.match(v, /\}, \[implicitSurfaces, surfaceLabels\]\);/);
  assert.match(v, /return \{ id: s\.id, name: surfaceLabels\.get\(s\.id\) \?\? s\.name, positions:/);
  assert.match(v, /label: tr\("Rename…"\), onClick: \(\) => askPrompt\("Rename surface:", s\.name, \(n\) => \{ if \(n\?\.trim\(\)\) setImplicitSurfaces\(\(p\) => p\.map\(\(x\) => \(x\.id === s\.id \? \{ \.\.\.x, name: n\.trim\(\) \} : x\)\)\);/);
  assert.match(src("../src/components/SurfaceSolidsPanel.jsx"), />\{runLabels\.get\(it\.id\) \?\? it\.name\}/);
  assert.match(src("../src/components/ExplicitSurfacePanel.jsx"), /surfaceNames\.get\(x\.id\) \?\? x\.name/);
});

// TASKS.csv #2314 — Macrostrat geology for an area drawn on the map, not only the project area.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("#2314 the dialog keeps a drawn area, falls back to the project area, and every fetch uses it", () => {
  const m = read("src/components/MacrostratModal.jsx");
  assert.match(m, /bboxLonLat: projectBbox \}\) \{/);
  assert.match(m, /const bboxLonLat = drawn \|\| projectBbox;/);
  assert.match(m, /<BasemapView\s+mode="draw"\s+initialBboxLonLat=\{bboxLonLat\}/);
  assert.match(m, /onConfirm=\{\(b\) => \{ setDrawn\(b\); setUnits\(null\); setMsg\(null\); setPicking\(false\); \}\}/);
  // the three fetches read bboxLonLat (or its centre), which is the drawn area when there is one
  assert.match(m, /fetchMacrostratRaster\(\{ bboxLonLat,/);
  assert.match(m, /fetchMacrostratLegend\(\{ bboxLonLat,/);
  assert.match(m, /fetchMacrostratMapLayer\(\{ bboxLonLat,/);
  assert.match(m, /const centre = bboxLonLat \?/);
  // drawing is possible with no project area at all
  assert.match(m, /disabled=\{!!busy\} onClick=\{\(\) => setPicking\(true\)\}/);
});

test("#2314 the area size line", async () => {
  const src = read("src/components/MacrostratModal.jsx");
  const lib = read("src/lib/areaSize.js"); // #1765 — moved to a lib, shared with the fetch-area picker
  const body = lib.slice(lib.indexOf("export function areaSizeText"));
  const areaSizeText = new Function(body.replace("export function areaSizeText", "return function areaSizeText"))();
  assert.match(src, /export \{ areaSizeText \};/);
  assert.equal(areaSizeText(null), "");
  assert.equal(areaSizeText([-129.1, 56.0, -129.0, 56.05]), "~6.2 km × 5.5 km");
  assert.equal(areaSizeText([-129.1, 56.0, -129.095, 56.004]), "~311 m × 442 m");
  assert.equal(areaSizeText([-130, 55, -128, 57]), "~124 km × 221 km");
});

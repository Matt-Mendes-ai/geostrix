// TASKS.csv #2244 — 'Convert heights to elevations (terrain + height)' did nothing, silently, on a project with no terrain. The button is
// disabled with no terrain, and a visible line now says what it needs.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("disabled without a terrain, and said under it", () => {
  const src = readFileSync(new URL("../src/modules/GeophysicsModule.jsx", import.meta.url), "utf8");
  assert.match(src, /<button type="button" disabled=\{!terrain\} onClick=\{\(\) => convertAgl\(sv\.key\)\}/);
  assert.match(src, /meta\.zMeaning === "agl" && !terrain && \(/);
  assert.match(src, /tr\("Needs a terrain: load or build one under Maps > Terrain \(a DEM, a fetch, or the project's own collars\)\."\)/);
});

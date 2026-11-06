// TASKS.csv #1434 — stale cross-tab text in Geophysics: an 'Also planned' .grd reader that shipped in v0.1.99, a voxel note pointing at a
// section that isn't there, and an empty state whose 'Import CSV…' opened the point-survey importer on the DC / IP pane.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const g = readFileSync(new URL("../src/modules/GeophysicsModule.jsx", import.meta.url), "utf8");

test("no planned .grd reader; the voxel note names the import that exists", () => {
  assert.ok(!g.includes("Surfer 6 / 7 binary grids (.grd) — read as a raster drape"));
  assert.ok(!g.includes('tr("Also planned:")'));
  assert.match(g, /Export the voxel from Oasis montaj as a CSV and use \\"Import block model CSV…\\" above\./);
});

test("the empty state matches the pane: no point importer on DC / IP", () => {
  assert.match(g, /actionLabel=\{geoPane === "dcip" \? null : geoPane === "points" \? tr\("Import CSV…"\) : tr\("Import a point survey \(CSV\)…"\)\}/);
  assert.match(g, /onAction=\{geoPane === "dcip" \? null : /);
  assert.match(g, /\{geoPane === "dcip" && <div [^>]*>\{tr\("A DC \/ IP line comes in through/);
});

test("the 3D View's terrain hint already names Maps > Terrain", () => {
  const v = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.ok(!v.includes("(Geophysics tab) and they are placed on it"));
  assert.ok(v.includes("Load a terrain (Maps > Terrain) to place them on the ground."));
});

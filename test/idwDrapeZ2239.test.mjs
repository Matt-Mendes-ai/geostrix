// TASKS.csv #2239 — an IDW grid of stations with elevations is drawn at the stations' median elevation, not the collars'
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { median } from "../src/lib/arrayStats.js";

const g = readFileSync(new URL("../src/modules/GeophysicsModule.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("the raster's elevation and the notice come from the gridded points when they have z", () => {
  assert.ok(g.includes("const ptsZs = pts.map((r) => r.z).filter(Number.isFinite), ptsZ = ptsZs.length ? median(ptsZs) : null;"));
  assert.ok(g.includes("const gridElev = ptsZ != null ? ptsZ : defaultElevation;"));
  assert.ok(g.includes('addRaster({ ...raster, elevation: gridElev, provenance: { tool: "IDW gridding",'));
  assert.ok(g.includes("ptsZ != null ? tr(\" Drawn flat at {z} m, the stations' median elevation (there is no terrain to drape it on).\""));
  assert.equal(median([400, 400, 401, NaN].filter(Number.isFinite)), 400);
});

// TASKS.csv #2557 — a gridded survey forgot its method: RTP ran on a radiometric grid, a single line became an 80 x 1 grid, and the ternary
// listed every raster. The raster keeps its survey's method; the filters, the ternary and the gridder follow it.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { rasterMethodOf, filterBlockedBy, ternaryChoices, pointsAlongOneLine } from "../src/lib/rasterMethod.js";

test("the method: carried by the raster, else its source survey's; unknown stays null", () => {
  const surveys = { "rad.csv": { method: "rad_tc", units: "cps" } };
  assert.equal(rasterMethodOf({ surveyMethod: "grav" }, surveys), "grav");
  assert.equal(rasterMethodOf({ provenance: { survey: "rad.csv" } }, surveys), "rad_tc");
  assert.equal(rasterMethodOf({ name: "import.tif" }, surveys), null);
  assert.equal(rasterMethodOf({ surveyMethod: "nonsense" }, surveys), null);
});

test("filters: none on radiometrics / EM, no reduction to the pole on gravity, everything on magnetics and on an unknown grid", () => {
  for (const k of ["rtp", "vd1", "upward", "tilt", "worms", "euler", "spectrum"]) assert.equal(filterBlockedBy(k, "rad_tc"), "potential", k);
  assert.equal(filterBlockedBy("vd1", "em_cond"), "potential");
  for (const k of ["rtp", "rtpa", "rte"]) assert.equal(filterBlockedBy(k, "grav"), "magnetic", k);
  for (const k of ["vd1", "upward", "tilt", "as", "worms", "euler", "tiltdepth", "spectrum"]) assert.equal(filterBlockedBy(k, "grav"), null, k);
  for (const k of ["rtp", "rte", "vd1"]) assert.equal(filterBlockedBy(k, "mag"), null);
  assert.equal(filterBlockedBy("rtp", null), null);
});

test("the ternary: the channel's grid first, other radiometric grids next, grids of another method last and marked", () => {
  const methods = { a: "mag", b: "rad_th", c: "rad_k", d: null, e: "rad_u", f: "grav" };
  const rs = [{ id: "a", name: "TMI IDW" }, { id: "b", name: "Th IDW" }, { id: "c", name: "K IDW" }, { id: "d", name: "Potassium.tif" }, { id: "e", name: "U IDW" }, { id: "f", name: "Bouguer" }];
  const k = ternaryChoices(rs, "k", (r) => methods[r.id]);
  assert.deepEqual(k.map((x) => x.raster.id), ["c", "d", "b", "e", "a", "f"]);
  assert.deepEqual(k.filter((x) => x.other).map((x) => x.raster.id), ["a", "f"]);
  assert.equal(ternaryChoices(rs, "u", (r) => methods[r.id])[0].raster.id, "e");
});

test("one traverse is one line; a grid of lines, or a line with a real offset, is not", () => {
  const line = Array.from({ length: 81 }, (_, i) => ({ x: 412000 + i * 25, y: 6500000 + i * 25 })); // a diagonal line
  assert.equal(pointsAlongOneLine(line, 25), true);
  const grid = []; for (let i = 0; i < 10; i++) for (let j = 0; j < 10; j++) grid.push({ x: i * 50, y: j * 50 });
  assert.equal(pointsAlongOneLine(grid, 25), false);
  const two = [...line, ...line.map((p) => ({ x: p.x + 200, y: p.y - 200 }))];
  assert.equal(pointsAlongOneLine(two, 25), false);
  assert.equal(pointsAlongOneLine([{ x: 0, y: 0 }, { x: 1, y: 1 }], 25), true);
});

test("the gridder refuses a single line and stamps the method; filter products keep it; the dialog disables what does not apply", () => {
  const g = readFileSync(new URL("../src/modules/GeophysicsModule.jsx", import.meta.url), "utf8");
  assert.match(g, /if \(pointsAlongOneLine\(pts, idwCellSize\)\)/);
  assert.match(g, /surveyMethod: geophysSurveys\?\.\[idwKey\]\?\.method \|\| undefined/);
  const r = readFileSync(new URL("../src/modules/RasterModule.jsx", import.meta.url), "utf8");
  assert.match(r, /surveyMethod: rasterMethodOf\(r, geophysSurveys\) \|\| undefined, units: r\.units \? FILTERS\[filt\.kind\]\.unitsOut\(r\.units\)/);
  assert.match(r, /disabled=\{filtering \|\| !!filterBlockedBy\(filt\.kind, rasterMethodOf\(r, geophysSurveys\)\)\}/);
  assert.match(r, /ternaryChoices\(gridRasters, key,/);
});

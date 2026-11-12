// TASKS.csv #2845 (GSC review B12) — a grid made from stations (Grid to raster (IDW)) had no colour bar on its Maps card and no row in the
// Layout legend until its Ramp or Stretch was touched: it was stored without colourRange / colourStops.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { idwColourFields } from "../src/lib/idw.js";
import { rasterLegendGroups } from "../src/lib/legendGroups.js";
import { DEFAULT_RASTER_STYLE, rasterStops } from "../src/lib/rasterColour.js";

test("idwColourFields: the viridis stops over the stretch, the same as a default-styled raster", () => {
  const f = idwColourFields({ mode: "p2-98", lo: -62.59, hi: -35.98 });
  assert.deepEqual(f.colourRange, [-62.59, -35.98]);
  assert.deepEqual(f.colourStyle, { palette: "viridis", stretch: "p2-98", invert: false });
  const ref = rasterStops(DEFAULT_RASTER_STYLE, -62.59, -35.98);
  assert.equal(f.colourStops.length, ref.length);
  f.colourStops.forEach((s, i) => { assert.equal(s.color, ref[i].color); assert.ok(Math.abs(s.value - ref[i].value) < 1e-9); });
  assert.equal(idwColourFields({ mode: "linear", lo: 1, hi: 5 }).colourStyle.stretch, "linear");
  assert.equal(idwColourFields({ mode: "equalise", lo: 1, hi: 5 }).colourStyle.stretch, "equalise");
});

test("idwColourFields: no range, no fields", () => {
  assert.deepEqual(idwColourFields({ mode: "p2-98", lo: null, hi: null }), {});
  assert.deepEqual(idwColourFields({ mode: "p2-98", lo: 3, hi: 3 }), {});
  assert.deepEqual(idwColourFields(undefined), {});
});

const grid = { nx: 2, ny: 2, values: "", dx: 100, dy: 100 };
test("rasterLegendGroups: a new IDW raster has a ramp row", () => {
  const r = { id: "a", name: "Blake IDW 100 m", grid, units: "mGal", stretch: { mode: "p2-98", lo: -62.59, hi: -35.98 }, ...idwColourFields({ mode: "p2-98", lo: -62.59, hi: -35.98 }) };
  const g = rasterLegendGroups([r]);
  assert.equal(g.length, 1);
  assert.ok(g[0].ramp, "a ramp");
  assert.match(g[0].label, /Blake IDW 100 m/);
});

test("rasterLegendGroups: an IDW raster saved without colour fields still gets its ramp (and equalized says so)", () => {
  const old = { id: "b", name: "old IDW", grid, stretch: { mode: "p2-98", lo: 10, hi: 20 } };
  const g = rasterLegendGroups([old]);
  assert.equal(g.length, 1);
  assert.ok(g[0].ramp);
  const eq = rasterLegendGroups([{ ...old, stretch: { mode: "equalise", lo: 10, hi: 20 } }]);
  assert.match(eq[0].label, /\(equalized\)/);
  // a raster restyled on its card (colourStyle) is read as it is, not from the old stretch
  assert.equal(rasterLegendGroups([{ ...old, colourStyle: { palette: "viridis", stretch: "linear" } }]).length, 0);
});

test("wiring: idwGridToRasterInput writes the colour fields", () => {
  const src = readFileSync(new URL("../src/lib/idw.js", import.meta.url), "utf8");
  assert.match(src, /\.\.\.\(hasRange \? idwColourFields\(st\) : \{\}\)/);
});

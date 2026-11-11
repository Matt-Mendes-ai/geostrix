// TASKS.csv #2477 — Atlas strip logs could carry lab assays only: no gamma log, no stratigraphic unit (the single strip log can). The
// strip-log builder takes custom-layer tracks, and the Atlas dialog offers two.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildStripLogSvgMarkup } from "../src/lib/striplogSvg.js";
import { CATEGORICAL_SAFE_COLORS } from "../src/lib/layers.js";

const collars = [{ hole_id: "A", x: 0, y: 0, z: 100, azimuth: 0, dip: 90, length: 30 }];
const strat = { id: "su", name: "Strat unit", rows: [{ hole_id: "A", from: 0, to: 10, value: "E1" }, { hole_id: "A", from: 10, to: 30, value: "E2" }, { hole_id: "B", from: 0, to: 5, value: "E3" }] };
const gamma = { id: "g", name: "Gamma: eU3O8", unit: "ppm", rows: [{ hole_id: "A", from: 0, to: 15, value: 20 }, { hole_id: "A", from: 15, to: 30, value: 300 }] };

test("a category as coloured blocks and a numeric log as bars, labelled with the layer's name and unit", () => {
  const out = buildStripLogSvgMarkup({ holeId: "A", collars, layers: {}, customTracks: [{ layer: strat, numeric: false }, { layer: gamma, numeric: true, max: 300 }] });
  assert.ok(out && out.svg);
  assert.match(out.svg, /Strat unit/);
  assert.match(out.svg, /Gamma: eU3O8 \(ppm\)/);
  assert.ok(out.svg.includes(CATEGORICAL_SAFE_COLORS[0]) && out.svg.includes(CATEGORICAL_SAFE_COLORS[1]), "E1 / E2 in the palette's colours");
  assert.equal(buildStripLogSvgMarkup({ holeId: "A", collars, layers: {} }), null, "no track at all: nothing, as before");
});

test("the Atlas dialog offers the custom tracks and passes them with the strip log", () => {
  const m = readFileSync(new URL("../src/components/GenerateAtlasModal.jsx", import.meta.url), "utf8");
  assert.match(m, /aria-label=\{tr\("Custom layer track \{n\}", \{ n: k \+ 1 \}\)\}/);
  assert.match(m, /return \{ assays, assaySymbols: syms, elementUnits, customTracks,/);
});

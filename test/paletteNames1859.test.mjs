// TASKS.csv #1859 — the raster card's Ramp select was 319 px wide in a 249 px card (the Maps sidebar scrolled sideways, 'Invert' out of
// sight): 'Resistivity / IP (low→high resistivity; not colorblind-safe)' had no ' — ' to cut at
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PALETTES, paletteShortName } from "../src/lib/layers.js";

test("every palette has a short name of a few words", () => {
  assert.equal(paletteShortName("resistivity"), "Resistivity / IP");
  assert.equal(paletteShortName("viridis"), "Viridis");
  for (const k of Object.keys(PALETTES)) assert.ok(paletteShortName(k).length <= 26, `${k}: ${paletteShortName(k)}`);
  assert.equal(paletteShortName("nope"), "nope");
});

test("the three palette selects use it; the raster card's select may shrink", () => {
  const rc = readFileSync(new URL("../src/components/RasterColourControls.jsx", import.meta.url), "utf8");
  assert.ok((rc.match(/style=\{\{ \.\.\.inputStyle, minWidth: 0 \}\}/g) || []).length >= 2); // the Ramp and the Stretch select (and one more)
  assert.match(rc, /style=\{\{ \.\.\.inputStyle, minWidth: 0 \}\} \/\* #1859/);
  assert.match(rc, /\{paletteShortName\(k\)\}/);
  assert.match(readFileSync(new URL("../src/components/NumericSymbologyEditor.jsx", import.meta.url), "utf8"), /\{paletteShortName\(k\)\}/);
  assert.match(readFileSync(new URL("../src/modules/GeophysicsModule.jsx", import.meta.url), "utf8"), /\{paletteShortName\(key\)\}/);
});

// TASKS.csv #2877 — the card's colour bar of an IDW raster saved before #2845 (no colourStops): from its stretch, as the legend does
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { idwColourFields } from "../src/lib/idwColour.js";
test("the stretch gives the bar's stops; the card falls back to it", () => {
  const f = idwColourFields({ mode: "p2-98", lo: 10, hi: 20 });
  assert.equal(f.colourStops[0].value, 10); assert.equal(f.colourStops.at(-1).value, 20);
  assert.deepEqual(idwColourFields({}).colourStops || [], []);
  assert.match(readFileSync(new URL("../src/components/RasterColourControls.jsx", import.meta.url), "utf8"), /r\.colourStops\?\.length \? r\.colourStops : idwColourFields\(r\.stretch\)\.colourStops \|\| \[\]/);
});

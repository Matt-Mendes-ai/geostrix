// TASKS.csv #1861 — Georeference was only on the Advanced ribbon, and the 'no readable georeferencing' refusal did not name it
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("Georeference is on the Simple ribbon, and both GeoTIFF refusals point to it", () => {
  const m = readFileSync(new URL("../src/modules/MapsModule.jsx", import.meta.url), "utf8");
  // #3907 (redesign P3): Maps' Basic tools list is five tools; Georeference is in All tools (the refusals still name it)
  assert.match(m, /<RibbonButton advanced icon=\{MapPinned\} label="Georeference"/);
  const r = readFileSync(new URL("../src/lib/raster.js", import.meta.url), "utf8");
  assert.equal((r.match(/or place it with Maps > Georeference\./g) || []).length, 2);
});

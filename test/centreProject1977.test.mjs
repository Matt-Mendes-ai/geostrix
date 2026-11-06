// TASKS.csv #1977 — Matt: "centre on project location" when fetching SRTM and imagery: a labelled button in the fetch pickers that
// brings back the project's area (fitted), the project pin shown there too
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const s = readFileSync(new URL("../src/components/BasemapView.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("the button: labelled, shown in a picker with a project area or wherever the project location is known", () => {
  assert.match(s, /const canRecenter = \(mode === "draw" && !!initialBboxLonLat\) \|\| \(Number\.isFinite\(lon\) && Number\.isFinite\(lat\)\);/);
  assert.match(s, /\{canRecenter && \(\n\s*<button onClick=\{recenter\} title=\{tr\("Centre on project location"\)\}[^\n]*<Crosshair size=\{14\} \/>\{tr\("Centre on project"\)\}<\/button>/);
});

test("it fits the project area in a picker and does not leave the Locate view zoomed far out", () => {
  assert.match(s, /if \(mode === "draw" && initialBboxLonLat\) \{ fitToBbox\(initialBboxLonLat\); return; \}/);
  assert.match(s, /const z = Math\.max\(zoom, 11\);/);
  assert.match(s, /const markerPx = center && Number\.isFinite\(lon\) && Number\.isFinite\(lat\)/); // the pin in every mode
  // the SRTM and the satellite pickers pass the project's area and centre
  for (const [f, seed] of [["../src/modules/GeophysicsModule.jsx", "srtm"], ["../src/modules/RasterModule.jsx", "sat"]]) {
    const m = readFileSync(new URL(f, import.meta.url), "utf8");
    assert.match(m, new RegExp(`lon=\\{${seed}SeedLonLat\\?\\.lon\\}`));
    assert.match(m, new RegExp(`initialBboxLonLat=\\{${seed}SeedBbox\\}`));
  }
});

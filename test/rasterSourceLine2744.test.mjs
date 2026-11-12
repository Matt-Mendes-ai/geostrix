// TASKS.csv #2744 (follow-up of #2648) — the raster pane's Source CRS line names a local grid's state: a tied grid brings the file in
// through its tie, an untied one takes its numbers as the grid's; it read 'The project CRS — not chosen yet' for both.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("the line is chosen by the project's state: a CRS, a tied grid, an untied grid, nothing yet", () => {
  const r = readFileSync(new URL("../src/modules/RasterModule.jsx", import.meta.url), "utf8");
  const i = r.indexOf("const rasterSourceDefault = project?.crsSet !== false"), j = r.indexOf(': tr("The project CRS — not chosen yet");', i);
  assert.ok(i > 0 && j > i);
  const block = r.slice(i, j);
  assert.match(block, /tr\("From the file's own tag, else the project CRS \(\{crs\}\)"/);
  assert.match(block, /: rasterTie \? tr\("From the file's own tag, brought into the local grid through its tie to \{crs\}", \{ crs: crsName\(rasterTie\.epsg\) \?/);
  assert.match(block, /: project\?\.localGrid \? tr\("The local grid's own numbers \(a file's CRS tag is not used until the grid is tied to a CRS\)"\)/);
  assert.match(r, /const rasterTie = tieOf\(project\);/);
  for (const lang of ["es", "pt", "fr", "ar"]) {
    const d = JSON.parse(readFileSync(new URL(`../src/locales/${lang}.json`, import.meta.url), "utf8"));
    assert.ok(d["From the file's own tag, brought into the local grid through its tie to {crs}"] && d["The local grid's own numbers (a file's CRS tag is not used until the grid is tied to a CRS)"], lang);
  }
});

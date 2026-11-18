// TASKS.csv #3891 — 'Rasters & terrain' first in the 3D View's sidebar (above Geometry), moved out of ViewerModule.jsx into
// viewer/RastersTerrainSection.jsx. The order is the order of the JSX (nothing is saved, so nothing to migrate).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("#3891 the section is rendered before Geometry, once, and Geometry takes the 16 px when it is not first", () => {
  const v = read("../src/modules/ViewerModule.jsx");
  const sec = v.indexOf("<RastersTerrainSection "), geo = v.indexOf('{tr("Geometry")}</div>');
  assert.ok(sec > 0 && geo > sec, "Rasters & terrain before Geometry");
  assert.equal(v.split("<RastersTerrainSection ").length, 2, "rendered once");
  assert.ok(geo - sec < 400, "right above it (after a tool pane's end line)");
  assert.match(v, /<div className="ge-section-label" style=\{rasters\.length \|\| terrain \? \{ marginTop: 16 \} : null\}>\{tr\("Geometry"\)\}<\/div>/);
  assert.doesNotMatch(v, /tr\("Rasters & terrain"\)/, "the block is no longer in ViewerModule");
  assert.match(v, /import RastersTerrainSection from "\.\/viewer\/RastersTerrainSection\.jsx";/);
});

test("#3891 the section: shown only with a raster or a terrain, its heading first (no top margin), the terrain card, the rows and legends", () => {
  const s = read("../src/modules/viewer/RastersTerrainSection.jsx");
  assert.match(s, /if \(!\(rasters\.length > 0 \|\| terrain\)\) return null;/);
  assert.match(s, /<div className="ge-section-label">\{tr\("Rasters & terrain"\)\}<\/div>/);
  const at = (t) => s.indexOf(t);
  assert.ok(at('tr("Rasters & terrain")') < at("<TerrainCard ") && at("<TerrainCard ") < at("rasters.map(") && at("rasters.map(") < at("<RasterLegend "));
  assert.match(s, /const RasterLegend = lazyPart\(\(\) => import\("\.\.\/\.\.\/components\/RasterLegend\.jsx"\)\);/, "the legend stays out of startup");
  assert.match(s, /tr\("Managed under Maps: colours, drape and elevation\."\)/);
});

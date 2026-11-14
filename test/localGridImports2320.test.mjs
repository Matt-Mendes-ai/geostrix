// TASKS.csv #2320 (split from #2288) — on a tied local-grid project, map layers, outcrop structures and surface samples that carry a CRS come
// into the grid through the tie; with no tie their numbers are kept (never the placeholder CRS)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildLayer } from "../src/lib/mapLayerBuild.js";
import { tieFromOrigin, localToWorld } from "../src/lib/localGridTie.js";

const tie = tieFromOrigin({ lx: 32000, ly: 808000, wx: 412000, wy: 6612000, rotationDeg: 12, scale: 1, epsg: 28351 });

test("a map layer in the tie's CRS lands on the local grid, and its note says so", () => {
  const w = localToWorld(tie, 32300, 808200);
  const L = buildLayer({ epsg: 28351, geomType: "point", features: [{ parts: [[[w.x, w.y]]], attributes: {} }] }, { sourceName: "pins", projectEpsg: null, tie });
  const [x, y] = L.features[0].parts[0][0];
  assert.ok(Math.abs(x - 32300) < 0.02 && Math.abs(y - 808200) < 0.02, `${x} ${y}`); // rounded to the centimetre at import
  assert.match(L.crsNote, /brought into the local grid through its tie to EPSG:28351 \(from EPSG:28351\)/);
  // no tie: as before
  assert.doesNotMatch(buildLayer({ epsg: 28351, geomType: "point", features: [{ parts: [[[w.x, w.y]]], attributes: {} }] }, { sourceName: "pins", projectEpsg: null }).crsNote, /local grid/);
});

test("the map-layer importers, the outcrop structures and the surface samples pass the tie", () => {
  const sm = readFileSync(new URL("../src/components/SurfaceMappingPanel.jsx", import.meta.url), "utf8");
  assert.match(sm, /tie: tieOf\(project\) \/\* #2320 \*\//);
  assert.match(sm, /const t = fileToLocal\(gridTie, r\.x, r\.y, src\);/);
  assert.match(sm, /r\.dipDir = bearingToLocal\(gridTie, r\.dipDir\)/);
  assert.match(sm, /\} else if \(project\?\.crsSet === false && project\?\.localGrid\) \{/); // no tie: kept
  assert.match(readFileSync(new URL("../src/modules/viewer/importPipelineImpl.js", import.meta.url), "utf8"), /tie: tieOf\(live\.project\) \/\* #2320 \*\//);
  const g = readFileSync(new URL("../src/modules/GeochemModule.jsx", import.meta.url), "utf8");
  assert.match(g, /const doReproject = !localNoTie && fromEpsg && toEpsg && fromEpsg !== toEpsg;/);
  assert.match(g, /const p = gridTie \? fileToLocal\(gridTie, x, y, fromEpsg\) : reprojectXY\(x, y, fromEpsg, toEpsg\);/);
});

test("the import review measures a table's distance from the project through the tie (found live: 808 km off)", () => {
  const sm = readFileSync(new URL("../src/components/SurfaceMappingPanel.jsx", import.meta.url), "utf8");
  assert.match(sm, /const reviewTie = tieOf\(project\);[\s\S]{0,300}fileToLocal\(reviewTie, x, y, epsg\)/);
});

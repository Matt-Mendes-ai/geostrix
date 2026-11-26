// TASKS.csv #4096 — a collar file with two codes in its epsg column, imported into a project whose CRS is not set, was reprojected INTO the
// placeholder EPSG:3156 (BC UTM 9N): Queensland collars at x = -10,297,992 (found live, #4056). Made-up coordinates near the live case.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { declaredCollarEpsg } from "../src/lib/declaredCollarCrs.js";
import { reprojectXY } from "../src/lib/reproject.js";
import { projectTargetEpsg } from "../src/lib/projectTarget.js";
import { metricCrsForExtent } from "../src/lib/adoptCrs.js";

test("the bug: AGD66 collars converted into the placeholder land 10,000 km off; into the declared CRS they stay put", () => {
  const p = reprojectXY(490000, 7804500, 20255, 3156);
  assert.ok(p.x < -1e7 && p.y < -8e6, JSON.stringify(p)); // the live numbers: -10,297,992 / -8,261,392
  const q = reprojectXY(490000, 7804500, 20355, 20255); // AGD84 to AGD66: a metre or two
  assert.ok(Math.hypot(q.x - 490000, q.y - 7804500) < 3, JSON.stringify(q));
  assert.equal(projectTargetEpsg({ epsg: 3156, crsSet: false }), null); // the placeholder is never a target
});

test("declaredCollarEpsg: the code most rows use, or the Source CRS when the rows use it", () => {
  const rows = [...Array(10).fill("20255"), ...Array(14).fill("20355")];
  assert.equal(declaredCollarEpsg(rows), "20355");
  assert.equal(declaredCollarEpsg(["28355", "28355", ""]), "28355"); // one code: as before (#607)
  assert.equal(declaredCollarEpsg(["28354", "28355"]), "28354"); // a tie: the first met
  assert.equal(declaredCollarEpsg([], "28355"), "28355"); // no column: the Source CRS
  assert.equal(declaredCollarEpsg(["", ""]), null);
  assert.equal(declaredCollarEpsg(rows, "20255"), "20255"); // the dialog's Source CRS, one the rows use
  assert.equal(declaredCollarEpsg(["28355"], "28354"), null); // contradicted: nothing adopted (#607)
});

test("a layer in degrees gives an unset project the metric CRS of its place, only when one zone holds it", () => {
  assert.deepEqual(metricCrsForExtent(7844, [146.85, -19.9, 146.95, -19.8]), { code: 7855, name: "GDA2020 / MGA zone 55" }); // a report area, GDA2020 lon / lat
  assert.equal(metricCrsForExtent(4326, [-130.2, 56.5, -130.0, 56.7])?.code, 3156); // northern BC: UTM 9N
  assert.equal(metricCrsForExtent(7844, [140, -25, 147, -19]), null); // over 6 degrees wide
  assert.equal(metricCrsForExtent(7844, [149.5, -20, 150.5, -19]), null); // across the zone 55 / 56 edge
  assert.equal(metricCrsForExtent(4326, [10, -1, 11, 1]), null); // across the equator
  assert.equal(metricCrsForExtent(28355, [146.85, -19.9, 146.95, -19.8]), null); // not geographic: adopted as declared
  assert.equal(metricCrsForExtent(7844, [489000, 7804000, 491000, 7806000]), null); // tagged lon / lat, numbers in metres (#2678)
  assert.equal(metricCrsForExtent(7844, null), null);
  const src = readFileSync(new URL("../src/modules/viewer/importPipelineImpl.js", import.meta.url), "utf8");
  // only a project whose CRS was never set; a project the user set to a geographic CRS keeps it
  assert.match(src, /const metric = live\.project\?\.crsSet === false && live\.setEpsg \? metricCrsForExtent\(declared, box\) : null;/);
  assert.match(src, /await adoptCrsIfEmpty\(guessEpsgFromPrjWkt\(parsed\.prjWkt\), file\.name, partsBox\(/); // the map layer passes its extent
});

test("the collar import adopts the declared code and reprojects only into a chosen CRS", () => {
  const src = readFileSync(new URL("../src/modules/viewer/importPipelineImpl.js", import.meta.url), "utf8");
  assert.match(src, /const declaredEpsg = declaredCollarEpsg\(rows\.map\(\(r\) => r\._rowEpsg\), srcEpsg\);/);
  assert.match(src, /const toEpsg = projectTargetEpsg\(liveProject\);/);
  assert.doesNotMatch(src, /const toEpsg = liveProject\.epsg;/);
});

// TASKS.csv #2287 — while the project CRS is not set, imported files are not reprojected INTO the placeholder (EPSG:3156)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { projectTargetEpsg } from "../src/lib/projectTarget.js";
import { vectorToBoundaryPolylines } from "../src/lib/boundaryImport.js";

const line = { geomType: "polyline", epsg: 26910, features: [{ geometry: [[613450, 5784400, 0], [613450, 5781400, 0]], parts: [[[613450, 5784400, 0], [613450, 5781400, 0]]], attributes: {} }] };
const first = (r) => { const q = r.polylines[0][0]; return [Math.round(q.x ?? q[0]), Math.round(q.y ?? q[1])]; };

test("the target CRS is the project's only once it is chosen", () => {
  assert.equal(projectTargetEpsg({ epsg: 3156, crsSet: false }), null);
  assert.equal(projectTargetEpsg({ epsg: 26910, crsSet: true }), 26910);
  assert.equal(projectTargetEpsg({ epsg: 26910 }), 26910, "older projects without the flag keep their CRS");
  assert.equal(projectTargetEpsg(null), null);
});

test("a zone 10N line on a project with no CRS keeps its coordinates and says so (it was moved about 410 km into zone 9N)", async () => {
  const old = await vectorToBoundaryPolylines(line, 3156);
  assert.ok(first(old)[0] > 1_000_000, "the old path moved it");
  const r = await vectorToBoundaryPolylines(line, projectTargetEpsg({ epsg: 3156, crsSet: false }));
  assert.deepEqual(first(r), [613450, 5784400]);
  assert.match(r.note, /the project has no coordinate system yet: its EPSG:26910 coordinates were kept as they are/);
  const none = await vectorToBoundaryPolylines({ ...line, epsg: undefined }, null);
  assert.match(none.note, /neither the file nor the project states a coordinate system/);
});

test("every Maps / Geophysics / drop importer uses the target, not project.epsg", () => {
  const rd = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
  assert.ok(rd("../src/modules/RasterModule.jsx").includes("buildRasterImport(file, { epsg: projectTargetEpsg(project),"));
  const g = rd("../src/modules/GeophysicsModule.jsx");
  assert.ok(g.includes("buildRasterImport(file, { epsg: projectTargetEpsg(project),") && (g.match(/vectorToBoundaryPolylines\([a-z]+, projectTargetEpsg\(project\)(, \{[^}]*\})?\)/g) || []).length === 2);
  assert.ok(rd("../src/modules/MapsModule.jsx").includes("projectEpsg: projectTargetEpsg(project), qml: null"));
  const p = rd("../src/modules/viewer/importPipelineImpl.js");
  assert.ok(p.includes("projectEpsg: projectTargetEpsg(live.project)") && p.includes("epsg: projectTargetEpsg(live.project || project)"));
  assert.ok(rd("../src/components/SurfaceMappingPanel.jsx").includes("let projectEpsg = projectTargetEpsg(project), empty = projectIsEmpty;"));
});

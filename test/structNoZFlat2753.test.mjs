// TASKS.csv #2753 step (2) (side 6 drew them in e3aa5f76) — the Surface Geology import notice for outcrops with no elevation that lie off the
// terrain or over its gaps now says where they are drawn: flat at the samples' plan elevation (surfaceFlatElevation, the 3D View's flatZ),
// not 'at its edge or filled level'.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { surfaceFlatElevation } from "../src/lib/viewer/surfacePlacement.js";

test("the notice names the flat elevation the 3D View uses", () => {
  const s = readFileSync(new URL("../src/components/SurfaceMappingPanel.jsx", import.meta.url), "utf8");
  assert.match(s, /tr\(" \{noZ\} had no elevation: \{ground\} sit on the terrain; \{off\} lie outside it or over its gaps and are drawn flat at \{z\} m, the samples' plan elevation\.", \{ noZ, ground: g\.ground, off: g\.off, z: Math\.round\(surfaceFlatElevation\(collars, surfaceSamples, collars\.length > 1 && collarsLookUnderground\(collars, survey\)\.underground\)\)\.toLocaleString\(\) \}\)/);
  assert.doesNotMatch(s, /drawn at its edge or filled level/);
  assert.match(s, /import \{ structureGroundCounts, surfaceFlatElevation, noTerrainGround \} from "\.\.\/lib\/viewer\/surfacePlacement\.js"; import \{ terrainGroundAt \} from "\.\.\/lib\/viewer\/geomath\.js"; import \{ mapLayerOnCollars \} from "\.\.\/lib\/viewer\/sceneBuilders\.js";/); // one line; noTerrainGround, mapLayerOnCollars: #3368
  assert.equal(surfaceFlatElevation([{ z: 300 }, { z: 320 }, { z: 310 }], [], false), 310); // the collars' median, as the 3D View
});

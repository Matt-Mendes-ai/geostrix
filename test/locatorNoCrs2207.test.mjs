// TASKS.csv #2207 — no real-world location (and no map tiles) from the placeholder CRS
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const vm = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const lm = readFileSync(new URL("../src/components/LocatorMap.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("the locator's lon / lat is not derived while the project CRS is not set", () => {
  assert.ok(vm.includes("if (project?.crsSet === false) { setProjectLonLat(null); return undefined; }"));
  assert.ok(vm.includes("}, [collars, terrain, project?.epsg, project?.crsSet, rebuildSeq, deferRound]);"));
  assert.ok(vm.includes("crsUnset={project?.crsSet === false}"));
});

test("the locator says why there is no map, and requests no tile (no layout without lon / lat)", () => {
  assert.ok(lm.includes('crsUnset ? tr("The project\'s coordinate system isn\'t set, so it has no real-world location yet.'));
  assert.ok(lm.includes("if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;"));
});

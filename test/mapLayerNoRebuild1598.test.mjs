// TASKS.csv #1598 / #1530 (review #1497, Lawyers) — with drillholes, extents of other data are not rebuild dependencies
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n"); // a CRLF checkout (CI) reads the same
const deps = src.match(/\}, \[collars, survey, desurveyBites \? desurveyMethod[^\n]*\]\);/)[0]; // #2371: desurveyBites

test("map layers, other anchors, surface samples and block models count only without holes", () => {
  assert.ok(src.includes("  const noHoles = !collars.length;\n"));
  for (const k of ["anchorSourcesKey", "mapAnchorKey", "placedSurfaceSamples", "voxelGeomSignature"]) {
    assert.ok(deps.includes(`noHoles && ${k}`), k);
    assert.ok(!new RegExp(`, ${k}[ ,]`).test(deps), `${k} ungated`);
  }
});

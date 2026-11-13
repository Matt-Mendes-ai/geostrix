// TASKS.csv #3234 — Select by location by one named part of a boundary; the parts' labels on the Maps plan
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { partChoices, boundaryPart } from "../src/lib/boundaryParts.js";
import { pointInBoundary } from "../src/lib/pointInPolygon.js";

const sq = (x0, y0, s) => [{ x: x0, y: y0 }, { x: x0 + s, y: y0 }, { x: x0 + s, y: y0 + s }, { x: x0, y: y0 + s }];
const b = { id: "b", name: "claims", polylines: [sq(0, 0, 100), sq(200, 0, 100), sq(20, 20, 10)], partNames: ["North", "South", "North"] };

test("#3234 the parts offered, and one part's rings (a block keeps its hole)", () => {
  assert.deepEqual(partChoices(b), ["North", "South"]);
  assert.deepEqual(partChoices({ partNames: ["Only", "Only"] }), []); // one name: nothing to choose
  assert.deepEqual(partChoices({}), []);
  const north = boundaryPart(b, "North");
  assert.equal(north.name, "claims: North");
  assert.equal(north.polylines.length, 2);
  assert.equal(boundaryPart(b, ""), b);
  assert.equal(boundaryPart(b, "Nowhere"), b);
  assert.equal(pointInBoundary(50, 50, north.polylines), true);
  assert.equal(pointInBoundary(250, 50, north.polylines), false); // in South only
  assert.equal(pointInBoundary(25, 25, north.polylines), false); // in North's hole
});

test("#3234 wiring: the part select, the selection through it, the Maps plan labels", () => {
  const v = fs.readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.match(v, /const boundary = boundaryPart\(boundaries\.find\(\(b\) => b\.id === selectByLocationBoundaryId\), selectByLocationPart\);/);
  assert.match(v, /aria-label=\{tr\("Part of the boundary"\)\}/);
  assert.match(v, /setSelectByLocationBoundaryId\(e\.target\.value\); setSelectByLocationPart\(""\);/);
  const m = fs.readFileSync(new URL("../src/components/MapsPlanView.jsx", import.meta.url), "utf8");
  assert.match(m, /if \(b\.partLabels && b\.partNames\?\.some\(Boolean\)\)/);
});

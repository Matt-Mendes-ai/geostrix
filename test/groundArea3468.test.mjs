// TASKS.csv #2997 / #3468 (WA iron review) — a 12 x 10 km tenement at a zone edge read 'Area 12,000 ha'; on the ground it is 11,982 ha
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pointScaleFactor, groundArea } from "../src/lib/groundArea.js";

test("the point scale factor is 0.9996 on the central meridian and 1.0007 at 300 km east of it (MGA zone 50)", () => {
  assert.ok(Math.abs(pointScaleFactor(500000, 7500000, 28350) - 0.9996) < 2e-6);
  const k = pointScaleFactor(800000, 7500000, 28350), hand = 0.9996 * (1 + (300000 / 6371000) ** 2 / 2); // the textbook k0 (1 + x^2 / 2R^2)
  assert.ok(Math.abs(k - hand) < 2e-5, `${k} vs ${hand}`);
});

test("the review's tenement: 12,000 ha on the grid is about 11,982 ha on the ground; a place on k = 1 and a local grid get no second figure", () => {
  const sq = (x, y, w, h) => [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }, { x, y }];
  const a = groundArea(12000, [sq(800000, 7502000, 12000, 10000)], 28350);
  assert.ok(Math.abs(a.groundHa - 11982) < 4, `${a.groundHa}`);
  assert.equal(groundArea(100, [sq(679000, 7500000, 1000, 1000)], 28350).groundHa, null); // k within 0.0001 of 1 (680 km east of nothing: 180 km off the central meridian)
  assert.equal(groundArea(100, [sq(1000, 1000, 1000, 1000)], null).groundHa, null); // no CRS: nothing to correct
  assert.equal(groundArea(100, [], 28350).groundHa, null);
});

test("the Claims card says both areas when they differ", () => {
  const g = readFileSync(new URL("../src/modules/GeophysicsModule.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(g, /tr\("\{v\} ha on the ground \(\{g\} ha on the map grid\)"/);
});

test("a closed boundary shows its area too (#3469)", () => {
  const g = readFileSync(new URL("../src/modules/GeophysicsModule.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(g, /\{isAreaBoundary\(b\) && \(\(\) => \{ \/\/ TASKS\.csv #3469/);
  assert.match(g, /tr\("Area \{v\} ha", \{ v: f\(ga\.gridHa\) \}\)/);
});

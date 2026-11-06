// TASKS.csv #1474 — NAIP (contiguous USA only) was offered for Silvertip at 59.9°N 130.3°W and failed only after the network search
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { naipCoverage } from "../src/lib/imageryLevels.js";

test("a coarse box around the contiguous USA, no network", () => {
  assert.equal(naipCoverage([-130.4, 59.8, -130.2, 60.0]), "outside"); // Silvertip, northern BC
  assert.equal(naipCoverage([-118.6, 37.3, -118.4, 37.5]), "inside"); // eastern California
  assert.equal(naipCoverage([-123.2, 48.9, -122.9, 49.6]), "partial"); // across the 49th parallel
  assert.equal(naipCoverage([-60, -10, -59, -9]), "outside"); // Brazil
});

test("the picker says so and the fetch refuses before searching", () => {
  const s = readFileSync(new URL("../src/modules/RasterModule.jsx", import.meta.url), "utf8");
  assert.match(s, /if \(satSource === "naip" && naipCoverage\(bboxLonLat\) === "outside"\) \{ setError\(/);
  assert.match(s, /\{naip && bbox && naipCoverage\(bbox\) !== "inside" && <span/);
});

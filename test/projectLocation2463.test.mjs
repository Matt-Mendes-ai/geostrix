// TASKS.csv #2463 — 'Project location' and its grid convergence were the FIRST collar's (an outlier 8 km from the drilling), while the same
// pane's landing note used the collars' median
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { medianPoint, collarCentreLonLat } from "../src/lib/projectCrs.js";
import { pointTransform } from "../src/lib/reproject.js";

test("the median point, the one the landing note converts", () => {
  const collars = [{ x: 380000, y: 6690000 }, ...Array.from({ length: 9 }, (_, i) => ({ x: 385000 + i * 100, y: 6684000 + i * 50 }))]; // an outlier first
  const m = medianPoint(collars);
  assert.deepEqual(m, { x: 385400, y: 6684250 }); // the 6th of 10 sorted values, as collarCentreLonLat takes
  const [lon, lat] = pointTransform(28351, 4326)(m.x, m.y);
  const c = collarCentreLonLat(collars, 28351);
  assert.ok(Math.abs(lon - c.lon) < 1e-9 && Math.abs(lat - c.lat) < 1e-9);
  assert.equal(medianPoint([]), null);
});

test("the Project CRS page uses it", () => {
  assert.match(readFileSync(new URL("../src/modules/CartographyModule.jsx", import.meta.url), "utf8"), /const anchor = useMemo\(\(\) => medianPoint\(collars\.length \? collars : layers\.geophys_pts \|\| \[\]\)/);
});

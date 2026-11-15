// TASKS.csv #3349 (Galore Creek review) — a road in a KML / GeoJSON became a claim with an area (its closing triangle, 'Area 450 ha') beside the real claim
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { closedFeaturesOnly, claimsFromVector } from "../src/lib/boundaryImport.js";

const poly = [{ x: 0, y: 0 }, { x: 3000, y: 0 }, { x: 3000, y: 2000 }, { x: 0, y: 2000 }, { x: 0, y: 0 }];
const road = [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 900 }];
const result = { polylines: [poly, road], closedFlags: [true, false], featureOf: [0, 1], attributes: [{ TENURE_NUM: "SYN-0001" }, { name: "SYNTHETIC ROAD" }] };

test("a feature with no closed ring is left out and counted; the claim keeps its tenure", () => {
  const { result: r, lines } = closedFeaturesOnly(result);
  assert.equal(lines, 1);
  assert.deepEqual(r.polylines, [poly]);
  const claims = claimsFromVector(r, "SYNTH_claim");
  assert.equal(claims.length, 1);
  assert.equal(claims[0].tenureNumber, "SYN-0001");
});

test("nothing to leave out, all lines, or no flags: the result is unchanged", () => {
  assert.equal(closedFeaturesOnly({ ...result, polylines: [poly], closedFlags: [true], featureOf: [0] }).lines, 0);
  assert.equal(closedFeaturesOnly({ ...result, closedFlags: [false, false] }).lines, 0); // the open-lines refusal handles it
  assert.equal(closedFeaturesOnly({ polylines: [poly] }).lines, 0);
});

test("the Claims route uses it and says what it left out", () => {
  const g = readFileSync(new URL("../src/modules/GeophysicsModule.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(g, /const \{ result: p, lines \} = closedFeaturesOnly\(p0\);/);
  assert.match(g, /tr\("\{name\}: \{n\} line feature\(s\) were not claims \(a claim is an area\): import them under Boundaries"/);
});

// TASKS.csv #2465 — British Columbia advice on a Western Australian project: the geographic-CRS refusal named BC CRSs, the NRCan terrain
// sources were offered anywhere, and the claim number asked for 'e.g. 1234567'
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { crsCandidatesAt } from "../src/lib/projectCrs.js";

test("the CRSs suggested where the collars are", () => {
  const wa = crsCandidatesAt(121.8, -29.97).map((c) => c.name);
  assert.ok(wa.some((n) => /MGA zone 51/.test(n)), wa.join(" | "));
  assert.ok(!wa.some((n) => /BC Albers/.test(n)));
  const bc = crsCandidatesAt(-122.3, 52.1).map((c) => c.name);
  assert.ok(bc.some((n) => /UTM zone 10N/.test(n)), bc.join(" | "));
});

test("the refusal, the terrain sources and the claim placeholder follow the place", () => {
  const c = readFileSync(new URL("../src/modules/CartographyModule.jsx", import.meta.url), "utf8");
  assert.match(c, /so the project needs a projected CRS: \{suggest\}\./);
  assert.match(c, /crsCandidatesAt\(at\.lon, at\.lat\)\.slice\(0, 2\)/);
  const g = readFileSync(new URL("../src/modules/GeophysicsModule.jsx", import.meta.url), "utf8");
  assert.match(g, /<option value="mrdem" disabled=\{outsideCanada && terrainSource !== "mrdem"\}>/);
  assert.match(g, /<option value="hrdem" disabled=\{outsideCanada && terrainSource !== "hrdem"\}>/);
  assert.match(g, /placeholder=\{tr\("e\.g\. the tenure or tenement number"\)\}/);
});

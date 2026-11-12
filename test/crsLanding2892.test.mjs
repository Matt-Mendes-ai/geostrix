// TASKS.csv #2892 (review #2876, WA bedded iron) — a point typed just east of 120° E (zone 51) offered only zone-51 CRSs 'most used here',
// though the 6,292 collars' eastings (795,000-817,000) are zone-50 values: picking one put them 607 km away. With collars, the question
// lists the typed point's zone and both neighbours, each with where the collars land, nearest first.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { crsCandidatesAt, crsCandidatesByLanding } from "../src/lib/projectCrs.js";

const collars = [{ x: 806075.789, y: 7507073.787 }, { x: 795871.826, y: 7514614.838 }, { x: 816900, y: 7500100 }]; // WA iron, MGA zone 50

test("typed across the zone edge: zone 50 first, with where the collars land", () => {
  assert.ok(crsCandidatesAt(120.05, -22.48).every((c) => /zone 51/.test(c.name)), "the point alone: zone 51 only, as before");
  const r = crsCandidatesByLanding(120.05, -22.48, collars);
  assert.deepEqual(r.slice(0, 3).map((c) => c.code), [7850, 28350, 32750]); // GDA2020, GDA94, WGS 84: the regional order kept
  assert.ok(r[0].km < 15, `zone 50 lands ${r[0].km} km from the point`);
  const z51 = r.find((c) => c.code === 28351);
  assert.ok(z51 && z51.km > 500, "zone 51 is still listed, with its distance");
  assert.ok(r.some((c) => /zone 50/.test(c.name)) && r.some((c) => /zone 52/.test(c.name)), "both neighbours of zone 51");
  for (let i = 1; i < r.length; i++) if (r[i].km !== null && r[i - 1].km !== null) assert.ok(r[i].km >= r[i - 1].km, "nearest first");
});

test("typed inside the right zone: the same zone first", () => {
  const r = crsCandidatesByLanding(119.97, -22.48, collars);
  assert.equal(r[0].code, 7850); assert.ok(r[0].km <= 10, `${r[0].km} km`); // the median of three test collars
  assert.ok(r.some((c) => /zone 49/.test(c.name)) && r.some((c) => /zone 51/.test(c.name)), "both neighbours of zone 50");
});

test("the dialog ranks by landing only with collars, and says the distance", () => {
  const m = readFileSync(new URL("../src/components/ProjectCrsModal.jsx", import.meta.url), "utf8");
  assert.match(m, /hasCollars \? crsCandidatesByLanding\(at\.lon, at\.lat, collars\) : crsCandidatesAt\(at\.lon, at\.lat\)/);
  assert.match(m, /tr\("— your collars land \{km\} km from here", \{ km: c\.km\.toLocaleString\(\) \}\)/);
  for (const l of ["es", "pt", "fr", "ar"]) {
    const d = JSON.parse(readFileSync(new URL(`../src/locales/${l}.json`, import.meta.url), "utf8"));
    for (const k of ["— your collars land {km} km from here", "— the collars do not fit this CRS"]) assert.ok(d[k], `${l}: ${k}`);
  }
});

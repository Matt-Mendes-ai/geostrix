// TASKS.csv #2243 (review #2174, WA gold) — the CRS picker's empty list showed 60 Canadian / South American systems and nothing said it
// went on: the project's own zones come first, the count is said, and the MGA zones (GDA94, GDA2020) and WGS 84 UTM south are found.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { listSupportedCrs } from "../src/lib/reproject.js";
import { rankCrs } from "../src/lib/crsSearch.js";
import { crsCandidatesAt } from "../src/lib/projectCrs.js";

test("#2243 the Australian zones are in the list and found by a search", () => {
  const all = listSupportedCrs();
  for (const c of [28351, 7851, 32751, 4283, 7844, 20351]) assert.ok(all.some((x) => x.code === c), String(c));
  assert.equal(rankCrs(all, "mga 51")[0].code, 28351);
  assert.equal(rankCrs(all, "28351")[0].code, 28351);
});

test("#2243 an empty search puts the project location's zones first", () => {
  const near = crsCandidatesAt(122.3, -28.85).map((c) => c.code); // WA
  assert.ok(near.includes(28351) && near.includes(7851), JSON.stringify(near));
  const first = rankCrs(listSupportedCrs(), "", [28351, null, ...near]).slice(0, near.length + 1).map((c) => c.code);
  assert.ok(near.every((c) => first.includes(c)));
  const src = readFileSync(new URL("../src/components/CrsPicker.jsx", import.meta.url), "utf8");
  assert.match(src, /rankCrs\(all, q, \[projectEpsg, value, \.\.\.nearby\]\)/);
  assert.match(src, /of \{total\} shown: type a name, zone or EPSG code to find the others/);
});

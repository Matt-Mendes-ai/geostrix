// TASKS.csv #1469 — the CRS picker: the project's CRS first, and 'UTM zone 9N' ranks the 9N zones above 19N / 29N
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { rankCrs } from "../src/lib/crsSearch.js";
import { listSupportedCrs, loadEpsgRegistry } from "../src/lib/reproject.js";

const L = [
  { code: 3156, name: "NAD83(CSRS) / UTM zone 9N" }, { code: 2955, name: "NAD83(CSRS) / UTM zone 19N" },
  { code: 31979, name: "SIRGAS 2000 / UTM zone 19N" }, { code: 25829, name: "ETRS89 / UTM zone 29N" }, { code: 26909, name: "NAD83 / UTM zone 9N" },
];

test("no query: the pinned codes first, the rest in order", () => {
  assert.deepEqual(rankCrs(L, "", [26909, null]).map((c) => c.code), [26909, 3156, 2955, 31979, 25829]);
});

test("whole-word zone matches come before substring ones; the project CRS first among them", () => {
  assert.deepEqual(rankCrs(L, "UTM zone 9N", [26909]).map((c) => c.code), [26909, 3156, 2955, 31979, 25829]);
  assert.deepEqual(rankCrs(L, "nad83 / utm", []).slice(0, 2).map((c) => c.code), [3156, 2955]); // order kept when no word decides
  assert.deepEqual(rankCrs(L, "26909", []).map((c) => c.code), [26909]);
});

test("on the real list, 'UTM zone 9N' puts NAD83 / UTM zone 9N in the first two once it is pinned", async () => {
  await loadEpsgRegistry().catch(() => {});
  const r = rankCrs(listSupportedCrs(), "UTM zone 9N", [26909]).map((c) => c.code);
  assert.equal(r[0], 26909);
  assert.ok(r.slice(0, 6).every((c) => c !== 2955), JSON.stringify(r.slice(0, 6)));
});

test("CrsPicker uses it with the project CRS and the current value", () => {
  const s = readFileSync(new URL("../src/components/CrsPicker.jsx", import.meta.url), "utf8");
  assert.match(s, /rankCrs\(all, q, \[(crsSet \? projectEpsg : null[^\]]*|projectEpsg), value(, \.\.\.nearby)?\]\)/); // nearby: #2243; crsSet: #2289
});

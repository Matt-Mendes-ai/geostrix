// TASKS.csv #932 — public survey samples and the project's own are separate populations by default.
import test from "node:test";
import assert from "node:assert/strict";
import { groupOptions, groupKeyFn, defaultPopulations, hasMixedSources, populations } from "../src/lib/thresholds.js";
import { sampleValues } from "../src/lib/evidence.js";

const own = (v) => ({ medium: "stream sediment", x: 0, y: 0, values: { Cu: v } });
const rgs = (v) => ({ medium: "stream sediment", x: 0, y: 0, values: { Cu: v }, attrs: { source: "BC Regional Geochemical Survey (1976-2010)" } });

test("#932: medium x source only when sources are mixed, and it is then the default", () => {
  const ownOnly = [own(10), own(20)], mixed = [own(10), rgs(100)];
  assert.equal(hasMixedSources(ownOnly), false);
  assert.equal(defaultPopulations(ownOnly), "medium");
  assert.ok(!groupOptions(ownOnly).some((o) => o.value === "medium_source"));
  assert.equal(defaultPopulations(mixed), "medium_source");
  assert.ok(groupOptions(mixed).some((o) => o.value === "medium_source"));
  const keyOf = groupKeyFn("medium_source");
  assert.deepEqual(mixed.map(keyOf), ["stream sediment · project samples", "stream sediment · BC Regional Geochemical Survey (1976-2010)"]);
});

test("#932: the evidence z-scores judge each source within itself", () => {
  // own silts at 10-30 ppm, a regional survey at 100-300: pooled, every own sample reads low and every RGS one high
  const s = [own(10), own(20), own(30), rgs(100), rgs(200), rgs(300)];
  const z = sampleValues(s, { kind: "element", symbol: "Cu" }, { Cu: "ppm" }).map((r) => Math.round(r.value * 100) / 100);
  assert.deepEqual(z.slice(0, 3), z.slice(3)); // the same rank within each source -> the same z
  const pooled = populations(s, { valueOf: (x) => x.values.Cu, keyOf: groupKeyFn("medium") });
  assert.equal(pooled.length, 1);
});

// TASKS.csv #3692 (rehearsal round 3) — a survey in feet was imported as metres without a hint. The dialog says, above Units, when most holes' deepest depth is about 3.28 times the collar length (feet), or 0.305 (metres chosen
// as feet), and the after-import notice names feet. SYNTHETIC holes.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { depthUnitHint } from "../src/lib/depthUnitHint.js";
import { importCheckSummary } from "../src/lib/dataQC.js";

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const lens = new Map(["A", "B", "C", "D"].map((h, i) => [h, 100 + 50 * i]));
const rows = (k) => [...lens].flatMap(([h, L]) => [{ hole_id: h, depth: 0 }, { hole_id: h, depth: L * k }]);
test("depths 3.28 times the collar lengths read as feet; 0.305 as metres read as feet; plain depths say nothing", () => {
  const f = depthUnitHint(rows(3.28084), lens); assert.equal(f.kind, "feet"); assert.equal(f.holes, 4); assert.ok(Math.abs(f.ratio - 3.28) < 0.01);
  assert.equal(depthUnitHint(rows(0.3048), lens).kind, "metres");
  assert.equal(depthUnitHint(rows(1), lens), null); assert.equal(depthUnitHint(rows(1.1), lens), null);
  assert.equal(depthUnitHint(rows(3.28084), new Map([["A", 100]])), null, "one hole is not enough");
  const mixed = [...rows(3.28084).slice(0, 4), ...rows(1).slice(4)]; assert.equal(depthUnitHint(mixed, lens), null, "under 60 % of the holes: no hint");
});
test("the after-import notice names feet when the stations past the end are the feet pattern", () => {
  const collars = [...lens].map(([hole_id, length]) => ({ hole_id, length })), st = rows(3.28084).map((r) => ({ hole_id: r.hole_id, from: r.depth, to: r.depth }));
  const msg = importCheckSummary(st, collars, null, "survey stations");
  assert.match(msg, /past the end of their hole/); assert.match(msg, /these depths look like FEET/);
  assert.doesNotMatch(importCheckSummary(rows(1).map((r) => ({ hole_id: r.hole_id, from: r.depth, to: r.depth })), collars, null, "survey stations"), /FEET/);
});
test("wired: the dialog line above Units, the importer's hint, four languages", () => {
  assert.match(read("../src/components/ImportMappingModal.jsx"), /modal\.depthUnitHint && \(\(modal\.depthUnitHint\.kind === "feet"\) === \(\(modal\.units \|\| "m"\) === "m"\)\)/);
  assert.match(read("../src/modules/viewer/importPipelineImpl.js"), /depthUnitHint: h/);
  for (const l of ["es", "pt", "fr", "ar"]) { const d = JSON.parse(read(`../src/locales/${l}.json`)); assert.ok(d["the deepest depth of {n} of {total} holes is about {ratio} times their length: these depths look like FEET — undo (Ctrl+Z) and import again with Feet chosen"], l); }
});

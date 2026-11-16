// TASKS.csv #3686 (rehearsal round 3) — re-importing corrected assays changed the values and said nothing; shells, block models and tonnage tables made from the old values were not marked. Now: the import says what it
// replaced (intervals, values changed, holes), a shell or an estimate keeps the stamp of the assays it read, and a stamp that is not the assays' now shows 'assays changed' (row of a block model, Grade-tonnage, the
// Generated surfaces row). SYNTHETIC rows.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { assayStamp, assayChanges } from "../src/lib/assayStamp.js";
import { isStaleStamp } from "../src/lib/layerStamp.js";

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const rows = () => [{ hole_id: "H1", from: 0, to: 1, values: { Zn: 2, Pb: 0.1 } }, { hole_id: "H1", from: 1, to: 2, values: { Zn: 3 }, qualifiers: { Zn: "<" } }, { hole_id: "H2", from: 0, to: 1, values: { Zn: 4 } }];
test("the stamp changes when a value, a qualifier, an interval or a row changes, and not otherwise", () => {
  const a = rows(), s0 = assayStamp(a);
  assert.equal(assayStamp(rows()), s0, "the same content, another array");
  const b = rows(); b[0].values.Zn = 1; assert.notEqual(assayStamp(b), s0);
  const c = rows(); c[1].qualifiers = {}; assert.notEqual(assayStamp(c), s0);
  const d = rows(); d[2].to = 1.5; assert.notEqual(assayStamp(d), s0);
  assert.notEqual(assayStamp(rows().slice(0, 2)), s0);
  assert.equal(isStaleStamp(s0, assayStamp(b)), true); assert.equal(isStaleStamp(undefined, assayStamp(b)), false, "made before stamps: unknown, not stale");
});
test("what an import changed: intervals updated, values changed, the holes", () => {
  const before = rows(), after = [...before]; after[0] = { ...before[0], values: { Zn: 1, Pb: 0.1 } }; after[2] = { ...before[2], values: { Zn: 4 } }; // the merge keeps an untouched row's object; H2's row is rewritten with the same values
  const r = assayChanges(before, after);
  assert.deepEqual([r.updated, r.valuesChanged, r.holes], [2, 1, ["H1"]]);
  assert.deepEqual(assayChanges(before, before), { updated: 0, valuesChanged: 0, holes: [] });
});
test("wired: shells and estimates stamp the assays they read (not a log), the notice, the badges, four languages", () => {
  assert.match(read("../src/modules/viewer/modellingRuns.js"), /\.\.\.\(numSrc \? \{\} : \{ assayStamp: assayStamp\(assays\) \}\)/);
  assert.match(read("../src/components/GradeEstimationModal.jsx"), /\.\.\.\(sourceData \? \{\} : \{ assayStamp: assayStamp\(assaysProp\) \}\)/);
  assert.match(read("../src/modules/GeochemModule.jsx"), /const chg = assayChanges\(assays, mergeRes\.rows\);/); assert.match(read("../src/modules/GeochemModule.jsx"), /chg\.valuesChanged \? tr\(/);
  assert.match(read("../src/modules/viewer/ViewerParts.jsx"), /<AssayStaleBadge params=\{model\.params\} \/>/); assert.match(read("../src/components/GradeTonnageModal.jsx"), /<AssayStaleBadge params=\{model\.params\} text \/>/);
  for (const l of ["es", "pt", "fr", "ar"]) { const d = JSON.parse(read(`../src/locales/${l}.json`)); for (const k of ["assays changed", "Made from assays that have changed since (re-imported, corrected or edited): its values may differ from the assays now. Run it again to use the assays as they are."]) assert.ok(d[k], `${l}: ${k.slice(0, 30)}`); }
});

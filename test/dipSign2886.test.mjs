// TASKS.csv #2886 (review #2876, WA bedded iron) — bores.csv (98 bores, Dip = 90 on every row) came in with 'Negative = down' pre-selected
// and the 98 holes pointed up into the air without a word. The file's dips now pick the convention, the dialog says why, and the notice
// counts the holes left pointing up.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { guessDipConvention, dipConventionFields, upwardHoles } from "../src/lib/dipSign.js";

const rowsOf = (dips) => dips.map((d, i) => ({ Hole_ID: `B${i}`, Dip: d }));

test("every dip positive and steep: Positive = down, with the count", () => {
  const g = guessDipConvention(rowsOf(Array(98).fill("90")), "Dip");
  assert.equal(g.convention, "pos_down"); assert.equal(g.positive, 98); assert.equal(g.negative, 0);
  assert.deepEqual(dipConventionFields(rowsOf([60, 75, 90, "88,5"]), "Dip"), { dipConvention: "pos_down", dipGuess: { n: 4 } });
});

test("anything else keeps the industry standard", () => {
  assert.equal(guessDipConvention(rowsOf([-90, -60, -89.8]), "Dip").convention, "neg_down"); // the WA iron collars
  assert.equal(guessDipConvention(rowsOf([90, 80, -60]), "Dip").convention, "neg_down", "one negative dip: a mixed file, not decided here");
  assert.equal(guessDipConvention(rowsOf([20, 30, 15, 60]), "Dip").convention, "neg_down", "shallow positive dips: underground up-holes look like this");
  assert.equal(guessDipConvention(rowsOf(["", "x", 0]), "Dip").convention, "neg_down", "no usable dip");
  assert.deepEqual(dipConventionFields(rowsOf([90]), null), { dipConvention: "neg_down" }, "no dip column");
});

test("the holes left pointing up after the sign (stored dips are positive down)", () => {
  assert.deepEqual(upwardHoles([{ hole_id: "A", dip: -90 }, { hole_id: "B", dip: 60 }, { hole_id: "A", dip: -80 }, { hole_id: "C", dip: NaN }]), ["A"]);
});

test("the dialog and the import use it", () => {
  const u = readFileSync(new URL("../src/modules/viewer/useImportPipeline.js", import.meta.url), "utf8");
  assert.equal((u.match(/\.\.\.dipConventionFields\((data|rows), dipColOf\(target, mapping\)\) \/\* #2886 \*\//g) || []).length, 3, "the single drop, the database table and the queue");
  assert.ok(!/dipConvention: "neg_down"/.test(u));
  assert.match(u, /const up = upwardHoles\(rows\), list = up\.slice\(0, 5\)\.join\(", "\); if \(up\.length\) parts\.push\(up\.length > 5 \/\/ #2886/);
  assert.match(u, /re-import with the other dip sign convention\): \{list\} and \{more\} more", \{ n: up\.length, list, more: up\.length - 5 \}\)/);
  assert.match(u, /dipConvention === "pos_down" \/\/ #2886/);
  const m = readFileSync(new URL("../src/components/ImportMappingModal.jsx", import.meta.url), "utf8");
  assert.match(m, /\{modal\.dipGuess && modal\.dipConvention === "pos_down" && \(/);
  for (const l of ["es", "pt", "fr", "ar"]) {
    const d = JSON.parse(readFileSync(new URL(`../src/locales/${l}.json`, import.meta.url), "utf8"));
    assert.ok(d["Every dip in this file is positive, and steep ({n} row(s)): read as Positive = down, so the holes go into the ground. Choose Negative = down for underground up-holes."], l);
    assert.ok(d["{n} hole(s) point upward (a dip above horizontal: right for underground up-holes; for surface drilling, re-import with the other dip sign convention): {list}"], l);
  }
});

// TASKS.csv #2191 (review #2174, WA gold) — a byte-identical survey re-import was reported as replacing 216 holes and 'extending' 16; the
// one-column range 'Lithology2–Lithology2' was fixed by #2153 (one column named once)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { replaceRowsByHole, replaceNote } from "../src/lib/layers.js";

const sv = (h, d, az = 90, dip = 60) => ({ hole_id: h, depth: d, azimuth: az, dip, _src: "survey_1.csv" });

test("an identical re-import: identical, neither replaced nor extended; the rows are not doubled", () => {
  const prev = [sv("A", 0), sv("A", 50), sv("A", 100), sv("B", 0)]; // B: one station at 0 m (the review's 16 'extended' holes)
  const again = prev.map((r) => ({ ...r, _src: "survey_1 (2).csv" }));
  const res = replaceRowsByHole(prev, again);
  assert.deepEqual(res.replacedHoles, []); assert.deepEqual(res.appendedHoles, []);
  assert.deepEqual(res.identicalHoles.sort(), ["A", "B"]);
  assert.equal(res.rows.length, 4);
  assert.match(replaceNote(res, "survey"), /^ The survey of 2 hole\(s\) \(A, B\) was identical to the one already loaded: nothing changed there\.$/);
});

test("a changed hole is still replaced, an unchanged one identical", () => {
  const prev = [sv("A", 0), sv("A", 50), sv("C", 0), sv("C", 40)];
  const res = replaceRowsByHole(prev, [sv("A", 0), sv("A", 50, 95), sv("C", 0), sv("C", 40)]);
  assert.deepEqual(res.replacedHoles, ["A"]); assert.deepEqual(res.identicalHoles, ["C"]);
});

test("#2153's one-column range holds", () => {
  const u = readFileSync(new URL("../src/modules/viewer/importPipelineImpl.js", import.meta.url), "utf8");
  assert.match(u, /cols: sib\.codes\.length > 1 \? `\$\{sib\.codes\[0\]\}–\$\{sib\.codes\[sib\.codes\.length - 1\]\}` : sib\.codes\[0\]/);
});

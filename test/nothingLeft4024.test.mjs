// TASKS.csv #4024 — 'Nothing left to model' says which units were left out and why (columns, counts). Made-up data.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { invalidCounts, columnsText, nothingLeftText, reasonText } from "../src/lib/modellingNothingLeft.js";
import { checkStackInputs } from "../src/lib/gempyInputCheck.js";

const isFiniteNum = (v) => (typeof v === "number" ? Number.isFinite(v) : Number.isFinite(Number(v)) && String(v).trim() !== "");

test("invalid columns are counted per column, and two maps add up", () => {
  const pts = [{ x: 1, y: 2, z: "" }, { x: "a", y: 2, z: "n/a" }, { x: 1, y: 2, z: 3 }];
  assert.deepEqual(invalidCounts(pts, ["x", "y", "z"], isFiniteNum), { x: 1, z: 2 });
  assert.equal(columnsText({ x: 1, z: 2 }, { dip: 3, z: 1 }), "x (1), z (3), dip (3)");
  assert.equal(columnsText({}, null), "");
});

test("each reason names the unit and its numbers", () => {
  assert.match(reasonText({ kind: "invalid", label: "Top of A", n: 4, columns: "z (4)" }), /Top of A: all 4 point\(s\) have a missing or non-numeric value in z \(4\)/);
  assert.match(reasonText({ kind: "tooFew", label: "Top of CID", before: 1, after: 1 }), /Top of CID: it has 1 contact point\(s\); a surface needs at least 2/);
  assert.match(reasonText({ kind: "tooFew", label: "Top of B", before: 5, after: 1 }), /1 of its 5 contact point\(s\) were left after removing repeated points/);
  assert.match(reasonText({ kind: "suspect", label: "Top of C", n: 3, holes: 2 }), /its 3 contact\(s\) are on 2 hole\(s\) whose collar elevation/);
  assert.match(reasonText({ kind: "empty", label: "Top of D" }), /Top of D: it has no contact points/);
});

test("the message lists every unit that was left out; with none given it says nothing had contact points", () => {
  const m = nothingLeftText([{ kind: "tooFew", label: "Top of CID", before: 1, after: 1 }, { kind: "empty", label: "Top of NS" }]);
  assert.match(m, /^Nothing left to model: Top of CID: it has 1 contact point\(s\).*Top of NS: it has no contact points/);
  assert.equal(nothingLeftText([]), "Nothing left to model: no unit has contact points to use.");
  assert.doesNotMatch(m, /notices above/, "it no longer sends the reader elsewhere");
});

test("the input check's own drop (under two points) is what the message reports for a single contact", () => {
  const r = checkStackInputs([{ label: "Top of CID", points: [{ x: 1, y: 1, z: 1 }], orientations: [{ x: 1, y: 1, z: 1, dip: 0, azimuth: 0 }] }]);
  assert.equal(r.specs.length, 0);
  assert.deepEqual(r.fixes.dropped, [{ label: "Top of CID", n: 1 }]);
});

test("wiring: the run collects the reasons, says them, and estimates a dip instead of dropping a unit whose orientations were all invalid", () => {
  const src = readFileSync(new URL("../src/modules/viewer/modellingRuns.js", import.meta.url), "utf8");
  assert.match(src, /errorNotice\(nothingLeftText\(why\)\)/);
  assert.match(src, /why\.push\(\{ kind: "tooFew"/);
  assert.match(src, /so its dip was estimated from its contact points/);
  assert.doesNotMatch(src, /see notices above for which columns to check/);
  assert.doesNotMatch(src, /no usable orientations left after removing invalid ones — skipped/);
});

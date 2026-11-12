// TASKS.csv #2176 step 2 — the drillhole build keeps what a commit did not touch: each hole's desurvey (planHoles) and every
// layer group whose inputs are the same (planGroups)
import test from "node:test";
import assert from "node:assert/strict";
import { planHoles, planGroups, sameRefs, BUILT_ROW_KEYS } from "../src/modules/viewer/drillholeScene.js";
import { viewerSource } from "./helpers/viewerSource.mjs";

const collar = (id, x = 0) => ({ hole_id: id, x, y: 0, z: 100, azimuth: 0, dip: -90, depth: 50 });
const O = { ox: 1, oy: 2, oz: 3, rebuildSeq: 0 };
// the cache a build leaves: its entries, as buildDrillholeScene fills them
const cacheOf = (plan, sigs = new Map(), holeSets = new Map(), o = O) => {
  for (const e of plan.holeEntries.values()) if (!e.raw) { e.raw = [{ md: 0 }]; e.pts = [{}]; e.trace = {}; }
  return { ...o, holes: plan.holeEntries, sigs, holeSets };
};

test("first build is full; the same collars and survey rows are kept, with no hole desurveyed again", () => {
  const cs = [collar("A"), collar("B")], s1 = { hole_id: "B", depth: 10 };
  const sv = new Map([["B", [s1]]]);
  const p1 = planHoles(undefined, cs, sv, "mincurv", O);
  assert.equal(p1.full, true);
  assert.deepEqual([...p1.changedHoles], ["A", "B"]);
  const prev = cacheOf(p1);
  const p2 = planHoles(prev, cs, new Map([["B", [s1]]]), "mincurv", O); // a new grouping array, the same row objects
  assert.equal(p2.full, false);
  assert.equal(p2.changedHoles.size, 0);
  assert.equal(p2.holeEntries.get("A"), prev.holes.get("A"), "the entry itself, with its trace");
});

test("a new collar object, new survey rows or another method desurveys only that hole; a removed hole counts as changed", () => {
  const a = collar("A"), b = collar("B"), c = collar("C");
  const prev = cacheOf(planHoles(undefined, [a, b, c], new Map(), "mincurv", O));
  const p = planHoles(prev, [a, { ...b }, c], new Map([["C", [{ hole_id: "C", depth: 5 }]]]), "mincurv", O);
  assert.deepEqual([...p.changedHoles].sort(), ["B", "C"]);
  assert.equal(p.full, false);
  const q = planHoles(prev, [a, b], new Map(), "mincurv", O);
  assert.deepEqual([...q.changedHoles], ["C"]);
  const m = planHoles(prev, [a, b, c], new Map(), "tangent", O);
  assert.equal(m.changedHoles.size, 3);
});

test("a moved origin, the Refresh button or a repeated hole id makes a full build; a moved origin keeps the desurvey", () => {
  const a = collar("A"), b = collar("B");
  const prev = cacheOf(planHoles(undefined, [a, b], new Map(), "m", O));
  const moved = planHoles(prev, [a, b], new Map(), "m", { ...O, ox: 5 });
  assert.equal(moved.full, true);
  assert.equal(moved.changedHoles.size, 0, "nothing to desurvey again");
  assert.equal(moved.holeEntries.get("A").raw, prev.holes.get("A").raw);
  assert.equal(moved.holeEntries.get("A").pts, null, "the origin-relative points are made again");
  assert.equal(planHoles(prev, [a, b], new Map(), "m", { ...O, rebuildSeq: 1 }).full, true);
  const dup = planHoles(prev, [a, b, collar("A", 9)], new Map(), "m", O);
  assert.equal(dup.full, true);
  assert.equal(dup.holeEntries, null);
});

test("planGroups: only the group whose rows changed, or that has rows in a changed hole", () => {
  const litho = [{}], weath = [{}], label = () => "";
  const sigs = new Map([["litho", [litho, "null", label]], ["weath", [weath, "null", label]], ["c1", [{ id: "c1" }, null, "null"]]]);
  const holeSets = new Map([["litho", new Set(["A"])], ["weath", new Set(["B"])], ["c1", new Set(["A", "B"])]]);
  const prev = { sigs, holeSets };
  assert.deepEqual([...planGroups(undefined, sigs, new Set(), false)].sort(), ["c1", "litho", "weath"]);
  assert.equal(planGroups(prev, new Map(sigs), new Set(), false).size, 0, "nothing changed");
  const weath2 = new Map(sigs); weath2.set("weath", [[{}], "null", label]);
  assert.deepEqual([...planGroups(prev, weath2, new Set(), false)], ["weath"], "a weathering commit rebuilds weathering only");
  assert.deepEqual([...planGroups(prev, new Map(sigs), new Set(["A"]), false)].sort(), ["c1", "litho"], "hole A was desurveyed again");
  const relabel = new Map([...sigs].map(([k, s]) => [k, k === "c1" ? s : [s[0], s[1], () => "x"]]));
  assert.deepEqual([...planGroups(prev, relabel, new Set(), false)].sort(), ["litho", "weath"], "a label override: the built-in layers' tips");
  assert.equal(planGroups(prev, new Map(sigs), new Set(), true).size, 3, "full");
  assert.ok(sameRefs([1, "a"], [1, "a"]) && !sameRefs([1], [2]) && !sameRefs([1], [1, 2]));
});

test("the build: every drillhole layer is planned, a kept group is not cleared, and its followers run only when the holes changed", () => {
  const v = viewerSource();
  for (const k of BUILT_ROW_KEYS) assert.ok(v.includes(`byHoleIf("${k}", layers.${k})`), k);
  assert.ok(v.includes("if (full) clearGroups(Object.values(groups));"));
  assert.ok(v.includes("if (rebuildHoles) setTracesSeq((n) => n + 1);"));
  assert.ok(v.includes("syncHoleLabels(groups.hole_labels, labelAnchors, holeLabelModeRef.current, makeTextSprite);"));
  assert.match(v, /if \(rebuildHoles \|\| stale\[0\]\) buildAssaySpheresRef\.current\(\);/);
  assert.match(v, /pointBuildersStale: \(\) => \[!sameInputs\(assayBuiltRef\.current, assayInputs\), !sameInputs\(geophysBuiltRef\.current, geophysInputs\), !sameInputs\(surfaceBuiltRef\.current, surfaceInputs\)\]/);
});

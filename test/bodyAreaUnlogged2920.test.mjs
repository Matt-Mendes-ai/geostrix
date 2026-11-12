// TASKS.csv #2920 (WA iron review) — a closed body of a unit on a Model area counted every hole outside the area as unlogged drilling
// ('299,823 of 313,975 m ... in 6166 hole(s)'): the holes are now the Model area's, as #2535 restricts the rows.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { unloggedDrilling } from "../src/lib/unloggedGaps.js";

test("the area rule: with 'checked', a hole unticked in the Holes list is not one of the holes here", () => {
  const traces = [{ hole_id: "A" }, { hole_id: "B" }, { hole_id: "C" }];
  const visibleHoles = { C: false };
  const here = (modelArea) => new Set(traces.filter((t) => modelArea !== "checked" || visibleHoles?.[t.hole_id] !== false).map((t) => t.hole_id));
  assert.deepEqual([...here("checked")], ["A", "B"]);
  assert.deepEqual([...here("all")], ["A", "B", "C"]);
  // the unlogged count then covers the area's holes only
  const collars = [{ hole_id: "A", length: 10 }, { hole_id: "B", length: 10 }, { hole_id: "C", length: 300 }];
  const rows = [{ hole_id: "A", from: 0, to: 10, value: "X" }, { hole_id: "B", from: 0, to: 4, value: "X" }];
  const set = here("checked");
  const area = unloggedDrilling(collars.filter((c) => set.has(c.hole_id)), rows, () => true);
  const all = unloggedDrilling(collars, rows, () => true);
  assert.ok(area.metres < all.metres, `${area.metres} vs ${all.metres}`);
});

test("wiring: the closed body's holes follow the Model area", () => {
  const r = fs.readFileSync(new URL("../src/modules/viewer/modellingRuns.js", import.meta.url), "utf8");
  assert.match(r, /const holesHere = new Set\(\(tracesRef\.current \|\| \[\]\)\.filter\(\(t\) => modelArea !== "checked" \|\| visibleHoles\?\.\[t\.hole_id\] !== false\)\.map\(\(t\) => t\.hole_id\)\);/);
});

// TASKS.csv #1864 (review #1646, Kodiak) — a 3D capture on a Layout page says how many surface samples it could not hold (samples over a
// void of the terrain have no ground and are drawn nowhere): the count rides the capture result onto the viewport element
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

test("#1864 the capture result carries the unplaced count; both store branches keep it; the viewport panel says it", () => {
  const vm = read("../src/modules/ViewerModule.jsx");
  assert.ok(vm.includes("unplacedForCaptureRef.current = surfaceSamplesUnplaced"));
  assert.ok(vm.includes("samplesUnplaced: unplacedForCaptureRef.current,"));
  const st = read("../src/lib/store.jsx");
  assert.equal(st.split("samplesUnplaced: res.samplesUnplaced || 0").length - 1, 2, "a new viewport and a refreshed one");
  const lay = read("../src/modules/LayoutModule.jsx");
  assert.ok(lay.includes("{sel.samplesUnplaced > 0 && ("));
  assert.ok(lay.includes("surface samples are not in this frame: they lie over a void of the terrain"));
});

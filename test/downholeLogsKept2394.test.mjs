// TASKS.csv #2394 (review #2325, WA uranium) — Downhole logs keeps its log, code layer, ranking, element and model per project, and its
// scatters draw a capped sample (#2331)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { strideSample, SCATTER_MAX } from "../src/lib/downholeLogs.js";
import { useKeptState, keptIn } from "../src/lib/keptState.js";

test("every choice of the pane is kept per project, none in plain component state", () => {
  const p = readFileSync(new URL("../src/components/DownholeLogsPane.jsx", import.meta.url), "utf8");
  for (const k of ["dhlogs.source", "dhlogs.domain", "dhlogs.logChoice" /* #2558: auto / on / off */, "dhlogs.rankStat", "dhlogs.rankAbove", "dhlogs.element", "dhlogs.model"]) assert.match(p, new RegExp(`useKeptState\\(keptScope, "${k.replace(".", "\\.")}"`), k);
  assert.doesNotMatch(p, /\buseState\(/);
  assert.equal(typeof useKeptState, "function");
  keptIn("p1").set("dhlogs.element", "Th");
  assert.equal(keptIn("p1").get("dhlogs.element"), "Th"); // what a reopened pane starts from
});

test("the scatter draws at most a few thousand points (17,508 gamma / U pairs: every 6th and the extremes)", () => {
  const pts = Array.from({ length: 17508 }, (_, i) => [i, (i * 7919) % 1000]);
  const d = strideSample(pts);
  assert.ok(d.points.length <= SCATTER_MAX + 4);
  assert.equal(d.step, 6);
});

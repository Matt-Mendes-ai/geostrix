// TASKS.csv #3433 — the planned-holes line / grid offers the project's own series; #3437 — Undo does not take back model surfaces
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { holeSeries, nextHoleId } from "../src/lib/holeSeries.js";
import { holePattern } from "../src/lib/plannedPattern.js";

test("holeSeries gives the prefix, next number and width", () => {
  const ids = ["GC23-0956", "GC23-0988", "GC23-0970", "X1"];
  assert.deepEqual(holeSeries(ids), { prefix: "GC23-", next: 989, width: 4 });
  assert.equal(nextHoleId(ids), "GC23-0989");
  assert.equal(holeSeries(["abc"]), null);
});

test("a pattern in the series keeps the series' digits", () => {
  const s = holeSeries(["GC23-0988"]);
  const p = holePattern({ x: 0, y: 0, bearingDeg: 90, spacing: 25, count: 3, prefix: s.prefix, firstNumber: s.next, minWidth: s.width });
  assert.deepEqual(p.holes.map((h) => h.name), ["GC23-0989", "GC23-0990", "GC23-0991"]);
  const q = holePattern({ x: 0, y: 0, bearingDeg: 90, spacing: 25, count: 2 });
  assert.deepEqual(q.holes.map((h) => h.name), ["PLAN-01", "PLAN-02"]);
});

test("the pattern form reads the series; Undrilled zones says Undo does not remove the zones", () => {
  const src = (f) => fs.readFileSync(new URL(f, import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(src("../src/components/PlannedHolePattern.jsx"), /holeSeries\(\[\.\.\.collars/);
  assert.match(src("../src/components/UndrilledZonesPane.jsx"), /Ctrl\+Z does not take it back/);
});

// TASKS.csv #1400 — strip log: Recovery % beside RQD, a structure track at each pick's alpha, mag susc on the log scale
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { logFrac, valueRange, recoveryMax, alphaTick, holeStructures } from "../src/lib/stripTracks.js";

test("mag susc of 0.1-2 against a maximum of 100 is no longer a sliver on the log scale", () => {
  const { minPos, max } = valueRange([{ value: 0.05 }, { value: 0.11 }, { value: 2 }, { value: 100 }, { value: 0 }]);
  assert.equal(minPos, 0.05);
  assert.equal(max, 100);
  const linear = 0.11 / 100, log = logFrac(0.11, minPos, max);
  assert.ok(linear < 0.002 && log > 0.1, `log ${log}`);
  assert.equal(logFrac(100, minPos, max), 1);
  assert.equal(logFrac(0.05, minPos, max), 0.03); // the floor keeps the lowest visible
  assert.equal(logFrac(0, minPos, max), 0);
});

test("recovery over 100 % is kept on the bar's scale", () => {
  assert.equal(recoveryMax([{ value: 16.67 }, { value: 98 }]), 100);
  assert.equal(recoveryMax([{ value: 112.67 }, { value: 98 }]), 112.67);
});

test("a pick's tick follows its alpha: 90 square to the core (horizontal), 0 along it (vertical)", () => {
  const h = alphaTick(90, 10), v = alphaTick(0, 10), m = alphaTick(30, 10);
  assert.ok(Math.abs(h.dx - 10) < 1e-9 && Math.abs(h.dy) < 1e-9);
  assert.ok(Math.abs(v.dx) < 1e-9 && Math.abs(v.dy - 10) < 1e-9);
  assert.ok(Math.abs(m.dx - 5) < 1e-9);
  assert.equal(alphaTick(null, 10), null);
  assert.equal(alphaTick("", 10), null);
});

test("one hole's picks, with a depth, down the hole", () => {
  const rows = [{ hole_id: "A", depth: "20", value: "Vein" }, { hole_id: "B", depth: 5 }, { hole_id: "A", depth: 3.5, value: "Fault" }, { hole_id: "A", depth: null }];
  assert.deepEqual(holeStructures(rows, "A").map((s) => s.depth), [3.5, 20]);
});

test("the strip log draws the three tracks and keys the structure types", () => {
  const src = readFileSync(new URL("../src/components/StripLog.jsx", import.meta.url), "utf8");
  assert.match(src, /key: "recovery", label: "Rec\.%", title: "Recovery %", rows: recovery, kind: "bar", max: recoveryMax\(recovery\)/);
  assert.match(src, /key: "structure", label: "Struct\.",[^\n]*kind: "struct"/);
  assert.match(src, /k === "magsusc" \? \{ logOk: true, minPos: valueRange\(rows\)\.minPos \}/);
  assert.match(src, /const lg = t\.logOk && logScale;/);
  assert.match(src, /t\.kind === "fill" \|\| t\.kind === "struct"/);
  // RQD then Recovery, side by side
  assert.ok(src.indexOf('key: "recovery"') > src.indexOf('key: "geotech"'));
});

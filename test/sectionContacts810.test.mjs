// TASKS.csv #810 — raw-code / group targets follow modelling-code assignments; contacts tagged by the section window
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { rowKey, inTargetUnit } from "../src/lib/modellingCodes.js";
import { intervalEndIndex, upperContactOf } from "../src/lib/viewer/intervals.js";

const r = (hole_id, from, to, value) => ({ hole_id, from, to, value });
const rows = [r("H1", 0, 10, "AND"), r("H1", 10, 20, "SIL"), r("H1", 20, 30, "SILBX"), r("H1", 30, 40, "AND")];

test("#810 without assignments a raw target matches the logged code only", () => {
  const codes = new Set(["SILBX"]);
  assert.deepEqual(rows.map((x) => inTargetUnit(x, codes, "SILBX", {})), [false, false, true, false]);
});

test("#810 an interval re-coded INTO the unit counts, one re-coded AWAY does not", () => {
  const assign = { [rowKey(rows[1])]: "SILBX", [rowKey(rows[2])]: "SILBX2" };
  const codes = new Set(["SILBX"]);
  assert.deepEqual(rows.map((x) => inTargetUnit(x, codes, "SILBX", assign)), [false, true, false, false]);
});

test("#810 a group target takes intervals re-coded to the group's name or to a member code", () => {
  const codes = new Set(["SIL", "SILBX"]);
  const assign = { [rowKey(rows[0])]: "Silicified", [rowKey(rows[3])]: "SIL", [rowKey(rows[2])]: "QV" };
  assert.deepEqual(rows.map((x) => inTargetUnit(x, codes, "Silicified", assign)), [true, true, false, true]);
});

test("#810 the top uses the same rule: re-coded SIL above SILBX makes one unit with one top", () => {
  const assign = { [rowKey(rows[1])]: "SILBX" };
  const codes = new Set(["SILBX"]);
  const IN = "\u0000in";
  const idx = intervalEndIndex(rows.map((x) => ({ ...x, value: inTargetUnit(x, codes, "SILBX", assign) ? IN : "" })));
  const tops = rows.filter((x) => inTargetUnit(x, codes, "SILBX", assign)).filter((x) => !upperContactOf(x, null, { startIndex: new Map(), endIndex: idx, codes: new Set([IN]) }).continues);
  assert.deepEqual(tops.map((x) => x.from), [10]);
});

test("#810 wiring: drawn contacts default on, in the stack pane, and the section picker offers codes and groups", () => {
  const v = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.match(v, /useState\(true\); \/\/ #810/);
  const panes = readFileSync(new URL("../src/modules/viewer/ModellingPanes.jsx", import.meta.url), "utf8"); // #693: the panes moved here
  assert.equal((panes.match(/checked=\{includeSectionContacts\}/g) || []).length, 2);
  const s = readFileSync(new URL("../src/components/SectionWindow.jsx", import.meta.url), "utf8");
  assert.match(s, /tagCodes\.map/);
  assert.match(s, /tagGroups\.map/);
  const m = readFileSync(new URL("../src/modules/viewer/modellingRuns.js", import.meta.url), "utf8");
  assert.match(m, /sectionTags\.has\(c\.unit\)/);
  assert.match(m, /noteUnmatchedDrawnContacts\(specs\)/);
});

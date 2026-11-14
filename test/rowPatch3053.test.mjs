// TASKS.csv #3053 — an 817-row lithology commit into a 150,455-row layer stalled about 1.9 s: the drillhole scene built the whole lithology
// group again (every interval). A commit that changes the rows of a few holes now patches the group: only those holes are retired and built
// again (as #3097 does for moved holes). SYNTHETIC rows.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { rowChangedHoles, ROW_PATCH_MAX_SHARE } from "../src/modules/viewer/drillholeScene.js";
import { replaceRowsByHole } from "../src/lib/layers.js";

const big = [];
for (let h = 0; h < 2000; h++) for (let i = 0; i < 25; i++) big.push({ hole_id: `WA${h}`, from: i * 2, to: i * 2 + 2, value: i % 2 ? "SH" : "BIF" });
const incoming = [];
for (let h = 0; h < 33; h++) for (let i = 0; i < 25; i++) incoming.push({ hole_id: `NEW${h}`, from: i * 2, to: i * 2 + 2, value: "BIF" });

test("a commit of new holes changes only those holes' rows: the patch builds 33 holes, not 2,033", () => {
  const next = replaceRowsByHole(big, incoming).rows ?? replaceRowsByHole(big, incoming);
  assert.ok(Array.isArray(next) && next.length === big.length + incoming.length);
  const holes = rowChangedHoles(big, next);
  assert.deepEqual([...holes].sort(), Array.from({ length: 33 }, (_, h) => `NEW${h}`).sort());
});

test("a replaced hole and a removed hole count; an unchanged layer or a large change is not patched", () => {
  const replaced = [...big.filter((r) => r.hole_id !== "WA7" && r.hole_id !== "WA8"), { hole_id: "WA7", from: 0, to: 50, value: "DOL" }];
  assert.deepEqual([...rowChangedHoles(big, replaced)].sort(), ["WA7", "WA8"]);
  assert.equal(rowChangedHoles(big, big), null);
  const many = big.map((r) => (r.hole_id < "WA5" ? { ...r } : r)); // a third of the holes' rows new objects
  assert.equal(rowChangedHoles(big, many), null, `more than ${ROW_PATCH_MAX_SHARE * 100} % of the rows: a full group build`);
  assert.equal(rowChangedHoles(null, big), null);
});

test("the scene build patches such a group: only the patched holes' rows are grouped and built", () => {
  const s = fs.readFileSync(new URL("../src/modules/viewer/drillholeScene.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(s, /if \(prev && !full && !changedHoles\.size\) for \(const k of rebuild\) \{/);
  assert.match(s, /LAYER_META\[k\]\?\.numeric \|\| !sig\.slice\(1\)\.every\(\(v, i\) => v === old\[i \+ 1\]\)\) continue;/);
  assert.match(s, /if \(g && retireHoles\(g, holes\)\) \{ patched\.add\(k\); rowPatchHoles\.set\(k, holes\); \}/);
  assert.match(s, /patched\.has\(k\) \? groupByHole\(\(rows \|\| \[\]\)\.filter\(\(r\) => patchHoles\(k\)\.has\(r\.hole_id\)\)\)/);
});

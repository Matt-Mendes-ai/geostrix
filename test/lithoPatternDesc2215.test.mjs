// TASKS.csv #2215 (review #2174, WA gold) — the strip log and sections printed FGDC patterns from a note logged on a few of a code's rows
// (TGVL -> 601 Gravel from 'GRAVEL IS QTZ VN MATERIAL' on 1 of 6 rows; SCP -> Quartz, ISY -> Igneous rock likewise). A description counts
// as the code's meaning only when it is logged on at least half of the code's intervals.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { codeDescriptions, lithoPatternMap } from "../src/lib/lithoPatterns.js";

const rows = (code, n, descs = []) => Array.from({ length: n }, (_, i) => ({ value: code, description: descs[i] || "" }));

test("a note on a few rows is not the code's meaning; a description on most rows is", () => {
  const data = [
    ...rows("TGVL", 6, ["GRAVEL IS QTZ VN MATERIAL"]), // 1 of 6, as the review's file
    ...rows("SCP", 121, ["FIZZES. CARB BLEACH?", "EOH", "quartz vein"]),
    ...rows("SST", 10, Array(8).fill("Sandstone, fine grained")),
  ];
  const d = codeDescriptions(data);
  assert.equal(d.get("TGVL"), undefined);
  assert.equal(d.get("SCP"), undefined);
  assert.equal(d.get("SST"), "Sandstone, fine grained");
  const m = lithoPatternMap(data, (v) => v);
  assert.equal(m.TGVL, null, "no pattern from a one-row note");
  assert.equal(m.SCP, null);
  assert.equal(m.SST, 607, "a code that is itself an abbreviation keeps its pattern");
  const described = lithoPatternMap(rows("U1", 4, ["Coarse sandstone", "Coarse sandstone", "Coarse sandstone"]), (v) => v);
  assert.equal(described.U1, 607, "a description on 3 of 4 rows still names the rock");
});

test("an override still wins; the strip log's pattern list reads the same descriptions", () => {
  assert.equal(lithoPatternMap(rows("TGVL", 6), (v) => v, { TGVL: { pattern: "601" } }).TGVL, 601);
  const s = fs.readFileSync(new URL("../src/components/StripLog.jsx", import.meta.url), "utf8");
  assert.match(s, /const litDesc = useMemo\(\(\) => codeDescriptions\(layers\.litho \|\| \[\]\), \[layers\.litho\]\);/);
  assert.match(s, /const auto = patternForUnit\(v, lithoName\(v\), litDesc\.get\(v\)\);/);
  assert.ok(!/\.find\(\(r\) => r\.value === v && r\.description\)\?\.description/.test(s), "not the first note found");
});

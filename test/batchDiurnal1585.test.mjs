// TASKS.csv #1585 (review #1497, Lawyers) — a multi-file walk-mag import takes the season's base-station files, corrects
// each survey file against the base of its own day, and says what was and was not corrected
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { batchDiurnalPlan, parseBaseStation, diurnalCorrect } from "../src/lib/diurnal.js";

const baseText = (idLine, level) => [idLine, "/datum 54000", ...Array.from({ length: 200 }, (_, i) => { const t = 8 * 3600 + i * 120, h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60; return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.0  ${(level + 5 * Math.sin(i / 7)).toFixed(2)} 99`; })].join("\n");

test("the plan: which days the bases cover, which survey files have none", () => {
  const bases = [
    parseBaseStation(baseText("/ID 1 file 01survey.b   20 VI 21", 57118), { name: "20210620_Base4.tbl" }),
    parseBaseStation(baseText("/ID 1 file 01survey.b   20VI21", 57016), { name: "20210620_Base3.tbl" }),
    parseBaseStation(baseText("/ID 1 file 01survey.b   21VI21", 57118), { name: "20210621_Base4.tbl" }),
    parseBaseStation(baseText("/datum 54000", 57118), { name: "base_no_day.tbl" }),
  ];
  const plan = batchDiurnalPlan(["20210620_WalkMAG.xyz", "20210621_WalkMAG.xyz", "20210622_WalkMAG.xyz", "WalkMAG_undated.xyz"], bases);
  assert.deepEqual(plan.days, ["2021-06-20", "2021-06-21"]);
  assert.deepEqual(plan.files.map((f) => [f.name, f.date, f.bases]), [["20210620_WalkMAG.xyz", "2021-06-20", 2], ["20210621_WalkMAG.xyz", "2021-06-21", 1], ["20210622_WalkMAG.xyz", "2021-06-22", 0], ["WalkMAG_undated.xyz", null, 0]]);
  assert.deepEqual(plan.withoutBase.map((f) => f.name), ["20210622_WalkMAG.xyz", "WalkMAG_undated.xyz"]);
  assert.deepEqual(plan.basesWithoutDay, ["base_no_day.tbl"]);
  assert.deepEqual(batchDiurnalPlan([], []), { days: [], files: [], withoutBase: [], basesWithoutDay: [] });
});

test("a day's correction is the single-file correction: two bases on one day average their deviations", () => {
  const b4 = parseBaseStation(baseText("/ID 1 file x 20VI21", 57118), { name: "20210620_Base4.tbl" });
  const b3 = parseBaseStation(baseText("/ID 1 file x 20VI21", 57016), { name: "20210620_Base3.tbl" });
  const times = [9 * 3600, 10 * 3600, 11 * 3600, 23 * 3600], raw = [56700, 56710, 56720, 56730];
  const res = diurnalCorrect(times, raw, [b4, b3]);
  assert.equal(res.used, 3);
  assert.equal(res.outside, 1); // 23:00 is after both bases
  assert.equal(res.corrected[3], null);
  assert.ok(Math.abs(res.corrected[0] - 56700) < 6); // within the day's 5 nT swing
});

test("the import path: every survey file is matched to its day's bases, the notice says corrected / raw / not corrected", () => {
  const s = readFileSync(new URL("../src/modules/GeophysicsModule.jsx", import.meta.url), "utf8");
  assert.match(s, /const day = gemHeaderInfo\(text\)\.date \|\| fileNameDate\(f\.name\);/);
  assert.match(s, /bases\.filter\(\(b\) => b\.date === day\)/);
  assert.match(s, /diurnalCorrect\(cleaned\.rows\.map\(\(r\) => r\[timeCol\]\), cleaned\.rows\.map\(\(r\) => r\[vCol\]\), dayBases\)/);
  assert.match(s, /Diurnal-corrected \{files\} of \{n\} files against their day's base/);
  assert.match(s, /No base for \{v\}: imported raw\./);
  assert.match(s, /Not diurnal-corrected: no base-station files were loaded\./);
  assert.match(s, /batchDiurnalPlan\(xyzPending\.batch\.files\.map\(\(f\) => f\.name\), xyzPending\.batch\.bases\)/);
  assert.match(s, /timeCol: columns\.find\(\(c\) => \/\^time\$\/i\.test\(c\)\)/);
});

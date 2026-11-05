// TASKS.csv #1584 (review #1497, Lawyers) — GEM dates in the compact "01VIII22" form are read, the "/ID ... file" line
// wins over other dated header lines, and a file's yyyymmdd name stands in when the header has no date
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gemDateOf, fileNameDate, gemHeaderInfo, parseBaseStation } from "../src/lib/diurnal.js";

test("both GEM date forms, longest Roman numeral first", () => {
  assert.equal(gemDateOf("/ID 1 file 01survey.b   01VIII22"), "2022-08-01");
  assert.equal(gemDateOf("/ID 1 file 01survey.b   19 VI 21"), "2021-06-19");
  assert.equal(gemDateOf("/BL50 16 XI 2021"), "2021-11-16");
  assert.equal(gemDateOf("/ID 4 file 1 survey.wm  02VIII22"), "2022-08-02");
  assert.equal(gemDateOf("/ID 2 file x 25VI22"), "2022-06-25");
  assert.equal(gemDateOf("/ID 2 file x 25V22"), "2022-05-25");
  assert.equal(gemDateOf("/ID 2 file x 25XII22"), "2022-12-25");
  assert.equal(gemDateOf("/Gem Systems GSM-19 4021347 v7.0"), null);
  assert.equal(gemDateOf("/datum  54000.00"), null);
  assert.equal(gemDateOf("/ID 2 file x 40VI22"), null); // not a day
});

test("the /ID line is the survey date; another dated line only when there is no /ID date (the 2021-11-16 rover case)", () => {
  const rover = ["/Gem Systems GSM-19W 4021347 v7.0", "/BL50 16 XI 2021", "/ID 4 file 1 survey.wm  01VIII22", "/UTC-07", "/datum  54000.00"].join("\n");
  const h = gemHeaderInfo(rover);
  assert.equal(h.date, "2022-08-01");
  assert.equal(h.dateFrom, "id");
  assert.equal(h.utcOffsetH, -7);
  const noId = ["/Gem Systems GSM-19", "/BL50 16 XI 2021"].join("\n");
  assert.deepEqual([gemHeaderInfo(noId).date, gemHeaderInfo(noId).dateFrom], ["2021-11-16", "header"]);
  assert.deepEqual([gemHeaderInfo("/datum 54000").date, gemHeaderInfo("/datum 54000").dateFrom], [null, null]);
});

test("the file name's yyyymmdd", () => {
  assert.equal(fileNameDate("20220801_Base4.tbl"), "2022-08-01");
  assert.equal(fileNameDate("RAW/2022/XYZ/MAG/20220801_RedGreen_WalkMAG.xyz"), "2022-08-01");
  assert.equal(fileNameDate("Base4.tbl"), null);
  assert.equal(fileNameDate("survey_4021347.tbl"), null); // not a date
  assert.equal(fileNameDate("20221301_x.tbl"), null); // month 13
});

test("a base file: the header date, else the file name's, and both kept for the cross-check", () => {
  const rows = ["08:10:56.0  57117.85 99", "08:11:00.0  57118.10 99", "08:11:04.0  57118.30 99"].join("\n");
  const compact = parseBaseStation(["/Gem Systems GSM-19", "/ID 1 file 01survey.b   01VIII22", rows].join("\n"), { name: "20220801_Base4.tbl" });
  assert.deepEqual([compact.date, compact.dateFrom, compact.nameDate], ["2022-08-01", "id", "2022-08-01"]);
  const nameOnly = parseBaseStation(["/Gem Systems GSM-19", "/datum 54000", rows].join("\n"), { name: "20220802_Base4.tbl" });
  assert.deepEqual([nameOnly.date, nameOnly.dateFrom, nameOnly.nameDate], ["2022-08-02", "filename", "2022-08-02"]);
  const none = parseBaseStation(["/datum 54000", rows].join("\n"), { name: "base.txt" });
  assert.deepEqual([none.date, none.dateFrom, none.nameDate], [null, null, null]);
  const conflict = parseBaseStation(["/BL50 16 XI 2021", rows].join("\n"), { name: "20220801_Base4.tbl" });
  assert.deepEqual([conflict.date, conflict.nameDate], ["2021-11-16", "2022-08-01"]);
});

test("the diurnal box reads the rover's day from its file name too, and says when a base's day is unknown or conflicting", () => {
  const s = readFileSync(new URL("../src/components/DiurnalCorrectionBox.jsx", import.meta.url), "utf8");
  assert.match(s, /pending\.header\?\.date \|\| fileNameDate\(pending\.fileName\)/);
  assert.match(s, /the day could not be read from \{v\}, so it may be from another day than the rover/);
  assert.match(s, /the header says \{date\} but the file name says \{nameDate\}/);
  assert.match(s, /\{date\} \(from the file name\)/);
});

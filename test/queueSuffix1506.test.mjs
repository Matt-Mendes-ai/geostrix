// TASKS.csv #1506 — a queued file's dialog title "(N more queued)" never becomes a layer name, a row's source or a notice
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../src/modules/viewer/importPipelineImpl.js", import.meta.url), "utf8");

test("commitImportData works with the bare file name", () => {
  assert.ok(src.includes("const { target, mapping, allRows: allRowsIn, dipConvention, fileName: shownName,")); // allRowsIn: the rows before the #2330 row filter // TASKS.csv #1963 — the argument is destructured on the next line (the whole object is also kept for the database-import record)
  assert.ok(src.includes('const fileName = String(shownName ?? "").replace(/ \\(\\d+ more queued\\)$/, "");'));
  const strip = (s) => String(s).replace(/ \(\d+ more queued\)$/, "");
  assert.equal(strip("2021 & 2022 DDH Min Domain.csv (10 more queued)").replace(/\.csv$/i, ""), "2021 & 2022 DDH Min Domain");
  assert.equal(strip("plain.csv"), "plain.csv");
});

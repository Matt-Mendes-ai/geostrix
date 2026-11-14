// TASKS.csv #3072 — the assay dialog's Import button was disabled for its first second or two (the value scan, #2164) with nothing saying
// why where the eye is: the status line sits in the scrolling body. The button now says it is checking, with its progress, and is aria-busy.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("the Import button says the values are being checked while the scan runs", () => {
  const s = fs.readFileSync(new URL("../src/components/AssayImportModal.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(s, /modal\.busy \? tr\("Importing…"\) : !scan && \(modal\.allRows \|\| \[\]\)\.length > 0 \? tr\("Checking the values… \{pct\}%", \{ pct: Math\.round\(scanPct \* 100\) \}\)/);
  assert.match(s, /aria-busy=\{!scan \|\| !!modal\.busy\} title=\{!scan \? tr\("The values are being checked for negatives, zeros and empty cells: the questions below depend on them\."\) : undefined\}/);
  assert.match(s, /disabled=\{!!modal\.busy \|\| !scan \|\| checkedCount === 0 \|\| unmapped\.length > 0\}/, "still disabled until the scan is in (#2164)");
});

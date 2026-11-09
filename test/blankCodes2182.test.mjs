// TASKS.csv #2182 (review #2174, WA gold) — a blank code cell in a coded log is skipped and counted, not imported as 'Unknown'
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isBlankCode, blankShare, skippedRowsText } from "../src/lib/viewer/importHelpers.js";

test("#2182 blank codes and the share the dialog shows", () => {
  for (const v of [null, undefined, "", "  "]) assert.equal(isBlankCode(v), true);
  for (const v of ["Py", "0", 0, "Unknown"]) assert.equal(isBlankCode(v), false); // a file's own 'Unknown' is a code
  assert.deepEqual(blankShare([{ M: "Py" }, { M: "" }, { M: null }, { M: " " }], "M"), { blank: 3, total: 4 });
  assert.match(skippedRowsText([{ reason: "no code", example: "" }, { reason: "no code", example: null }], 10), /Skipped 2 of 10 row\(s\): 2 blank code\./);
});

test("#2182 wiring: the interval import skips them (or takes the next numbered code); the dialog warns over 20 %", () => {
  const p = readFileSync(new URL("../src/modules/viewer/useImportPipeline.js", import.meta.url), "utf8");
  assert.match(p, /!numeric && r\.value == null \? "no code"/);
  assert.match(p, /r\.codes\.find\(\(c\) => !isBlankCode\(c\)\)/);
  assert.match(readFileSync(new URL("../src/components/ImportMappingModal.jsx", import.meta.url), "utf8"), /b\.blank \/ b\.total >= 0\.2/);
});

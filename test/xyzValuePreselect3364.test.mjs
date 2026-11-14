// TASKS.csv #3364 — the multi-file .xyz picker preselects the Value
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("#3364 the multi-file .xyz picker preselects the one column left as Value, like the single-file one", () => {
  const g = readFileSync(new URL("../src/modules/GeophysicsModule.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(g, /valueCol: g\.value \|\| onlyValueLeft\(columns, \[gx, gy, g\.z\]\.filter\(Boolean\), parsedRows\), header: gemHeaderInfo\(text\)/);
});

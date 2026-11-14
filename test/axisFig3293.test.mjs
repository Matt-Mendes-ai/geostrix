// TASKS.csv #3293 (#3226 (5)) — probability / box plot axis ends in plain digits: 1000 no longer reads "1.00e+3" beside "100".
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { axisFig } from "../src/lib/numberFormat.js";
test("plain digits, three significant figures, no exponent", () => {
  assert.deepEqual([100, 1000, 12345.6, 0.0042, 0.5, 1.2345].map(axisFig), ["100", "1000", "12300", "0.0042", "0.5", "1.23"]);
  assert.equal(axisFig(NaN), "");
});
test("wired", () => {
  const s = fs.readFileSync(new URL("../src/components/GradeStatistics.jsx", import.meta.url), "utf8");
  assert.ok(s.includes("{axisFig(low)}</text>") && s.includes("{axisFig(high)} {unit}") && s.includes("import { axisFig"));
});

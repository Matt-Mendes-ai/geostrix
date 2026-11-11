// TASKS.csv #2165 (WA drillhole review) — a required field the dialog could not match says which column names it looked for; the rows
// dropped for a blank Elevation (the second half of the row) are no longer dropped since #2169 (an assumed elevation, said in the notice)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { TARGET_SCHEMAS } from "../src/lib/layers.js";

test("the dialog lists the aliases of an unmatched required field", () => {
  const m = readFileSync(new URL("../src/components/ImportMappingModal.jsx", import.meta.url), "utf8");
  assert.match(m, /missingRequired\.filter\(\(f\) => f\.aliases\?\.length\)\.map\(\(f\) => <div key=\{f\.key\}/);
  assert.match(m, /tr\("\{field\}: no column matched; the names looked for are \{names\}\."/);
  // the schema carries the names it looks for
  const hole = TARGET_SCHEMAS.collars.fields.find((f) => f.key === "hole_id");
  assert.ok(hole.required && hole.aliases.includes("holeid") && hole.aliases.includes("bhid"));
});

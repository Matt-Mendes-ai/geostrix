// TASKS.csv #3292 (#3226 (4)) — the volcanic-codes dialog names a code from the project's dictionary ('V1 — Meta-rhyolite flow'). Source check (the dialog is a .jsx).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const rd = (f) => fs.readFileSync(new URL(f, import.meta.url), "utf8").replace(/\r\n/g, "\n");
test("the dialog shows the meaning, the module reads it from the litho dictionary", () => {
  assert.ok(rd("../src/components/VolcanicCodesModal.jsx").includes('{c.code || <em>{tr("no code logged")}</em>}{c.meaning ? ` — ${c.meaning}` : ""}'));
  assert.match(rd("../src/modules/GeochemModule.jsx"), /meaning: code \? entryOf\(store\.codeDictionary\?\.litho, code\)\?\.desc \|\| "" : ""/);
});

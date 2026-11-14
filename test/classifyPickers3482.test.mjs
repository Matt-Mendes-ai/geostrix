// TASKS.csv #3482 (#3292) — the Alteration box dialog's code pickers (the logged lithology mapped to protoliths, the least-altered alteration codes) name each code with the
// project's dictionary meaning. Source check (the dialog is a .jsx).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const rd = (f) => fs.readFileSync(new URL(f, import.meta.url), "utf8").replace(/\r\n/g, "\n");
test("the dialog prints the meaning beside the code and the module hands it the dictionary's", () => {
  const m = rd("../src/components/AlterationBoxModal.jsx");
  assert.ok(m.includes('meaningOf = null') && m.includes('meaningOf?.("alt", c)') && m.includes('meaningOf?.("litho", c)'));
  assert.ok(rd("../src/modules/GeochemModule.jsx").includes('meaningOf={(layer, code) => entryOf(store.codeDictionary?.[layer], code)?.desc || ""}'));
});

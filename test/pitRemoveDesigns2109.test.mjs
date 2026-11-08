// TASKS.csv #2109 (review #2013, Woodjam) — removing a pit shell names its benched designs in the confirm and removes them with it.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const p = readFileSync(new URL("../src/components/PitShellPane.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const d = readFileSync(new URL("../src/components/PitDesignPane.jsx", import.meta.url), "utf8");
test("the designs are found by the pitId their params carry, named, and removed", () => {
  assert.ok(d.includes("pitId: pit.id"), "a design records its shell's id");
  assert.match(p, /const designs = surfaces\.filter\(\(g\) => g\.params\?\.pitId === s\.id\);/);
  assert.match(p, /tr\("Its \{n\} benched design\(s\) go too: \{names\}\."/);
  assert.match(p, /designs\.forEach\(\(g\) => onRemove\?\.\(g\.id\)\);/);
});

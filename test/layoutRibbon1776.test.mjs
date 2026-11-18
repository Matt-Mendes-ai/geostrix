// TASKS.csv #1776 (review #1645, Copley) — the Collar table is a Simple-ribbon tool, and the page bar's Atlas button no longer looks disabled
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const m = readFileSync(new URL("../src/modules/LayoutModule.jsx", import.meta.url), "utf8");

test("Collar table is not an Advanced-only button", () => {
  // #3912: the Insert tools sit in the Add menu, a Basic tool; the Collar table is in its list whatever the mode (Logo and Samples table only with All tools)
  assert.match(m, /const addItems = \[\["text", "Text"\], \["north", "North arrow"\], \["scale", "Scale bar"\], \["legend", "Legend"\], \["titleblock", "Title block"\], \["table", "Collar table"\], \.\.\.\(basicToolsOn \? \[\] :/);
  assert.match(m, /<RibbonButton icon=\{Plus\} label="Add" tone="output"/);
});

test("the Atlas button is drawn like the enabled selects beside it, not in the faint grey of a disabled control", () => {
  const i = m.indexOf('{tr("Atlas…")}');
  const btn = m.slice(m.lastIndexOf("<button", i), i);
  assert.doesNotMatch(btn, /color-text-faint/);
  assert.match(btn, /background: "var\(--color-bg\)"/);
  assert.match(btn, /color: "var\(--color-text\)"/);
});

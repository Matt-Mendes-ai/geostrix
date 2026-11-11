// TASKS.csv #1776 (review #1645, Copley) — the Collar table is a Simple-ribbon tool, and the page bar's Atlas button no longer looks disabled
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const m = readFileSync(new URL("../src/modules/LayoutModule.jsx", import.meta.url), "utf8");

test("Collar table is not an Advanced-only button", () => {
  const line = m.split(/\r?\n/).find((l) => l.includes('label="Collar table"'));
  assert.ok(line);
  assert.doesNotMatch(line, /<RibbonButton advanced /);
});

test("the Atlas button is drawn like the enabled selects beside it, not in the faint grey of a disabled control", () => {
  const i = m.indexOf('{tr("Atlas…")}');
  const btn = m.slice(m.lastIndexOf("<button", i), i);
  assert.doesNotMatch(btn, /color-text-faint/);
  assert.match(btn, /background: "var\(--color-bg\)"/);
  assert.match(btn, /color: "var\(--color-text\)"/);
});

// TASKS.csv #3003 (5), Matt's decision (2026-11-12): Mine Design's Simple ribbon is the open-pit flow (Pit shell, Pit design, Dump); Drifts
// and ramps and Strings are Advanced (Show all), their groups with them (#1707 / #1817: no group shows empty in Simple).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("the Mine Design ribbon in Simple", () => {
  const p = fs.readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  const m = p.slice(p.indexOf('label="Mine design tools"'), p.indexOf('label="Targeting tools"'));
  const simple = [...m.matchAll(/<RibbonButton (?!advanced)[^>]*label="([^"]+)"/g)].map((x) => x[1]);
  assert.deepEqual(simple, ["Pit shell", "Pit design", "Dump / stockpile", "Drifts and ramps", "Strings"].filter((l) => !["Drifts and ramps", "Strings"].includes(l)));
  assert.match(m, /<RibbonGroup advanced label="Underground">/);
  assert.match(m, /<RibbonGroup advanced label="CAD">/);
  assert.match(m, /<RibbonButton advanced icon=\{Layers\} label="Nested pits"/);
});

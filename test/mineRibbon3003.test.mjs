// TASKS.csv #3003 (5), Matt's decision (2026-11-12): Mine Design's Simple ribbon is the open-pit flow (Pit shell, Pit design, Dump); Drifts and ramps stay Advanced (Show all).
// TASKS.csv #3798 (Matt, 2026-11-16: "YES, show Stope outlines and Strings in Simple mode, always (not guessed from the data), since Dump needs Strings"): Stope outlines and Strings show in
// Simple too, their groups with them (#1707 / #1817: no group shows empty in Simple).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("the Mine Design ribbon in Simple", () => {
  const p = fs.readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  const m = p.slice(p.indexOf('label="Mine design tools"'), p.indexOf('label="Targeting tools"'));
  const simple = [...m.matchAll(/<RibbonButton (?!advanced)[^>]*label="([^"]+)"/g)].map((x) => x[1]);
  assert.deepEqual(simple, ["Pit shell", "Pit design", "Dump / stockpile", "Stope outlines", "Strings"]);
  assert.match(m, /<RibbonGroup label="Underground">/);
  assert.match(m, /<RibbonGroup label="CAD">/);
  assert.match(m, /<RibbonButton advanced icon=\{Spline\} label="Drifts and ramps"/);
  assert.match(m, /<RibbonButton advanced icon=\{Layers\} label="Nested pits"/);
});

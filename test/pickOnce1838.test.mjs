// TASKS.csv #1838 — a picked collar fills the planned-hole form once, not again each time the pane reopens
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("applied picks are remembered outside the form, and the pick's note follows the pick in the form", () => {
  const p = fs.readFileSync("src/components/PlannedHoleParts.jsx", "utf8");
  assert.match(p, /const appliedPicks = new WeakSet\(\);/);
  assert.match(p, /if \(!pickedPoint \|\| pickedPoint === lastAppliedPick\.current \|\| appliedPicks\.has\(pickedPoint\)\) return;/);
  assert.match(p, /appliedPicks\.add\(pickedPoint\); setPickInForm\(true\);/);
  assert.match(p, /\{noTerrain && pickedPoint && pickInForm && <div role="note"/);
  // the store names a blank one PLAN-n; #3347 — unless the project's series offers its next id
  assert.ok(p.includes("onAdd({ ...(draft.name.trim() ? { name: draft.name.trim() } : nameOffer ? { name: nameOffer } : {})") && !p.includes("name: draft.name.trim() || undefined"));
});

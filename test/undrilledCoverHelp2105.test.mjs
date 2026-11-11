// TASKS.csv #2105 — the help says where the Covered-within value comes from (the drill-site spacing, #2452), not 'a placeholder'
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("the help and the pane agree: half the typical drill-site spacing, said under the field", () => {
  const h = fs.readFileSync("src/help/pages/targeting.js", "utf8");
  assert.ok(!h.includes("The starting value is a placeholder, not a rule."));
  assert.ok(h.includes("It starts at half the typical spacing of the drill sites"));
  const p = fs.readFileSync("src/components/UndrilledZonesPane.jsx", "utf8");
  assert.ok(p.includes("Drill sites are typically {s} m apart; covered within starts at half that."));
});

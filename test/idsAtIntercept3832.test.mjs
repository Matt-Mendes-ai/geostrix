// TASKS.csv #3832 — Maps plan: with 'Colour at: the highest interval, down the hole' the hole ids stayed at the collars while the dots moved to the intercepts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("the ids and pad call-outs are drawn at the dots' own positions (the intercepts when the colour is drawn there)", () => {
  const m = readFileSync(new URL("../src/components/MapsPlanView.jsx", import.meta.url), "utf8");
  assert.match(m, /drawCallouts\(ctx, dotCollars \/\* #3832/);
  assert.doesNotMatch(m, /drawCallouts\(ctx, collars,/);
  assert.match(m, /const dotCollars = useMemo\(\(\) => \{\s+if \(!atIntercept\) return collars;/);
  assert.match(m, /return collars\.map\(\(c\) => \{ const p = at\.get\(String\(c\.hole_id\)\); return p \? \{ \.\.\.c, x: p\.x, y: p\.y \} : c; \}\);/); // hole_id kept: the colour, the label
});

// TASKS.csv #2113 — the opening's solid says when its mesh volume differs from the section x length the profile line gives
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("the 'Added' message adds the section x length figure when they differ by more than 0.5 %", () => {
  const p = fs.readFileSync("src/components/DesignLinesPane.jsx", "utf8");
  assert.match(p, /Math\.abs\(pm\.volume - area \* c\.length\) > 0\.005 \* area \* c\.length \? " " \+ tr\("That is the solid's own volume; the section times the line's length/);
});

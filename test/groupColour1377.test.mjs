// TASKS.csv #1377 — every new lithology group was #8a7fbf, so two groups looked the same in the stack list and legend
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { nextGroupColour, CATEGORICAL_SAFE_COLORS } from "../src/lib/layers.js";

test("each new group takes the next palette colour no group uses", () => {
  const a = nextGroupColour([], "Earn clastics");
  const b = nextGroupColour([{ color: a }], "McDame carbonate");
  assert.equal(a, CATEGORICAL_SAFE_COLORS[0]);
  assert.notEqual(a, b);
  // a colour the geologist set by hand is skipped too (case-insensitive)
  assert.equal(nextGroupColour([{ color: CATEGORICAL_SAFE_COLORS[0].toLowerCase() }, { color: "#123456" }]), CATEGORICAL_SAFE_COLORS[1]);
  // past the palette: a colour from the name, still a colour
  const all = CATEGORICAL_SAFE_COLORS.map((color) => ({ color }));
  assert.match(nextGroupColour(all, "Group 17"), /^(#|hsl|rgb)/);
});

test("the store gives a new group that colour unless one is passed", () => {
  const s = readFileSync(new URL("../src/lib/store.jsx", import.meta.url), "utf8");
  assert.match(s, /\{ name: "Group", color: nextGroupColour\(p, group\?\.name\), codes: \[\], \.\.\.group, id \}/);
});

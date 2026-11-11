// TASKS.csv #1777 (review #1645, Copley) — one placeholder syntax: the atlas fills {hole_id} as it fills {{hole_id}}, leaves the page's own
// {project} / {scale} for the page, and both lists are shown where text is edited and in the Atlas dialog
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { substituteTokens, hasAtlasTokens, HOLE_TOKENS, SECTION_TOKENS } from "../src/lib/atlas.js";

const v = { hole_id: "COP-23-0009", azimuth: "045", dip: "-60", length: "150" };

test("single and double braces are both filled; unknown and page placeholders are left as written", () => {
  assert.equal(substituteTokens("{hole_id} plan, Az {azimuth} Dip {{dip}}, {length} m - {project} 1 : {scale}", v), "COP-23-0009 plan, Az 045 Dip -60, 150 m - {project} 1 : {scale}");
  assert.equal(substituteTokens("{{hole_idd}} {holeid}", v), "{{hole_idd}} {holeid}"); // a typo stays visible
  assert.equal(substituteTokens("{constructor}", v), "{constructor}"); // never an object's own property names
  assert.equal(substituteTokens(null, v), null);
});

test("the dialog sees the tokens in either form, per mode", () => {
  assert.equal(hasAtlasTokens("{hole_id}", HOLE_TOKENS), true);
  assert.equal(hasAtlasTokens("{{hole_id}}", HOLE_TOKENS), true);
  assert.equal(hasAtlasTokens("{project} {scale}", HOLE_TOKENS), false);
  assert.equal(hasAtlasTokens("{name}", SECTION_TOKENS), true);
  assert.equal(hasAtlasTokens(undefined, HOLE_TOKENS), false);
});

test("wired: the text sidebar lists the atlas tokens, the dialog shows single braces", () => {
  const m = readFileSync(new URL("../src/modules/LayoutModule.jsx", import.meta.url), "utf8");
  assert.match(m, /tr\("On atlas pages also: \{list\}", \{ list: \[\.\.\.new Set\(\[\.\.\.HOLE_TOKENS, \.\.\.SECTION_TOKENS\]\)\]/);
  const g = readFileSync(new URL("../src/components/GenerateAtlasModal.jsx", import.meta.url), "utf8");
  assert.match(g, /v2: tokens\.map\(\(t\) => `\{\$\{t\}\}`\)\.join\(", "\)/);
  assert.match(g, /hasAtlasTokens\(el\.text, mode === "hole" \? HOLE_TOKENS : SECTION_TOKENS\)/);
});

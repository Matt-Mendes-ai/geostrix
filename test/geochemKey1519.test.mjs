// TASKS.csv #1519 — 'by hole' and 'by logged lithology' colours had no key on screen (only the exported figure had one)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const s = readFileSync(new URL("../src/modules/GeochemModule.jsx", import.meta.url), "utf8");

test("a key for lithology and for up to 16 holes; past that a line says why there is none", () => {
  assert.match(s, /^const KEY_MAX = 16;/m);
  assert.match(s, /const plottedHoles = useMemo\(\(\) => \(colorMode === "hole" \? \[\.\.\.new Set\(plotted\.map\(\(a\) => a\.hole_id\)\)\] : \[\]\), \[colorMode, plotted\]\);/);
  assert.match(s, /\(colorMode === "lithology" \|\| \(colorMode === "hole" && plottedHoles\.length <= KEY_MAX\)\)/);
  assert.match(s, /tr\("\+ \{n\} more \(the exported figure lists them all\)"/);
  assert.match(s, /colorMode === "hole" && plottedHoles\.length > KEY_MAX && <span/);
});

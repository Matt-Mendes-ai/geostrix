// TASKS.csv #2057 (review #2013, Woodjam) — after a DXF strings import the Explicit surface pane said 'Includes 2 string(s) imported
// from DXF' and also 'No section lines yet'. With DXF strings and no drawn section line it now says the DXF strings are hard lines.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../src/components/ExplicitSurfacePanel.jsx", import.meta.url), "utf8");

test("the DXF strings are counted as the build line counts them", () => {
  assert.match(src, /const dxfStrings = def \? \(def\.lines \|\| \[\]\)\.filter\(\(l\) => l\.pts\?\.length >= 2 && l\.imageId === "dxf"\)\.length : 0;/);
  // the build line's count (#1959) uses the same test
  assert.match(src, /const dxf = \(def\.lines \|\| \[\]\)\.filter\(\(l\) => l\.pts\?\.length >= 2 && l\.imageId === "dxf"\)\.length/);
});

test("'No section lines yet' only when there is no line of any kind", () => {
  assert.match(src, /: dxfStrings \? tr\(dxfStrings === 1 \? "No lines drawn on sections yet; \{n\} string imported from DXF is a hard line of this surface\." : "No lines drawn on sections yet; \{n\} strings imported from DXF are hard lines of this surface\.", \{ n: dxfStrings \}\)\s*: tr\("No section lines yet\."\)/);
});

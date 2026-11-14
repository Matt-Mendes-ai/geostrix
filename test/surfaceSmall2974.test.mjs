// TASKS.csv #2974 (WA iron review) — small Surface Geology things: (6) the typed measurement's ranges checked in the form, the value named;
// (7) Unit polygons' unit suggestions from polygon maps and the logged codes only
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("(6) the typed form checks dip 0-90 and dip direction 0-360 and names the value", () => {
  const p = readFileSync(new URL("../src/components/SurfaceMappingPanel.jsx", import.meta.url), "utf8");
  assert.match(p, /if \(!\(n\(typing\.dip\) >= 0 && n\(typing\.dip\) <= 90\)\) \{ setStructMsg\(\{ ok: false, text: tr\("The dip must be from 0 to 90° \(typed: \{v\}\)\.", \{ v: typing\.dip \}\) \}\); return; \}/);
  assert.match(p, /tr\("The dip direction must be from 0 to 360° \(typed: \{v\}\)\.", \{ v: typing\.dipDir \}\)/);
});

test("(7) suggestions: polygon layers' categorical values and the logged lithology codes, not a GPX layer's names", () => {
  const p = readFileSync(new URL("../src/components/UnitPolygonPane.jsx", import.meta.url), "utf8");
  assert.match(p, /if \(l\.geomType !== "polygon" \|\| l\.styleBreaks\?\.length\) continue;/);
  assert.match(p, /for \(const r of layers\?\.litho \|\| \[\]\) \{\s*const v = String\(r\?\.value \?\? ""\)\.trim\(\); if \(!v \|\| s\.has\(v\)\) continue;/); // the logged codes, but not cover / no recovery: #3381
});

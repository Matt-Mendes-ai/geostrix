// TASKS.csv #1698 (review #1645, Copley) — the strip log: custom layers as tracks on request, the elements on in 3D first,
// no empty RQD% track
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../src/components/StripLog.jsx", import.meta.url), "utf8");

test("the elements shown in 3D open the log, in their order", () => {
  assert.match(src, /shownElements = \[\]/);
  assert.match(src, /const shownFirst = shownElements\.filter\(\(s\) => symbols\.includes\(s\)\);/);
  assert.match(src, /useState\(shownFirst\[0\] \|\| symbols\[0\] \|\| ""\)/);
  assert.match(src, /useState\(shownFirst\.slice\(1, 3\)\)/);
  const viewer = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.match(viewer, /shownElements=\{assayDisplayElements\}/);
});

test("custom layers: a text layer as a colour column, a numeric field as a bar, added and removed from the header", () => {
  assert.match(src, /const \{ customLayers: allCustom = \[\] \} = useStore\(\);/);
  assert.match(src, /if \(!numFields\.includes\("value"\)\) out\.push\(\{ key: `\$\{l\.id\}:value`, layer: l, field: "value", numeric: false/);
  assert.match(src, /kind: "bar", max: vals\.length \? arrMax\(vals\) : 0, minPos: pos\.length \? arrMin\(pos\) : 0, logOk: pos\.length > 0, scaleLabel: true/);
  assert.match(src, /kind: "fill", colorFn: \(v\) => customColour\(c\.layer, sty, \{ value: v \}\)/);
  assert.match(src, /from: depthOf\(r\) - 0\.25, to: depthOf\(r\) \+ 0\.25/); // a depth-only reading
  assert.match(src, /<option value="">\{tr\("\+ track"\)\}<\/option>/);
  assert.match(src, /aria-label=\{tr\("Remove track \{v\}", \{ v: c\.label \}\)\}/);
  assert.match(src, /\.\.\.customTrackDefs,/);
});

test("the RQD% track only when the hole has RQD rows", () => {
  assert.match(src, /\.\.\.\(geotech\.length \? \[\{ key: "geotech", label: "RQD%", rows: geotech, kind: "bar", max: 100 \}\] : \[\]\)/);
});

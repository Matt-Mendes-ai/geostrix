// TASKS.csv #2304 (review #2174, WA gold) — 'Fit the holes' blames the unsurveyed (assumed vertical) holes only when they widen the frame
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const L = readFileSync(new URL("../src/modules/LayoutModule.jsx", import.meta.url), "utf8");
const at = L.indexOf("const fitViewport = async (sel, { pass = 1") /* #3371: more options */ /* #3018 */, body = L.slice(at, L.indexOf("\n  };", at));

test("the scale is computed with and without the assumed holes' points", () => {
  assert.match(body, /if \(!assumedIds\.has\(hid\)\) ptsDrilled\.push\(\[p\.x, p\.y\]\)/);
  assert.match(body, /scaleDrilled = roundScaleFor\(a0, a1, b0, b1\);/);
});

test("the clause appears only with a smaller drilled-only scale, which it names", () => {
  assert.match(L, /\{sel\.fitInfo\.drilledScale > 0 && " " \+ tr\("Set the scale by hand, or remove those collars: \{k\} of them are assumed vertical \(no survey or azimuth \/ dip\) and widen the frame; the rest fit at 1:\{s\}\./ /* #3899 */);
  assert.doesNotMatch(L, /\{sel\.fitInfo\.assumed > 0 && " " \+ tr\(/);
});

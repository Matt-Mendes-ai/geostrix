// TASKS.csv #2132 (review #2013, Woodjam) — Layout's 'Fit the holes at a round scale' says what it fitted, including the collars that
// are only assumed vertical, and a district-wide fit lands on a preset instead of 'custom'.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const L = readFileSync(new URL("../src/modules/LayoutModule.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("regional presets: 1:250,000, 1:500,000 and 1:1,000,000", () => {
  const presets = JSON.parse(L.match(/const SCALE_PRESETS = (\[[^\]]*\]);/)[1]);
  for (const s of [250000, 500000, 1000000]) assert.ok(presets.includes(s), String(s));
  assert.deepEqual(presets, [...presets].sort((a, b) => a - b));
});

test("the fit says how many holes it framed and how many are only assumed vertical", () => {
  const at = L.indexOf("const fitViewport = async (sel, { pass = 1 } = {}) =>") /* #3018 */;
  const body = L.slice(at, L.indexOf("\n  };", at));
  assert.match(body, /!surveyedIds\.has\(c\.hole_id\) && \(!Number\.isFinite\(c\.azimuth\) \|\| !Number\.isFinite\(c\.dip\)\)/);
  assert.match(body, /fitInfo: nHoles \? \{ scale, holes: nHoles, assumed, \.\.\.\(assumed && scaleDrilled < scale \? \{ drilledScale: scaleDrilled \} : \{\}\), \.\.\.\(turnedScale < scale \? \{ turnedScale \} : \{\}\) \} : null/); /* turnedScale: #2737 */ // #2304: blamed only when they widen it
  // shown under the button while the scale is still the fitted one (a notice was cleared by the refresh re-selecting the frame)
  assert.match(L, /\{sel\.fitInfo && sel\.fitInfo\.scale === sel\.fixedScale && \(/);
  assert.match(L, /drawn as assumed vertical holes\) and widen the frame/);
});

// TASKS.csv #3018 (review #2876, WA iron) — Fit the holes rotated the holes by the last capture's azimuth while the capture it started used the
// current camera: '1:500,000, they run the other way' on the first press, '1:250,000' on the second. The fit now records the azimuth it used
// and fits once more when the capture comes back at another one.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const L = readFileSync(new URL("../src/modules/LayoutModule.jsx", import.meta.url), "utf8");

test("Fit records the azimuth it used and the capture it follows, on the viewport by id", () => {
  assert.match(L, /const fitViewport = async \(sel, \{ pass = 1(, allHoles = false, keepScale = false)? \} = \{\}\) => \{/);
  assert.match(L, /fitAzimuth: sel\.cameraAzimuthDeg \|\| 0, fitFrom: sel\.capturedAt \|\| 0, fitPass: pass \}/);
  assert.match(L, /setElements\(\(els\) => els\.map\(\(el\) => \(el\.id === sel\.id \? \{ \.\.\.el, \.\.\.patch \} : el\)\)\);/);
});

test("a capture back at another azimuth fits once more, with the flags cleared either way", () => {
  assert.match(L, /el\.type === "viewport" && el\.fitAzimuth != null && \(el\.capturedAt \|\| 0\) !== el\.fitFrom/);
  assert.match(L, /if \(\(el\.fitPass \|\| 1\) < 2 && turn\(el\.cameraAzimuthDeg, el\.fitAzimuth\) > 0\.5\) fitViewport\(\{ \.\.\.el, fitAzimuth: undefined \}, \{ pass: 2(, allHoles: !!el\.fitInfo\?\.allHoles \/\* #3371 \*\/)? \}\);/);
  // the angle between two azimuths, as the effect computes it
  const turn = (a, b) => Math.abs(((((a || 0) - (b || 0)) % 360) + 540) % 360 - 180);
  assert.equal(turn(45, 0), 45); assert.equal(turn(359, 1), 2); assert.equal(turn(0, 0), 0); assert.equal(turn(90, 270), 180);
});

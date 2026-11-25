// TASKS.csv #4072 — the 3D view's compass as Matt's option B, "bezel ring": a white disc, a dark ring, 8 grey ticks, a gold north
// marker outside the ring, N inside it and E / S / W smaller in grey, no grey square behind it; click-to-snap, the Bottom-view mirror
// (#2038), the translated W (#786) and the font reload (#385) kept, the click targets no smaller than before.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const s = readFileSync(new URL("../src/components/CompassRose.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("#4072 the bezel's look: colours, 8 ticks, the gold north marker, no background square", () => {
  assert.match(s, /const BEZEL = \{ disc: 0xffffff, ring: 0x3a4454, tick: 0x9aa5b3, north: 0xe2a63c \};/);
  assert.doesNotMatch(s, /navScene\.background\s*=/, "no #f4f5f7 square");
  assert.match(s, /renderer\.clearDepth\(\);\n    const prevAutoClear = renderer\.autoClear;\n    renderer\.autoClear = false;\n    renderer\.render\(navScene, navCamera\);\n    renderer\.autoClear = prevAutoClear;/);
  assert.match(s, /\[0, 45, 90, 135, 180, 225, 270, 315\]\.forEach/, "8 ticks");
  assert.match(s, /new THREE\.CircleGeometry\(ringR \+ 0\.03, 64\)/, "the white disc");
  assert.match(s, /ringGroup\.add\(northMarker\);\n  clickable\.push\(northMarker\);/, "the gold marker turns with the bezel and snaps to north");
  assert.doesNotMatch(s, /lubber/);
});

test("#4072 letters: N weight 500 in the #523 north blue, E / S / W smaller in muted grey, W translated", () => {
  assert.match(s, /\{ dir: \[0, 0, -1\], label: "N", color: "#1f5f9e", px: 80 \}/);
  for (const l of ["E", "S"]) assert.match(s, new RegExp(`label: "${l}", color: "#65717e", px: 60 \\}`));
  assert.match(s, /label: tr\("W"\), color: "#65717e", px: 60 \}/, "#786");
  assert.match(s, /ring\.rotation\.x = Math\.PI \/ 2;/, "the ring lies flat (it stood on edge: a dark line)");
  assert.match(s, /makeLabelSprite\(p\.label, p\.color, 0\.82, p\.px, 500\)/);
  assert.match(s, /document\.fonts\.load\(LABEL_FONT\(px, weight\)\)\.then\(draw/, "#385: drawn again once Exo 2 (500) has loaded");
});

test("#4072 click targets no smaller than before: letters keep 0.82, tick targets 0.3 x 0.42 (were 0.1 x 0.22)", () => {
  assert.match(s, /new THREE\.BoxGeometry\(0\.3, 0\.05, 0\.42\), hitMat\)/);
  assert.match(s, /hit\.userData\.dir = dir;\n    ringGroup\.add\(hit\);\n    clickable\.push\(hit\);/);
  assert.match(s, /const hitMat = new THREE\.MeshBasicMaterial\(\{ visible: false \}\);/);
  assert.match(s, /flipGroup\.scale\.z = lookingUpFromBelow \? -1 : 1;/, "#2038 kept");
});

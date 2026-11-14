// TASKS.csv #3261 (Galore review) — a pierce point with no value of the chosen layer at the RL (a geotechnical hole with no assays) was filled
// white beside the near-white lowest class, and the key did not say so. It is a smaller hollow grey ring, outside the coloured points' paths,
// and the key counts it.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const w = fs.readFileSync(new URL("../src/components/LevelPlanWindow.jsx", import.meta.url), "utf8");

test("a point with no value is not given a fill: it goes to its own path, drawn as a hollow grey ring", () => {
  assert.match(w, /color: \(pc\.logs \|\| \[\]\)\.find\(\(l\) => l\.layer === activeLayer\)\?\.color \|\| null \}\)\);/);
  assert.match(w, /pcAll: dotsPath\(valued\.map\(\(q\) => \[q\.x, q\.y\]\), X, Y\), pcFill: dotsByColour\(valued, X, Y\), pcNone: dotsPath\(none, X, Y\), findPc: pointFinder\(pcs, X, Y\)/);
  assert.match(w, /<path d=\{dw\.pcNone\} stroke="#8a94a3" strokeWidth=\{9\}[^>]*\/><path d=\{dw\.pcNone\} stroke="#ffffff" strokeWidth=\{6\.2\}/);
  assert.ok(!/\?\.color \|\| "#ffffff" \}\)\)/.test(w), "no white fill for a missing value");
});

test("the key: a row counting them (when the layer has classes), drawn as a ring; hover still finds them", () => {
  assert.match(w, /tr\(none === 1 \? "No value here: \{n\} pierce point \(hollow ring\)" : "No value here: \{n\} pierce points \(hollow ring\)", \{ n: none \}\), "#ffffff", \{ ring: true \}\]/);
  assert.match(w, /borderRadius: o\?\.ring \? 5 : 2/);
  assert.match(w, /findPc: pointFinder\(pcs, X, Y\)/, "the finder keeps every pierce point");
});

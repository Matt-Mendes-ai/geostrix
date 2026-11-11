// TASKS.csv #1731 — a posterior drawn on its own range, the earlier score maps hidden, the ramp said
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { scoreImage, scoreTop, isOverlayOutput } from "../src/lib/evidence.js";

test("a posterior of at most 0.26 reaches the darkest colour; a fuzzy score keeps 0-1", () => {
  const post = Float32Array.from([0, 0.13, 0.26, NaN]);
  assert.ok(Math.abs(scoreTop(post) - 0.26) < 1e-6);
  const stretched = scoreImage(post, 4, 1, scoreTop(post)), flat = scoreImage(post, 4, 1);
  assert.deepEqual([...stretched.data.slice(8, 11)], [128, 0, 38]); // 0.26 -> dark red
  assert.ok(flat.data[8] > 200, String(flat.data[8])); // on 0-1 it stayed pale
  assert.equal(stretched.data[15], 0); // NaN transparent
  assert.equal(scoreTop(Float32Array.from([NaN, 0])), 1); // nothing above 0: the plain ramp
});

test("the pane hides the earlier score maps, says the ramp, and score maps are never evidence", () => {
  const p = fs.readFileSync("src/components/EvidenceOverlayPane.jsx", "utf8");
  assert.match(p, /const top = which === "posterior" \|\| which === "posteriorSd" \? scoreTop\(score\) : 1;/); // the sd too since #2001
  assert.match(p, /earlier\.forEach\(\(r\) => updateRaster\(r\.id, \{ visible: false \}\)\)/);
  assert.match(p, /displayRange: \[0, \+top\.toPrecision\(3\)\]/);
  assert.ok(isOverlayOutput({ params: { tool: "weights of evidence (posterior probability)" } }) && isOverlayOutput({ params: { tool: "fuzzy overlay" } }));
  assert.match(p, /valueRasters = useMemo\(\(\) => rasters\.filter\(\(r\) => r\.grid && !isOverlayOutput\(r\)\)/);
});
